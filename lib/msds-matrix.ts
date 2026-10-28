import type { ComponentRow } from './msds-regulations';
export type MatrixProduct={product:string;components:ComponentRow[];pages:number[]};
type Item={str:string;transform:number[];width:number;height:number};
// Match horizontal cells by their PDF coordinates, never by the number of text tokens.
// A continued table retains its header across pages; a new header replaces it.
export function extractProductMatrix(pages:readonly (readonly unknown[])[]):MatrixProduct[]{
 const products=new Map<string,MatrixProduct>();let columns:{name:string;x:number}[]=[];let section=false;
 for(let p=0;p<pages.length;p++){
  const lines:{y:number;items:Item[]}[]=[];
  for(const v of pages[p]){const i=v as Item;if(!i.str?.trim()||!i.transform)continue;let line=lines.find(l=>Math.abs(l.y-i.transform[5])<=2);if(!line){line={y:i.transform[5],items:[]};lines.push(line);}line.items.push(i);}
  for(const line of lines.sort((a,b)=>b.y-a.y)){
   const items=line.items.sort((a,b)=>a.transform[4]-b.transform[4]);const text=items.map(i=>i.str).join(' ');
   if(/^\s*3\s*[.．)]\s*구\s*성/.test(text))section=true;
   if(section&&/^\s*4\s*[.．)]\s*응\s*급/.test(text)){section=false;columns=[];}
   if(!section)continue;
   const casHeader=items.find(i=>/CAS\s*No\.?/i.test(i.str));
   if(casHeader&&/구\s*성/.test(text)){
    columns=items.filter(i=>i.transform[4]>casHeader.transform[4]+casHeader.width&&/^[A-Z][A-Z0-9]*-\d+[A-Z0-9]*$/i.test(i.str.trim())).map(i=>({name:i.str.trim(),x:i.transform[4]+i.width/2}));
    for(const c of columns)if(!products.has(c.name))products.set(c.name,{product:c.name,components:[],pages:[]});continue;
   }
   if(!columns.length)continue;const casItem=items.find(i=>/^\d{2,7}-\d{2}-\d$/.test(i.str.trim()));if(!casItem)continue;
   const name=items.filter(i=>i.transform[4]<casItem.transform[4]).map(i=>i.str).join(' ').trim();if(!name)continue;
   const cells=columns.map(()=>[] as string[]);
   for(const i of items.filter(i=>i.transform[4]>casItem.transform[4]+casItem.width)){const x=i.transform[4]+i.width/2;let index=0;for(let k=1;k<columns.length;k++)if(Math.abs(columns[k].x-x)<Math.abs(columns[index].x-x))index=k;cells[index].push(i.str);}
   columns.forEach((c,k)=>{const product=products.get(c.name)!;const concentration=cells[k].join('').trim()||'확인 필요';const cas=casItem.str.trim();if(product.components.some(r=>r.cas===cas))return;product.components.push({id:`matrix-${product.components.length+1}`,name,cas,concentration,basis:'unknown',specialCondition:'unknown',notes:`원본 ${p+1}쪽 · ${c.name} 열. ${concentration==='-'?'원문 - 표기(해당 열 미기재). ':''}함유량 단위·중량/용량 기준은 원문 확인 필요.`});if(!product.pages.includes(p+1))product.pages.push(p+1);});
  }
 }
 return [...products.values()].filter(p=>p.components.length>0);
}
export function matrixIngredients(product:MatrixProduct){return product.components.map(c=>`${c.name}\t${c.cas}\t${c.concentration}`).join('\n');}
