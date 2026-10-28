export const MEMBER_ROLES = ["preliminary","general","paid","master"] as const;
export type MemberRole = typeof MEMBER_ROLES[number];
export const ROLE_LABELS:Record<string,string>={preliminary:"예비회원",general:"일반회원",paid:"정회원",master:"관리자(마스터)"};
export const BUSINESS_SIZES=["5인 미만","5~19인","20~49인","50~99인","100~299인","300인 이상"] as const;
export type MemberProfile={userId:string;displayName:string;createdAt:string;email?:string;role?:string;businessName?:string;businessSize?:string;contactName?:string;jobTitle?:string;phone?:string;profileCompletedAt?:string|null;updatedAt?:string|null;version?:number};
export type PaidRequest={id:string;userId:string;status:string;note:string;createdAt:string;reviewedAt:string|null;reviewNote:string;amount:number;paymentReference:string;author?:string;email?:string;businessName?:string;version?:number};
export type MemberAudit={id:number;actorId:string;targetId:string;action:string;oldRole:string;newRole:string;reason:string;createdAt:string};
export type MemberAdminData={members:MemberProfile[];total:number;pages:number;current:number;requests:PaidRequest[];audit:MemberAudit[]};
export function profileComplete(member:MemberProfile|null|undefined){return !!member?.businessName?.trim()&&!!member.businessSize&&!!member.contactName?.trim()&&!!member.jobTitle?.trim()&&!!member.phone?.trim();}
export function canWrite(member:MemberProfile|null|undefined){return member?.role==="master"||!!member&&["general","paid"].includes(member.role||"")&&profileComplete(member);}
export function isMaster(member:MemberProfile|null|undefined){return member?.role==="master";}
export function roleLabel(member:MemberProfile|null|undefined){return ROLE_LABELS[member?.role||"preliminary"]||"예비회원";}
export function validateProfile(form:URLSearchParams){
 const take=(key:string,max:number)=>{const all=form.getAll(key);if(all.length!==1)return null;const value=all[0].trim();return value&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value)?value:null;};
 const displayName=take("displayName",30),businessName=take("businessName",120),businessSize=take("businessSize",30),contactName=take("contactName",60),jobTitle=take("jobTitle",80),phone=take("phone",30);
 if(!displayName||!businessName||!businessSize||!(BUSINESS_SIZES as readonly string[]).includes(businessSize)||!contactName||!jobTitle||!phone||!/^\+?[0-9 ()-]+$/.test(phone)||phone.replace(/\D/g,"").length<7||phone.replace(/\D/g,"").length>15||form.getAll("consent").length!==1||form.get("consent")!=="yes")return null;
 return {displayName,businessName,businessSize,contactName,jobTitle,phone};
}
