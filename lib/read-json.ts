export async function smallJson(request:Request,limit=16000):Promise<Record<string,any>|null>{
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return null;
 const reader=request.body?.getReader();if(!reader)return null;const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return null;}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}
}
