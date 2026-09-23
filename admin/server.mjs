// ─────────────────────────────────────────────────────────────
//  설교 업로드 관리자 도구 (내 컴퓨터에서만 돕니다)
//  실행:  npm run admin    또는  설교올리기.command 더블클릭
// ─────────────────────────────────────────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { docxToText, guessMeta, findPrivacy, buildPrompt } from './lib/extract.mjs';
import { pptToPdf, pdfToImages, checkTools } from './lib/convert.mjs';
import { urlFromRef } from './lib/bible.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRAFTS = path.join(ROOT, '.drafts');
const CONTENT = path.join(ROOT, 'src/content/sermons');
const PUBLIC_FILES = path.join(ROOT, 'public/files');
const MANUSCRIPTS = path.join(ROOT, '.manuscripts');
const PORT = 4321;

fs.mkdirSync(DRAFTS, { recursive: true });
fs.mkdirSync(CONTENT, { recursive: true });
fs.mkdirSync(PUBLIC_FILES, { recursive: true });

// ── 유틸 ────────────────────────────────────────────────
const json = (res, code, data) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 200 * 1024 * 1024) { reject(new Error('파일이 너무 큽니다 (200MB 초과)')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });

const draftDir = (id) => path.join(DRAFTS, id);
const draftPath = (id) => path.join(draftDir(id), 'draft.json');
const readDraft = async (id) => JSON.parse(await fsp.readFile(draftPath(id), 'utf8'));
const writeDraft = async (d) => fsp.writeFile(draftPath(d.id), JSON.stringify(d, null, 2));

// ── 1) 업로드 분석 ──────────────────────────────────────
async function analyze(body) {
  const id = new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14);
  const dir = draftDir(id);
  await fsp.mkdir(dir, { recursive: true });

  const notes = [];
  let manuscript = '';
  let meta = { title: '', date: new Date().toISOString().slice(0, 10), preacher: '', ref: '', url: '' };

  // 원고 (docx)
  if (body.docx?.data) {
    const docxPath = path.join(dir, 'manuscript.docx');
    await fsp.writeFile(docxPath, Buffer.from(body.docx.data, 'base64'));
    try {
      manuscript = await docxToText(docxPath);
      meta = guessMeta(manuscript, body.docx.name || '');
    } catch (e) {
      notes.push(`원고를 읽지 못했습니다: ${e.message}`);
    }
  }

  // PPT → PDF → 썸네일
  let files = { slides: [], pdf: null, ppt: null, thumb: null };
  if (body.ppt?.data) {
    const ext = path.extname(body.ppt.name || '.pptx') || '.pptx';
    const pptPath = path.join(dir, `slides${ext}`);
    await fsp.writeFile(pptPath, Buffer.from(body.ppt.data, 'base64'));
    files.ppt = path.basename(pptPath);

    const pdf = await pptToPdf(pptPath, dir);
    if (pdf.ok) {
      files.pdf = 'slides.pdf';
      const img = await pdfToImages(pdf.path, dir);
      if (img.ok) {
        files.slides = img.files;
        files.thumb = img.files[0];
      } else notes.push(img.error);
    } else {
      notes.push(pdf.error);
    }
  }

  const draft = {
    id,
    createdAt: new Date().toISOString(),
    status: 'draft',
    title: meta.title,
    date: meta.date,
    preacher: meta.preacher,
    scriptureRef: meta.ref,
    scriptureUrl: meta.url,
    summary: '',
    keyPoints: [],
    manuscript,
    files,
    pptAccess: 'view',       // 저작권 기본값: 보기만 허용
    series: null,
    tags: [],
    youtube: null,
    privacyAcknowledged: false,
    notes,
  };
  await writeDraft(draft);
  return { ...draft, privacy: findPrivacy(manuscript) };
}

// ── 2) 게시 ────────────────────────────────────────────
async function publish(id) {
  const d = await readDraft(id);
  if (!d.title?.trim()) throw new Error('제목을 입력해 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
  if (findPrivacy(d.manuscript).length > 0 && !d.privacyAcknowledged) {
    throw new Error('실명으로 보이는 표현이 남아 있습니다. 확인 후 "검토했습니다"를 체크해 주세요.');
  }

  // 같은 날짜가 이미 있으면 -2, -3 을 붙입니다
  let slug = d.date;
  let n = 1;
  while (fs.existsSync(path.join(CONTENT, `${slug}.json`))) slug = `${d.date}-${++n}`;

  // 파일 옮기기
  const outDir = path.join(PUBLIC_FILES, slug);
  await fsp.mkdir(outDir, { recursive: true });
  const moved = { slides: [], pdf: null, ppt: null, thumb: null };
  for (const name of d.files?.slides ?? []) {
    const from = path.join(draftDir(id), name);
    if (!fs.existsSync(from)) continue;
    await fsp.copyFile(from, path.join(outDir, name));
    moved.slides.push(`/files/${slug}/${name}`);
  }
  moved.thumb = moved.slides[0] ?? null;
  // PDF는 '다운로드 허용'일 때만 함께 올립니다 (용량·저작권)
  if (d.pptAccess === 'download' && d.files?.pdf) {
    const from = path.join(draftDir(id), d.files.pdf);
    if (fs.existsSync(from)) {
      await fsp.copyFile(from, path.join(outDir, d.files.pdf));
      moved.pdf = `/files/${slug}/${d.files.pdf}`;
    }
  }

  // 원고 전문은 공개하지 않고 내 컴퓨터에만 보관합니다
  await fsp.mkdir(MANUSCRIPTS, { recursive: true });
  await fsp.writeFile(path.join(MANUSCRIPTS, `${slug}.txt`), d.manuscript || '');

  const sermon = {
    date: d.date,
    title: d.title.trim(),
    preacher: d.preacher?.trim() || '',
    scriptureRef: d.scriptureRef?.trim() || '',
    scriptureUrl: d.scriptureUrl?.trim() || urlFromRef(d.scriptureRef),
    summary: d.summary?.trim() || '',
    keyPoints: (d.keyPoints || []).map((p) => String(p).trim()).filter(Boolean),
    files: moved,
    pptAccess: d.pptAccess || 'view',
    series: d.series || null,
    tags: d.tags || [],
    youtube: d.youtube || null,
    status: 'published',
    publishedAt: new Date().toISOString(),
  };
  await fsp.writeFile(path.join(CONTENT, `${slug}.json`), JSON.stringify(sermon, null, 2) + '\n');

  const git = await pushToGithub(`설교 등록: ${d.date} ${sermon.title}`);
  await fsp.rm(draftDir(id), { recursive: true, force: true });
  return { slug, git };
}

async function pushToGithub(message) {
  const g = (args) => run('git', args, { cwd: ROOT });
  try {
    await g(['add', 'src/content/sermons', 'public/files']);
    await g(['commit', '-m', message]);
  } catch (e) {
    if (!/nothing to commit/i.test(e.stdout || e.message)) return { ok: false, step: 'commit', error: e.message };
  }
  try {
    await g(['remote', 'get-url', 'origin']);
  } catch {
    return { ok: false, step: 'remote', error: '깃헙 저장소가 아직 연결되지 않았습니다. 저장은 끝났고, 연결 후 올라갑니다.' };
  }
  try {
    const branch = (await g(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
    await g(['push', 'origin', branch]);
    return { ok: true };
  } catch (e) {
    return { ok: false, step: 'push', error: e.stderr || e.message };
  }
}

// ── 3) 서버 ────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const seg = url.pathname.split('/').filter(Boolean);

  try {
    // 관리자 화면
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(await fsp.readFile(path.join(ROOT, 'admin/index.html')));
    }

    // 초안 미리보기 파일 (pdf, 썸네일)
    if (req.method === 'GET' && seg[0] === 'draft' && seg.length === 3) {
      const file = path.join(draftDir(seg[1]), path.basename(seg[2]));
      if (!fs.existsSync(file)) return json(res, 404, { error: 'not found' });
      const type = file.endsWith('.pdf') ? 'application/pdf'
        : file.endsWith('.png') ? 'image/png'
        : file.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
      res.writeHead(200, { 'content-type': type });
      return fs.createReadStream(file).pipe(res);
    }

    if (seg[0] !== 'api') return json(res, 404, { error: 'not found' });

    // 환경 점검
    if (req.method === 'GET' && seg[1] === 'health') {
      return json(res, 200, checkTools());
    }

    // 초안 목록
    if (req.method === 'GET' && seg[1] === 'drafts' && seg.length === 2) {
      const ids = (await fsp.readdir(DRAFTS)).filter((f) => fs.existsSync(draftPath(f)));
      const list = await Promise.all(ids.map(async (id) => {
        const d = await readDraft(id);
        return { id, title: d.title, date: d.date };
      }));
      return json(res, 200, list.sort((a, b) => b.id.localeCompare(a.id)));
    }

    // 초안 하나
    if (req.method === 'GET' && seg[1] === 'drafts' && seg.length === 3) {
      const d = await readDraft(seg[2]);
      return json(res, 200, { ...d, privacy: findPrivacy(d.manuscript) });
    }

    // 업로드 분석
    if (req.method === 'POST' && seg[1] === 'analyze') {
      return json(res, 200, await analyze(await readBody(req)));
    }

    // 초안 저장 (임시저장)
    if (req.method === 'PUT' && seg[1] === 'drafts' && seg.length === 3) {
      const body = await readBody(req);
      const current = await readDraft(seg[2]);
      const next = { ...current, ...body, id: current.id };
      if (!next.scriptureUrl && next.scriptureRef) next.scriptureUrl = urlFromRef(next.scriptureRef);
      await writeDraft(next);
      return json(res, 200, { ok: true, privacy: findPrivacy(next.manuscript) });
    }

    // 초안 삭제
    if (req.method === 'DELETE' && seg[1] === 'drafts' && seg.length === 3) {
      await fsp.rm(draftDir(seg[2]), { recursive: true, force: true });
      return json(res, 200, { ok: true });
    }

    // AI 프롬프트
    if (req.method === 'GET' && seg[1] === 'drafts' && seg[3] === 'prompt') {
      return json(res, 200, { prompt: buildPrompt(await readDraft(seg[2])) });
    }

    // AI 결과 반영
    if (req.method === 'POST' && seg[1] === 'drafts' && seg[3] === 'ai') {
      const { text } = await readBody(req);
      const m = String(text || '').match(/\{[\s\S]*\}/);
      if (!m) throw new Error('붙여넣은 내용에서 JSON을 찾지 못했습니다.');
      const ai = JSON.parse(m[0]);
      const d = await readDraft(seg[2]);
      const next = {
        ...d,
        title: ai.title?.trim() || d.title,
        scriptureRef: ai.scriptureRef?.trim() || d.scriptureRef,
        summary: ai.summary?.trim() || d.summary,
        keyPoints: Array.isArray(ai.keyPoints) ? ai.keyPoints : d.keyPoints,
      };
      if (next.scriptureRef && !next.scriptureUrl) next.scriptureUrl = urlFromRef(next.scriptureRef);
      await writeDraft(next);
      return json(res, 200, next);
    }

    // 게시
    if (req.method === 'POST' && seg[1] === 'drafts' && seg[3] === 'publish') {
      return json(res, 200, await publish(seg[2]));
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 400, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  설교 업로드 창이 열렸습니다 →  ${url}`);
  console.log(`  (창을 닫으려면 이 검은 화면에서 Control + C)\n`);
  if (!process.env.NO_OPEN) execFile('open', [url], () => {});
});
