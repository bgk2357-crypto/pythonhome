export type NewsKind = "trends" | "general";
export type NewsArticle = { title: string; url: string; publisher: string; sourceId: string; publishedAt: string | null; topics: string[] };
export type NewsSource = { id: string; name: string; kind: NewsKind; url: string; homepage: string; format: "rss" | "board" | "kosha"; method?: "POST"; institution?: string };

export const TOPICS = ["안전", "보건", "사망사고", "화학물질", "화재"];
export function topicsFor(title: string) {
  const topics: string[] = [];
  if (/안전|재해|산재|추락|끼임|붕괴|폭발|사고/.test(title)) topics.push("안전");
  if (/보건|위생|직업병|건강|중독|질식|작업환경|근골격|유해|납\s/.test(title)) topics.push("보건");
  if (/사망|숨져|숨진|중대재해|중대산업/.test(title)) topics.push("사망사고");
  if (/화학|누출|유출|가스|유해물질|유해인자|중독|MSDS|물질안전/.test(title)) topics.push("화학물질");
  if (/화재|불길|불이\s?나|산불|소방|폭발/.test(title)) topics.push("화재");
  return topics;
}
function googleFeed(query: string) { const url = new URL("https://news.google.com/rss/search"); url.search = new URLSearchParams({ q: query, hl: "ko", gl: "KR", ceid: "KR:ko" }).toString(); return url.toString(); }
export const NEWS_SOURCES: NewsSource[] = [
  { id: "kosha-notice", name: "안전보건공단 공지", institution: "안전보건공단", kind: "trends", format: "kosha", method: "POST", url: "https://portal.kosha.or.kr/api/portal24/bizA/p/ACMZZ04000/bbs/id01", homepage: "https://portal.kosha.or.kr/community/notice" },
  { id: "kosha-business", name: "안전보건공단 사업 알림", institution: "안전보건공단", kind: "trends", format: "kosha", method: "POST", url: "https://portal.kosha.or.kr/api/portal24/bizA/p/ACMZZ04000/bbs/id05", homepage: "https://portal.kosha.or.kr/" },
  { id: "kosha-accident", name: "안전보건공단 재해사례", institution: "안전보건공단", kind: "trends", format: "kosha", method: "POST", url: "https://portal.kosha.or.kr/api/portal24/bizA/p/ACMZZ04000/bbs/id03", homepage: "https://portal.kosha.or.kr/" },
  { id: "moel-notice", name: "고용노동부 공지", institution: "고용노동부", kind: "trends", format: "rss", url: "https://www.moel.go.kr/rss/notice.do", homepage: "https://www.moel.go.kr/news/notice/noticeList.do" },
  { id: "moel-report", name: "고용노동부 보도자료", institution: "고용노동부", kind: "trends", format: "board", url: "https://www.moel.go.kr/news/enews/report/enewsList.do", homepage: "https://www.moel.go.kr/news/enews/report/enewsList.do" },
  { id: "kiha-notice", name: "한국산업보건학회 공지", institution: "한국산업보건학회", kind: "trends", format: "board", url: "https://www.kiha.kr/main/community.htm?tbn=gongi", homepage: "https://www.kiha.kr/main/community.htm?tbn=gongi" },
  { id: "news-safety", name: "안전·보건 뉴스", kind: "general", format: "rss", url: googleFeed("산업안전 OR 산업보건 OR 중대재해 OR 사망사고 OR 안전사고 when:14d"), homepage: "https://news.google.com/" },
  { id: "news-chemical", name: "화학물질·누출 뉴스", kind: "general", format: "rss", url: googleFeed('"화학물질" OR "가스 누출" OR "화학물질 누출" OR "유해물질 유출" when:14d'), homepage: "https://news.google.com/" },
  { id: "news-fire", name: "화재·폭발 뉴스", kind: "general", format: "rss", url: googleFeed("화재 OR 폭발 사고 when:7d"), homepage: "https://news.google.com/" },
];
