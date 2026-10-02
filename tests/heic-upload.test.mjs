import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Adapt only the ESM boundary so each case has its own browser primitives and
// clock. The production decoding/compression functions run without modification.
const imageSource = readFileSync(new URL('../admin.image.js', import.meta.url), 'utf8')
  .replace(/export /g, '')
  .replaceAll('import.meta.url', JSON.stringify('https://toohuubrand.com/admin.image.js'))
  + '\n;globalThis.api = {isHeic, decodeHeic, compressImage};';
const workerSource = readFileSync(new URL('../admin.heic-worker.js', import.meta.url), 'utf8')
  .replace(/^import buildLibheif from .*;\n/, '');

function file({name='photo.jpg', type='image/jpeg', size=100, bytes=new Uint8Array(32)}={}) {
  return {name, type, size, slice(start, end) { return new Blob([bytes.slice(start, end)]); }, async arrayBuffer() { return bytes.buffer; }};
}
function ftyp(major, compatible=[], minor='\0\0\0\0') {
  const bytes = new Uint8Array(16 + compatible.length * 4);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode('ftyp'+major+minor+compatible.join('')), 4);
  return bytes;
}
function imageEnvironment(options={}) {
  const state = {workers:[], timers:new Map(), cleared:[], revoked:[], urls:[], canvases:[], encodes:[], draws:[], fills:[], sources:[]};
  let timerId=0;
  const makeSource = (width=4032, height=3024) => {
    const source = {width, height, closed:0, close() { this.closed++; }};
    state.sources.push(source); return source;
  };
  class LocalURL extends URL {
    static createObjectURL(value) { state.urls.push(value); return 'blob:test-image'; }
    static revokeObjectURL(value) { state.revoked.push(value); }
  }
  class LocalImage {
    constructor() { this.width=options.imageWidth || 2400; this.height=options.imageHeight || 1200; }
    set src(value) {
      this.currentSrc=value;
      if (!value || options.imageMode==='pending') return;
      queueMicrotask(() => options.imageMode==='success' ? this.onload() : this.onerror());
    }
  }
  class LocalWorker {
    constructor(url, config) {
      if (options.workerConstructorError) throw new Error('worker unavailable');
      this.url=url; this.config=config; this.terminated=0; state.workers.push(this);
    }
    postMessage(message) {
      this.message=message;
      if (options.workerPostError) throw new Error('clone error');
      if (options.workerReply) queueMicrotask(() => this.onmessage({data:options.workerReply(makeSource)}));
    }
    terminate() { this.terminated++; }
  }
  const sandbox = {
    Blob, Uint8Array, DataView, URL:LocalURL, Image:LocalImage, Worker:LocalWorker,
    setTimeout(fn, delay) { const id=++timerId; state.timers.set(id,{fn,delay}); return id; },
    clearTimeout(id) { state.cleared.push(id); state.timers.delete(id); },
    createImageBitmap: options.noBitmap ? undefined : async () => {
      if (options.nativeError) throw new Error('unsupported format');
      return makeSource(options.width, options.height);
    },
    document:{createElement(tag) {
      assert.equal(tag,'canvas');
      const context = {fillStyle:'', fillRect(...args) { state.fills.push({color:this.fillStyle,args}); }, drawImage(...args) { state.draws.push(args); }};
      const canvas = {width:0,height:0, getContext() { return options.noContext ? null : context; }, toBlob(callback,type,quality) {
        const call={type,quality,width:this.width,height:this.height}; state.encodes.push(call);
        callback(options.encode ? options.encode(call,state.encodes.length) : new Blob([new Uint8Array(100)],{type}));
      }};
      state.canvases.push(canvas); return canvas;
    }}
  };
  const context = vm.createContext(sandbox); vm.runInContext(imageSource,context);
  return {...context.api,state,makeSource};
}

test('detects iPhone HEIC/HEIF by extension, MIME or compatible file brand',async()=>{
  const {isHeic}=imageEnvironment();
  for (const input of [file({name:'IMG_1234.HEIC',type:''}),file({name:'IMG.heif'}),file({type:'image/heic-sequence'}),file({type:'image/heif'}),file({name:'photo',type:'',bytes:ftyp('heic')}),file({name:'photo',type:'application/octet-stream',bytes:ftyp('mif1',['heix'])}),file({name:'photo',type:'',bytes:ftyp('isom',['heic'])})]) assert.equal(await isHeic(input),true);
});
test('does not confuse truncated files, ordinary JPEG or minor-version bytes with HEIC',async()=>{
  const {isHeic}=imageEnvironment();
  for (const input of [file(),file({bytes:new Uint8Array([0,1,2])}),file({bytes:ftyp('isom',[],'heic')}),file({bytes:ftyp('avif',['avif'])})]) assert.equal(await isHeic(input),false);
});
test('rejects empty, oversized and SVG files before allocating a decoder',async()=>{
  const env=imageEnvironment();
  await assert.rejects(env.compressImage(file({size:0})),/Хоосон/);
  await assert.rejects(env.compressImage(file({size:30*1024*1024+1})),/30 MB/);
  await assert.rejects(env.compressImage(file({type:'image/svg+xml'})),/HEIC, JPG/);
  await assert.rejects(env.compressImage(file({name:'unsafe.SVG',type:''})),/HEIC, JPG/);
  assert.equal(env.state.sources.length,0); assert.equal(env.state.workers.length,0);
});
test('native photo is resized to 1600 px and emitted as JPEG without relying on WebP support',async()=>{
  const env=imageEnvironment({encode:({type})=>type==='image/jpeg'?new Blob([new Uint8Array(500)],{type}):null});
  const blob=await env.compressImage(file());
  assert.equal(blob.type,'image/jpeg'); assert.equal(blob.size,500);
  assert.equal(env.state.encodes[0].width,1600); assert.equal(env.state.encodes[0].height,1200);
  assert.equal(env.state.fills[0].color,'#ffffff');
  assert.equal(env.state.sources[0].closed,1);
  assert.equal(env.state.canvases[0].width,1); assert.equal(env.state.canvases[0].height,1);
  assert.equal(env.state.workers.length,0);
});
test('native HEIC support succeeds without loading a worker',async()=>{
  const env=imageEnvironment({width:1200,height:1600}),progress=[];
  const blob=await env.compressImage(file({name:'IMG.HEIC'}),message=>progress.push(message));
  assert.equal(blob.type,'image/jpeg'); assert.equal(env.state.workers.length,0);
  assert.match(progress[0],/HEIC/); assert.equal(env.state.sources[0].closed,1);
});
test('Safari image-element decode works after createImageBitmap failure and revokes its URL',async()=>{
  const env=imageEnvironment({nativeError:true,imageMode:'success'});
  assert.equal((await env.compressImage(file({name:'IMG.HEIC'}))).type,'image/jpeg');
  assert.deepEqual(env.state.revoked,['blob:test-image']);
  assert.equal(env.state.workers.length,0); assert.equal(env.state.timers.size,0);
  assert.equal(env.state.encodes[0].width,1600); assert.equal(env.state.encodes[0].height,800);
});
test('HEIC falls back to the local worker only after native decoders fail',async()=>{
  const env=imageEnvironment({nativeError:true,workerReply:make=>({bitmap:make(1200,1600)})});
  const input=file({name:'IMG.HEIC'});
  assert.equal((await env.compressImage(input)).type,'image/jpeg');
  const worker=env.state.workers[0];
  assert.equal(worker.url.href,'https://toohuubrand.com/admin.heic-worker.js');
  assert.equal(worker.config.type,'module'); assert.equal(worker.message.file,input);
  assert.equal(worker.message.maxSide,1600); assert.equal(worker.message.maxPixels,60_000_000);
  assert.equal(worker.terminated,1); assert.equal(env.state.sources[0].closed,1);
  assert.deepEqual(env.state.revoked,['blob:test-image']); assert.equal(env.state.timers.size,0);
});
test('a corrupt non-HEIC image rejects without trying the HEIC decoder',async()=>{
  const env=imageEnvironment({nativeError:true});
  await assert.rejects(env.compressImage(file()),/Зургийг уншиж чадсангүй/);
  assert.equal(env.state.workers.length,0); assert.deepEqual(env.state.revoked,['blob:test-image']);
});
test('a stalled native image decode times out and releases its temporary URL',async()=>{
  const env=imageEnvironment({noBitmap:true,imageMode:'pending'});
  const pending=env.compressImage(file());
  const result=assert.rejects(pending,/Зургийг уншиж чадсангүй/);
  await new Promise(resolve=>setImmediate(resolve));
  const timer=[...env.state.timers.values()][0]; assert.equal(timer.delay,20000); timer.fn();
  await result; assert.deepEqual(env.state.revoked,['blob:test-image']);
  assert.equal(env.state.workers.length,0); assert.equal(env.state.canvases.length,0);
});
test('oversized decoded resolution is rejected and native image memory is released',async()=>{
  const env=imageEnvironment({width:10000,height:10000});
  await assert.rejects(env.compressImage(file()),/60 мегапиксел/);
  assert.equal(env.state.sources[0].closed,1); assert.equal(env.state.canvases.length,0);
});
test('large JPEG results are retried at lower quality and dimensions until within the upload budget',async()=>{
  const env=imageEnvironment({encode:({type},n)=>new Blob([new Uint8Array(n<=5?700001:700000)],{type})});
  assert.equal((await env.compressImage(file())).size,700000);
  assert.equal(env.state.encodes.length,6);
  assert.equal(env.state.encodes[5].width,1280); assert.equal(env.state.encodes[5].height,960);
  assert.equal(env.state.sources[0].closed,1);
});
test('an image that cannot fit the upload budget fails after bounded work and releases resources',async()=>{
  const env=imageEnvironment({encode:({type})=>({size:700001,type})});
  await assert.rejects(env.compressImage(file()),/хэмжээ хэт том/);
  assert.equal(env.state.encodes.length,25); assert.equal(env.state.sources[0].closed,1);
  assert.equal(env.state.canvases[0].width,1);
});
test('missing canvas, failed JPEG encoding and wrong encoder MIME fail clearly with cleanup',async()=>{
  for (const options of [{noContext:true},{encode:()=>null},{encode:()=>new Blob(['image'],{type:'image/png'})}]) {
    const env=imageEnvironment(options);
    await assert.rejects(env.compressImage(file()),/Зургийг/);
    assert.equal(env.state.sources[0].closed,1); assert.equal(env.state.canvases[0].width,1);
  }
});
test('worker decode errors, script errors and deserialization errors terminate their worker',async()=>{
  for (const kind of ['decode','script','message']) {
    const env=imageEnvironment(),pending=env.decodeHeic(file({name:'photo.heic'})),worker=env.state.workers[0];
    const result=assert.rejects(pending,/HEIC|Хөрвүүлсэн/);
    if(kind==='decode')worker.onmessage({data:{error:'HEIC зураг гэмтсэн'}});
    if(kind==='script'){let prevented=false;worker.onerror({preventDefault(){prevented=true;}});assert(prevented);}
    if(kind==='message')worker.onmessageerror();
    await result; assert.equal(worker.terminated,1); assert.equal(env.state.timers.size,0);
  }
});
test('worker timeout rejects after 90 seconds and terminates without waiting on real time',async()=>{
  const env=imageEnvironment(),pending=env.decodeHeic(file({name:'photo.heic'}));
  const result=assert.rejects(pending,/хугацаа хэтэрлээ/);
  const timer=[...env.state.timers.values()][0]; assert.equal(timer.delay,90000); timer.fn();
  await result; assert.equal(env.state.workers[0].terminated,1); assert.equal(env.state.timers.size,0);
});
test('worker creation or postMessage failure rejects and cleans up any worker already created',async()=>{
  for (const options of [{workerConstructorError:true},{workerPostError:true}]) {
    const env=imageEnvironment(options);
    await assert.rejects(env.decodeHeic(file()),/эхлүүлж чадсангүй/);
    for(const worker of env.state.workers)assert.equal(worker.terminated,1);
    assert.equal(env.state.timers.size,0);
  }
});

function workerEnvironment(options={}) {
  const state={posts:[],freed:[],contexts:[],pixels:[],bitmaps:[],displays:[]};
  const frame=(name,width,height,primary=false)=>({
    get_width:()=>width,get_height:()=>height,is_primary:()=>primary,
    free(){state.freed.push(name);},
    display(pixels,callback){state.displays.push(name);callback(options.displayError?null:pixels);}
  });
  const frames=options.frames?.(frame) ?? [frame('primary',400,300,true)];
  const lib={HeifDecoder:class {
    constructor(){this.decoder='decoder-context';}
    decode(){if(options.decodeError)throw new Error(options.decodeError);return frames;}
  },heif_context_free(context){state.contexts.push(context);}};
  const sandbox={
    buildLibheif:async()=>lib,
    ImageData:class {constructor(width,height){this.width=width;this.height=height;this.data=new Uint8ClampedArray(width*height*4);state.pixels.push(this);}},
    createImageBitmap:async(rgba,settings)=>{const bitmap={width:settings.resizeWidth,height:settings.resizeHeight};state.bitmaps.push({rgba,settings,bitmap});return bitmap;},
    self:{postMessage(message,transfer){state.posts.push({message,transfer});}}
  };
  vm.runInNewContext(workerSource,sandbox);
  return {state,run:()=>sandbox.self.onmessage({data:{file:file({name:'IMG.HEIC'}),maxSide:1600,maxPixels:60_000_000}})};
}
test('HEIC worker uses the primary photo, outputs a transferable bitmap and frees all decoded frames',async()=>{
  const env=workerEnvironment({frames:frame=>[frame('thumbnail',20,10),frame('primary',3200,1600,true)]});
  await env.run();
  assert.deepEqual(env.state.displays,['primary']);
  assert.equal(env.state.bitmaps[0].settings.resizeWidth,1600); assert.equal(env.state.bitmaps[0].settings.resizeHeight,800);
  const {message,transfer}=env.state.posts[0]; assert.equal(message.bitmap,transfer[0]);
  assert.equal(env.state.pixels[0].data[3],255); assert.equal(env.state.pixels[0].data.at(-1),255);
  assert.deepEqual(env.state.freed,['thumbnail','primary']); assert.deepEqual(env.state.contexts,['decoder-context']);
});
test('HEIC worker handles a file without primary metadata and never enlarges a small image',async()=>{
  const env=workerEnvironment({frames:frame=>[frame('first',80,40)]}); await env.run();
  assert.deepEqual(env.state.displays,['first']);
  assert.equal(env.state.bitmaps[0].settings.resizeWidth,80); assert.equal(env.state.bitmaps[0].settings.resizeHeight,40);
});
test('HEIC worker rejects empty or corrupt files with a Mongolian message and releases the decoder',async()=>{
  for(const options of [{frames:()=>[]},{decodeError:'libheif internal decoding failure'}]) {
    const env=workerEnvironment(options); await env.run();
    assert.match(env.state.posts[0].message.error,/HEIC зураг гэмтсэн/);
    assert.doesNotMatch(env.state.posts[0].message.error,/internal/);
    assert.deepEqual(env.state.contexts,['decoder-context']);
    assert.equal(env.state.bitmaps.length,0);
  }
});
test('HEIC worker checks pixel limits before allocating pixels and still releases decoded frames',async()=>{
  const env=workerEnvironment({frames:frame=>[frame('huge',10000,10000,true)]}); await env.run();
  assert.match(env.state.posts[0].message.error,/60 мегапиксел/);
  assert.equal(env.state.pixels.length,0); assert.deepEqual(env.state.freed,['huge']);
  assert.deepEqual(env.state.contexts,['decoder-context']);
});
test('HEIC worker reports failed pixel decode and frees the frame and decoder',async()=>{
  const env=workerEnvironment({displayError:true}); await env.run();
  assert.match(env.state.posts[0].message.error,/HEIC.*хөрвүүл/);
  assert.deepEqual(env.state.freed,['primary']); assert.deepEqual(env.state.contexts,['decoder-context']);
  assert.equal(env.state.bitmaps.length,0);
});
