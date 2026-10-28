export type IndustrialYear = {
  year: number; casualties: number; cases: number | null; deaths: number; accidentDeaths: number; diseaseDeaths: number;
  accidentVictims: number; diseaseVictims: number; poisoning: [number, number, number]; musculoskeletal: [number, number, number, number];
};
// Official MOEL compensation-approval statistics. No estimates or live counters.
// 2024 analysis PDF: printed pp. 18–19, 23, 29 (PDF pp. 24–25, 29, 35).
// 2025 annual HWP: V. reference tables, totals and disease-type breakdown.
export const INDUSTRIAL_STATISTICS: IndustrialYear[] = [
  { year: 2023, casualties: 136796, cases: 136077, deaths: 2016, accidentDeaths: 812, diseaseDeaths: 1204, accidentVictims: 113465, diseaseVictims: 23331, poisoning: [55, 27, 190], musculoskeletal: [7596, 2272, 2932, 210] },
  { year: 2024, casualties: 142771, cases: 141973, deaths: 2098, accidentDeaths: 827, diseaseDeaths: 1271, accidentVictims: 115773, diseaseVictims: 26998, poisoning: [30, 33, 178], musculoskeletal: [9917, 3124, 3003, 223] },
  { year: 2025, casualties: 147130, cases: null, deaths: 2248, accidentDeaths: 872, diseaseDeaths: 1376, accidentVictims: 113305, diseaseVictims: 33825, poisoning: [32, 38, 189], musculoskeletal: [14185, 4638, 3020, 302] },
];
export const STATISTICS_SOURCES = [
  { title: "2024년 산업재해 현황분석 책자", url: "https://www.moel.go.kr/policy/policydata/view.do?bbs_seq=20251201429", detail: "2023·2024년 비교표, 산업재해 건수와 질환별 집계" },
  { title: "2025년 산업재해 현황", url: "https://www.moel.go.kr/policy/policydata/view.do?bbs_seq=20260301471", detail: "2025년 연간 현황 · 2026.03.31 공표" },
];
export const STATISTICS_CHECKED_AT = "2026-10-23";
export function poisoningTotal(row: IndustrialYear) { return row.poisoning.reduce((total, value) => total + value, 0); }
export function musculoskeletalTotal(row: IndustrialYear) { return row.musculoskeletal.reduce((total, value) => total + value, 0); }
