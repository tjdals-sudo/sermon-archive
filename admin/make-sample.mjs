// 다운로드 폴더에 "바로 열어보는 미리보기" 꾸러미를 만듭니다.
// GitHub 배포 전에 결과물을 눈으로 확인하는 용도입니다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(os.homedir(), 'Downloads', '설교아카이브-샘플');
const CONFIG = path.join(ROOT, 'site.config.mjs');

const original = fs.readFileSync(CONFIG, 'utf8');
try {
  // 미리보기는 내 컴퓨터에서 여는 것이라 하위 경로 없이 만듭니다
  fs.writeFileSync(CONFIG, original.replace(/base:\s*'[^']*'/, "base: '/'"));
  execFileSync('npx', ['astro', 'build'], { cwd: ROOT, stdio: 'inherit' });
} finally {
  fs.writeFileSync(CONFIG, original);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'dist'), OUT, { recursive: true });

fs.writeFileSync(path.join(OUT, '미리보기 열기.command'), `#!/bin/bash
cd "$(dirname "$0")" || exit 1
PORT=8765
echo "미리보기를 엽니다. 다 보시면 이 창에서 Control + C 를 누르세요."
(sleep 1; open "http://localhost:$PORT/") &
python3 -m http.server $PORT
`);
fs.chmodSync(path.join(OUT, '미리보기 열기.command'), 0o755);

const size = execFileSync('du', ['-sh', OUT]).toString().split('\t')[0];
console.log(`\n미리보기 꾸러미: ${OUT}  (${size})`);
