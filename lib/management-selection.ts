import {processPath,type ProcessNode} from './process-hierarchy';
import type {WorkspaceAsset} from './workspace';

export type ManagementTask={id:string;label:string;details:string;nodeId?:string;legacy?:string[]};
const normalized=(value:string)=>value.trim().toLocaleLowerCase();
export function managementTasks(items:WorkspaceAsset[],nodes:ProcessNode[]):ManagementTask[]{
 const tasks:ManagementTask[]=nodes.map(node=>({id:`node:${node.id}`,nodeId:node.id,label:processPath(nodes,node.id).map(part=>part.name).join(' → '),details:node.workDetails||''}));
 for(const item of items){
  if(item.categoryId&&nodes.some(node=>node.id===item.categoryId))continue;
  const legacy=[item.department||'',item.processName||'',item.taskName||''];
  if(!legacy.some(Boolean))continue;
  const id=`legacy:${JSON.stringify(legacy)}`;
  if(!tasks.some(task=>task.id===id))tasks.push({id,label:legacy.filter(Boolean).join(' → '),details:'기존 수기 분류',legacy});
 }
 return tasks;
}
export function searchManagementTasks(tasks:ManagementTask[],query:string){const term=normalized(query);return tasks.filter(task=>normalized(`${task.label} ${task.details}`).includes(term));}
export function managementMsds(items:WorkspaceAsset[],nodes:ProcessNode[],task:ManagementTask|undefined,query:string){
 const term=normalized(query);
 return items.filter(item=>{
  if(task?.nodeId&&!processPath(nodes,item.categoryId||'').some(node=>node.id===task.nodeId))return false;
  if(task?.legacy&&![item.department||'',item.processName||'',item.taskName||''].every((name,index)=>name===task.legacy![index]))return false;
  return normalized([item.product,item.fileName,item.msdsNumber,item.supplier,item.cas,...(item.components||[]).map(component=>`${component.name} ${component.cas}`)].join(' ')).includes(term);
 });
}
export function managementList(items:WorkspaceAsset[],ids:string[]){return [...new Set(ids)].flatMap(id=>{const item=items.find(item=>item.id===id);return item?[item]:[];});}
