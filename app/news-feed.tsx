"use client";
import { useEffect, useState } from "react";
import { NEWS_SOURCES, TOPICS, type NewsKind } from "../lib/news-sources";
import type { NewsResult } from "../lib/news-service";

function date(value: string, time = false) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(new Date(value));
}
export function NewsFeed({ kind }: { kind: NewsKind }) {
  const [data, setData] = useState<NewsResult | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const [topic, setTopic] = useState("전체"); const [source, setSource] = useState(""); const [query, setQuery] = useState("");
  const [page, setPage] = useState(1); const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false);
    fetch(`/api/news?kind=${kind}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("news-unavailable");
      return await response.json() as NewsResult;
    }).then(result => { if (!controller.signal.aborted) setData(result); }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, reload]);
  useEffect(() => {
    const interval = setInterval(() => { if (!document.hidden) setReload(value => value + 1); }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  const sources = NEWS_SOURCES.filter(item => item.kind === kind);
  const search = query.trim().toLocaleLowerCase();
  const articles = (data?.articles ?? []).filter(item => (topic === "전체" || item.topics.includes(topic)) && (!source || item.sourceId === source) && (!search || `${item.title} ${item.publisher}`.toLocaleLowerCase().includes(search)));
  const pages = Math.max(1, Math.ceil(articles.length / 15)); const current = Math.min(page, pages);
  const newestFetch = data?.sources.map(item => item.fetchedAt).filter((value): value is string => !!value).sort().at(-1);
  const failures = data?.sources.filter(item => item.status !== "ok") ?? [];
  return <div className="news-feed">
    <div className="feed-intro"><div><span className="eyebrow">{kind === "trends" ? "OFFICIAL UPDATES" : "SAFETY & HEALTH NEWS"}</span><h2>{kind === "trends" ? "기관 공지·알림 모아보기" : "안전·보건 이슈 뉴스"}</h2><p>{kind === "trends" ? "안전보건공단·고용노동부·한국산업보건학회의 공개 자료 중 관련 소식을 모았습니다." : "Google 뉴스의 공개 검색 RSS에서 안전·보건·화학물질 누출·사망사고·화재 관련 기사를 모았습니다."}</p></div><button className="button secondary" type="button" disabled={loading} onClick={() => setReload(value => value + 1)}>{loading ? "수집 중…" : "새로고침 ↻"}</button></div>
    <div className="feed-meta"><span className="feed-status-dot" aria-hidden="true" />30분 간격 자동 갱신<span>{newestFetch ? `최근 수집 ${date(newestFetch, true)}` : "공개 자료를 확인합니다"}</span></div>
    {error && <p className="notice error" role="alert">뉴스를 불러오지 못했습니다. 잠시 후 새로고침해주세요.{data ? " 이전에 불러온 자료를 표시합니다." : " 아래 기관별 원문 링크를 이용할 수 있습니다."}</p>}
    {!!failures.length && <p className="notice" role="status">일부 출처의 연결이 지연되고 있습니다. 이전 수집 자료가 있으면 표시하며, 해당 출처는 5분 후 다시 확인합니다.</p>}
    <details className="feed-sources"><summary>수집 출처와 연결 상태 {data ? `· ${data.sources.filter(item => item.status === "ok").length}/${sources.length} 정상` : ""}</summary><ul>{sources.map(item => {
      const status = data?.sources.find(value => value.id === item.id);
      return <li key={item.id}><a href={item.homepage} target="_blank" rel="noopener noreferrer">{item.name} ↗</a><span>{!status ? "확인 전" : status.status === "ok" ? `정상 · 관련 ${status.count}건` : status.status === "stale" ? "연결 지연 · 이전 자료" : "일시 수집 불가"}</span>{status?.fetchedAt && <time dateTime={status.fetchedAt}>수집 {date(status.fetchedAt, true)}</time>}</li>;
    })}</ul></details>
    <div className="feed-controls"><div className="feed-topics" aria-label="뉴스 주제">{["전체", ...TOPICS].map(value => <button type="button" key={value} aria-pressed={topic === value} onClick={() => { setTopic(value); setPage(1); }}>{value}</button>)}</div><div className="feed-search"><label htmlFor={`source-${kind}`} className="sr-only">수집 출처</label><select id={`source-${kind}`} value={source} onChange={event => { setSource(event.target.value); setPage(1); }}><option value="">전체 출처</option>{sources.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><label htmlFor={`search-${kind}`} className="sr-only">제목 또는 출처 검색</label><input id={`search-${kind}`} type="search" placeholder="제목·출처 검색" value={query} maxLength={100} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div></div>
    <p className="feed-count" role="status">{loading && !data ? "공개 자료를 수집하고 있습니다…" : `${articles.length}건 · 최신순`}</p>
    <div className="feed-list" aria-busy={loading}>{articles.slice((current - 1) * 15, current * 15).map(item => <article className="feed-item" key={item.url}><div className="feed-item-meta"><strong>{item.publisher}</strong>{item.publishedAt ? <time dateTime={item.publishedAt}>{date(item.publishedAt)}</time> : <span>게시일 미제공</span>}</div><h3><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}<span aria-hidden="true"> ↗</span><span className="sr-only"> (새 창에서 원문 보기)</span></a></h3><div className="feed-tags">{item.topics.map(value => <span key={value}>{value}</span>)}</div></article>)}</div>
    {!loading && !articles.length && <div className="empty-state"><h3>{data && failures.length === sources.length ? "수집 출처에 연결하지 못했습니다" : "조건에 맞는 소식이 없습니다"}</h3><p>{data && failures.length === sources.length ? "출처별 원문 링크를 이용하거나 잠시 후 다시 확인해주세요." : "주제를 전체로 선택하거나 검색어를 바꿔보세요. 새 소식은 다음 수집 시 반영됩니다."}</p></div>}
    {pages > 1 && <nav className="pagination" aria-label="뉴스 페이지"><button type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>← 이전</button><span>{current} / {pages}</span><button type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>다음 →</button></nav>}
    <p className="feed-footnote">제목·출처·게시일과 원문 링크를 제공합니다. 자동 분류한 자료이며, 자세한 내용과 정정 사항은 원문에서 확인해주세요. {kind === "trends" ? "수집 범위는 기관이 공개한 최근 목록이며, 학회 공지는 한국산업보건학회(구 한국산업위생학회)를 기준으로 합니다." : "같은 사건을 다룬 다른 언론사의 기사는 함께 표시될 수 있습니다."}</p>
  </div>;
}
