import { context } from './context';
export async function getMemberRequests(_id:string){return context.paidRequests??[];}
export async function getMemberAdmin(_page=1,_q="",_role=""){return context.adminData??{members:[],total:0,pages:1,current:1,requests:[],audit:[]};}
