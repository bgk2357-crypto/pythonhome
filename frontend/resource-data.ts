import { context } from './context';
export async function getResources(_page=1,_q="",_category="") { return context.resources ?? {items:[],total:0,pages:1,current:1}; }
export async function getResource(_id:string) { return context.resourceSelected ?? null; }
