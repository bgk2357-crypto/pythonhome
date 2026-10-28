'use client';
import {useEffect,useState} from 'react';
let ready:Promise<unknown>|undefined;
export function DeleteContent({kind,id,returnTo}:{kind:string;id:string|number;returnTo:string}){
 const [rights,setRights]=useState<{csrf:string;canDelete:boolean}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{ready??=fetch('/api/account',{cache:'no-store'}).then(r=>{if(!r.ok){ready=undefined;throw Error();}return r.json();});ready.then(()=>fetch('/api/content?'+new URLSearchParams({kind,id:String(id)}),{cache:'no-store'})).then(async r=>r.ok?await r.json() as {csrf:string;canDelete:boolean}:null).then(setRights).catch(()=>{});},[kind,id]);
 if(!rights?.canDelete)return null;
 return <><button className="button secondary" disabled={busy} onClick={async()=>{if(!confirm('이 글과 첨부 내용을 삭제할까요? 복원할 수 없습니다.'))return;setBusy(true);try{const r=await fetch('/api/content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,id,csrf:rights.csrf})});if(!r.ok)throw Error();location.href=document.documentElement.dataset.argoRuntime==='php'?'/index.php?'+new URLSearchParams({route:returnTo}):returnTo;}catch{setError('삭제하지 못했습니다. 새로고침 후 다시 확인해주세요.');setBusy(false);}}}>글 삭제</button>{error&&<p role="alert">{error}</p>}</>;
}
