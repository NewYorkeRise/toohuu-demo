const AXES = {boot:['Хийцлэл','Өнгө','Хэмжээ'],socks:['Өнгө','Хэмжээ'],rug:['Хэмжээ','Загвар']};
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
export const MAX_BODY = 750000;

export function json(body, status=200) {
  return Response.json(body, {status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
function text(value, max, required=false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f]/.test(value.replace(/[\r\n\t]/g,''))) throw new Error('Текстийн утга буруу байна.');
  const result=value.trim();
  if(required&&!result) throw new Error('Заавал бөглөх талбар хоосон байна.');
  return result;
}
function number(value,max) {
  if(!Number.isSafeInteger(value)||value<0||value>max) throw new Error('Үнэ, бэлэн тоо нь эерэг бүхэл тоо эсвэл 0 байна.');
  return value;
}
function imageURL(value) {
  const s=text(value||'',2048);
  if(!s)return '';
  let u; try{u=new URL(s);}catch{throw new Error('Зургийн холбоос буруу байна.');}
  if(u.protocol!=='https:'||u.username||u.password)throw new Error('Зургийн холбоос https:// гэж эхэлнэ.');
  return u.href;
}
function variantsFor(product, submitted, previous) {
  const sameAxes=previous&&JSON.stringify(previous.axes)===JSON.stringify(product.axes);
  // Variants are owned by the server. Preserve existing availability when only
  // metadata changes; explicitly changing options creates their combinations.
  if(sameAxes) return previous.variants;
  let combos=[{}];
  for(const axis of product.axes) {
    combos=combos.flatMap(c=>axis.values.map(v=>({...c,[axis.name]:v})));
    if(combos.length>600)throw new Error('Нэг загварын сонголтын хослол 600-аас их байж болохгүй.');
  }
  const existing=new Map((previous?.variants||[]).map(v=>[JSON.stringify(product.axes.map(a=>v.options[a.name])),v]));
  return combos.map((options,i)=> {
    const old=existing.get(JSON.stringify(product.axes.map(a=>options[a.name])));
    return old || {id:`${product.id}-v${crypto.randomUUID().replaceAll('-','').slice(0,12)}`,sku:`${product.id}-${i}`,options,price_delta:0,is_preorder:product.stock_count===0};
  });
}
export function validateProducts(input, previous=[]) {
  if(!Array.isArray(input)||input.length>200)throw new Error('Барааны жагсаалт буруу байна (дээд тал нь 200).');
  const before=new Map(previous.map(p=>[p.id,p])), ids=new Set();
  const products=input.map(p=>{
    if(!p||typeof p!=='object'||typeof p.id!=='string'||!ID.test(p.id)||ids.has(p.id))throw new Error('Барааны дугаар давхардсан эсвэл буруу байна.');
    ids.add(p.id);
    if(!Object.hasOwn(AXES,p.type))throw new Error('Барааны төрөл буруу байна.');
    if(p.type==='boot'&&!['men','women','kids'].includes(p.audience))throw new Error('Гутлын ангиллыг сонгоно уу.');
    if(!Array.isArray(p.axes)||p.axes.length!==AXES[p.type].length)throw new Error('Хэмжээ, өнгө, хийцийн талбарууд дутуу байна.');
    const seen=new Set();
    const axes=p.axes.map(a=>{
      if(!a||!AXES[p.type].includes(a.name)||seen.has(a.name)||!Array.isArray(a.values)||!a.values.length||a.values.length>40)throw new Error('Хэмжээ, өнгө, хийцийн сонголт буруу байна.');
      seen.add(a.name);
      const values=a.values.map(v=>text(v,60,true));
      if(new Set(values).size!==values.length)throw new Error('Сонголтын утга давхардсан байна.');
      return {name:a.name,values};
    });
    for(const key of ['is_active','hot','fresh'])if(typeof p[key]!=='boolean')throw new Error('Барааны төлөв буруу байна.');
    const old=before.get(p.id), image=imageURL(p.image);
    // Main image can be replaced without silently dropping the existing gallery.
    const oldImages=(old?.images||[]).filter(u=>u!==old?.image);
    const images=image?[image,...oldImages.filter(u=>u!==image)]:[];
    const product={id:p.id,sku:text(p.sku||p.id,80,true),name:text(p.name,100,true),type:p.type,
      audience:p.type==='boot'?p.audience:null,category:p.type==='boot'?(p.audience==='kids'?'kids':'main'):(p.category==='kids'?'kids':'main'),
      base_price:number(p.base_price,100000000),stock_count:number(p.stock_count,100000),
      image,images,description:text(p.description||'',2000),is_active:p.is_active,hot:p.hot,fresh:p.fresh,axes};
    product.variants=variantsFor(product,p.variants,old);
    return product;
  });
  if(previous.some(p=>!ids.has(p.id)))throw new Error('Барааг устгахын оронд харагдах төлөвийг хаана уу.');
  if(new TextEncoder().encode(JSON.stringify(products)).length>MAX_BODY)throw new Error('Барааны мэдээлэл хэт их байна.');
  return products;
}
export function changesBetween(previous,products){
  const before=new Map(previous.map(p=>[p.id,p]));
  return products.flatMap(p=>{
    const old=before.get(p.id);
    if(!old)return [{id:p.id,name:p.name,fields:['Шинэ бараа']}];
    const fields=Object.keys(p).filter(k=>JSON.stringify(p[k])!==JSON.stringify(old[k]));
    return fields.length?[{id:p.id,name:p.name,fields}]:[];
  });
}
export async function readCatalog(env){
  if(!env.CATALOG_DB)throw new Error('Catalog database unavailable');
  const row=await env.CATALOG_DB.prepare('SELECT products, revision, updated_at FROM catalog WHERE id = 1').first();
  if(!row)throw new Error('Catalog has not been initialized');
  const updated_at=row.updated_at.includes('T')?row.updated_at:row.updated_at.replace(' ','T')+'Z';
  return {products:JSON.parse(row.products),revision:row.revision,updated_at};
}
