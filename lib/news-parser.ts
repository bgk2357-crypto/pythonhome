import { topicsFor, type NewsArticle, type NewsSource } from "./news-sources";

export function plainText(value: string) {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<[^>]*>/g, " ").replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, code: string) => {
    if (!code.startsWith("#")) return entities[code.toLowerCase()] ?? match;
    const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  }).replace(/\s+/g, " ").trim();
}
export function articleUrl(value: string, base: string, institution: boolean) {
  if (!plainText(value)) return null;
  try {
    const url = new URL(plainText(value), base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if (institution && url.hostname !== new URL(base).hostname) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    return url.toString();
  } catch { return null; }
}
export function parsePublishedDate(value: string): string | null {
  let text = plainText(value);
  // Dates without an offset on Korean institution boards are Korea time.
  const local = text.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (local) text = `${local[1]}-${local[2].padStart(2, "0")}-${local[3].padStart(2, "0")}T${local[4] ?? "00"}:${local[5] ?? "00"}:${local[6] ?? "00"}+09:00`;
  const time = Date.parse(text); return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
function article(titleValue: string, link: string, date: string, source: NewsSource, publisher?: string): NewsArticle | null {
  let title = plainText(titleValue).slice(0, 400);
  const name = plainText(publisher || source.institution || source.name).slice(0, 100);
  if (source.kind === "general" && title.endsWith(` - ${name}`)) title = title.slice(0, -name.length - 3).trim();
  const url = articleUrl(link, source.url, source.kind === "trends");
  if (!title || !url) return null;
  const topics = topicsFor(title);
  if (!topics.length && source.id !== "kiha-notice") return null;
  if (source.id === "kiha-notice" && /구인구직|채용|연회비|평의원|선거|회비/.test(title) && !topics.length) return null;
  return { title, url, publisher: name, sourceId: source.id, publishedAt: parsePublishedDate(date), topics };
}
function tag(block: string, name: string) { return block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] ?? ""; }
export function parseRss(xml: string, source: NewsSource) {
  if (!/<(?:rss|feed)\b/i.test(xml) || /<!DOCTYPE/i.test(xml)) throw new Error("invalid-feed");
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  return blocks.map(([, block]) => article(tag(block, "title"), tag(block, "link"), tag(block, "pubDate") || tag(block, "dc:date"), source, tag(block, "source"))).filter((value): value is NewsArticle => !!value);
}
export function parseBoard(html: string, source: NewsSource) {
  const result: NewsArticle[] = []; let matchedLinks = 0;
  for (const [row] of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const date = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([, value]) => plainText(value)).find(value => /^20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(value)) ?? "";
    for (const [, link, title] of row.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      if (source.id === "kiha-notice" ? !/community_view\.htm\?.*\buid=/.test(link) : !/enewsView\.do\?.*\bnews_seq=/.test(link)) continue;
      matchedLinks++;
      const item = article(title, link, date, source); if (item) result.push(item);
    }
  }
  if (!matchedLinks) throw new Error("board-layout-changed");
  return result;
}
export function parseKosha(json: unknown, source: NewsSource) {
  const data = json as { result?: string; payload?: { pstNm?: string; wrtDt?: string; contentsLinkUrl?: string; businessNm?: string }[] };
  if (data?.result !== "success" || !Array.isArray(data.payload)) throw new Error("invalid-kosha-response");
  return data.payload.map(row => article(row.pstNm ?? "", row.contentsLinkUrl ?? "", row.wrtDt ?? "", source)).filter((value): value is NewsArticle => !!value);
}
export function deduplicateArticles(items: NewsArticle[]) {
  const seenUrls = new Set<string>(); const seenTitles = new Set<string>();
  return [...items].sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0)).filter(item => {
    const key = `${item.publisher}:${item.title.replace(/[\s\p{P}]/gu, "").toLowerCase()}`;
    if (seenUrls.has(item.url) || seenTitles.has(key)) return false;
    seenUrls.add(item.url); seenTitles.add(key); return true;
  });
}
