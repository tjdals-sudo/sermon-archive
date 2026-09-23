// 설교 JSON 파일들을 모아 최신순으로 정렬합니다.
// 파일 하나 = 설교 한 편. status가 'published'인 것만 웹에 나옵니다.
const modules = import.meta.glob('../content/sermons/*.json', { eager: true });

export const sermons = Object.entries(modules)
  .map(([path, mod]) => {
    const data = mod.default ?? mod;
    return { ...data, slug: path.split('/').pop().replace(/\.json$/, '') };
  })
  .filter((s) => s.status === 'published')
  .sort((a, b) => b.date.localeCompare(a.date));

export const years = [...new Set(sermons.map((s) => s.date.slice(0, 4)))].sort().reverse();

export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const week = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return { full: `${y}. ${m}. ${d}. (${week})`, short: `${m}.${d}`, y: String(y), m: String(m) };
}
