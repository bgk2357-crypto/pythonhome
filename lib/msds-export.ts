import { GHS, MSDS_SECTION_TITLES, type MsdsRecord } from "./msds";
import { fieldValue, MSDS_FIELDS, msdsDocumentBlocks, pictogramDescription, sectionValue } from "./msds-document";
type ExportOptions = { images?: Record<string, Uint8Array> };
export function downloadBytes(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type })); const link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 20000);
}
async function imagesFor(ids: string[], options: ExportOptions) {
  if (options.images) return options.images;
  const result: Record<string, Uint8Array> = {};
  if (typeof window === "undefined") return result;
  for (const id of [...new Set(ids)].filter(id => GHS.some(([code]) => code === id))) { const response = await fetch(`/ghs/${id}.png`); if (!response.ok) throw Error("그림문자를 불러오지 못했습니다."); result[id] = new Uint8Array(await response.arrayBuffer()); }
  return result;
}
function chunks(value: string, size = 30000) { const result: string[] = []; for (let at = 0; at < Math.max(1, value.length); at += size) result.push(value.slice(at, at + size)); return result; }
export async function msdsWorkbook(records: MsdsRecord[], options: ExportOptions = {}) {
  const { default: ExcelJS } = await import("exceljs"); const workbook = new ExcelJS.Workbook(); workbook.creator = "Argo&Health Lab"; workbook.created = new Date();
  const sheet = workbook.addWorksheet("물질목록", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [...MSDS_FIELDS.map(([key, header]) => ({ key, header, width: ["hazards", "precautions", "classification"].includes(key) ? 55 : 25 })), { key: "pictograms", header: "GHS 그림문자 코드·명칭", width: 45 }, { key: "reviewed", header: "원문 검토", width: 15 }, { key: "fileName", header: "출처 파일", width: 35 }, { key: "importedAt", header: "가져온 일시", width: 26 }];
  records.forEach(record => sheet.addRow({ ...Object.fromEntries(MSDS_FIELDS.map(([key]) => [key, fieldValue(record, key).slice(0, 32000)])), pictograms: pictogramDescription(record), reviewed: record.reviewed ? "검토 완료" : "검토 필요", fileName: record.fileName, importedAt: record.importedAt }));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, records.length + 1), column: sheet.columns.length } };
  const details = workbook.addWorksheet("취급·응급조치"); details.columns = [{ header: "제품명", key: "product", width: 25 }, ...["ingredients", "firstAid", "fire", "spill", "handling", "protection"].map((key, index) => ({ header: ["구성성분 원문", "응급조치", "화재 대응", "누출 대응", "취급·저장", "보호구·노출방지"][index], key, width: 60 }))];
  records.forEach(record => details.addRow(Object.fromEntries(["product", "ingredients", "firstAid", "fire", "spill", "handling", "protection"].map(key => [key, fieldValue(record, key as keyof MsdsRecord).slice(0, 32000)]))));
  const full = workbook.addWorksheet("전체항목"); full.columns = [{ header: "제품명", key: "product", width: 25 }, { header: "항목 순서", key: "order", width: 12 }, { header: "항목", key: "label", width: 28 }, { header: "조각 번호", key: "part", width: 12 }, { header: "내용", key: "text", width: 100 }];
  for (const record of records) for (const [index, [key, label]] of MSDS_FIELDS.entries()) chunks(fieldValue(record, key)).forEach((text, part) => full.addRow({ product: record.product, order: index + 1, label, part: part + 1, text }));
  const numbered = workbook.addWorksheet("MSDS16항"); numbered.columns = [{ header: "제품명", key: "product", width: 25 }, { header: "항 번호", key: "section", width: 12 }, { header: "항 제목", key: "title", width: 35 }, { header: "조각 번호", key: "part", width: 12 }, { header: "항별 전체 원문·편집 내용", key: "text", width: 100 }];
  for (const record of records) for (let section = 1; section <= 16; section++) chunks(sectionValue(record, section)).forEach((text, part) => numbered.addRow({ product: record.product, section, title: MSDS_SECTION_TITLES[section - 1], part: part + 1, text }));
  const symbols = workbook.addWorksheet("GHS그림문자"); symbols.columns = [{ header: "제품명", key: "product", width: 25 }, { header: "CAS 번호", key: "cas", width: 25 }, { header: "GHS 코드", key: "code", width: 15 }, { header: "그림문자 명칭", key: "name", width: 20 }, { header: "그림", key: "image", width: 17 }, { header: "확인 근거", key: "evidence", width: 55 }];
  const images = await imagesFor(records.flatMap(record => record.pictograms), options);
  for (const record of records) for (const id of record.pictograms) { const row = symbols.addRow({ product: record.product, cas: record.cas, code: id, name: GHS.find(([code]) => code === id)?.[1] ?? id, evidence: record.pictogramEvidence?.[id] || "편집자 선택" }); row.height = 82; if (images[id]) { const image = workbook.addImage({ buffer: new Uint8Array(images[id]) as never, extension: "png" }); symbols.addImage(image, { tl: { col: 4, row: row.number - 1 + 0.05 }, ext: { width: 96, height: 96 } }); } }
  const raw = workbook.addWorksheet("추출원문"); raw.columns = [{ header: "출처 파일", key: "file", width: 35 }, { header: "제품명", key: "product", width: 25 }, { header: "텍스트 조각 번호", key: "part", width: 18 }, { header: "전체 추출 원문", key: "text", width: 100 }];
  for (const record of records) chunks(record.text).forEach((text, part) => raw.addRow({ file: record.fileName, product: record.product, part: part + 1, text }));
  workbook.eachSheet(sheet => { sheet.getRow(1).height = 26; sheet.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF154B6B" } }; }); sheet.eachRow((row, number) => { if (number > 1) { row.alignment = { vertical: "top", wrapText: true }; row.font = { size: 10 }; } }); });
  return workbook.xlsx.writeBuffer();
}
function xml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ""); }
function pictureXml(id: string, index: number) {
  return `<hp:pic id="${900000 + index}" zOrder="${index}" numberingType="PICTURE" textWrap="SQUARE" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${800000 + index}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="6000" height="6000"/><hp:curSz width="6000" height="6000"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="3000" centerY="3000" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="6000" y="0"/><hc:pt2 x="6000" y="6000"/><hc:pt3 x="0" y="6000"/></hp:imgRect><hp:imgClip left="0" right="6000" top="0" bottom="6000"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="6000" dimheight="6000"/><hc:img binaryItemIDRef="${id}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:sz width="6000" widthRelTo="ABSOLUTE" height="6000" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="1" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>${id}</hp:shapeComment></hp:pic>`;
}
export async function msdsHwpx(record: MsdsRecord, template: ArrayBuffer, options: ExportOptions = {}) {
  const { default: JSZip } = await import("jszip"); const original = await JSZip.loadAsync(template); const zip = new JSZip();
  // HWPX identification must be the first uncompressed ZIP member.
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE", createFolders: false });
  for (const name of Object.keys(original.files)) if (name !== "mimetype" && !original.files[name].dir) zip.file(name, await original.files[name].async("uint8array"), { createFolders: false });
  let section = await original.file("Contents/section0.xml")!.async("string"); const images = await imagesFor(record.pictograms, options); let manifest = await original.file("Contents/content.hpf")!.async("string"); let index = 1000;
  const lineSegments = '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>';
  const paragraph = (text: string, picture = "") => `<hp:p id="${index++}" paraPrIDRef="3" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${picture}<hp:t>${xml(text)}</hp:t></hp:run>${lineSegments}</hp:p>`;
  let paragraphs = "";
  for (const block of msdsDocumentBlocks(record)) { paragraphs += paragraph(block.title); if (block.title === "GHS 그림문자") for (const id of record.pictograms) { if (images[id]) { zip.file(`BinData/${id}.png`, images[id], { createFolders: false }); manifest = manifest.replace('</opf:manifest>', `<opf:item id="${id}" href="BinData/${id}.png" media-type="image/png" isEmbeded="1"/></opf:manifest>`); paragraphs += paragraph(`${id} ${GHS.find(([code]) => code === id)?.[1] ?? ""}`, pictureXml(id, index)); } } for (const line of block.text.split("\n")) paragraphs += paragraph(line); paragraphs += paragraph(""); }
  section = section.replace('</hs:sec>', paragraphs + '</hs:sec>'); zip.file('Contents/section0.xml', section, { createFolders: false }); zip.file('Contents/content.hpf', manifest, { createFolders: false });
  zip.file('Preview/PrvText.txt', msdsDocumentBlocks(record).map(block => block.title + '\r\n' + block.text).join('\r\n\r\n'), { createFolders: false });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
function rtfText(value: string) {
  let result = ''; for (let index = 0; index < value.length; index++) { const code = value.charCodeAt(index); const char = value[index]; if (char === '\n') result += '\\line '; else if (char === '\r') continue; else if (char === '\\' || char === '{' || char === '}') result += '\\' + char; else if (char === '\t') result += '\\tab '; else if (code < 32) continue; else if (code < 128) result += char; else result += `\\u${code > 32767 ? code - 65536 : code}?`; } return result;
}
export async function msdsRtf(record: MsdsRecord, options: ExportOptions = {}) {
  const images = await imagesFor(record.pictograms, options);
  let text = '{\\rtf1\\ansi\\ansicpg949\\deff0\\uc1{\\fonttbl{\\f0\\fnil\\fcharset129 Malgun Gothic;}}\\paperw11906\\paperh16838\\margl1134\\margr1134\\margt1134\\margb1134\\f0\\fs20\n';
  for (const block of msdsDocumentBlocks(record)) { text += `\\pard\\sb180\\sa100\\b\\fs24 ${rtfText(block.title)}\\b0\\fs20\\par\n`;
    if (block.title === 'GHS 그림문자') for (const id of record.pictograms) if (images[id]) { const hex = Array.from(images[id], byte => byte.toString(16).padStart(2, '0')).join(''); text += `{\\pict\\pngblip\\picw192\\pich192\\picwgoal1200\\pichgoal1200 ${hex}} ${rtfText(id)}\\par\n`; }
    text += `\\pard\\sa100 ${rtfText(block.text)}\\par\n`;
  }
  return new TextEncoder().encode(text + '}');
}
