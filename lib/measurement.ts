export type MeasurementRow={id:string;date:string;department:string;process:string;location:string;substance:string;cas:string;result:string;unit:string;limit:string;limitUnit:string;period:'TWA'|'STEL'|'Ceiling'|'unknown';limitPeriod:'TWA'|'STEL'|'Ceiling'|'unknown';notes:string};
export function parseDelimited(text:string){const first=text.split(/\r?\n/)[0]||'';const delimiter=first.includes('\t')?'\t':first.includes('|')?'|':',';const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&c===delimiter){row.push(cell.trim());cell='';}else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
}
export function parseMeasurementRows(text:string):MeasurementRow[]{
 const table=parseDelimited(text);if(table.length<2)return [];const headers=table[0].map(x=>x.replace(/[\s()]/g,'').toLowerCase());
 const find=(names:string[])=>headers.findIndex(h=>names.includes(h));const mapping={date:find(['측정일','측정일자','date']),department:find(['부서','부서명','department']),process:find(['공정','작업공정','공정명','process']),location:find(['측정위치','위치','location']),substance:find(['물질명','유해인자','측정물질','substance']),cas:find(['cas','cas번호','카스번호']),result:find(['측정값','측정결과','결과','result']),unit:find(['단위','측정단위','unit']),limit:find(['노출기준','기준값','limit']),limitUnit:find(['기준단위','limitunit']),period:find(['측정구분','평가시간','period']),limitPeriod:find(['기준구분','limitperiod'])};
 if(mapping.result<0||(mapping.cas<0&&mapping.substance<0))return [];
 if(table.length-1>300)throw Error('측정결과는 보고서당 300행 이하로 나눠 등록해주세요.');
 return table.slice(1).map((row,i)=>{const value=(key:keyof typeof mapping)=>mapping[key]>=0?row[mapping[key]]||'':'';const period=(v:string)=>['TWA','STEL','Ceiling'].includes(v)?v as MeasurementRow['period']:'unknown';return {id:'measurement-'+i,date:value('date'),department:value('department'),process:value('process'),location:value('location'),substance:value('substance'),cas:value('cas'),result:value('result'),unit:value('unit'),limit:value('limit'),limitUnit:value('limitUnit'),period:period(value('period')),limitPeriod:period(value('limitPeriod')),notes:'업로드 자동 추출 초안 · 원문 대조 필요'};});
}
export function exposureComparison(row:MeasurementRow){
 const numeric=/^(?:\d+(?:\.\d+)?|\.\d+)$/;const unit=(v:string)=>v.trim().toLowerCase().replace(/³/g,'3').replace(/\s/g,'');
 if(!numeric.test(row.result.trim())||!numeric.test(row.limit.trim())||Number(row.limit)<=0)return {label:'수치 확인 필요',ratio:null};
 if(!['ppm','mg/m3','ug/m3','ng/m3','f/cm3','fibers/cm3'].includes(unit(row.unit).replace(/[µμ]/g,'u'))||unit(row.unit)!==unit(row.limitUnit))return {label:'단위 확인 필요',ratio:null};
 if(!['TWA','STEL','Ceiling'].includes(row.period)||row.period!==row.limitPeriod)return {label:'평가시간 확인 필요',ratio:null};
 const ratio=Number(row.result)/Number(row.limit);if(!Number.isFinite(ratio))return {label:'수치 확인 필요',ratio:null};return {label:ratio>1?'입력 기준 초과':ratio===1?'입력 기준과 동일':'입력 기준 이하',ratio};
}
