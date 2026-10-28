export type ProcessNode={id:string;parentId:string;name:string;level:number;workDetails?:string};
export function cleanHierarchy(value:unknown):ProcessNode[]|null{
 if(value===undefined)return [];if(!Array.isArray(value)||value.length>200)return null;
 const nodes:ProcessNode[]=[];const ids=new Set<string>();
 for(const n of value){if(!n||typeof n!=='object'||typeof n.id!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(n.id)||ids.has(n.id)||typeof n.parentId!=='string'||typeof n.name!=='string'||!n.name.trim()||n.name.length>80||(!Number.isSafeInteger(n.level)||n.level<1||n.level>200)||typeof (n.workDetails??'')!=='string'||(n.workDetails??'').length>2000)return null;ids.add(n.id);nodes.push({id:n.id,parentId:n.parentId,name:n.name.trim(),level:n.level,...(n.workDetails?{workDetails:n.workDetails}:{} )});}
 for(const n of nodes){const parent=nodes.find(p=>p.id===n.parentId);if(n.level===1?n.parentId!=='':!parent||parent.level!==n.level-1)return null;if(nodes.some(p=>p.id!==n.id&&p.parentId===n.parentId&&p.name===n.name))return null;}return nodes;
}
export function processPath(nodes:ProcessNode[],id:string){const path:ProcessNode[]=[];let node=nodes.find(n=>n.id===id);for(let i=0;node&&i<200;i++){path.unshift(node);node=nodes.find(n=>n.id===node!.parentId);}return path;}
export function processAssignment(nodes:ProcessNode[],id:string){const path=processPath(nodes,id);return {categoryId:id,category:path.map(n=>n.name).join(' / '),department:path[0]?.name||'',processName:path[1]?.name||'',taskName:path.slice(2).map(n=>n.name).join(' / ')};}
export function descendants(nodes:ProcessNode[],id:string):string[]{return [id,...nodes.filter(n=>n.parentId===id).flatMap(n=>descendants(nodes,n.id))];}

export function processLevelLabel(level:number){return level===1?'대분류 · 부서':level===2?'중분류 · 공정':level===3?'소분류 · 작업':`하위분류 ${level-3}`;}
