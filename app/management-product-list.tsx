"use client";
import type {WorkspaceAsset} from '../lib/workspace';
import type {ProcessNode} from '../lib/process-hierarchy';
import {ProcessSummary} from './process-flow';

export function ManagementProductList({items,nodes,applied,dirtyIds,busy,onApply,onRemove}:{items:WorkspaceAsset[];nodes:ProcessNode[];applied:string[];dirtyIds:Set<string>;busy:boolean;onApply:(id:string,checked:boolean)=>void;onRemove:(id:string)=>void}){
 return <ul className="wd-management-selected-list">{items.map(item=><li key={item.id} className={applied.includes(item.id)?'is-applied':''}>
  <label className="wd-management-apply"><input type="checkbox" aria-label={`${item.product||item.fileName} 관리요령 적용`} checked={applied.includes(item.id)} disabled={busy||dirtyIds.has(item.id)} onChange={event=>onApply(item.id,event.target.checked)}/><span><strong>{item.product||item.fileName}</strong><small>{item.msdsNumber?`MSDS # ${item.msdsNumber} · `:''}{item.supplier||'공급자 확인 필요'}</small><b>{applied.includes(item.id)?'관리요령 적용 중':'체크하여 관리요령 적용'}</b>{dirtyIds.has(item.id)&&<small>변경 내용을 먼저 저장해주세요.</small>}</span></label>
  <ProcessSummary item={item} nodes={nodes}/><button disabled={busy||dirtyIds.has(item.id)} onClick={()=>onRemove(item.id)} aria-label={`${item.product||item.fileName} 목록에서 제거`}>목록에서 제거</button>
 </li>)}</ul>;
}
