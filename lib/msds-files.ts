import {extractProductMatrix} from './msds-matrix';
import { analyseMsds } from "./msds";
import { pdfPageText, xmlDocumentText } from "./msds-layout";

const MAX_UNPACKED = 16 * 1024 * 1024;
export async function extractMsdsFile(file: File, options: { pdfWorkerSrc?: string } = {}) {
  if (file.size > 10 * 1024 * 1024) throw new Error("파일은 10MB 이하로 선택해주세요.");
  const extension = file.name.split(".").pop()?.toLowerCase(); const buffer = await file.arrayBuffer(); let text = "";
  const matrixPages:unknown[][]=[];
  const evidence: Record<string, string> = {}; const notes: string[] = []; let unidentified = 0;
  async function inspectImage(bytes: Uint8Array, source: string) { try { const { imagePictograms } = await import("./msds-pictograms"); for (const match of await imagePictograms(bytes)) { if (match.id) evidence[match.id] = source; else unidentified++; } } catch { /* A non-image attachment must not prevent text extraction. */ } }
  if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = options.pdfWorkerSrc ?? "/vendor/pdf.worker.min.mjs";
    const loading = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
    const pdf = await loading.promise;
    try {
      if (pdf.numPages > 80) throw new Error("80페이지 이하의 MSDS를 선택해주세요.");
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number); const content = await page.getTextContent();
        matrixPages.push(content.items); const pageText = pdfPageText(content.items); text += pageText + "\n";
        if (typeof document !== "undefined" && (number <= 5 || /(?:^|\n)\s*2[.)．]\s*유해/.test(pageText))) {
          try { const viewport = page.getViewport({ scale: 1.25 }); const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); const context = canvas.getContext("2d", { willReadFrequently: true });
            if (context && canvas.width * canvas.height <= 8000000) { await page.render({ canvasContext: context, canvas, viewport }).promise; const { recognisePictograms } = await import("./msds-pictograms"); for (const match of recognisePictograms(context.getImageData(0, 0, canvas.width, canvas.height))) { if (match.id) evidence[match.id] = `원본 PDF ${number}쪽 그림`; else unidentified++; } }
          } catch { notes.push(`PDF ${number}쪽 그림을 자동 대조하지 못했습니다. 원문 그림문자를 확인해주세요.`); }
        }
      }
    } finally { await loading.destroy(); }
  } else if (extension === "docx" || extension === "hwpx") {
    const { default: JSZip } = await import("jszip"); const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files).filter(name => extension === "docx" ? name === "word/document.xml" : /^Contents\/section\d+\.xml$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (names.length > 80) throw new Error("문서 구역이 너무 많습니다.");
    let xmlSize = 0;
    for (const name of names) {
      const entry = zip.file(name)!;
      const uncompressedSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
      if (uncompressedSize && uncompressedSize > MAX_UNPACKED) throw new Error("문서의 텍스트 용량이 너무 큽니다.");
      const xml = await entry.async("string"); xmlSize += xml.length; if (xmlSize > MAX_UNPACKED) throw new Error("문서의 텍스트 용량이 너무 큽니다.");
      const document = new DOMParser().parseFromString(xml, "application/xml");
      if (document.getElementsByTagName("parsererror").length) throw new Error("문서 XML을 읽을 수 없습니다.");
      text += xmlDocumentText(document) + "\n";
    }
    const images = Object.keys(zip.files).filter(name => !zip.files[name].dir && /^(?:BinData|word\/media)\//i.test(name)); let imageBytes = 0;
    for (const name of images.slice(0, 40)) { const entry = zip.file(name)!; const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0; if (size > 5000000 || imageBytes + size > MAX_UNPACKED) { notes.push("일부 큰 이미지의 자동 대조를 생략했습니다. 원문 그림문자를 확인해주세요."); continue; } const bytes = await entry.async("uint8array"); imageBytes += bytes.length; if (imageBytes > MAX_UNPACKED) break; await inspectImage(bytes, `원본 문서 그림 ${name.split("/").pop()}`); }
    if (images.length > 40) notes.push("문서의 처음 40개 이미지를 자동 대조했습니다. 나머지 그림문자는 원문에서 확인해주세요.");
  } else if (extension === "hwp") {
    const CFB = await import("cfb"); const { inflateSync } = await import("fflate");
    const compound = CFB.read(new Uint8Array(buffer), { type: "array" });
    const header = compound.FileIndex[compound.FullPaths.findIndex(name => /\/FileHeader$/.test(name))]?.content;
    if (!header || header.length < 40) throw new Error("지원하는 HWP 5 형식이 아닙니다. HWPX로 저장해 다시 선택해주세요.");
    const headerBytes = new Uint8Array(header);
    const flags = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength).getUint32(36, true);
    if (flags & (2 | 4 | 16)) throw new Error("암호화·배포용·DRM HWP는 읽을 수 없습니다. 일반 HWPX 또는 PDF로 저장해주세요.");
    let total = 0;
    for (let index = 0; index < compound.FullPaths.length; index++) {
      if (!/BodyText\/Section\d+$/.test(compound.FullPaths[index])) continue;
      const packed = new Uint8Array(compound.FileIndex[index].content);
      const data = flags & 1 ? inflateSync(packed) : packed;
      total += data.length; if (total > MAX_UNPACKED) throw new Error("HWP 문서 용량이 너무 큽니다.");
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      for (let at = 0; at + 4 <= data.length;) {
        const header = view.getUint32(at, true); at += 4; let size = header >>> 20;
        if (size === 4095) { if (at + 4 > data.length) break; size = view.getUint32(at, true); at += 4; }
        if (at + size > data.length) break;
        if ((header & 1023) === 67) {
          const paragraph = data.subarray(at, at + size); const words = new DataView(paragraph.buffer, paragraph.byteOffset, paragraph.byteLength);
          for (let offset = 0; offset + 2 <= paragraph.length; offset += 2) {
            const code = words.getUint16(offset, true);
            if (code >= 32) text += String.fromCharCode(code);
            else if (code === 13 || code === 10) text += "\n";
            else if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].includes(code)) { text += " "; offset += 14; }
          }
          text += "\n";
        }
        at += size;
      }
    }
  } else if (extension === "txt") { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  else throw new Error("PDF·HWP·HWPX·DOCX·UTF-8 TXT 파일을 선택해주세요.");
  if (text.trim().length < 60) throw new Error("텍스트를 충분히 추출하지 못했습니다. 스캔 PDF는 OCR 처리한 뒤 사용하거나 원문 텍스트를 붙여넣어주세요.");
  const record = analyseMsds(text, file.name);
  record.pictograms = [...new Set([...record.pictograms, ...Object.keys(evidence)])].sort(); record.pictogramEvidence = { ...record.pictogramEvidence, ...evidence };
  if (unidentified) notes.push(`그림문자 후보 ${unidentified}개는 표준 그림과 확실하게 일치하지 않아 자동 선택하지 않았습니다. 원문과 대조해 직접 선택해주세요.`);
  record.extractionNotes = [...(record.extractionNotes ?? []), ...notes];
  return Object.assign(record,{matrixProducts:extractProductMatrix(matrixPages)});
}
