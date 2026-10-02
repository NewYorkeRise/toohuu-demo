import {json,readCatalog,validateProducts,changesBetween,MAX_BODY} from '../../../lib/catalog.js';
export async function onRequestGet({env}){
  try{return json(await readCatalog(env));}
  catch{return json({error:'Барааны мэдээлэл ачаалагдсангүй. Дахин оролдоно уу.'},503);}
}
export async function onRequestPut({request,env,data}){
  if(request.headers.get('Origin')!==new URL(request.url).origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Хүсэлт зөвшөөрөгдөөгүй.'},403);
  if(Number(request.headers.get('Content-Length'))>MAX_BODY)return json({error:'Мэдээлэл хэт их байна.'},413);
  let body,previous,products,reason;
  try{
    // Limit streamed bodies too (Content-Length is not trustworthy).
    const reader=request.body?.getReader();let bytes=0;const chunks=[];
    if(!reader)throw new Error('Мэдээлэл хоосон байна.');
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BODY){await reader.cancel();return json({error:'Мэдээлэл хэт их байна.'},413);}chunks.push(value);}
    const raw=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
    body=JSON.parse(new TextDecoder().decode(raw));
    if(!Number.isSafeInteger(body.revision)||body.revision<1)throw new Error('Хувилбарын дугаар буруу байна.');
    if(typeof body.reason!=='string'||body.reason.trim().length>300)throw new Error('Тайлбар 300 тэмдэгтээс хэтэрч болохгүй.');
    reason=body.reason.trim();
  }catch(e){return json({error:e instanceof SyntaxError?'Хүсэлтийн мэдээлэл буруу байна.':e.message},400);}
  try{previous=await readCatalog(env);}catch{return json({error:'Хадгалалтын холболт тасарсан байна. Дахин оролдоно уу.'},503);}
  if(previous.revision!==body.revision)return json({error:'Өөр төхөөрөмжөөс мэдээлэл өөрчлөгдсөн байна. Жагсаалтаа шинэчлээд дахин засна уу.'},409);
  try{
    products=validateProducts(body.products,previous.products);
    if(products.some(p=>!p.is_active&&previous.products.find(o=>o.id===p.id)?.is_active)&&!reason)throw new Error('Барааг нуух шалтгаанаа бичнэ үү.');
  }catch(e){return json({error:e.message},400);}
  const changes=changesBetween(previous.products,products);
  if(!changes.length)return json(previous);
  const updated_at=new Date().toISOString(),revision=body.revision+1;
  try{
    // SQL trigger writes the before/after audit in this same atomic transaction.
    const result=await env.CATALOG_DB.prepare('UPDATE catalog SET products = ?, revision = revision + 1, updated_at = ?, actor = ?, reason = ?, summary = ?, request_id = ? WHERE id = 1 AND revision = ? RETURNING revision')
      .bind(JSON.stringify(products),updated_at,data.adminUser,reason,JSON.stringify(changes),crypto.randomUUID(),body.revision).first();
    if(!result)return json({error:'Мэдээлэл зэрэг өөрчлөгдлөө. Жагсаалтаа шинэчлээд дахин оролдоно уу.'},409);
    return json({products,revision,updated_at});
  }catch{return json({error:'Хадгалж чадсангүй. Дахин оролдоно уу.'},503);}
}
