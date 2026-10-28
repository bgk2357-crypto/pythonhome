import { lawGroups, lawSearchUrl, lawTextUrl } from "./laws";

export function LegalResources({ path }: { path: string }) {
  if (path === "/resources/guidelines") return <>
    <p className="notice">안전보건공단의 기술지원규정(KOSHA GUIDE)을 공식 포털에서 확인하세요. 지침명이나 지침번호로 검색할 수 있습니다.</p>
    <div className="legal-links"><a href="https://smartsearch.kosha.or.kr/" target="_blank" rel="noopener noreferrer"><span><strong>KOSHA GUIDE 검색</strong><small>안전보건공단 스마트검색 · 지침명이나 지침번호 입력 후 기술지침 자료 확인</small></span><span aria-hidden="true">↗</span></a><a href="https://portal.kosha.or.kr/archive/resources/tech-support/revision/RevisionNoticePage" target="_blank" rel="noopener noreferrer"><span><strong>기술지원규정 제·개정 공지</strong><small>안전보건공단 공식 포털 · 최신 제·개정 자료 확인</small></span><span aria-hidden="true">↗</span></a></div>
    <p className="muted">공식 포털에서 ‘산재예방 정보 → 가이드 → 기술지원규정(KOSHA GUIDE)’ 메뉴로도 찾아갈 수 있습니다.</p>
  </>;
  const group = lawGroups[path];
  if (!group) return null;
  return <div className="law-library">
    <div className="law-search-box">
      <p className="eyebrow">MINISTRY OF GOVERNMENT LEGISLATION</p>
      <h2>법제처 국가법령정보센터 검색</h2>
      <p>법령명을 입력하면 법제처의 검색 결과가 새 창에서 열립니다.</p>
      <form action="https://www.law.go.kr/lsSc.do" method="get" target="_blank" rel="noopener noreferrer" className="law-search-form">
        <input type="hidden" name="menuId" value="1" /><input type="hidden" name="subMenuId" value="15" /><input type="hidden" name="tabMenuId" value="81" />
        <label htmlFor="law-query">검색할 법령명</label>
        <div className="law-search-row"><input id="law-query" type="search" name="query" defaultValue={group.search} required maxLength={100} /><button className="button" type="submit">법제처 검색 ↗</button></div>
      </form>
      <div className="law-shortcuts" aria-label="주요 법령 검색">
        <a href={lawSearchUrl("산업안전보건법")} target="_blank" rel="noopener noreferrer">산업안전보건법 검색 ↗</a>
        <a href={lawSearchUrl("중대재해 처벌 등에 관한 법률")} target="_blank" rel="noopener noreferrer">중대재해처벌법 검색 ↗</a>
      </div>
    </div>
    <div className="law-section-top"><h2>{group.heading}</h2><span>법제처 공식 원문</span></div>
    <p className="muted">법률과 시행령·규칙을 각각 선택해 확인할 수 있습니다.</p>
    <div className="law-reference-list">{group.items.map(law => <article className="law-reference" key={law.name}>
      <span className="law-type">{law.type}</span>
      <div className="law-reference-copy"><h3>{law.title}</h3><p>{law.description}</p></div>
      <div className="law-reference-actions"><a className="law-primary-link" href={lawTextUrl(law.name)} target="_blank" rel="noopener noreferrer">본문 보기 ↗</a><a href={lawSearchUrl(law.title)} target="_blank" rel="noopener noreferrer">검색 결과 ↗</a></div>
    </article>)}</div>
    <div className="law-help"><h3>하위법령과 별표·서식도 확인하려면</h3><ol><li>위 목록에서 <strong>본문 보기</strong>를 선택합니다.</li><li>국가법령정보센터에서 <strong>법령체계도</strong>를 선택하면 관련 상·하위법령을 볼 수 있습니다.</li><li><strong>3단비교</strong>에서는 법률·시행령·시행규칙을 함께 비교하고, <strong>별표·서식</strong>에서는 관련 양식을 확인합니다. 제공 항목은 법령에 따라 다를 수 있습니다.</li></ol><p>현행·예정·연혁 법령과 시행일은 법제처 원문에서 확인해주세요. 이 홈페이지에 법령 본문을 복사해 저장하지 않습니다.</p></div>
  </div>;
}
