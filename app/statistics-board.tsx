"use client";
import { useState } from "react";
import { INDUSTRIAL_STATISTICS } from "../lib/industrial-statistics";
import { IndustrialStatistics } from "./industrial-statistics";
export function StatisticsBoard() {
  const [year, setYear] = useState(2025);
  return <><div className="board-top"><h2>연도별 산업재해 통계</h2><span>고용노동부 공식 연간 자료 · 3개 연도</span></div><div className="board-table-wrap"><table className="board-table"><caption className="sr-only">연도별 산업재해 현황 게시판</caption><thead><tr><th>연도</th><th>통계 자료</th><th>재해자 수</th><th>사망자 수</th></tr></thead><tbody>{[...INDUSTRIAL_STATISTICS].reverse().map(row => <tr key={row.year}><td>{row.year}</td><td><button className="msds-select" onClick={() => { setYear(row.year); document.getElementById("statistics-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{row.year}년 산업재해 현황 보기 →</button></td><td>{row.casualties.toLocaleString("ko-KR")}명</td><td>{row.deaths.toLocaleString("ko-KR")}명</td></tr>)}</tbody></table></div><div id="statistics-detail" className="statistics-board-detail"><IndustrialStatistics key={year} initialYear={year} /></div></>;
}
