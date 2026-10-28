type PdfTextItem = { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean };
export function pdfPageText(items: readonly unknown[]) {
  const lines: { y: number; height: number; items: PdfTextItem[] }[] = [];
  for (const value of items) { const item = value as PdfTextItem; if (typeof item.str !== "string" || !item.transform) continue;
    const y = item.transform[5], height = Math.abs(item.height || item.transform[3] || 10);
    let line = lines.find(line => Math.abs(line.y - y) <= Math.max(1.5, Math.min(line.height, height) * 0.3));
    if (!line) { line = { y, height, items: [] }; lines.push(line); } line.items.push(item);
  }
  return lines.sort((a, b) => b.y - a.y).map(line => {
    const sorted = line.items.sort((a, b) => a.transform[4] - b.transform[4]);
    return sorted.map((item, index) => { const next = sorted[index + 1]; const gap = next ? next.transform[4] - item.transform[4] - item.width : 0; return item.str + (next ? gap > line.height * 1.5 ? "\t" : " " : ""); }).join("");
  }).join("\n");
}
export function xmlDocumentText(document: Document) {
  const result: string[] = [];
  // Walk once in document order. Reading all descendant <t>s for every outer
  // paragraph duplicated entire HWPX tables and merged labels with their values.
  function visit(node: Node) {
    if (node.nodeType !== 1) { for (const child of Array.from(node.childNodes)) visit(child); return; }
    const element = node as Element, name = element.localName;
    if (name === "t") { result.push(element.textContent || ""); return; }
    if (name === "tab") { result.push("\t"); return; }
    if (name === "autoNum" && element.getAttribute("numType") !== "PAGE" && element.getAttribute("num")) { result.push(element.getAttribute("num") + ". "); return; }
    if (name === "br" || name === "lineBreak") { result.push("\n"); return; }
    for (const child of Array.from(element.childNodes)) visit(child);
    if (["p", "tc", "tr"].includes(name)) result.push("\n");
  }
  visit(document); return result.join("").replace(/\n{3,}/g, "\n\n");
}
