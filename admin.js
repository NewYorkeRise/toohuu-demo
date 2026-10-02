'use strict';

const TYPE_NAMES = {boot:'Гутал', socks:'Оймс', rug:'Ширдэг'};
const AUDIENCES = {men:'Эрэгтэй', women:'Эмэгтэй', kids:'Хүүхэд'};
const DEFAULT_AXES = {
  boot:[{name:'Хийцлэл', values:['Оёмол','Давхар эсгий','Арьсан хормойтой']},{name:'Өнгө',values:['Хар','Бор','Саарал']},{name:'Хэмжээ',values:['36','37','38','39','40','41','42','43']}],
  socks:[{name:'Өнгө',values:['Цагаан','Саарал','Бор']},{name:'Хэмжээ',values:['S (35–37)','M (38–40)','L (41–43)']}],
  rug:[{name:'Хэмжээ',values:['60×90 см','90×150 см','120×180 см','200×300 см']},{name:'Загвар',values:['Өлзий','Эвэр','Хас']}]
};
const COLOR_CHOICES = {'Номин ногоон':'#A8D8C4','Ягаан':'#F4A7B9','Шар':'#FFD166','Шаргал':'#D4C5A9','Цэнхэр':'#5B9BD5','Хар':'#1C1C1C','Цайвар цэнхэр':'#C8DFF7','Хүрэн улаан':'#7A2033','Улбар шар':'#F28C38','Хар хөх':'#1E3A5F','Улаан':'#D93B3B','Цайвар нил ягаан':'#C5A8D8','Нил ягаан':'#6B2FA0','Цайвар ягаан':'#FAD4DC','Ногоон':'#4A7A5A','Неон ногоон':'#C8F000','Бараан саарал':'#555555','Саарал':'#9E9E9E','Бор':'#8B5E3C','Цагаан':'#F5F5F5'};
const MAX_IMAGES = 20, MAX_COMBINATIONS = 1500;
const FIELD_NAMES = {name:'Нэр',type:'Бүлэг',audience:'Ангилал',category:'Ангилал',base_price:'Үнэ',stock_count:'Бэлэн тоо',image:'Зураг',images:'Зураг',description:'Тайлбар',axes:'Сонголтууд',option_axes:'Сонголтууд',variants:'Хослолууд',is_active:'Харагдах байдал',hot:'Эрэлттэй',fresh:'Шинэ',created:'Шинэ бараа'};
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const money = value => Number(value).toLocaleString('en-US') + '₮';
const unit = type => type === 'rug' ? 'ширхэг' : 'хос';
const dateText = value => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Ulaanbaatar'}).format(new Date(value)) : '—';
const safeImage = value => {
  if (typeof value !== 'string') return '';
  if (/^\/media\/[a-f0-9]{64}$/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : ''; } catch { return ''; }
};
const thumbnail = (product, className='product-image') => safeImage(product.image) ? `<img class="${className}" src="${esc(product.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="${className} image-placeholder">TOOHUU</span>`;

let catalog = null, currentView = 'products', typeFilter = 'all', statusFilter = 'all', searchQuery = '', page = 1;
let draft = null, originalProduct = null, initialForm = '', dirty = false, saving = false, catalogLoading = false;
let auditRequest = 0;
let editorType = 'boot', axesByType = {}, removedImages = [], uploading = false, editorSession = 0;
const selectedRadio = name => document.querySelector(`#product-form input[name="${name}"]:checked`)?.value || '';
function setRadio(name,value) { document.querySelectorAll(`#product-form input[name="${name}"]`).forEach(input=>{input.checked=input.value===value;}); }

function showNotice(message, kind='success') {
  $('notice').textContent = message;
  $('notice').className = `notice ${kind}`;
  $('notice').hidden = !message;
}
function showFormError(message) {
  $('form-error').textContent = message;
  $('form-error').hidden = !message;
  if (message) $('form-error').scrollIntoView({block:'nearest'});
}
function errorMessage(error, savingRequest=false) {
  if (error.status === 401 || error.status === 403) return 'Нэвтрэх эрхийг баталгаажуулж чадсангүй. Хуудсаа дахин ачаалж админы нэр, нууц үгээр нэвтэрнэ үү.';
  if (error.status === 409) return 'Өөр төхөөрөмж эсвэл админ мэдээллийг шинэчилсэн байна. Таны өөрчлөлт хадгалагдаагүй. Энэ цонхыг хааж «Шинэчлэх» товчоор хамгийн сүүлийн мэдээллийг аваад дахин засна уу.';
  if (error.status === 503) return 'Мэдээлэл хадгалах үйлчилгээ түр боломжгүй байна. Түр хүлээгээд дахин оролдоно уу.';
  if (error.status === 400 || error.status === 422 || error.status === 413) return error.detail || 'Мэдээллийг хадгалж чадсангүй. Нэр, үнэ, бэлэн тоо болон сонголтын утгууд зөв эсэхийг шалгана уу.';
  if (savingRequest) return 'Хадгалалт баталгаажаагүй байна. Сүлжээгээ шалгаад энэ цонхыг хааж «Шинэчлэх» товчоор мэдээллээ дахин уншина уу.';
  return 'Мэдээллийг ачаалж чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.';
}
async function api(path, options={}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(path, {credentials:'same-origin',cache:'no-store',...options,signal:controller.signal});
    if (!response.ok) {
      const error = new Error('Request failed'); error.status = response.status;
      try { const body = await response.json(); if (typeof body.error === 'string' && body.error.length <= 500) error.detail = body.error; } catch {}
      throw error;
    }
    return await response.json();
  } finally { clearTimeout(timeout); }
}
function loading(message='Мэдээллийг ачаалж байна') {
  $('view-content').innerHTML = `<div class="empty loading"><span class="spinner" aria-hidden="true"></span><h2>${esc(message)}</h2><p>Түр хүлээнэ үү.</p></div>`;
}
async function loadCatalog() {
  if (catalogLoading) return;
  catalogLoading = true;
  $('add-product').disabled = true;
  if (currentView === 'products') loading();
  try {
    const result = await api('/admin/api/catalog');
    if (!Array.isArray(result.products) || !Number.isInteger(result.revision)) throw new Error('Invalid catalog');
    catalog = result;
    if (currentView === 'products') renderProducts();
    showNotice('');
  } catch (error) {
    if (currentView === 'products') $('view-content').innerHTML = `<div class="empty"><h2>Каталогийг нээж чадсангүй</h2><p>${esc(errorMessage(error))}</p><button class="button secondary" data-action="reload">Дахин оролдох</button></div>`;
  } finally {
    catalogLoading = false;
    $('add-product').disabled = !catalog;
  }
}
function setView(view) {
  currentView = view;
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  const headings = {
    products:['Каталог','Бараа','Нэр, үнэ, бэлэн тоо болон сонголтуудаа удирдана.'],
    audit:['Хяналт','Өөрчлөлтийн түүх','Хэн, хэзээ, ямар мэдээлэл шинэчилснийг харна.'],
    orders:['Харилцаа','Захиалга','Захиалагчтай Messenger чатаар холбогдоно.']
  }[view];
  document.querySelector('.page-heading .eyebrow').textContent = headings[0];
  document.querySelector('.page-heading h1').textContent = headings[1];
  document.querySelector('.page-heading .subtitle').textContent = headings[2];
  $('add-product').hidden = view !== 'products';
  showNotice('');
  if (view === 'products') catalog ? renderProducts() : loadCatalog();
  if (view === 'audit') loadAudit();
  if (view === 'orders') $('view-content').innerHTML = `<section class="orders-card"><p class="eyebrow">Messenger</p><h2>Захиалгаа чатаар хүлээн авна</h2><p>Худалдан авагч сонгосон загвар, хэмжээ, өнгө болон холбоо барих мэдээллээ Messenger-ээр илгээнэ. Энэ самбарт захиалга, төлбөр автоматаар бүртгэгдэхгүй.</p><p>Хүлээн авсан захиалгын дагуу барааны бэлэн тоог «Бараа» хэсгээс шинэчилнэ үү.</p><a class="button primary" href="https://www.facebook.com/toohuubrand" target="_blank" rel="noopener">TOOHUU Facebook нээх ↗</a></section>`;
}
function renderProducts() {
  if (!catalog) return;
  const products = catalog.products;
  $('view-content').innerHTML = `<section class="metrics" aria-label="Каталогийн товч мэдээлэл">
    <div class="metric"><p>Нийт загвар</p><strong>${products.length}</strong></div>
    <div class="metric"><p>Сайтад харагдаж буй</p><strong>${products.filter(p => p.is_active).length}</strong></div>
    <div class="metric"><p>Нуусан загвар</p><strong>${products.filter(p => !p.is_active).length}</strong></div>
    <div class="metric"><p>Бэлэн тоо дууссан</p><strong>${products.filter(p => p.stock_count === 0).length}<small>загвар</small></strong></div>
  </section><div class="catalog-tools"><div class="type-tabs" aria-label="Барааны бүлэг">${[['all','Бүгд'],...Object.entries(TYPE_NAMES)].map(([type,name]) => `<button type="button" data-type="${type}" aria-pressed="${typeFilter===type}">${name}<small>${products.filter(p=>type==='all'||p.type===type).length}</small></button>`).join('')}</div><div class="search-row"><input type="search" id="product-search" aria-label="Бараа хайх" placeholder="Загварын нэрээр хайх…" value="${esc(searchQuery)}"><select id="status-filter" aria-label="Харагдах байдлаар шүүх"><option value="all">Бүх төлөв</option><option value="active">Сайтад харагдах</option><option value="hidden">Нуусан</option><option value="empty">Бэлэн тоо 0</option></select></div></div><div id="product-results"></div><div class="catalog-footer"><span>Сүүлд шинэчилсэн: ${esc(dateText(catalog.updated_at))} · УБ цаг</span><button type="button" class="text-button" data-action="reload">Шинэчлэх</button></div>`;
  $('status-filter').value = statusFilter;
  renderProductRows();
}
function renderProductRows() {
  const all = catalog.products.filter(product => (typeFilter === 'all' || product.type === typeFilter) && (statusFilter === 'all' || statusFilter === 'active' && product.is_active || statusFilter === 'hidden' && !product.is_active || statusFilter === 'empty' && product.stock_count === 0) && product.name.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase()));
  const perPage = 30, pages = Math.max(1,Math.ceil(all.length / perPage));
  page = Math.min(page,pages);
  const products = all.slice((page-1)*perPage,page*perPage);
  if (!all.length) { $('product-results').innerHTML = `<div class="empty"><h2>Тохирох бараа олдсонгүй</h2><p>Хайлт эсвэл сонгосон шүүлтүүрээ өөрчилнө үү.</p><button class="button secondary" type="button" data-action="reset-filters">Шүүлтүүр цэвэрлэх</button></div>`; return; }
  $('product-results').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Загвар</th><th class="desktop-category">Ангилал</th><th>Үнэ</th><th>Бэлэн тоо</th><th>Төлөв</th><th><span class="visually-hidden">Үйлдэл</span></th></tr></thead><tbody>${products.map(product => `<tr><td class="product-main"><div class="product-cell">${thumbnail(product)}<div><strong>${esc(product.name)}</strong><span class="product-meta">${TYPE_NAMES[product.type] || ''}${product.audience?' · '+esc(AUDIENCES[product.audience]||''):product.type==='socks'?' · '+(product.category==='kids'?'Хүүхэд':'Том хүн'):''}</span></div></div></td><td class="desktop-category">${esc(product.audience?AUDIENCES[product.audience]:product.type==='socks'?(product.category==='kids'?'Хүүхэд':'Том хүн'):'—')}</td><td class="number price-cell">${money(product.base_price)}</td><td class="number stock-cell ${!product.stock_count?'stock-zero':''}">${product.stock_count} ${unit(product.type)}</td><td class="status-cell"><span class="badge ${product.is_active?'live':'hidden'}">${product.is_active?'● Нийтэлсэн':'Нуусан'}</span></td><td class="edit-cell"><button class="edit-button" type="button" data-edit="${esc(product.id)}" aria-label="${esc(product.name)} засах">Засах</button></td></tr>`).join('')}</tbody></table></div>${pages>1?`<div class="catalog-footer"><span>${all.length} загвар · ${page}/${pages} хуудас</span><div><button class="button secondary" data-page="${page-1}" ${page===1?'disabled':''}>Өмнөх</button> <button class="button secondary" data-page="${page+1}" ${page===pages?'disabled':''}>Дараах</button></div></div>`:''}`;
}
async function loadAudit() {
  const request = ++auditRequest;
  loading('Өөрчлөлтийн түүхийг ачаалж байна');
  try {
    const result = await api('/admin/api/audit');
    if (currentView !== 'audit' || request !== auditRequest) return;
    if (!Array.isArray(result.entries)) throw new Error('Invalid audit');
    $('view-content').innerHTML = result.entries.length ? `<div class="audit-list">${result.entries.map(entry => `<article class="audit-entry"><div class="audit-title"><strong>Каталог шинэчлэгдсэн</strong><span>№${esc(entry.revision)}</span></div><p>${Array.isArray(entry.summary)?entry.summary.map(item=>`${esc(item.name || item.id)}: ${esc((item.fields || []).map(field=>FIELD_NAMES[field] || field).join(', '))}`).join('<br>'):esc(entry.summary || '')}</p>${entry.reason?`<p>${esc(entry.reason)}</p>`:''}<div class="audit-meta"><span>${esc(entry.actor || 'Админ')}</span><time>${esc(dateText(entry.created_at))} · УБ цаг</time></div></article>`).join('')}</div><div class="catalog-footer"><span>Сүүлийн ${result.entries.length} өөрчлөлт</span><button class="text-button" data-action="reload-audit">Шинэчлэх</button></div>` : `<div class="empty"><h2>Өөрчлөлт хараахан алга</h2><p>Барааны мэдээллийг хадгалсны дараа түүх энд харагдана.</p></div>`;
  } catch (error) {
    if (currentView === 'audit' && request === auditRequest) $('view-content').innerHTML = `<div class="empty"><h2>Түүхийг ачаалж чадсангүй</h2><p>${esc(errorMessage(error))}</p><button class="button secondary" data-action="reload-audit">Дахин оролдох</button></div>`;
  }
}
function availableAxisValues(type,axis) {
  if (axis.name === 'Өнгө') return Object.keys(COLOR_CHOICES);
  if (axis.name === 'Хэмжээ' && type === 'boot') return Array.from({length:21},(_,i)=>String(i+26));
  if (axis.name === 'Хэмжээ' && type === 'socks') return ['XS (26–29)','S (30–33)','S (35–37)','M (38–40)','L (41–43)'];
  return DEFAULT_AXES[type].find(item=>item.name===axis.name)?.values || [];
}
function prepareAxes(type,axes) {
  return axes.map(axis=>({name:axis.name,values:[...axis.values],choices:[...new Set([...availableAxisValues(type,axis),...axis.values])]}));
}
function syncAxes() {
  const axes = axesByType[editorType] || [];
  document.querySelectorAll('.axis-options').forEach((group,index)=>{
    const checked = Array.from(group.querySelectorAll('input[type="checkbox"]:checked')).map(input=>input.value);
    const axis = axes[index];
    if (axis) axis.values = [...axis.values.filter(value=>checked.includes(value)),...checked.filter(value=>!axis.values.includes(value))];
  });
}
function currentAxes() { syncAxes(); return (axesByType[editorType] || []).map(({name,values})=>({name,values:[...values]})); }
function renderAxes() {
  $('axis-list').innerHTML = axesByType[editorType].map((axis,index) => {
    const name = axis.name==='Загвар'?'Хээ':axis.name;
    return `<fieldset class="axis-options" data-axis-index="${index}"><legend>${esc(name)} <span class="axis-count">${axis.values.length} сонгосон</span></legend><div class="axis-actions"><button type="button" class="text-button" data-axis-all="${index}">Бүгдийг сонгох</button><button type="button" class="text-button" data-axis-clear="${index}">Цэвэрлэх</button></div><div class="choice-list">${axis.choices.map(value=>`<label class="choice${axis.name==='Өнгө'?' color-choice':''}"><input type="checkbox" value="${esc(value)}"${axis.values.includes(value)?' checked':''}>${axis.name==='Өнгө'&&COLOR_CHOICES[value]?`<i class="color-dot color-swatch-${Object.keys(COLOR_CHOICES).indexOf(value)}" aria-hidden="true"></i>`:''}<span>${esc(value)}</span></label>`).join('')}</div><details class="custom-choice"><summary>Өөр ${esc(name.toLocaleLowerCase())} нэмэх</summary><div class="custom-choice-row"><input type="text" id="custom-axis-${index}" maxlength="60" aria-label="Шинэ ${esc(name.toLocaleLowerCase())}" placeholder="Шинэ утга"><button type="button" class="button secondary" data-axis-add="${index}">Нэмэх</button></div></details></fieldset>`;
  }).join('');
}
function updateAxisCount(group) {
  group.querySelector('.axis-count').textContent = `${group.querySelectorAll('input[type="checkbox"]:checked').length} сонгосон`;
}
function addAxisChoice(index) {
  if (saving || uploading) return;
  const input = $('custom-axis-'+index), value = input.value.trim();
  if (!value) { input.focus(); return; }
  syncAxes();
  const axis = axesByType[editorType][index];
  if (!axis.choices.includes(value)) axis.choices.push(value);
  if (!axis.values.includes(value)) axis.values.push(value);
  renderAxes(); markDirty();
}
function updateTypeFields() {
  const type = selectedRadio('type');
  $('audience-field').hidden = type !== 'boot';
  $('category-field').hidden = type !== 'socks';
  $('stock-unit').textContent = unit(type);
}
function renderGallery() {
  if (!draft) return;
  $('gallery-count').textContent = `${draft.images.length} / ${MAX_IMAGES} зураг`;
  $('image-gallery').innerHTML = draft.images.map((url,index)=>`<figure class="gallery-item"><img src="${esc(safeImage(url))}" alt="Зураг ${index+1}" referrerpolicy="no-referrer"><figcaption>${index===0?'<span class="cover-label">Нүүр зураг</span>':`<button type="button" class="cover-button" data-image-cover="${index}">Нүүр болгох</button>`}<div class="gallery-image-actions"><button type="button" data-image-move="${index}" data-direction="-1" aria-label="Зураг ${index+1}-ийг зүүн тийш зөөх"${index===0?' disabled':''}>←</button><button type="button" data-image-move="${index}" data-direction="1" aria-label="Зураг ${index+1}-ийг баруун тийш зөөх"${index===draft.images.length-1?' disabled':''}>→</button><button type="button" class="remove-image" data-image-remove="${index}" aria-label="Зураг ${index+1}-ийг хасах">×</button></div></figcaption></figure>`).join('');
  $('choose-images').disabled = uploading || saving || draft.images.length >= MAX_IMAGES;
  $('add-image-url').disabled = uploading || saving || draft.images.length >= MAX_IMAGES;
  $('gallery-undo').hidden = !removedImages.length;
  $('undo-image').disabled = uploading || saving || draft.images.length >= MAX_IMAGES;
}
function galleryError(message='') {
  $('gallery-error').textContent = message;
  $('gallery-error').hidden = !message;
}
function normalizeImageUrl(input) {
  const value = input.trim();
  if (!safeImage(value)) throw new Error('Зургийн нээлттэй HTTPS холбоос оруулна уу.');
  const url = new URL(value,location.origin);
  if (url.hostname === 'drive.google.com') {
    if (url.pathname.includes('/folders/')) throw new Error('Хавтасны биш, зураг тус бүрийн Google Drive холбоос оруулна уу.');
    const id = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || url.searchParams.get('id');
    if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) throw new Error('Google Drive зургийн холбоосыг шалгана уу.');
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;
  }
  return value;
}
function addImageUrl() {
  if (!draft || saving || uploading) return;
  galleryError();
  try {
    if (draft.images.length >= MAX_IMAGES) throw new Error(`Нэг загварт ${MAX_IMAGES} хүртэл зураг нэмнэ.`);
    const url = normalizeImageUrl($('product-image-url').value);
    if (draft.images.includes(url)) throw new Error('Энэ зураг галерейд нэмэгдсэн байна.');
    draft.images.push(url); $('product-image-url').value='';
    $('gallery-status').textContent='Зураг нэмэгдлээ. «Хадгалах» товчоор нийтэлнэ.';
    renderGallery(); markDirty();
  } catch(error) { galleryError(error.message); }
}
async function compressImage(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error(/\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type) ? 'HEIC зураг энэ хөтөч дээр уншигдахгүй байна. JPG эсвэл PNG болгож оруулна уу.' : 'Зургийг уншиж чадсангүй. JPG, PNG эсвэл WebP зураг сонгоно уу.'); }
  try {
    const scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas');
    let width = Math.max(1,Math.round(bitmap.width*scale)), height = Math.max(1,Math.round(bitmap.height*scale));
    for (let attempt=0;attempt<5;attempt++) {
      canvas.width=width; canvas.height=height;
      const context=canvas.getContext('2d');
      if (!context) throw new Error('Зургийг боловсруулах боломжгүй байна.');
      context.drawImage(bitmap,0,0,width,height);
      for (const quality of [.84,.74,.64,.54,.44]) {
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
        if (!blob || blob.type!=='image/webp') throw new Error('Энэ хөтөч зураг боловсруулахыг дэмжихгүй байна. Chrome эсвэл Safari-г шинэчилнэ үү.');
        if (blob.size<=700000) return blob;
      }
      width=Math.max(1,Math.floor(width*.8)); height=Math.max(1,Math.floor(height*.8));
    }
    throw new Error('Зургийн хэмжээ хэт том байна. Жижиг зураг сонгоно уу.');
  } finally { bitmap.close?.(); }
}
async function addImageFiles(fileList) {
  if (!draft || saving || uploading || !fileList?.length) return;
  const session=editorSession, targetDraft=draft, files=Array.from(fileList), errors=[];
  const capacity=MAX_IMAGES-draft.images.length;
  if (!capacity) { galleryError(`Нэг загварт ${MAX_IMAGES} хүртэл зураг нэмнэ.`); return; }
  if (files.length>capacity) errors.push(`Эхний ${capacity} зургийг нэмнэ. Нэг загварт ${MAX_IMAGES} хүртэл зураг оруулна.`);
  const selected=files.slice(0,capacity);
  uploading=true; galleryError(); updateBusyState();
  let added=0;
  try {
    for (let i=0;i<selected.length;i++) {
      const file=selected[i];
      $('gallery-status').textContent=`Зураг оруулж байна… ${i+1} / ${selected.length}`;
      try {
        if (file.size>30*1024*1024) throw new Error('30 MB-аас жижиг зураг сонгоно уу.');
        if (!/^image\//i.test(file.type) && !/\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name)) throw new Error('Зургийн файл сонгоно уу.');
        if (/svg/i.test(file.type) || /\.svg$/i.test(file.name)) throw new Error('JPG, PNG эсвэл WebP зураг сонгоно уу.');
        const blob=await compressImage(file);
        let result;
        try { result=await api('/admin/api/images',{method:'POST',headers:{'Content-Type':'image/webp'},body:blob}); }
        catch(error) { if (!error.status) throw new Error('Зургийг серверт оруулж чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.'); throw error; }
        if (session!==editorSession || draft!==targetDraft) return;
        if (!/^\/media\/[a-f0-9]{64}$/.test(result.url)) throw new Error('Зургийн хадгалалтыг баталгаажуулж чадсангүй.');
        if (draft.images.includes(result.url)) { errors.push(`${file.name}: энэ зураг аль хэдийн нэмэгдсэн байна.`); continue; }
        draft.images.push(result.url); added++; renderGallery(); markDirty();
      } catch(error) { errors.push(`${file.name}: ${error.status?errorMessage(error):error.name==='AbortError'?'Зураг оруулах хугацаа хэтэрлээ. Дахин оролдоно уу.':error.message || 'Зураг оруулж чадсангүй.'}`); }
    }
  } finally {
    uploading=false;
    if (session===editorSession && draft===targetDraft) {
      $('gallery-status').textContent=added?`${added} зураг нэмэгдлээ. «Хадгалах» товчоор нийтэлнэ.`:'Зураг нэмэгдээгүй.';
      galleryError(errors.join('\n')); updateBusyState(); renderGallery(); markDirty();
    }
  }
}
function formState() {
  return JSON.stringify({fields:Array.from($('product-form').querySelectorAll('input[name],textarea[name]')).map(input=>[input.name,input.type==='checkbox'||input.type==='radio'?input.checked:input.value]),axes:currentAxes(),images:draft?.images || []});
}
function markDirty() {
  dirty = formState() !== initialForm;
  $('dirty-label').textContent = dirty ? 'Хадгалаагүй өөрчлөлт байна.' : 'Хадгалсны дараа сайтад нийтлэгдэнэ.';
  $('save-product').disabled = saving || uploading || (!dirty && !!originalProduct);
  const hiding = !($('product-active').checked) && (!originalProduct || originalProduct.is_active);
  $('save-reason').required = hiding;
  $('reason-required').hidden = !hiding;
}
function openEditor(id=null) {
  if (!catalog || saving || uploading) return;
  originalProduct = id ? catalog.products.find(product=>product.id === id) : null;
  if (id && !originalProduct) return;
  const type = typeFilter === 'all' ? 'boot' : typeFilter;
  draft = originalProduct ? clone(originalProduct) : {id:'m'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:'',type,audience:type==='boot'?'women':null,category:'main',base_price:0,stock_count:0,image:'',images:[],description:'',is_active:true,hot:false,fresh:true,axes:clone(DEFAULT_AXES[type])};
  draft.images = (Array.isArray(draft.images) && draft.images.length ? [...draft.images] : draft.image?[draft.image]:[]).filter(safeImage);
  editorType=draft.type; editorSession++; removedImages=[];
  axesByType=Object.fromEntries(Object.keys(TYPE_NAMES).map(type=>[type,prepareAxes(type,clone(type===draft.type?(draft.axes || draft.option_axes || DEFAULT_AXES[type]):DEFAULT_AXES[type]))]));
  $('product-form').reset();
  $('editor-kicker').textContent = originalProduct ? 'Бараа засах' : 'Шинэ загвар';
  $('editor-title').textContent = originalProduct ? originalProduct.name : 'Бараа нэмэх';
  for (const [name,id] of [['name','product-name'],['base_price','product-price'],['stock_count','product-stock'],['description','product-description']]) $(id).value = draft[name] ?? '';
  setRadio('type',draft.type); setRadio('audience',draft.audience || 'women'); setRadio('category',draft.category || 'main');
  for (const name of ['is_active','hot','fresh']) $('product-'+({is_active:'active',hot:'hot',fresh:'fresh'}[name])).checked = !!draft[name];
  renderAxes();
  updateTypeFields();
  renderGallery(); galleryError(); $('gallery-status').textContent='';
  showFormError('');
  initialForm = formState();
  dirty = false;
  markDirty();
  $('editor').showModal();
  document.querySelector('.editor-body').scrollTop = 0;
  $('product-name').focus();
}
function closeEditor() {
  if (saving || uploading) return;
  if (dirty && !confirm('Хадгалаагүй өөрчлөлтөө орхиод хаах уу?')) return;
  dirty = false;
  $('editor').close();
  draft = null;
  editorSession++;
}
function readProduct() {
  const type = selectedRadio('type'), axes = currentAxes();
  const emptyAxis=axes.find(axis=>!axis.values.length);
  if (emptyAxis) throw new Error(`«${emptyAxis.name==='Загвар'?'Хээ':emptyAxis.name}» хэсгээс дор хаяж нэг сонголт чеклэнэ үү.`);
  if (axes.some(axis=>axis.values.length > 40 || axis.values.some(value=>value.length>60))) throw new Error('Нэг хэсэгт 40 хүртэл сонголт чеклэнэ. Нэг утга 60 тэмдэгтээс хэтрэхгүй байна.');
  if (axes.reduce((count,axis)=>count*axis.values.length,1)>MAX_COMBINATIONS) throw new Error(`Хэмжээ, өнгө, хийцийн нийт хослол ${MAX_COMBINATIONS}-аас хэтэрлээ. Сонголтын тоогоо багасгана уу.`);
  if (draft.images.length>MAX_IMAGES || draft.images.some(image=>!safeImage(image))) throw new Error(`Зургийн холбоосуудаа шалгана уу. ${MAX_IMAGES} хүртэл зураг оруулна.`);
  const images=[...draft.images], image=images[0] || '';
  const name = $('product-name').value.trim();
  if (!name) throw new Error('Загварын нэрийг оруулна уу.');
  const result = {...draft,name,type,audience:type==='boot'?selectedRadio('audience'):null,category:type==='boot'?(selectedRadio('audience')==='kids'?'kids':'main'):type==='socks'?selectedRadio('category'):'main',base_price:Number($('product-price').value),stock_count:Number($('product-stock').value),image,images,description:$('product-description').value.trim(),is_active:$('product-active').checked,hot:$('product-hot').checked,fresh:$('product-fresh').checked,axes};
  if (!originalProduct || originalProduct.type!==type || JSON.stringify(originalProduct.axes || originalProduct.option_axes)!==JSON.stringify(axes)) delete result.variants;
  return result;
}
function updateBusyState() {
  const busy=saving || uploading;
  $('editor-fields').disabled=busy;
  $('close-editor').disabled=busy;
  $('cancel-edit').disabled=busy;
  $('save-product').disabled=busy || (!dirty && !!originalProduct);
  $('save-product').textContent=saving?'Хадгалж байна…':uploading?'Зураг оруулж байна…':'Хадгалах';
  $('product-form').setAttribute('aria-busy',String(busy));
}
function savingState(active) {
  saving=active; updateBusyState();
}
async function saveProduct(event) {
  event.preventDefault();
  if (saving || uploading || !catalog) return;
  showFormError('');
  let product;
  try { product = readProduct(); } catch(error) { showFormError(error.message); return; }
  const reason = $('save-reason').value.trim();
  const hiding = !product.is_active && (!originalProduct || originalProduct.is_active);
  if (hiding && !reason) { showFormError('Бараа нууж буй шалтгаанаа бичнэ үү.'); $('save-reason').focus(); return; }
  if (hiding && !confirm(`«${product.name}» загварыг дэлгүүрт харагдахгүй болгох уу? Дараа нь буцааж харуулах боломжтой.`)) return;
  const products = catalog.products.map(item=>item.id===product.id?product:item);
  if (!originalProduct) products.push(product);
  savingState(true);
  try {
    const result = await api('/admin/api/catalog',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({products,revision:catalog.revision,reason})});
    if (!Array.isArray(result.products) || !Number.isInteger(result.revision)) throw new Error('Invalid save');
    catalog = result;
    dirty = false;
    $('editor').close();
    draft = null;
    renderProducts();
    showNotice(`«${product.name}» хадгалагдлаа. Дэлгүүрийн мэдээлэл шинэчлэгдсэн.`);
  } catch (error) { showFormError(errorMessage(error,true)); }
  finally { savingState(false); }
}

document.addEventListener('click',event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.view) setView(button.dataset.view);
  if (button.dataset.type) { typeFilter=button.dataset.type; page=1; renderProducts(); }
  if (button.dataset.edit) openEditor(button.dataset.edit);
  if (button.dataset.page) { page=Number(button.dataset.page); renderProductRows(); }
  if (button.dataset.action==='reload') loadCatalog();
  if (button.dataset.action==='reload-audit') loadAudit();
  if (button.dataset.action==='reset-filters') { typeFilter='all'; statusFilter='all'; searchQuery=''; page=1; renderProducts(); }
  if (!draft || saving || uploading) return;
  if ('axisAll' in button.dataset || 'axisClear' in button.dataset) {
    const index=Number(button.dataset.axisAll ?? button.dataset.axisClear), checked='axisAll' in button.dataset;
    const group=document.querySelector(`.axis-options[data-axis-index="${index}"]`);
    group.querySelectorAll('input[type="checkbox"]').forEach(input=>{input.checked=checked;});
    syncAxes(); updateAxisCount(group); markDirty();
  }
  if ('axisAdd' in button.dataset) addAxisChoice(Number(button.dataset.axisAdd));
  if ('imageRemove' in button.dataset) {
    const index=Number(button.dataset.imageRemove);
    removedImages.push({index,url:draft.images.splice(index,1)[0]});
    renderGallery(); markDirty();
  }
  if ('imageCover' in button.dataset) {
    draft.images.unshift(draft.images.splice(Number(button.dataset.imageCover),1)[0]);
    renderGallery(); markDirty();
  }
  if ('imageMove' in button.dataset) {
    const index=Number(button.dataset.imageMove), next=index+Number(button.dataset.direction);
    if (next>=0 && next<draft.images.length) [draft.images[index],draft.images[next]]=[draft.images[next],draft.images[index]];
    renderGallery(); markDirty();
  }
});
document.addEventListener('input',event => {
  if (event.target.id==='product-search') { searchQuery=event.target.value; page=1; renderProductRows(); }
});
document.addEventListener('change',event => {
  if (event.target.id==='status-filter') { statusFilter=event.target.value; page=1; renderProductRows(); }
});
$('add-product').addEventListener('click',()=>openEditor());
$('close-editor').addEventListener('click',closeEditor);
$('cancel-edit').addEventListener('click',closeEditor);
$('editor').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
$('product-form').addEventListener('input',markDirty);
$('product-form').addEventListener('change',markDirty);
$('product-form').addEventListener('submit',saveProduct);
$('product-type').addEventListener('change',()=>{syncAxes();editorType=selectedRadio('type');renderAxes();updateTypeFields();markDirty();});
$('axis-list').addEventListener('change',event=>{const group=event.target.closest('.axis-options');if(group){syncAxes();updateAxisCount(group);markDirty();}});
$('axis-list').addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.id.startsWith('custom-axis-')){event.preventDefault();addAxisChoice(Number(event.target.id.slice(12)));}});
$('choose-images').addEventListener('click',()=>{if(!saving&&!uploading)$('image-files').click();});
$('image-files').addEventListener('change',event=>{const files=Array.from(event.target.files || []);event.target.value='';addImageFiles(files);});
$('add-image-url').addEventListener('click',addImageUrl);
$('product-image-url').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addImageUrl();}});
$('undo-image').addEventListener('click',()=>{
  if(!draft || saving || uploading || !removedImages.length || draft.images.length>=MAX_IMAGES)return;
  const removed=removedImages.pop();
  if(!draft.images.includes(removed.url))draft.images.splice(Math.min(removed.index,draft.images.length),0,removed.url);
  renderGallery();markDirty();
});
$('gallery-drop').addEventListener('dragover',event=>{event.preventDefault();if(!saving&&!uploading)$('gallery-drop').classList.add('drag-over');});
$('gallery-drop').addEventListener('dragleave',event=>{if(!$('gallery-drop').contains(event.relatedTarget))$('gallery-drop').classList.remove('drag-over');});
$('gallery-drop').addEventListener('drop',event=>{event.preventDefault();$('gallery-drop').classList.remove('drag-over');addImageFiles(event.dataTransfer.files);});
window.addEventListener('beforeunload',event=>{if(dirty || saving || uploading){event.preventDefault();event.returnValue='';}});
document.addEventListener('error',event=>{if(event.target.tagName==='IMG'){event.target.hidden=true;const placeholder=document.createElement('span');placeholder.className=event.target.className+' image-placeholder';placeholder.textContent='TOOHUU';event.target.replaceWith(placeholder);}},true);
loadCatalog();
