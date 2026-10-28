import fingerprints from "./ghs-fingerprints.json";

export type Pixels = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };
type Box = { left: number; top: number; right: number; bottom: number };
function dark(image: Pixels, x: number, y: number) { const at = (y * image.width + x) * 4; return image.data[at + 3] > 80 && Math.max(image.data[at], image.data[at + 1], image.data[at + 2]) < 155; }
export function glyphFingerprint(image: Pixels, box: Box): string {
  let left = box.right, top = box.bottom, right = -1, bottom = -1;
  for (let y = box.top; y <= box.bottom; y++) for (let x = box.left; x <= box.right; x++) if (dark(image, x, y)) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  if (right - left < 3 || bottom - top < 3) return "";
  let result = "";
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { let black = 0, total = 0;
    const x0 = left + Math.floor(x * (right - left + 1) / 32), x1 = Math.min(right, left + Math.ceil((x + 1) * (right - left + 1) / 32) - 1);
    const y0 = top + Math.floor(y * (bottom - top + 1) / 32), y1 = Math.min(bottom, top + Math.ceil((y + 1) * (bottom - top + 1) / 32) - 1);
    for (let sy = y0; sy <= y1; sy++) for (let sx = x0; sx <= x1; sx++) { total++; if (dark(image, sx, sy)) black++; }
    result += black / Math.max(1, total) >= 0.4 ? "1" : "0";
  }
  return result;
}
export function matchGhsGlyph(signature: string) {
  if (!signature) return null;
  const scores = Object.entries(fingerprints).map(([id, reference]) => {
    const references = typeof reference === "string" ? [reference] : reference;
    const score = Math.max(...references.map((pattern: string) => { let intersection = 0, union = 0; for (let index = 0; index < 1024; index++) { if (signature[index] === "1" || pattern[index] === "1") union++; if (signature[index] === "1" && pattern[index] === "1") intersection++; } return intersection / Math.max(1, union); }));
    return { id, score };
  }).sort((a, b) => b.score - a.score);
  return scores[0].score >= 0.86 && scores[0].score - scores[1].score >= 0.12 ? scores[0].id : null;
}
export function pictogramBoxes(image: Pixels): Box[] {
  if (image.width * image.height > 8000000) return [];
  const seen = new Uint8Array(image.width * image.height); const result: Box[] = [];
  for (let at = 0; at < seen.length; at++) { if (seen[at]) continue; const pixel = at * 4;
    if (!(image.data[pixel] > 125 && image.data[pixel] > image.data[pixel + 1] * 1.5 && image.data[pixel] > image.data[pixel + 2] * 1.5 && image.data[pixel + 3] > 80)) continue;
    const queue = [at]; seen[at] = 1; let left = at % image.width, right = left, top = Math.floor(at / image.width), bottom = top;
    for (let index = 0; index < queue.length; index++) { const point = queue[index], x = point % image.width, y = Math.floor(point / image.width); left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1], [-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) { const nx = x + dx, ny = y + dy, next = ny * image.width + nx;
        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height || seen[next]) continue; const p = next * 4;
        if (image.data[p] > 125 && image.data[p] > image.data[p + 1] * 1.5 && image.data[p] > image.data[p + 2] * 1.5 && image.data[p + 3] > 80) { seen[next] = 1; queue.push(next); }
      }
    }
    const width = right - left + 1, height = bottom - top + 1;
    if (width >= 18 && height >= 18 && width / height > 0.75 && width / height < 1.33 && queue.length > width && queue.length < width * height * 0.55) result.push({ left, right, top, bottom });
  }
  return result.slice(0, 24);
}
export function recognisePictograms(image: Pixels) { return pictogramBoxes(image).map(box => ({ box, id: matchGhsGlyph(glyphFingerprint(image, box)) })); }
export async function imagePictograms(bytes: Uint8Array) {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return [];
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
  try {
    const ratio = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return [];
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return recognisePictograms(context.getImageData(0, 0, canvas.width, canvas.height));
  } finally { bitmap.close(); }
}
