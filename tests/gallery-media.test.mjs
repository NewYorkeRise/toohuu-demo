import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {validateProducts} from '../lib/catalog.js';
import {MAX_IMAGE_BYTES,readImageBody,imageType} from '../lib/media.js';
import {onRequest as middleware} from '../functions/_middleware.js';
import {onRequestPut as saveCatalog} from '../functions/admin/api/catalog.js';
import {onRequestPost as uploadImage} from '../functions/admin/api/images.js';
import {onRequestGet as getImage,onRequestHead as headImage} from '../functions/media/[id].js';

const origin='https://toohuubrand.com';
const secrets={ADMIN_USER:'test-admin',ADMIN_PASS:'local-test-password'};
const authorization='Basic '+Buffer.from(`${secrets.ADMIN_USER}:${secrets.ADMIN_PASS}`).toString('base64');
const seed=JSON.parse(readFileSync(new URL('../lib/catalog-seed.json',import.meta.url),'utf8'));
const clone=value=>structuredClone(value);
const first=()=>clone(seed[0]);
const urls=['https://example.com/first.jpg','https://example.com/second.png','/media/'+'a'.repeat(64)];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZuoAAAAASUVORK5CYII=','base64');
const webp=Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA','base64');

function withGallery(){const p=first();p.images=[...urls];p.image=urls[0];return p;}
function validated(product,previous=[]){return validateProducts([product],previous)[0];}

function database(blobRepresentation='typed-array'){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_catalog.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0002_media.sql',import.meta.url),'utf8'));
  const binding=value=>value instanceof ArrayBuffer?new Uint8Array(value):value;
  const convert=row=>{
    if(row?.bytes instanceof Uint8Array){
      if(blobRepresentation==='array')row.bytes=Array.from(row.bytes);
      if(blobRepresentation==='array-buffer')row.bytes=row.bytes.buffer.slice(row.bytes.byteOffset,row.bytes.byteOffset+row.bytes.byteLength);
    }
    return row||null;
  };
  const D1={prepare(sql){let params=[];return {
    bind(...values){params=values.map(binding);return this;},
    async first(){return convert(db.prepare(sql).get(...params));},
    async all(){return {results:db.prepare(sql).all(...params).map(convert)};},
    async run(){const result=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(result.changes)}};}
  };}};
  return {db,env:{...secrets,CATALOG_DB:D1}};
}
function uploadRequest(body=png,headers={}){
  return new Request(origin+'/admin/api/images',{method:'POST',headers:{Authorization:authorization,Origin:origin,'Content-Type':'image/png',...headers},body,...(body instanceof ReadableStream?{duplex:'half'}:{})});
}
async function protectedUpload(request,env){
  const data={};
  return middleware({request,env,data,next:()=>uploadImage({request,env,data})});
}
function catalogRequest(products,revision){return new Request(origin+'/admin/api/catalog',{method:'PUT',headers:{Authorization:authorization,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({products,revision,reason:'Gallery edit test'})});}

test('gallery order is authoritative and first image becomes the cover',()=>{
  const previous=withGallery(),product=clone(previous);
  product.images=[urls[2],urls[0],urls[1]];
  const result=validated(product,[previous]);
  assert.deepEqual(result.images,product.images);
  assert.equal(result.image,urls[2]);
  assert.deepEqual(result.variants,previous.variants);
});
test('removing a cover promotes the next image; explicit [] removes every image',()=>{
  const previous=withGallery(),product=clone(previous);
  product.images=product.images.slice(1);
  assert.equal(validated(product,[previous]).image,urls[1]);
  product.images=[];
  assert.deepEqual(validated(product,[previous]).images,[]);
  assert.equal(validated(product,[previous]).image,'');
});
test('untouched gallery and existing variants survive metadata edits',()=>{
  const previous=withGallery(),product=clone(previous);product.name+=' шинэ';product.variants=[];
  const result=validated(product,[previous]);
  assert.deepEqual(result.images,previous.images);
  assert.deepEqual(result.variants,previous.variants);
});
test('legacy single-image data becomes a one-image gallery',()=>{
  const previous=first();delete previous.images;
  const result=validated(clone(previous),[previous]);
  assert.deepEqual(result.images,previous.image?[previous.image]:[]);
  assert.equal(result.image,previous.image);
});
test('an older single-cover editor replaces cover while preserving gallery remainder',()=>{
  const previous=withGallery();
  for(const keepImages of [false,true]){
    const product=clone(previous);product.image='https://example.com/new-cover.jpg';
    if(!keepImages)delete product.images;
    assert.deepEqual(validated(product,[previous]).images,[product.image,...urls.slice(1)]);
  }
});
test('gallery URL validation rejects unsupported schemes, credentials and unsafe local paths',()=>{
  for(const bad of ['',null,42,'http://example.com/x.png','data:image/svg+xml,<svg/>','blob:https://toohuubrand.com/id','javascript:alert(1)','https://user:pass@example.com/x.png','//elsewhere.example/x.png','/outside/image.png','/media/../secret','/media/'+ 'z'.repeat(64)]){
    const product=withGallery();product.images=[bad];
    assert.throws(()=>validated(product),String(bad));
  }
});
test('gallery accepts at most 20 images and removes duplicate URLs',()=>{
  const product=withGallery();product.images=Array.from({length:20},(_,i)=>`https://example.com/${i}.png`);
  assert.equal(validated(product).images.length,20);
  product.images.push('https://example.com/20.png');assert.throws(()=>validated(product));
  product.images=[urls[0],urls[0],urls[1]];assert.deepEqual(validated(product).images,urls.slice(0,2));
});
test('3 workmanship × 20 colors × 21 sizes is allowed, and over 1500 combinations rejected',()=>{
  const previous=first(),product=clone(previous);
  product.axes.find(a=>a.name==='Өнгө').values=Array.from({length:20},(_,i)=>`Өнгө ${i}`);
  product.axes.find(a=>a.name==='Хэмжээ').values=Array.from({length:21},(_,i)=>String(26+i));
  assert.equal(validated(product,[previous]).variants.length,1260);
  product.axes.find(a=>a.name==='Хэмжээ').values.push(...['47','48','49','50','51']);
  assert.throws(()=>validated(product,[previous]));
});
test('adding options preserves each preexisting matching variant and its availability',()=>{
  const previous=first(),product=clone(previous);product.axes.find(a=>a.name==='Өнгө').values.push('Номин ногоон');
  const result=validated(product,[previous]);
  for(const old of previous.variants)assert.deepEqual(result.variants.find(v=>v.id===old.id),old);
});
test('gallery edits produce atomic before/after audit and concurrent updates conflict',async()=>{
  const {db,env}=database();try{
    const previous=withGallery();db.prepare('INSERT INTO catalog(id,products,revision,updated_at) VALUES(1,?,1,?)').run(JSON.stringify([previous]),'2026-10-01T00:00:00Z');
    const one=clone(previous),two=clone(previous);one.images.reverse();two.images=[];
    const responses=await Promise.all([one,two].map(product=>saveCatalog({request:catalogRequest([product],1),env,data:{adminUser:'test-admin'}})));
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const log=db.prepare('SELECT * FROM audit_log').all();assert.equal(log.length,1);assert.equal(log[0].actor,'test-admin');
    assert.deepEqual(JSON.parse(log[0].before_products)[0].images,urls);
    assert.deepEqual(JSON.parse(log[0].after_products)[0].images,[...urls].reverse());
    assert(JSON.parse(log[0].summary)[0].fields.includes('images'));
    assert.throws(()=>db.prepare("UPDATE audit_log SET actor='tampered'").run());
  }finally{db.close();}
});

test('image uploads reject missing or wrong authentication before storing anything',async()=>{
  const {db,env}=database();try{
    for(const header of ['', 'Basic '+Buffer.from('test-admin:wrong').toString('base64')]){
      const response=await protectedUpload(uploadRequest(png,{Authorization:header}),env);assert.equal(response.status,401);
    }
    assert.equal(db.prepare('SELECT count(*) n FROM media').get().n,0);
  }finally{db.close();}
});
test('image upload fails closed when server credentials are not configured',async()=>{
  assert.equal((await protectedUpload(uploadRequest(),{})).status,503);
});
test('image upload rejects cross-site or absent Origin, including direct handler requests',async()=>{
  const {db,env}=database();try{
    for(const from of ['', 'https://elsewhere.example']){
      assert.equal((await protectedUpload(uploadRequest(png,{Origin:from}),env)).status,403);
      assert.equal((await uploadImage({request:uploadRequest(png,{Origin:from}),env,data:{adminUser:'test-admin'}})).status,403);
    }
    assert.equal(db.prepare('SELECT count(*) n FROM media').get().n,0);
  }finally{db.close();}
});
test('image upload rejects SVG, forged MIME, empty and truncated payloads',async()=>{
  const {db,env}=database();try{
    const cases=[
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),'image/svg+xml',415],
      [Buffer.from('<svg/>'),'image/png',400],
      [png,'image/jpeg',400],
      [new Uint8Array(),'image/png',400],
      [png.subarray(0,16),'image/png',400]
    ];
    for(const [body,mime,status] of cases)assert.equal((await protectedUpload(uploadRequest(body,{'Content-Type':mime}),env)).status,status);
    assert.equal(db.prepare('SELECT count(*) n FROM media').get().n,0);
  }finally{db.close();}
});
test('image detector rejects invalid structural headers rather than serving fake images',()=>{
  const pngHeader=png.subarray(0,24);
  const fakeJpeg=Uint8Array.from([255,216,255,0,0,0,0,0,0,0,255,217]);
  const fakeWebp=Uint8Array.from([82,73,70,70,12,0,0,0,87,69,66,80,0,0,0,0,0,0,0,0]);
  for(const payload of [pngHeader,fakeJpeg,fakeWebp])assert.throws(()=>imageType(payload));
});
test('static WebP is accepted, while truncated chunks and excessive dimensions are rejected',()=>{
  assert.equal(imageType(webp),'image/webp');
  assert.throws(()=>imageType(webp.subarray(0,-1)));
  const largePng=Buffer.from(png);largePng.writeUInt32BE(4097,16);
  assert.throws(()=>imageType(largePng));
  const largeWebp=Buffer.from(webp);largeWebp.writeUInt16LE(4097,26);
  assert.throws(()=>imageType(largeWebp));
});
test('image body reader enforces both declared length and streamed byte limits',async()=>{
  await assert.rejects(()=>readImageBody(uploadRequest(png,{'Content-Length':String(MAX_IMAGE_BYTES+1)})),RangeError);
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES));controller.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}});
  await assert.rejects(()=>readImageBody(uploadRequest(stream)),RangeError);assert.equal(cancelled,true);
  const exact=await readImageBody(uploadRequest(new Uint8Array(MAX_IMAGE_BYTES)));
  assert.equal(exact.length,MAX_IMAGE_BYTES);
});
test('oversized streamed upload responds 413 and cannot write to media storage',async()=>{
  const {db,env}=database();try{
    const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES+1));controller.close();}});
    assert.equal((await protectedUpload(uploadRequest(stream),env)).status,413);
    assert.equal(db.prepare('SELECT count(*) n FROM media').get().n,0);
  }finally{db.close();}
});
for(const representation of ['array','array-buffer','typed-array']){
  test(`uploaded images deduplicate and public GET/HEAD/304 serve D1 ${representation} BLOBs`,async()=>{
    const {db,env}=database(representation);try{
      assert.equal(imageType(png),'image/png');
      const one=await protectedUpload(uploadRequest(),env),two=await protectedUpload(uploadRequest(),env);
      assert.equal(one.status,201);assert.equal(two.status,201);
      assert.equal(one.headers.get('Cache-Control'),'no-store');
      const uploaded=await one.json();assert.deepEqual(await two.json(),uploaded);
      assert.match(uploaded.url,/^\/media\/[a-f0-9]{64}$/);
      assert.equal(db.prepare('SELECT count(*) n FROM media').get().n,1);
      const record=db.prepare('SELECT actor,size FROM media').get();assert.equal(record.actor,'test-admin');assert.equal(record.size,png.length);
      const params={id:uploaded.url.split('/').at(-1)};
      const request=new Request(origin+uploaded.url);
      const response=await middleware({request,env:{CATALOG_DB:env.CATALOG_DB},data:{},next:()=>getImage({request,env,params})});
      assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');
      assert.equal(response.headers.get('Content-Length'),String(png.length));assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
      assert.match(response.headers.get('Cache-Control'),/immutable/);assert.match(response.headers.get('Content-Security-Policy'),/sandbox/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
      const head=await headImage({request:new Request(origin+uploaded.url,{method:'HEAD'}),env,params});
      assert.equal(head.status,200);assert.equal(head.headers.get('Content-Length'),String(png.length));assert.equal((await head.arrayBuffer()).byteLength,0);
      const cached=await getImage({request:new Request(origin+uploaded.url,{headers:{'If-None-Match':response.headers.get('ETag')}}),env,params});
      assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);
    }finally{db.close();}
  });
}
test('missing or invalid public media IDs return 404 and storage outages return 503',async()=>{
  const {db,env}=database();try{
    for(const id of ['../catalog','NOT-A-HASH','f'.repeat(64)])assert.equal((await getImage({request:new Request(origin+'/media/'+id),env,params:{id}})).status,404);
    assert.equal((await getImage({request:new Request(origin+'/media/'+'f'.repeat(64)),env:{},params:{id:'f'.repeat(64)}})).status,503);
  }finally{db.close();}
});
