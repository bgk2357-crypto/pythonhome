"use client";
import type {ReactNode} from 'react';
import type {WorkspaceAsset} from '../lib/workspace';

export function ProductSelectionList({items,selected,onChange,busy,actions}:{items:WorkspaceAsset[];selected:string[];onChange:(ids:string[])=>void;busy:boolean;actions:(item:WorkspaceAsset)=>ReactNode}){
 const all=items.length>0&&items.every(item=>selected.includes(item.id));
 return <section className="wd-product-selection" aria-label="MSDS 제품 선택 목록">
  <div className="wd-selection-tools"><label><input type="checkbox" checked={all} disabled={busy||!items.length} onChange={e=>onChange(e.target.checked?[...new Set([...selected,...items.map(item=>item.id)])]:selected.filter(id=>!items.some(item=>item.id===id)))}/>검색 결과 전체 선택</label><span>검색 결과 {items.length}개 · 현재 목록에서 {items.filter(item=>selected.includes(item.id)).length}개 선택</span></div>
  <ul>{items.map(item=><li className={'wd-output-card'+(selected.includes(item.id)?' wd-output-selected':'')} key={item.id}>
   <label className="wd-product-choice"><input type="checkbox" aria-label={`${item.product||item.fileName} 선택`} checked={selected.includes(item.id)} disabled={busy} onChange={e=>onChange(e.target.checked?[...new Set([...selected,item.id])]:selected.filter(id=>id!==item.id))}/><span><span className={'wd-status '+(item.reviewed?'done':'')}>{item.reviewed?'검토 완료':'검토 필요'}</span><strong>{item.product||item.fileName}</strong><small>{item.category||'미분류'} · {item.supplier||'공급자 확인 필요'}</small>{selected.includes(item.id)&&<b className="wd-selection-badge">선택됨</b>}</span></label>
   <div className="wd-buttons">{actions(item)}</div>
  </li>)}</ul>
 </section>;
}
