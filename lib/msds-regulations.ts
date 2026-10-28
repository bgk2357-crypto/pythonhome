import data from './regulation-data.json';
export const regulatorySources=data.sources;
export const regulatoryCoverage=data.coverage;
export const regulationLabels={managed:'관리대상 유해물질',special:'특별관리물질',measurement:'작업환경측정 대상',health:'특수건강진단 대상'} as const;
export type RegulationKind=keyof typeof regulationLabels;
export type ComponentRow={id:string;name:string;cas:string;concentration:string;basis:'unknown'|'weight'|'volume'|'pure';specialCondition:'unknown'|'confirmed'|'excluded';notes:string};
export type MatchResult={state:'match'|'below'|'review'|'unknown';label:string;reason:string;source:string;entryName?:string;threshold?:number};
const casPattern=/(?<!\d)\d{2,7}-\d{2}-\d(?!\d)/g;
export function validCas(cas:string){if(!/^\d{2,7}-\d{2}-\d$/.test(cas))return false;const digits=cas.replace(/-/g,'');let sum=0;for(let i=digits.length-2,weight=1;i>=0;i--,weight++)sum+=Number(digits[i])*weight;return sum%10===Number(digits.at(-1));}
export function concentrationRange(value:string):{min:number;max:number}|null{
 const v=value.replace(/\s/g,'').replace(/[％]/g,'%').replace(/[～~–—]/g,'-');
 const range=v.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)%?$/);if(range){const min=Number(range[1]),max=Number(range[2]);return min<=max&&max<=100?{min,max}:null;}
 const one=v.match(/^(<=|>=|<|>|≤|≥)?(\d+(?:\.\d+)?)%?$/);if(!one||Number(one[2])>100)return null;const n=Number(one[2]);
 // Strict bounds remain conservative at the boundary.
 return one[1]&&['<','<=','≤'].includes(one[1])?{min:0,max:n}:one[1]?{min:n,max:100}:{min:n,max:n};
}
export function extractComponents(text:string):ComponentRow[]{
 const rows:ComponentRow[]=[];const lines=text.split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  const line=lines[i];for(const match of line.matchAll(casPattern)){
   if(rows.length>=100)return rows;
   const cas=match[0],before=line.slice(0,match.index).trim(),after=line.slice((match.index||0)+cas.length).split(casPattern)[0];
   const candidate=(after.match(/(?:[<>≤≥]=?\s*)?\d+(?:\.\d+)?\s*(?:[-~～–]\s*\d+(?:\.\d+)?)?\s*%/)||[])[0]||(/^[\s|]*(?:[<>≤≥]=?\s*)?\d+(?:\.\d+)?\s*(?:[-~～–]\s*\d+(?:\.\d+)?)?\s*%?[\s|]*$/.test(after)?after.replace(/[|]/g,'').trim():'');
   const next=lines[i+1]||'';const special=after.replace(/[|]/g,'').trim();const amount=candidate||(/^(?:[-–—]|Rem\.\s*\(.*\))$/i.test(special)?special:'')||(/^\s*(?:[<>≤≥]=?\s*)?\d+(?:\.\d+)?\s*(?:[-~～–]\s*\d+(?:\.\d+)?)?\s*%\s*$/.test(next)?next.trim():'');
   const legal=data.entries.find(e=>e.cas.includes(cas));
   rows.push({id:'component-'+rows.length,name:before.replace(/^[\s|\d.)-]+|[|;:,]+$/g,'').trim()||legal?.name||'',cas,concentration:amount,basis:/중량|w\/w|wt\s*%/i.test(line)?'weight':/용량|v\/v|vol\s*%/i.test(line)?'volume':'unknown',specialCondition:'unknown',notes:'자동 추출 초안 · 원문 3항 대조 필요'});
  }
 }
 return rows;
}
export function classifyComponent(row:ComponentRow,kind:RegulationKind):MatchResult{
 const source=kind==='special'?'managed':kind;const sourceName=regulatorySources.find(s=>s.id===source)!.title;
 const entries=data.entries.filter(e=>e.kind===source&&e.cas.includes(row.cas.trim())&&(kind!=='special'||e.special));
 if(!validCas(row.cas.trim()))return {state:'unknown',label:'CAS 확인 필요',reason:'CAS 형식 또는 검증 숫자가 맞지 않습니다.',source:sourceName};
 if(!entries.length)return {state:'unknown',label:'직접 일치 없음',reason:'화합물군·이성질체·취급 조건까지 미대상으로 판정한 것은 아닙니다.',source:sourceName};
 const entry=entries[0],base={source:sourceName,entryName:entry.name,threshold:entry.threshold};
 if(kind==='special'&&entry.conditional&&row.specialCondition==='excluded')return {...base,state:'below',label:'조건 제외 확인',reason:'사용자가 특별관리 조건 제외를 확인했습니다. 확인 근거를 메모로 보관하세요.'};
 if(entry.conditional&&row.specialCondition!=='confirmed')return {...base,state:'review',label:'적용 조건 확인',reason:entry.text};
 const range=concentrationRange(row.concentration);
 if(!range)return {...base,state:'review',label:'함유량 확인',reason:`별표 목록 CAS 일치. 비교 기준 ${entry.threshold}% (${entry.basis==='weight'?'중량':'용량'}).`};
 if(row.basis!=='pure'&&row.basis!==entry.basis)return {...base,state:'review',label:'함유량 단위 확인',reason:`별표는 ${entry.basis==='weight'?'중량':'용량'}비율 기준입니다. 원문 함유량의 기준을 확인하세요.`};
 if(row.basis==='pure'&&(range.min!==100||range.max!==100))return {...base,state:'review',label:'순물질 함량 확인',reason:'순물질 선택 시 함유량은 100%인지 확인하세요.'};
 if(range.min>=entry.threshold)return {...base,state:'match',label:'목록·함유량 일치',reason:`${entry.threshold}% 이상 기준과 일치. 실제 작업장 적용·노출 조건은 별도 검토.`};
 if(range.max<entry.threshold)return {...base,state:'below',label:'기재 함량 기준 미만',reason:`입력한 최대 함량은 ${entry.threshold}% 미만입니다. 원문 범위와 단위를 확인하세요.`};
 return {...base,state:'review',label:'함유량 경계 확인',reason:`함유량 범위 또는 부등호가 ${entry.threshold}% 기준에 걸칩니다. 공급자에게 정확한 함량을 확인하세요.`};
}
