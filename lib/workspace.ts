import type { ProcessNode } from './process-hierarchy';
import type { MsdsRecord } from './msds';
import type { ComponentRow } from './msds-regulations';
import type { MeasurementRow } from './measurement';
import {cleanManagementEntries,type ManagementEntry} from './management-records';
export const workspaceServices = [
 {id:'system',title:'안전보건관리체계 구축',description:'방침과 목표부터 실행·점검·개선까지',tasks:['업무 현황','사업장 기본정보','안전보건 방침·목표','조직과 책임','유해·위험요인 관리','실행계획과 이행점검','문서함']},
 {id:'risk',title:'위험성평가',description:'공정별 위험요인과 개선대책 관리',tasks:['업무 현황','공정·작업 등록','유해·위험요인 파악','위험성 결정','감소대책과 실행','결과 검토','문서함']},
 {id:'ergonomics',title:'근골격계부담작업 유해요인조사',description:'작업 현황·증상조사·개선계획 정리',tasks:['업무 현황','조사계획','부담작업 현황','증상 설문','작업별 유해요인','개선계획','문서함']},
 {id:'msds',title:'물질안전보건자료',description:'MSDS 등록부터 검토·분류·현장 활용까지',tasks:['대시보드','MSDS 업로드 및 분석','규제 검토 및 자료 생성','업로드 MSDS 검토 및 관리','경고표지 생성','작업공정별 관리요령','특별관리물질 검토','화학물질 위험성평가(CHARM)','MSDS 자산 목록','공정흐름도 · 부서/공정/작업','사업장·현장 게시 설정','현장 뷰어','문서/레포트 다운로드']},
] as const;
export function workspaceAccess(member:{role?:string}|null|undefined){return !!member&&['paid','master'].includes(member.role||'');}
export type WorkspaceAsset = MsdsRecord & {version:number;category:string;groupName:string;msdsNumber:string;hCodes:string;regulationNotes:string;specialNotes:string;published:boolean;fileSize:number;updatedAt:string;kind?:'msds'|'measurement';components?:ComponentRow[];measurementRows?:MeasurementRow[];managementNotes?:string;managementEntries?:ManagementEntry[];processName?:string;postingLocation?:string;categoryId?:string;taskName?:string;matrixProduct?:string};
export type WorkspaceSettings = {businessName:string;notice:string;categories:string[];version:number;department:string;processName:string;postingLocation:string;hierarchy?:ProcessNode[]};
export type PublicationEvent={id:string;assetId:string;action:string;product:string;department:string;processName:string;postingLocation:string;createdAt:string};
export const emptySettings:WorkspaceSettings={businessName:'',notice:'',categories:[],version:0,department:'',processName:'',postingLocation:'',hierarchy:[]};
export function publicationChange(previous:Record<string,unknown>|null,next:Record<string,unknown>|null){if((next?.kind||previous?.kind)==='measurement')return null;const action=!next?'delete':next.published&&!previous?.published?'publish':!next.published&&previous?.published?'unpublish':next.published?'update':null;if(!action)return null;const value=next||previous||{};return {assetId:value.id,action,product:value.product||value.fileName||'',department:value.department||value.category||'',processName:value.processName||'',postingLocation:value.postingLocation||''};}
export function cleanAsset(value:unknown):Record<string,unknown>|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const input=value as Record<string,unknown>,out:Record<string,unknown>={};
 if(typeof input.id!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(input.id))return null;
 out.id=input.id;
 const fields=['fileName','importedAt','product','supplier','address','phone','workplace','department','cas','ingredients','signal','hazards','precautions','firstAid','fire','spill','handling','protection','text','emergencyPhone','recommendedUse','restrictions','classification','category','groupName','msdsNumber','hCodes','regulationNotes','specialNotes','managementNotes','processName','postingLocation','categoryId','taskName','matrixProduct'];
 for(const field of fields){const v=input[field]??'';if(typeof v!=='string'||v.length>(field==='text'?100000:field==='category'||field==='taskName'?20000:field==='groupName'?120:10000))return null;out[field]=v;}
 out.pictograms=Array.isArray(input.pictograms)?[...new Set(input.pictograms.filter(x=>typeof x==='string'&&/^GHS0[1-9]$/.test(x)))]:[];
 out.reviewed=input.reviewed===true;out.published=input.published===true&&out.reviewed===true;
 out.kind=input.kind==='measurement'?'measurement':'msds';if(out.kind==='measurement')out.published=false;
 if(input.managementEntries!==undefined){const entries=cleanManagementEntries(input.managementEntries);if(!entries)return null;out.managementEntries=entries;}
 for(const [key,limit,keys] of [['components',100,['id','name','cas','concentration','basis','specialCondition','notes']],['measurementRows',300,['id','date','department','process','location','substance','cas','result','unit','limit','limitUnit','period','limitPeriod','notes']]] as const){const rows=input[key]??[];if(!Array.isArray(rows)||rows.length>limit)return null;const clean=[];for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row))return null;const result:Record<string,string>={};for(const field of keys){const v=row[field]??'';if(typeof v!=='string'||v.length>(field==='notes'?1000:200))return null;result[field]=v;}clean.push(result);}out[key]=clean;}
 return out;
}
