// 작성해 둔 요약을 설교 데이터에 반영합니다. (.summaries/*.json → src/content/sermons)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'src/content/sermons');
const DIR = path.join(ROOT, '.summaries');

const all = {};
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  Object.assign(all, JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
}

let n = 0;
for (const [date, v] of Object.entries(all)) {
  const p = path.join(CONTENT, `${date}.json`);
  if (!fs.existsSync(p)) { console.log(`건너뜀: ${date} (설교 없음)`); continue; }
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  s.summary = v.summary;
  s.keyPoints = v.keyPoints;
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
  n++;
}
console.log(`요약 ${n}편 반영 완료`);
