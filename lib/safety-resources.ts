export const RESOURCE_PATH = "/resources/safety-forms";
export const RESOURCE_CATEGORIES = ["가이드", "서식", "교육자료", "사례", "기타"] as const;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 3;
export const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
export const FILE_EXTENSIONS = ["pdf","hwp","hwpx","docx","xlsx","pptx","png","jpg","jpeg","txt","csv","zip"];
export type ResourceFile = { id: string; name: string; size: number };
export type ResourcePost = { id: string; category: string; author: string; title: string; body: string; createdAt: string; files: ResourceFile[] };
export type ResourcePage = { items: ResourcePost[]; total: number; current: number; pages: number };
export function validCategory(value: string) { return (RESOURCE_CATEGORIES as readonly string[]).includes(value); }
export function safeFilename(value: string) { return value.replaceAll("\\", "/").split("/").pop()!.replace(/[\x00-\x1f\x7f<>:"|?*]/g, "_").slice(0,150); }
export function validFileBytes(name: string, bytes: Uint8Array) {
 const ext = name.split(".").pop()?.toLowerCase() || "";
 if (!FILE_EXTENSIONS.includes(ext) || bytes.length===0 || bytes.length>MAX_FILE_BYTES) return false;
 const has=(signature:number[])=>signature.every((n,i)=>bytes[i]===n);
 if (ext==="pdf") return has([37,80,68,70,45]);
 if (ext==="png") return has([137,80,78,71,13,10,26,10]);
 if (ext==="jpg"||ext==="jpeg") return has([255,216,255]);
 if (ext==="hwp") return has([208,207,17,224,161,177,26,225]);
 if (["hwpx","docx","xlsx","pptx","zip"].includes(ext)) return has([80,75,3,4]);
 try { if (bytes.includes(0)) return false; new TextDecoder("utf-8",{fatal:true}).decode(bytes); return true; } catch { return false; }
}
export function encodedChunks(bytes: Uint8Array) { const chunks:string[]=[]; for(let i=0;i<bytes.length;i+=32768) chunks.push(btoa(String.fromCharCode(...bytes.slice(i,i+32768)))); return chunks; }
export function decodedChunk(value:string) { return Uint8Array.from(atob(value),c=>c.charCodeAt(0)); }
export function fileSize(bytes:number) { return bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`; }
