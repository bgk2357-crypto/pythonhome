export const PASSWORD_PATTERN='(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9])[\x21-\x7E]{8,16}';
export const PASSWORD_HELP='영문자·숫자·특수문자를 모두 포함한 8~16자 (공백·한글 제외)';
export function validPassword(value:unknown):value is string{return typeof value==='string'&&!/[^\x21-\x7E]/.test(value)&&new RegExp(`^${PASSWORD_PATTERN}$`).test(value);}
export function normalizedEmail(value:unknown){
 if(typeof value!=='string')return null;
 const email=value.trim().toLowerCase(),parts=email.split('@');
 if(email.length>254||parts.length!==2||parts[0].length>64||parts[0].startsWith('.')||parts[0].endsWith('.')||parts[0].includes('..'))return null;
 return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email)?email:null;
}
