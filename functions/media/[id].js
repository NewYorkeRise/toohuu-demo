import {MEDIA_ID} from '../../lib/media.js';

async function serve({request,env,params}){
  if(!MEDIA_ID.test(params.id))return new Response('Зураг олдсонгүй.',{status:404});
  try{
    const row=await env.CATALOG_DB.prepare('SELECT content_type, bytes, size FROM media WHERE id = ?').bind(params.id).first();
    if(!row)return new Response('Зураг олдсонгүй.',{status:404});
    const headers={'Content-Type':row.content_type,'Content-Length':String(row.size),'Cache-Control':'public, max-age=31536000, immutable','ETag':`"${params.id}"`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"};
    if(request.headers.get('If-None-Match')===headers.ETag)return new Response(null,{status:304,headers});
    const bytes=Array.isArray(row.bytes)?new Uint8Array(row.bytes):row.bytes;
    return new Response(request.method==='HEAD'?null:bytes,{headers});
  }catch{return new Response('Зураг ачаалагдсангүй.',{status:503,headers:{'Cache-Control':'no-store'}});}
}
export const onRequestGet=serve;
export const onRequestHead=serve;
