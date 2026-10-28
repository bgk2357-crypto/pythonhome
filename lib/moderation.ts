export type FilterRule={id:number;kind:'keyword'|'regex';expression:string};
export function validFilter(kind:string,expression:string){
 if(!expression.trim()||expression.length>80||/[\x00-\x1f\x7f~]/.test(expression))return false;
 if(kind==='keyword')return true;if(kind!=='regex')return false;
 // Bounded, portable subset: no groups, lookarounds, backreferences, or unbounded repetition.
 let rest=expression.replace(/\[(?:\\[sdw\-\]\\.]|[^\]\\])+\]/g,'a').replace(/\\[sdw.\-_]/g,'a').replace(/\{[0-5](?:,[0-5])?\}/g,'');
 if(/[()[\]{}|*+?\\]/.test(rest))return false;
 try{return !new RegExp(expression,'iu').test('');}catch{return false;}
}
export function maskContent(text:string,rules:FilterRule[]){
 let result=text;for(const rule of rules){if(!validFilter(rule.kind,rule.expression))continue;const pattern=rule.kind==='keyword'?rule.expression.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'):rule.expression;result=result.replace(new RegExp(pattern,'giu'),match=>'*'.repeat(Array.from(match).length));}return result;
}
