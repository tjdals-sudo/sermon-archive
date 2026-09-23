// 폴더에 쌓인 설교 파일을 한꺼번에 가져옵니다. (처음 한 번, 과거 자료 이관용)
//   사용법: node admin/bulk-import.mjs "<폴더 경로>" [--only 20260104] [--no-ppt]
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { docxToText, guessMeta, findPrivacy } from './lib/extract.mjs';
import { pptToPdf, pdfToImages } from './lib/convert.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'src/content/sermons');
const PUBLIC_FILES = path.join(ROOT, 'public/files');
const MANUSCRIPTS = path.join(ROOT, '.manuscripts');

const dir = process.argv[2];
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const noPpt = process.argv.includes('--no-ppt');
if (!dir) { console.error('폴더 경로를 알려주세요.'); process.exit(1); }

const key = (f) => (f.match(/(20\d{6})/) || [])[1];
const files = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
const groups = new Map();
for (const f of files) {
  const k = key(f);
  if (!k || (only && k !== only)) continue;
  if (!groups.has(k)) groups.set(k, { docx: null, ppt: null });
  if (/\.docx?$/i.test(f)) groups.set(k, { ...groups.get(k), docx: f });
  if (/\.pptx?$/i.test(f)) groups.set(k, { ...groups.get(k), ppt: f });
}

const prevOf = (date) => {
  const f = path.join(CONTENT, `${date}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
};

const report = [];
for (const [k, g] of [...groups].sort()) {
  const date = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;
  process.stdout.write(`${date} `);
  if (!g.docx) { report.push({ date, skip: '원고 없음' }); console.log('건너뜀 (원고 없음)'); continue; }

  const manuscript = await docxToText(path.join(dir, g.docx));
  const meta = guessMeta(manuscript, g.docx);
  const privacy = findPrivacy(manuscript);

  const outDir = path.join(PUBLIC_FILES, date);
  await fsp.mkdir(outDir, { recursive: true });
  const fileRefs = { slides: [], pdf: null, ppt: null, thumb: null };

  if (g.ppt && !noPpt) {
    const res = await pptToPdf(path.join(dir, g.ppt), outDir);
    if (res.ok) {
      const img = await pdfToImages(res.path, outDir);
      if (img.ok) {
        fileRefs.slides = img.files.map((f) => `/files/${date}/${f}`);
        fileRefs.thumb = fileRefs.slides[0];      // 첫 장을 카카오톡 공유 이미지로
      } else report.push({ date, warn: img.error });
      // 보기 전용이면 PDF 원본은 두지 않습니다 (용량 절약)
      const keepPdf = (prevOf(date).pptAccess || 'view') === 'download';
      if (keepPdf) fileRefs.pdf = `/files/${date}/slides.pdf`;
      else fs.rmSync(res.path, { force: true });
    } else report.push({ date, warn: res.error });
  }

  // 원고 전문은 공개하지 않습니다. 요약을 만들 때 쓰도록 내 컴퓨터에만 보관합니다.
  await fsp.mkdir(MANUSCRIPTS, { recursive: true });
  await fsp.writeFile(path.join(MANUSCRIPTS, `${date}.txt`), manuscript);

  // 이미 가져온 설교라면, 사람이 손본 내용(제목·요약·핵심포인트 등)은 그대로 둡니다
  const jsonPath = path.join(CONTENT, `${date}.json`);
  const prev = prevOf(date);

  const sermon = {
    date,
    title: prev.title || meta.title,
    preacher: prev.preacher || meta.preacher || '',
    scriptureRef: prev.scriptureRef || meta.ref,
    scriptureUrl: prev.scriptureUrl || meta.url,
    summary: prev.summary || '',
    keyPoints: prev.keyPoints?.length ? prev.keyPoints : [],
    // PPT를 다시 변환하지 않은 경우, 기존 파일 정보를 지우지 않습니다
    files: fileRefs.slides.length || !prev.files ? fileRefs : prev.files,
    pptAccess: prev.pptAccess || 'view',
    series: prev.series ?? null,
    tags: prev.tags ?? [],
    youtube: prev.youtube ?? null,
    status: prev.status || 'published',
    publishedAt: prev.publishedAt || new Date().toISOString(),
  };
  await fsp.writeFile(jsonPath, JSON.stringify(sermon, null, 2) + '\n');

  const imgBytes = fileRefs.slides.reduce((a, f) => a + fs.statSync(path.join(ROOT, 'public', f.slice(1))).size, 0);
  const pdfSize = fileRefs.slides.length ? `${fileRefs.slides.length}장 ${(imgBytes / 1048576).toFixed(1)}` : '-';
  report.push({ date, title: meta.title || '(제목 없음)', ref: meta.ref, pdf: pdfSize, privacy: privacy.length });
  console.log(`✓ ${meta.title || '(제목 없음)'} | ${meta.ref} | 슬라이드 ${pdfSize}MB | 실명의심 ${privacy.length}`);
}

console.log('\n── 정리 ──');
console.log('가져온 설교:', report.filter((r) => !r.skip).length, '편');
const noTitle = report.filter((r) => r.title === '(제목 없음)');
if (noTitle.length) console.log('제목을 직접 넣어야 하는 설교:', noTitle.map((r) => r.date).join(', '));
const withPrivacy = report.filter((r) => r.privacy > 0);
if (withPrivacy.length) console.log('실명 확인이 필요한 설교:', withPrivacy.map((r) => `${r.date}(${r.privacy})`).join(', '));
