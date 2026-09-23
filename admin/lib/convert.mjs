// PPT를 PDF로 바꾸고, 첫 장으로 카카오톡 공유용 썸네일을 만듭니다.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readdirSync, renameSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const run = promisify(execFile);

// LibreOffice가 맥의 한글 폰트를 못 찾는 문제를 막습니다.
// (이 설정이 없으면 PPT의 한글이 PDF에서 통째로 사라집니다)
const FONTCONFIG = ['/opt/homebrew/etc/fonts/fonts.conf', '/usr/local/etc/fonts/fonts.conf']
  .find((p) => existsSync(p));
const ENV = FONTCONFIG ? { ...process.env, FONTCONFIG_FILE: FONTCONFIG } : process.env;

const SOFFICE_CANDIDATES = [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/opt/homebrew/bin/soffice',
  '/usr/local/bin/soffice',
  '/usr/bin/soffice',
];

// PDF로 만들 때 사진 해상도를 낮춰 용량을 줄입니다.
// 화면으로 보기에는 충분하고, 용량은 보통 1/3 ~ 1/10로 줄어듭니다.
// 더 선명하게 하려면 MaxImageResolution 값을 200~300으로 올리세요.
const PDF_OPTIONS = JSON.stringify({
  UseLosslessCompression: { type: 'boolean', value: 'false' },
  Quality: { type: 'long', value: '80' },
  ReduceImageResolution: { type: 'boolean', value: 'true' },
  MaxImageResolution: { type: 'long', value: '150' },
  ExportBookmarks: { type: 'boolean', value: 'false' },
});

export function findSoffice() {
  return SOFFICE_CANDIDATES.find((p) => existsSync(p)) || null;
}

/** PPT/PPTX → PDF. 성공하면 만들어진 PDF 경로를 돌려줍니다. */
export async function pptToPdf(pptPath, outDir) {
  const soffice = findSoffice();
  if (!soffice) {
    return { ok: false, error: 'LibreOffice가 설치되어 있지 않습니다. (brew install --cask libreoffice)' };
  }
  try {
    await run(soffice, [
      '--headless', '--norestore', '--convert-to', `pdf:impress_pdf_Export:${PDF_OPTIONS}`,
      '--outdir', outDir, pptPath,
    ], { timeout: 300000, env: ENV });

    const made = path.join(outDir, path.basename(pptPath).replace(/\.[^.]+$/, '.pdf'));
    if (!existsSync(made)) return { ok: false, error: 'PDF가 만들어지지 않았습니다.' };

    const dest = path.join(outDir, 'slides.pdf');
    if (made !== dest) renameSync(made, dest);
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, error: `변환 실패: ${e.message}` };
  }
}

/** PDF 첫 장 → 썸네일 png (macOS 기본 기능 사용, 추가 설치 불필요) */
export async function makeThumb(pdfPath, outDir) {
  const tmp = path.join(os.tmpdir(), `thumb-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  try {
    await run('qlmanage', ['-t', '-s', '1200', '-o', tmp, pdfPath], { timeout: 60000 });
    const png = readdirSync(tmp).find((f) => f.endsWith('.png'));
    if (!png) return { ok: false, error: '썸네일을 만들지 못했습니다.' };
    const dest = path.join(outDir, 'thumb.png');
    renameSync(path.join(tmp, png), dest);
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** PDF의 각 장을 이미지로 만듭니다. 폰에서 쭉 스크롤하며 보기 위한 것입니다. */
export async function pdfToImages(pdfPath, outDir, prefix = 'slide') {
  try {
    await run('pdftoppm', [
      '-jpeg', '-jpegopt', 'quality=72',
      '-scale-to-x', '1200', '-scale-to-y', '-1',
      pdfPath, path.join(outDir, prefix),
    ], { timeout: 300000 });
    const files = readdirSync(outDir).filter((f) => f.startsWith(prefix + '-') && f.endsWith('.jpg')).sort();
    if (!files.length) return { ok: false, error: '슬라이드 이미지를 만들지 못했습니다.' };
    return { ok: true, files };
  } catch (e) {
    const hint = /ENOENT/.test(e.message) ? ' (brew install poppler 로 설치하세요)' : '';
    return { ok: false, error: `슬라이드 이미지 변환 실패${hint}: ${e.message}` };
  }
}

/** 설치 상태 점검 */
export function checkTools() {
  return { libreoffice: Boolean(findSoffice()), fontconfig: Boolean(FONTCONFIG) };
}
