import buildLibheif from './admin.vendor/libheif-1.23.5.js';

// One file per worker. The parent terminates the worker on success, error or timeout
// to release the decoder heap, including memory owned by the compiled library.
self.onmessage = async ({data:{file, maxSide, maxPixels}}) => {
  let lib, decoder, images;
  try {
    lib = await buildLibheif();
    decoder = new lib.HeifDecoder();
    images = decoder.decode(await file.arrayBuffer());
    if (!images?.length) throw new Error('HEIC зураг гэмтсэн эсвэл дэмжигдэхгүй байна.');
    const image = images.find(item => item.is_primary?.()) || images[0];
    const width = image.get_width(), height = image.get_height();
    if (!width || !height || width * height > maxPixels) throw new Error('Зургийн нягтаршил хэт өндөр байна. 60 мегапиксел хүртэл зураг сонгоно уу.');
    const pixels = new ImageData(width, height);
    for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255;
    const rgba = await new Promise((resolve, reject) => image.display(pixels, result => result
      ? resolve(result) : reject(new Error('HEIC зургийг хөрвүүлж чадсангүй.'))));
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const bitmap = await createImageBitmap(rgba, {resizeWidth:Math.max(1, Math.round(width * scale)), resizeHeight:Math.max(1, Math.round(height * scale)), resizeQuality:'high'});
    self.postMessage({bitmap}, [bitmap]);
  } catch (error) {
    self.postMessage({error:/^[А-Яа-яӨөҮү]/.test(error.message || '') ? error.message : 'HEIC зураг гэмтсэн эсвэл хөрвүүлэх боломжгүй байна. Өөр зураг сонгоно уу.'});
  } finally {
    for (const image of images || []) image.free();
    if (decoder?.decoder) lib.heif_context_free(decoder.decoder);
  }
};
