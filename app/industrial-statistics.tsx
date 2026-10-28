"use client";
import { useState } from "react";
import { INDUSTRIAL_STATISTICS, STATISTICS_CHECKED_AT, STATISTICS_SOURCES, musculoskeletalTotal, poisoningTotal } from "../lib/industrial-statistics";

const number = (value: number) => value.toLocaleString("ko-KR");
export function IndustrialStatistics({ initialYear = 2025 }: { initialYear?: number }) {
  const [year, setYear] = useState(initialYear);
  const row = INDUSTRIAL_STATISTICS.find(item => item.year === year)!;
  const previous = INDUSTRIAL_STATISTICS.find(item => item.year === year - 1);
  const [metric, setMetric] = useState("deaths");
  const cards = [
    { label: "산재 사망자", value: row.deaths, unit: "명", detail: `사고 ${number(row.accidentDeaths)}명 · 질병 ${number(row.diseaseDeaths)}명`, className: "stat-danger" },
    { label: "전체 산업재해자", value: row.casualties, unit: "명", detail: "업무상 사고·질병 재해자 합계" },
    { label: "산업재해 발생 건수", value: row.cases, unit: "건", detail: row.cases === null ? "해당 현황표에 미수록 · 2024년 값은 연도 선택" : "사람 수와 구분한 재해 건수" },
    { label: "안전 분야 · 사고재해자", value: row.accidentVictims, unit: "명", detail: "공식 분류: 업무상사고 재해자" },
    { label: "보건 분야 · 질병재해자", value: row.diseaseVictims, unit: "명", detail: "공식 분류: 업무상질병 재해자" },
    { label: "화학물질 중독 재해자", value: poisoningTotal(row), unit: "명", detail: "금속·중금속 + 유기화합물 + 기타 화학물질 중독" },
    { label: "근골격계질환 재해자", value: musculoskeletalTotal(row), unit: "명", detail: "신체부담작업 + 요통 + 사고성요통 + 기타" },
  ];
  const chartValue = (item: typeof row) => metric === "deaths" ? item.deaths : metric === "poisoning" ? poisoningTotal(item) : metric === "musculoskeletal" ? musculoskeletalTotal(item) : item.casualties;
  const maximum = Math.max(...INDUSTRIAL_STATISTICS.map(chartValue));
  return <section className="industrial-statistics" aria-labelledby="industrial-statistics-title">
    <div className="statistics-heading"><div><span className="eyebrow">WORKPLACE SAFETY IN NUMBERS</span><h2 id="industrial-statistics-title">숫자로 보는 산업재해</h2><p>고용노동부 공식 연간 통계 · 대한민국 전체</p></div><div className="statistics-year"><label htmlFor="statistics-year">조회 연도</label><select id="statistics-year" value={year} onChange={event => setYear(Number(event.target.value))}>{[...INDUSTRIAL_STATISTICS].reverse().map(item => <option key={item.year} value={item.year}>{item.year}년</option>)}</select></div></div>
    <div className="statistics-cards" aria-live="polite">{cards.map(card => <article className={`statistics-card ${card.className ?? ""}`} key={card.label}><h3>{card.label}</h3><div><strong>{card.value === null ? "미수록" : number(card.value)}</strong>{card.value !== null && <span>{card.unit}</span>}</div><p>{card.detail}</p></article>)}</div>
    <div className="statistics-bottom"><div className="statistics-change"><strong>{year}년 사망자 {number(row.deaths)}명</strong><span>{previous ? `전년 대비 ${row.deaths >= previous.deaths ? "+" : ""}${number(row.deaths - previous.deaths)}명 (${((row.deaths - previous.deaths) / previous.deaths * 100).toFixed(1)}%)` : "사고 사망과 질병 사망을 합산한 인원"}</span></div><div className="statistics-chart"><label htmlFor="statistics-chart-metric">연도별 비교</label><select id="statistics-chart-metric" value={metric} onChange={event => setMetric(event.target.value)}><option value="deaths">사망자 수</option><option value="casualties">전체 재해자 수</option><option value="poisoning">화학물질 중독</option><option value="musculoskeletal">근골격계질환</option></select><ul>{INDUSTRIAL_STATISTICS.map(item => <li key={item.year}><span>{item.year}</span><div className="statistics-bar" aria-hidden="true"><i style={{ width: `${chartValue(item) / maximum * 100}%` }} /></div><strong>{number(chartValue(item))}명</strong></li>)}</ul></div></div>
    <details className="statistics-details"><summary>연도별 전체 표 · 집계 기준 · 출처 확인</summary><div className="board-table-wrap"><table className="statistics-table"><caption>산업재해 연간 비교 · 단위는 항목명에 표시</caption><thead><tr><th scope="col">연도</th><th scope="col">사망자(명)</th><th scope="col">전체 재해자(명)</th><th scope="col">재해 건수(건)</th><th scope="col">사고재해자(명)</th><th scope="col">질병재해자(명)</th><th scope="col">화학물질 중독(명)</th><th scope="col">근골격계질환(명)</th></tr></thead><tbody>{INDUSTRIAL_STATISTICS.map(item => <tr key={item.year}><th scope="row">{item.year}</th>{[item.deaths, item.casualties, item.cases, item.accidentVictims, item.diseaseVictims, poisoningTotal(item), musculoskeletalTotal(item)].map((value, index) => <td key={index}>{value === null ? "미수록" : number(value)}</td>)}</tr>)}</tbody></table></div>
    <ul className="statistics-notes"><li>재해 발생일이 아닌 산재보상 승인일 기준 연간 통계입니다. 사망자 수는 사망사고 발생 건수와 다릅니다.</li><li>안전·보건 분야는 각각 공식 분류인 업무상사고·업무상질병의 재해자 수로 표시합니다. 재해자에는 사망자가 포함됩니다.</li><li>화학물질 중독은 세 중독 항목의 인원을 합산했습니다. 급성 중독사고의 발생 건수나 누출사고 건수가 아닙니다.</li><li>근골격계질환은 신체부담작업·요통·사고성요통·기타 인원의 합계이며 질병재해자의 일부입니다. 세부 항목을 전체 재해자와 다시 더하면 중복됩니다.</li><li>2025년 재해 발생 건수는 확인한 연간 현황표에 없어 미수록으로 표시합니다. 2023·2024년 건수는 분석 책자에서 확인했습니다.</li></ul>
    <div className="statistics-source-links">{STATISTICS_SOURCES.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗<small>{source.detail}</small></a>)}</div></details>
    <p className="statistics-verified">출처: 고용노동부 산업재해현황·현황분석 · 원문 확인 {STATISTICS_CHECKED_AT} · 실시간 사고 집계가 아닌 연간 공표 자료</p>
  </section>;
}
