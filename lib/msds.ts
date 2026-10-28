export type MsdsRecord = {
  id: string; fileName: string; importedAt: string; product: string; supplier: string; address: string; phone: string;
  workplace: string; department: string; cas: string; ingredients: string; signal: string; hazards: string; precautions: string;
  firstAid: string; fire: string; spill: string; handling: string; protection: string; pictograms: string[];
  text: string; reviewed: boolean;
  emergencyPhone?: string; recommendedUse?: string; restrictions?: string; classification?: string;
  sectionText?: Record<string, string>; pictogramEvidence?: Record<string, string>; extractionNotes?: string[];
};
export const MSDS_SECTION_TITLES = ["화학제품과 회사에 관한 정보", "유해성·위험성", "구성성분의 명칭 및 함유량", "응급조치 요령", "폭발·화재시 대처방법", "누출사고시 대처방법", "취급 및 저장방법", "노출방지 및 개인보호구", "물리화학적 특성", "안정성 및 반응성", "독성에 관한 정보", "환경에 미치는 영향", "폐기시 주의사항", "운송에 필요한 정보", "법적 규제현황", "그 밖의 참고사항"];
export const GHS = [
  ["GHS01", "폭발성"], ["GHS02", "인화성"], ["GHS03", "산화성"], ["GHS04", "고압가스"], ["GHS05", "부식성"],
  ["GHS06", "급성독성"], ["GHS07", "자극성 등"], ["GHS08", "건강 유해성"], ["GHS09", "환경 유해성"],
];
export const WARNING_SOURCE = "https://msds.kosha.or.kr/MSDSInfo/msds/web/kosha/msds02/Msds02WarningList.jsp";
export const WARNING_LAW = "https://www.law.go.kr/admRulLsInfoP.do?admRulSeq=2100000278320&chrClsCd=010202";
export const LABEL_PRESETS = [
  { id: "small", name: "5ℓ 미만 · 직접 확인", width: 100, height: 90, minimum: 0 },
  { id: "5", name: "5ℓ 이상 ~ 50ℓ 미만 · 90㎠", width: 100, height: 90, minimum: 90 },
  { id: "50", name: "50ℓ 이상 ~ 200ℓ 미만 · 180㎠", width: 150, height: 120, minimum: 180 },
  { id: "200", name: "200ℓ 이상 ~ 500ℓ 미만 · 300㎠", width: 200, height: 150, minimum: 300 },
  { id: "500", name: "500ℓ 이상 · 450㎠", width: 250, height: 180, minimum: 450 },
];
export function casNumbers(text: string) { return [...new Set(text.match(/\b\d{2,7}-\d{2}-\d\b/g) ?? [])]; }
export function sections(text: string) {
  const result: Record<number, string> = {}; const matches = [...text.matchAll(/(?:^|\n)[ \t]*(?:SECTION[ \t]*)?(1[0-6]|[1-9])[ \t]*[.．、):：\-][ \t]*(?:화[ \t]*학|유[ \t]*해|구[ \t]*성|응[ \t]*급|폭[ \t]*발|누[ \t]*출|취[ \t]*급|노[ \t]*출|물[ \t]*리|안[ \t]*정|독[ \t]*성|환[ \t]*경|폐[ \t]*기|운[ \t]*송|법[ \t]*적|그\s*밖|기타|Identification|Hazard|Composition|First|Fire|Accidental|Handling|Exposure|Physical|Stability|Toxicological|Ecological|Disposal|Transport|Regulatory|Other)[^\n]*/gi)];
  matches.forEach((match, index) => { const number = Number(match[1]); const value = text.slice(match.index! + match[0].length, matches[index + 1]?.index ?? text.length).trim(); result[number] = [result[number], value].filter(Boolean).join("\n"); });
  if (!matches.length) {
    const normalize = (value: string) => value.replace(/[\s·ㆍ・.,:：()]/g, "");
    const titles = MSDS_SECTION_TITLES.map(normalize); const headings: { number: number; start: number; end: number }[] = []; let offset = 0;
    for (const line of text.split("\n")) { const number = titles.indexOf(normalize(line)); if (number >= 0) headings.push({ number: number + 1, start: offset, end: offset + line.length }); offset += line.length + 1; }
    headings.forEach((heading, index) => { result[heading.number] = text.slice(heading.end, headings[index + 1]?.start ?? text.length).trim(); });
  }
  return result;
}
const LABELS = ["제품명", "제품 이름", "물질명", "Product name", "Product identifier", "회사명", "공급자명", "제조자명", "제조사명", "제조회사명", "공급회사명", "Company name", "Supplier", "주소", "소재지", "Address", "전화번호", "전화", "연락처", "긴급전화번호", "긴급 전화번호", "비상연락처", "Emergency phone", "Telephone", "신호어", "Signal word", "권고 용도", "권고용도", "사용상의 제한", "사용상 제한", "Recommended use", "Restrictions on use", "사용 회사명", "사용회사명", "사용 부서", "공정명"];
function labelPattern(label: string) { return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[ \\t]*").replace(/([가-힣])(?=[가-힣])/g, "$1[ \\t]*"); }
function cleanLabel(value: string) { return value.replace(/^[ \t]*(?:[가-하a-z][.)．]|\(?\d+[.)]|[-•●○■□])[ \t]*/i, "").trim(); }
function field(text: string, labels: string) {
  const wanted = labels.split("|").sort((a, b) => b.length - a.length).map(labelPattern).join("|");
  const all = LABELS.sort((a, b) => b.length - a.length).map(labelPattern).join("|");
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = cleanLabel(lines[index]);
    const match = line.match(new RegExp(`^(?:${wanted})(?:[ \\t]*[:：=][ \\t]*|[ \\t]+|$)(.*)$`, "i"));
    if (!match) continue;
    let value = match[1].trim();
    if (/^(?:정보|관련\s*정보|information)$/i.test(value)) continue;
    if (!value) { for (let next = index + 1; next < Math.min(lines.length, index + 4); next++) { const candidate = cleanLabel(lines[next]); if (!candidate) continue; if (new RegExp(`^(?:${all})(?:[ \\t]*[:：=]|[ \\t]*$)`, "i").test(candidate)) break; value = candidate; break; } }
    value = value.split(new RegExp(`[ \\t]+(?:${all})[ \\t]*[:：=]`, "i"))[0].trim();
    if (value) return value;
  }
  return text.match(new RegExp(`(?:${wanted})[ \\t]*[:：=][ \\t]*([^\\n]+)`, "i"))?.[1].trim() ?? "";
}
function hazardBlock(text: string, kind: "hazard" | "precaution") {
  const heading = kind === "hazard" ? /유해\s*[·ㆍ・/\-]?\s*위험\s*문구|Hazard statements?/i : /예방\s*조치\s*문구|Precautionary statements?/i;
  const lines = text.split("\n"); const start = lines.findIndex(line => heading.test(line));
  if (start < 0) return "";
  const result = [lines[start].replace(heading, "").replace(/^[ \t:：]+/, "")];
  for (const line of lines.slice(start + 1)) { if (/예방\s*조치\s*문구|유해\s*[·ㆍ・/\-]?\s*위험\s*문구|그림\s*문자|신호어|기타\s*유해|Hazard statements?|Precautionary statements?|Signal word|Pictograms?/i.test(line)) break; result.push(line); }
  return result.join("\n").trim();
}
export function textPictograms(hazard: string) {
  const ids = new Set([...hazard.matchAll(/\bGHS[ _-]?0?([1-9])\b/gi)].map(match => `GHS0${match[1]}`));
  const part = hazard.match(/(?:그림\s*문자|Pictograms?)[ \t:：]*([\s\S]*?)(?=신호어|유해\s*[·ㆍ]?\s*위험\s*문구|예방\s*조치|Signal word|Hazard statements?|$)/i)?.[1] ?? "";
  let remaining = part;
  for (const [id, pattern] of [["GHS03", /원\s*위의\s*불꽃|flame over circle/gi], ["GHS01", /폭발하는\s*폭탄|exploding bomb/gi], ["GHS04", /가스\s*실린더|gas cylinder/gi], ["GHS05", /부식성|corrosion/gi], ["GHS06", /해골(?:과\s*교차된\s*뼈)?|skull(?: and crossbones)?/gi], ["GHS07", /느낌표|exclamation mark/gi], ["GHS08", /건강\s*유해성|health hazard/gi], ["GHS09", /환경\s*유해성|environment/gi], ["GHS02", /불꽃|flame/gi]] as const) { if (pattern.test(remaining)) { ids.add(id); remaining = remaining.replace(pattern, ""); } }
  return [...ids].sort();
}
export function analyseMsds(textValue: string, fileName: string): MsdsRecord {
  const text = textValue.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").replace(/\u00a0/g, " ").slice(0, 1000000);
  const s = sections(text); const identification = s[1] || text.slice(0, 6000); const hazard = s[2] || "";
  const signal = field(hazard, "신호어|Signal word");
  return {
    id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join(""), fileName, importedAt: new Date().toISOString(),
    product: field(identification, "제품명|제품 이름|제품의 명칭|물질명|Product name|Product identifier"),
    supplier: field(identification, "회사명|공급자명|제조자명|제조사명|제조회사명|공급회사명|제조/공급회사명|공급자|제조업체|Company name|Supplier"), address: field(identification, "주소|회사 주소|공급자 주소|소재지|Address"),
    phone: field(identification, "전화번호|전화|연락처|Telephone") || field(identification, "긴급전화번호|긴급 전화번호|비상연락처|Emergency phone"), workplace: field(identification, "사용 회사명|사용회사명"), department: field(identification, "사용 부서|공정명"),
    emergencyPhone: field(identification, "긴급전화번호|긴급 전화번호|비상연락처|Emergency phone"), recommendedUse: field(identification, "권고 용도|권고용도|Recommended use"), restrictions: field(identification, "사용상의 제한|사용상 제한|Restrictions on use"), classification: hazard.split(/(?:그림\s*문자|신호어|유해\s*[·ㆍ]?\s*위험\s*문구|Signal word|Pictograms?)/i)[0].trim(),
    cas: casNumbers(s[3] || text).join(", "), ingredients: s[3] || "",
    signal: /위험|Danger/i.test(signal) ? "위험" : /경고|Warning/i.test(signal) ? "경고" : "",
    hazards: hazardBlock(hazard, "hazard") || hazard.split("\n").filter(line => /\bH\d{3}(?:\+H?\d{3})*\b/.test(line)).join("\n"),
    precautions: hazardBlock(hazard, "precaution") || hazard.split("\n").filter(line => /\bP\d{3}(?:\+P?\d{3})*\b/.test(line)).join("\n"),
    firstAid: s[4] || "", fire: s[5] || "", spill: s[6] || "", handling: s[7] || "", protection: s[8] || "",
    pictograms: textPictograms(hazard), pictogramEvidence: Object.fromEntries(textPictograms(hazard).map(id => [id, "원문 2항의 코드/그림문자 이름"])), sectionText: Object.fromEntries(Object.entries(s).map(([key, value]) => [key, value])), extractionNotes: textValue.length > 1000000 ? ["원문 텍스트가 100만 자를 초과해 일부가 제외되었습니다."] : [], text, reviewed: false,
  };
}
export function labelProblems(record: MsdsRecord, width: number, height: number, presetId: string, surfaceArea: number) {
  const problems: string[] = []; const preset = LABEL_PRESETS.find(item => item.id === presetId);
  const area = width * height / 100;
  if (!Number.isFinite(area) || width < 30 || height < 30 || width > 400 || height > 400) problems.push("가로·세로는 30~400mm 범위로 입력해주세요.");
  const minimum = presetId === "small" ? surfaceArea * 0.05 : preset?.minimum ?? 0;
  if (presetId === "small" && (!Number.isFinite(surfaceArea) || surfaceArea <= 0)) problems.push("5ℓ 미만은 용기·포장 표면적(상하 면적 제외)을 입력해 면적 기준을 확인해주세요.");
  if (area + 0.001 < minimum) problems.push(`표지 면적이 ${minimum.toFixed(1)}㎠ 이상이어야 합니다.`);
  if (!record.product.trim()) problems.push("제품명을 확인해주세요.");
  if (!record.supplier.trim() || !record.address.trim() || !record.phone.trim()) problems.push("공급자명·주소·전화번호를 입력해주세요.");
  if (!["위험", "경고", "해당 없음"].includes(record.signal)) problems.push("원문 2항의 신호어를 선택해주세요.");
  if (record.signal !== "해당 없음" && (!record.hazards.trim() || !record.precautions.trim() || !record.pictograms.length)) problems.push("원문에 따른 그림문자·유해위험 문구·예방조치 문구를 확인해주세요.");
  if (record.signal === "해당 없음" && (record.pictograms.length || record.hazards.trim())) problems.push("분류 해당 없음과 유해성 항목이 충돌합니다. 원문을 다시 확인해주세요.");
  if (record.pictograms.includes("GHS06") && record.pictograms.includes("GHS07")) problems.push("해골과 느낌표의 우선순위 적용 여부를 원문과 대조해 그림문자를 정리해주세요.");
  if (!record.reviewed) problems.push("원문 MSDS와 추출·수정 내용을 대조한 뒤 검토 완료를 선택해주세요.");
  return problems;
}
