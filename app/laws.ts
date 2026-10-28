export type LawReference = { title: string; type: string; name: string; description: string };
export function lawSearchUrl(query: string) {
  const url = new URL("https://www.law.go.kr/lsSc.do");
  url.searchParams.set("menuId", "1");
  url.searchParams.set("subMenuId", "15");
  url.searchParams.set("tabMenuId", "81");
  url.searchParams.set("query", query);
  return url.toString();
}
export function lawTextUrl(name: string) { return "https://www.law.go.kr/법령/" + encodeURIComponent(name); }
export const lawGroups: Record<string, { search: string; heading: string; items: LawReference[] }> = {
  "/resources/osh-law": {
    search: "산업안전보건법", heading: "산업안전보건법과 하위법령",
    items: [
      { title: "산업안전보건법", type: "법률", name: "산업안전보건법", description: "산업안전보건법의 본문·부칙·별표·연혁을 확인합니다." },
      { title: "산업안전보건법 시행령", type: "대통령령", name: "산업안전보건법시행령", description: "법에서 위임한 사항을 정한 시행령을 확인합니다." },
      { title: "산업안전보건법 시행규칙", type: "고용노동부령", name: "산업안전보건법시행규칙", description: "시행에 필요한 절차와 서식 등 세부 내용을 확인합니다." },
      { title: "산업안전보건기준에 관한 규칙", type: "고용노동부령", name: "산업안전보건기준에관한규칙", description: "안전·보건에 관한 작업 및 시설 등의 기준을 확인합니다." },
      { title: "유해·위험작업의 취업 제한에 관한 규칙", type: "고용노동부령", name: "유해ㆍ위험작업의취업제한에관한규칙", description: "유해·위험작업의 취업 제한에 관한 규칙을 확인합니다." },
    ],
  },
  "/resources/serious-law": {
    search: "중대재해 처벌 등에 관한 법률", heading: "중대재해처벌법과 하위법령",
    items: [
      { title: "중대재해 처벌 등에 관한 법률", type: "법률", name: "중대재해처벌등에관한법률", description: "중대재해처벌법의 현행 본문과 연혁을 확인합니다." },
      { title: "중대재해 처벌 등에 관한 법률 시행령", type: "대통령령", name: "중대재해처벌등에관한법률시행령", description: "법에서 위임한 사항과 시행에 필요한 내용을 확인합니다." },
    ],
  },
};
