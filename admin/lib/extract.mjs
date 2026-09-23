// 원고(docx)에서 텍스트와 기본 정보를 뽑고, 개인정보로 보이는 표현을 찾아냅니다.
import mammoth from 'mammoth';
import { findScripture } from './bible.mjs';

/** docx 파일 → 줄바꿈이 살아있는 순수 텍스트 */
export async function docxToText(filePath) {
  const { value } = await mammoth.extractRawText({ path: filePath });
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 본문에서 제목·날짜·설교자·본문구절 초안을 추측합니다 (틀려도 화면에서 고치면 됩니다) */
export function guessMeta(text, fileName = '') {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const head = lines.slice(0, 25).join('\n');

  return {
    title: guessTitle(lines, fileName),
    date: guessDate(head) || guessDate(fileName) || today(),
    preacher: guessPreacher(head),
    ...(findScripture(head) || findScripture(text) || { ref: '', url: '' }),
  };
}

// 원고에서 제목처럼 보이지만 제목이 아닌 줄들
const NOT_TITLE = /^(서론|본론|결론|도입|전개|마무리|적용|기도|기도제목|찬양|광고|봉독|성경봉독|본문|암송구절|예화|첫째|둘째|셋째|넷째)/;

function guessTitle(lines, fileName) {
  const GENERIC = /^(소년부|주일|예배|설교|PW|ppt|말씀)+$/;
  const isScripture = (t) => /^[가-힣]{2,7}\s*\d{1,3}\s*[:장]/.test(t);
  const ok = (t) => {
    const v = clean(t).replace(/[:：]\s*$/, '');
    if (v.length < 3 || v.length > 40) return null;
    if (GENERIC.test(v.replace(/\s/g, ''))) return null;
    if (NOT_TITLE.test(v) || isScripture(v)) return null;
    return v;
  };

  // 1순위: 원고 중간의 "설교제목은 ○○○ 입니다" — 가장 확실한 단서
  const said = lines.join('\n').match(/설교\s*(?:의\s*)?제목은?\s*[:：]?\s*(.+?)\s*(?:입니다|이에요|예요)/);
  if (said) {
    const v = ok(said[1]);
    if (v) return v;
  }
  // 2순위: "… 설교: 나따(나를 따르라)" / "제목: …"
  for (const l of lines.slice(0, 15)) {
    const m = l.match(/(?:설교|제목)\s*[:：]\s*(.+)$/);
    const v = m && ok(m[1]);
    if (v) return v;
  }
  // 3순위: "20260215 위로의 자녀 야곱" — 날짜 뒤에 바로 제목이 오는 양식
  for (const l of lines.slice(0, 5)) {
    const m = l.match(/^\d{8}\s+(.+)$/);
    if (!m) continue;
    const v = ok(m[1].replace(/(소년부|주일|예배|설교|PW)/g, ' '));
    if (v) return v;
  }
  // 4순위: 앞쪽의 짧고 문장부호 없는 줄
  for (const l of lines.slice(0, 10)) {
    if (/^\d/.test(l) || /[.。?!]$/.test(l)) continue;
    const v = ok(l);
    if (v) return v;
  }
  return '';   // 못 찾으면 비워 둡니다 (엉뚱한 제목보다 낫습니다)
}

function guessDate(text) {
  let m = text.match(/(20\d{2})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = text.match(/(20\d{2})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function guessPreacher(text) {
  const m = text.match(/(?:설교자|인도자|말씀\s*전한\s*이)\s*[:：]\s*([가-힣]{2,4}\s*(?:목사|전도사|강도사|선교사|장로)?)/);
  if (m) return clean(m[1]);
  // "새로운 전도사님" 같은 말이 잡히지 않도록 성씨로 시작하는 이름만 인정합니다
  const m2 = text.match(new RegExp(`([${SURNAME}][가-힣]{1,2}\\s*(?:목사|전도사|강도사))`));
  return m2 ? clean(m2[1]) : '';
}

// prettier-ignore
const SURNAME = '김이박최정강조윤장임한오서신권황안송전홍고문손양배백허유남심노하곽성차주우구민류진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금육인맹제모탁국어은편용';
const TITLES = '집사|권사|장로|목사|전도사|사모|선생님|형제|자매|성도|어린이|학생|교사|부장';

/** 실명·연락처로 보이는 표현 찾기 — 게시 전 경고용 */
// 성씨처럼 보이지만 이름이 아닌 흔한 말들 (오탐 방지)
const NOT_NAME = new Set([
  '어린','우리','오늘','여러','하나','자기','모두','서로','그때','정말','조금','아주','많은','어떤',
  '이런','저런','그런','새로','사랑','예수','천국','교회','주일','학교','친구','부모','엄마',
  '아빠','가족','남자','여자','최고','제일','고맙','감사','반가','안녕','착한','좋은','나쁜',
  '방금','지금','다음','마지','처음','마음','생각','신앙','믿음','기도','말씀','성경','찬양',
  '구원','은혜','축복','소년','중등','고등','유치','청년','장년','전체','담당','담임','부서',
]);

export function findPrivacy(text) {
  const hits = [];
  const push = (kind, value, index) => {
    if (hits.some((h) => h.value === value)) return;
    const context = text.slice(Math.max(0, index - 40), index + 60).replace(/\n/g, ' ').trim();
    hits.push({ kind, value, context });
  };

  // 이름 + 직분/호칭  (단어 첫머리에서만, 일반명사는 제외)
  const nameRe = new RegExp(`(?<![가-힣])([${SURNAME}][가-힣]{1,2})\\s*(${TITLES}|씨|군|양)(?![가-힣])`, 'g');
  let m;
  while ((m = nameRe.exec(text)) !== null) {
    if (NOT_NAME.has(m[1])) continue;
    push('이름', m[0].trim(), m.index);
  }

  const rules = [
    ['전화번호', /01[016-9][-. ]?\d{3,4}[-. ]?\d{4}/g],
    ['이메일', /[\w.+-]+@[\w-]+\.[\w.]+/g],
    ['주민번호', /\d{6}\s*[-]\s*[1-4]\d{6}/g],
  ];
  for (const [kind, re] of rules) {
    let mm;
    while ((mm = re.exec(text)) !== null) push(kind, mm[0].trim(), mm.index);
  }
  return hits;
}

/** Claude에 붙여넣을 프롬프트를 만듭니다 */
export function buildPrompt(draft) {
  return `아래는 교회 주일 설교 원고입니다. 설교자의 의도를 해치지 않게 담백한 문체로 정리해 주세요.
과장하거나 새로운 해석을 덧붙이지 말고, 원고에 있는 내용만 사용하세요.

다음 JSON 형식으로만 답하세요. 설명은 쓰지 마세요.

{
  "title": "설교 제목 (원고에 있으면 그대로)",
  "scriptureRef": "본문 구절 (예: 요한복음 3:16-21)",
  "summary": "3~4문장 요약. 담백하게.",
  "keyPoints": ["핵심 포인트 3~5개", "각 항목은 한 문장", "..."]
}

--- 설교 원고 시작 ---
${draft.manuscript}
--- 설교 원고 끝 ---`;
}

const pad = (n) => String(n).padStart(2, '0');
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const today = () => new Date().toISOString().slice(0, 10);
