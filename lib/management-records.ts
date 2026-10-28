import type {WorkspaceAsset} from './workspace';

export type ManagementEntry={id:string;categoryId:string;department:string;processName:string;taskName:string;workDetails:string;notes:string;updatedAt:string};
export function cleanManagementEntries(value:unknown):ManagementEntry[]|null{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>100)return null;
 const ids=new Set<string>(),entries:ManagementEntry[]=[];
 for(const row of value){
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(row.id)||ids.has(row.id))return null;
  const entry:Record<string,string>={id:row.id};ids.add(row.id);
  for(const field of ['categoryId','department','processName','taskName','workDetails','notes','updatedAt']as const){const text=row[field]??'';const limit=field==='notes'?10000:field==='workDetails'?2000:field==='taskName'?20000:field==='categoryId'?80:field==='updatedAt'?80:200;if(typeof text!=='string'||text.length>limit)return null;entry[field]=text;}
  entries.push(entry as ManagementEntry);
 }
 return entries;
}
export function managementEntriesOf(item:WorkspaceAsset):ManagementEntry[]{
 if(item.managementEntries!==undefined)return item.managementEntries;
 // Keep previously saved single-product notes available until first scoped save.
 return item.managementNotes?.trim()?[{id:'legacy',categoryId:item.categoryId||'',department:item.department||'',processName:item.processName||'',taskName:item.taskName||'',workDetails:'',notes:item.managementNotes,updatedAt:item.updatedAt||''}]:[];
}
export function managementContextKey(entry:Pick<ManagementEntry,'categoryId'|'department'|'processName'|'taskName'>){return entry.categoryId?`node:${entry.categoryId}`:JSON.stringify([entry.department.trim(),entry.processName.trim(),entry.taskName.trim()]);}
export function upsertManagementEntry(item:WorkspaceAsset,entry:ManagementEntry){
 const entries=managementEntriesOf(item),names=(value:ManagementEntry)=>JSON.stringify([value.department.trim(),value.processName.trim(),value.taskName.trim()]);
 const existing=entries.find(value=>value.id===entry.id||managementContextKey(value)===managementContextKey(entry)||names(value)===names(entry));
 const saved={...entry,id:existing?.id||entry.id};
 if(!existing&&entries.length>=100)throw Error('MSDS당 관리요령은 최대 100개까지 저장할 수 있습니다.');
 return {entry:saved,item:{...item,managementEntries:existing?entries.map(value=>value.id===existing.id?saved:value):[...entries,saved],reviewed:false,published:false}};
}
export function managementPrintItem(item:WorkspaceAsset,entry:ManagementEntry):WorkspaceAsset{return {...item,categoryId:entry.categoryId,category:[entry.department,entry.processName,entry.taskName].filter(Boolean).join(' / '),department:entry.department,processName:entry.processName,taskName:entry.taskName,managementNotes:[entry.workDetails?`작업내용\n${entry.workDetails}`:'',entry.notes].filter(Boolean).join('\n\n')};}
