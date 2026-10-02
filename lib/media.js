export const MAX_IMAGE_BYTES=768000;
export const MEDIA_ID=/^[a-f0-9]{64}$/;

export async function readImageBody(request){
  if(Number(request.headers.get('Content-Length'))>MAX_IMAGE_BYTES)throw new RangeError('Зургийн хэмжээ хэт том байна.');
  const reader=request.body?.getReader(),chunks=[];let length=0;
  if(!reader)throw new Error('Зураг сонгоно уу.');
  while(true){
    const {done,value}=await reader.read();if(done)break;
    length+=value.byteLength;
    if(length>MAX_IMAGE_BYTES){await reader.cancel();throw new RangeError('Зургийн хэмжээ хэт том байна.');}
    chunks.push(value);
  }
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes;
}
export function imageType(bytes){
  const starts=values=>values.every((value,i)=>bytes[i]===value);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const tag=(offset,length=4)=>String.fromCharCode(...bytes.slice(offset,offset+length));
  const dimensions=(w,h)=>w>0&&h>0&&w<=4096&&h<=4096;
  if(bytes.length>=57&&starts([137,80,78,71,13,10,26,10])){
    let offset=8,header=false,pixels=false;
    while(offset+12<=bytes.length){
      const length=view.getUint32(offset),type=tag(offset+4),end=offset+12+length;
      if(end>bytes.length)break;
      if(offset===8){if(type!=='IHDR'||length!==13||!dimensions(view.getUint32(offset+8),view.getUint32(offset+12)))break;header=true;}
      if(type==='IDAT'&&length>0)pixels=true;
      if(type==='IEND'&&length===0&&end===bytes.length&&header&&pixels)return 'image/png';
      offset=end;
    }
  }
  if(bytes.length>=32&&starts([255,216,255])&&bytes.at(-2)===255&&bytes.at(-1)===217){
    let offset=2,frame=false;
    while(offset+4<bytes.length){
      if(bytes[offset++]!==255)break;
      while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];
      if(offset+2>bytes.length)break;
      const length=view.getUint16(offset);
      if(length<2||offset+length>bytes.length-2)break;
      if([0xc0,0xc1,0xc2].includes(marker)&&length>=8)frame=dimensions(view.getUint16(offset+5),view.getUint16(offset+3));
      if(marker===0xda&&length>=6&&frame&&offset+length<bytes.length-2)return 'image/jpeg';
      offset+=length;
    }
  }
  if(bytes.length>=26&&starts([82,73,70,70])&&tag(8)==='WEBP'&&view.getUint32(4,true)+8===bytes.length){
    let offset=12,pixels=false;
    while(offset+8<=bytes.length){
      const type=tag(offset),length=view.getUint32(offset+4,true),payload=offset+8,end=payload+length+(length%2);
      if(end>bytes.length||type==='ANIM'||type==='ANMF')break;
      if(type==='VP8 '&&length>10&&tag(payload+3,3)==='\x9d\x01\x2a')pixels=dimensions(view.getUint16(payload+6,true)&0x3fff,view.getUint16(payload+8,true)&0x3fff);
      if(type==='VP8L'&&length>5&&bytes[payload]===0x2f){const bits=view.getUint32(payload+1,true);pixels=dimensions((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);}
      if(type==='VP8X'&&(length!==10||(bytes[payload]&2)))break;
      if(end===bytes.length&&pixels)return 'image/webp';
      offset=end;
    }
  }
  throw new Error('JPG, PNG эсвэл WebP зураг оруулна уу.');
}
