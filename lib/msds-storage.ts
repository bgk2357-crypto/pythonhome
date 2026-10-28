import type { MsdsRecord } from "./msds";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open("argo-msds", 1); request.onupgradeneeded = () => request.result.createObjectStore("records", { keyPath: "id" }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export async function loadMsds(): Promise<MsdsRecord[]> {
  const db = await database();
  return new Promise((resolve, reject) => { const request = db.transaction("records").objectStore("records").getAll(); request.onsuccess = () => { resolve(request.result); db.close(); }; request.onerror = () => { reject(request.error); db.close(); }; });
}
export async function saveMsds(records: MsdsRecord[]) {
  const db = await database();
  return new Promise<void>((resolve, reject) => { const transaction = db.transaction("records", "readwrite"); const store = transaction.objectStore("records"); store.clear(); records.forEach(record => store.put(record)); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = () => { db.close(); reject(transaction.error); }; });
}
