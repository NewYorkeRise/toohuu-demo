import {json} from '../../../lib/catalog.js';
import {readImageBody,imageType} from '../../../lib/media.js';

export async function onRequestPost({request,env,data}){
  if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Хүсэлт зөвшөөрөгдөөгүй.'},403);
  if(!['image/jpeg','image/png','image/webp'].includes(request.headers.get('Content-Type')))return json({error:'JPG, PNG эсвэл WebP зураг оруулна уу.'},415);
  let bytes,mime;
  try{
    bytes=await readImageBody(request);mime=imageType(bytes);
    if(mime!==request.headers.get('Content-Type'))throw new Error('Зургийн формат тохирохгүй байна.');
  }catch(e){return json({error:e.message},e instanceof RangeError?413:400);}
  if(!env.CATALOG_DB)return json({error:'Зураг хадгалах үйлчилгээ түр боломжгүй байна.'},503);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const id=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
  try{
    // Content-addressed images are immutable and shared by duplicate uploads.
    // Actor/timestamp are retained with the file; catalog history records its use.
    await env.CATALOG_DB.prepare('INSERT OR IGNORE INTO media (id, content_type, bytes, size, created_at, actor) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id,mime,bytes.buffer,bytes.length,new Date().toISOString(),data.adminUser).run();
    return json({url:`/media/${id}`,size:bytes.length},201);
  }catch{return json({error:'Зураг хадгалж чадсангүй. Дахин оролдоно уу.'},503);}
}
