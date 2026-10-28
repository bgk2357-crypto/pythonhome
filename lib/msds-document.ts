import { GHS, MSDS_SECTION_TITLES, sections, type MsdsRecord } from "./msds";
export const MSDS_FIELDS: [keyof MsdsRecord, string][] = [["product", "제품명"], ["cas", "CAS 번호"], ["supplier", "공급자·제조자명"], ["address", "공급자 주소"], ["phone", "공급자 전화"], ["emergencyPhone", "긴급전화"], ["recommendedUse", "권고 용도"], ["restrictions", "사용상의 제한"], ["workplace", "사용 회사명"], ["department", "사용 부서·공정"], ["classification", "유해성·위험성 분류"], ["signal", "신호어"], ["hazards", "유해·위험 문구"], ["precautions", "예방조치 문구"], ["ingredients", "구성성분·함유량"], ["firstAid", "응급조치"], ["fire", "화재 대응"], ["spill", "누출 대응"], ["handling", "취급·저장"], ["protection", "보호구·노출 방지"]];
export function fieldValue(record: MsdsRecord, key: keyof MsdsRecord) { return String(record[key] ?? ""); }
export function sectionValue(record: MsdsRecord, number: number) { return record.sectionText?.[String(number)] ?? sections(record.text)[number] ?? ""; }
export function pictogramDescription(record: MsdsRecord) { return record.pictograms.map(id => `${id} ${GHS.find(([code]) => code === id)?.[1] ?? ""}`).join(", "); }
export function msdsDocumentBlocks(record: MsdsRecord) {
  const blocks = [{ title: "MSDS 분석·검토 자료", text: "원문에서 추출한 내용과 편집자가 수정한 정보를 함께 정리한 자료입니다." }, { title: "기본정보·편집한 정보", text: MSDS_FIELDS.map(([key, label]) => `${label}: ${fieldValue(record, key) || "원문 확인 필요"}`).join("\n") }, { title: "GHS 그림문자", text: pictogramDescription(record) || "선택된 그림문자 없음 — 원문 확인 필요" }];
  for (let number = 1; number <= 16; number++) blocks.push({ title: `${number}. ${MSDS_SECTION_TITLES[number - 1]}`, text: sectionValue(record, number) || "원문에서 확인되지 않은 항목입니다." });
  blocks.push({ title: "출처·검토 상태", text: `출처 파일: ${record.fileName}\n가져온 일시: ${record.importedAt}\n원문 대조: ${record.reviewed ? "검토 완료" : "검토 필요"}\n${(record.extractionNotes ?? []).join("\n")}` });
  blocks.push({ title: "전체 추출 원문", text: record.text });
  return blocks;
}
