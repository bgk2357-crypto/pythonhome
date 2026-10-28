const iterations=600000;
const hex=(bytes:Uint8Array)=>Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
async function derive(password:string,salt:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bytes=Uint8Array.from(salt.match(/../g)!,value=>parseInt(value,16));
 return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes,iterations},key,256)));
}
export async function hashPassword(password:string){const salt=hex(crypto.getRandomValues(new Uint8Array(16)));return `pbkdf2_sha256$${iterations}$${salt}$${await derive(password,salt)}`;}
export async function verifyPassword(password:string,stored:string|null){
 const parts=(stored||'').split('$'),valid=parts.length===4&&parts[0]==='pbkdf2_sha256'&&parts[1]===String(iterations)&&/^[a-f0-9]{32}$/.test(parts[2])&&/^[a-f0-9]{64}$/.test(parts[3]);
 const actual=await derive(password,valid?parts[2]:'00000000000000000000000000000000'),expected=valid?parts[3]:'0'.repeat(64);
 let difference=0;for(let i=0;i<64;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);
 return valid&&difference===0;
}
