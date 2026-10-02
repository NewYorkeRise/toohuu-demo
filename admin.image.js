// Images stay on the device while decoding/resizing; only the web-sized result is uploaded.
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_PIXELS = 60_000_000;
const MAX_SIDE = 1600;

export async function isHeic(file) {
  if (/\.hei[cf]$/i.test(file.name || '') || /^image\/hei[cf](?:-sequence)?$/i.test(file.type)) return true;
  const bytes = new Uint8Array(await file.slice(0, 256).arrayBuffer());
  const text = offset => String.fromCharCode(...bytes.slice(offset, offset + 4));
  if (text(4) !== 'ftyp') return false;
  const brands = new Set(['heic','heix','hevc','hevx','heim','heis','mif1','msf1']);
  const length = Math.min(bytes.length, new DataView(bytes.buffer).getUint32(0));
  for (let i = 8; i + 4 <= length; i += 4) if (i !== 12 && brands.has(text(i))) return true;
  return false;
}

function dimensions(width, height) {
  if (!width || !height || width * height > MAX_PIXELS) throw new Error('Зургийн нягтаршил хэт өндөр байна. 60 мегапиксел хүртэл зураг сонгоно уу.');
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  return {width:Math.max(1, Math.round(width * scale)), height:Math.max(1, Math.round(height * scale))};
}

async function nativeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch { /* Safari can decode HEIC through an image element. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      const timeout = setTimeout(() => { image.src = ''; reject(new Error('Зургийг унших хугацаа хэтэрлээ.')); }, 20000);
      image.onload = () => { clearTimeout(timeout); resolve(image); };
      image.onerror = () => { clearTimeout(timeout); reject(new Error('Зургийг уншиж чадсангүй.')); };
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

export function decodeHeic(file) {
  return new Promise((resolve, reject) => {
    let worker, timeout;
    const finish = (error, bitmap) => {
      clearTimeout(timeout);
      worker?.terminate();
      error ? reject(error) : resolve(bitmap);
    };
    try {
      worker = new Worker(new URL('./admin.heic-worker.js', import.meta.url), {type:'module'});
      timeout = setTimeout(() => finish(new Error('HEIC зураг хөрвүүлэх хугацаа хэтэрлээ. Дахин нэг нэгээр нь оруулна уу.')), 90000);
      worker.onmessage = ({data}) => data.bitmap
        ? finish(null, data.bitmap)
        : finish(new Error(data.error || 'HEIC зургийг хөрвүүлж чадсангүй. Өөр зураг сонгоод дахин оролдоно уу.'));
      worker.onerror = event => {
        event.preventDefault();
        finish(new Error('HEIC хөрвүүлэгч ачаалагдсангүй. Интернэтээ шалгаад хуудсаа шинэчилнэ үү.'));
      };
      worker.onmessageerror = () => finish(new Error('Хөрвүүлсэн зургийг уншиж чадсангүй. Дахин оролдоно уу.'));
      worker.postMessage({file, maxSide:MAX_SIDE, maxPixels:MAX_PIXELS});
    } catch { finish(new Error('HEIC хөрвүүлэгчийг эхлүүлж чадсангүй. Safari эсвэл Chrome-оо шинэчлээд дахин оролдоно уу.')); }
  });
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Зургийг боловсруулах боломжгүй байна.')), type, quality));
}

export async function compressImage(file, onProgress = () => {}) {
  if (!file.size) throw new Error('Хоосон зураг оруулах боломжгүй.');
  if (file.size > MAX_FILE_BYTES) throw new Error('30 MB-аас жижиг зураг сонгоно уу.');
  if (/svg/i.test(file.type) || /\.svg$/i.test(file.name || '')) throw new Error('HEIC, JPG, PNG эсвэл WebP зураг сонгоно уу.');
  const heic = await isHeic(file);
  let source, canvas;
  onProgress(heic ? 'HEIC зураг хөрвүүлж байна…' : 'Зураг бэлтгэж байна…');
  try {
    try { source = await nativeImage(file); }
    catch {
      if (!heic) throw new Error('Зургийг уншиж чадсангүй. Өөр зураг сонгоно уу.');
      source = await decodeHeic(file);
    }
    let {width, height} = dimensions(source.width, source.height);
    canvas = document.createElement('canvas');
    // JPEG works in iPhone Safari, including versions which cannot encode WebP.
    // Canvas output also omits the original photo's EXIF/GPS metadata.
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Зургийг боловсруулах боломжгүй байна.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
      context.drawImage(source, 0, 0, width, height);
      for (const quality of [.86, .76, .66, .56, .46]) {
        const blob = await toBlob(canvas, 'image/jpeg', quality);
        if (blob.type !== 'image/jpeg') throw new Error('Зургийг JPG болгож чадсангүй. Хөтчөө шинэчлээд дахин оролдоно уу.');
        if (blob.size <= 700000) return blob;
      }
      width = Math.max(1, Math.floor(width * .8)); height = Math.max(1, Math.floor(height * .8));
    }
    throw new Error('Зургийн хэмжээ хэт том байна. Жижиг зураг сонгоно уу.');
  } finally {
    source?.close?.();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
