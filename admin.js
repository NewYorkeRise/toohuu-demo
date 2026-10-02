'use strict';

const TYPE_NAMES = {boot:'Гутал', socks:'Оймс', rug:'Ширдэг'};
const AUDIENCES = {men:'Эрэгтэй', women:'Эмэгтэй', kids:'Хүүхэд'};
const DEFAULT_AXES = {
  boot:[{name:'Хийцлэл', values:['Оёмол','Давхар эсгий','Арьсан хормойтой']},{name:'Өнгө',values:['Хар','Бор','Саарал']},{name:'Хэмжээ',values:['36','37','38','39','40','41','42','43']}],
  socks:[{name:'Өнгө',values:['Цагаан','Саарал','Бор']},{name:'Хэмжээ',values:['S (35–37)','M (38–40)','L (41–43)']}],
  rug:[{name:'Хэмжээ',values:['60×90 см','90×150 см','120×180 см','200×300 см']},{name:'Загвар',values:['Өлзий','Эвэр','Хас']}]
};
const FIELD_NAMES = {name:'Нэр',type:'Бүлэг',audience:'Ангилал',category:'Ангилал',base_price:'Үнэ',stock_count:'Бэлэн тоо',image:'Зураг',images:'Зураг',description:'Тайлбар',axes:'Сонголтууд',option_axes:'Сонголтууд',variants:'Хослолууд',is_active:'Харагдах байдал',hot:'Эрэлттэй',fresh:'Шинэ',created:'Шинэ бараа'};
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const money = value => Number(value).toLocaleString('en-US') + '₮';
const unit = type => type === 'rug' ? 'ширхэг' : 'хос';
const dateText = value => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Ulaanbaatar'}).format(new Date(value)) : '—';
const safeImage = value => /^https:\/\//i.test(String(value || '')) ? value : '';
const thumbnail = (product, className='product-image') => safeImage(product.image) ? `<img class="${className}" src="${esc(product.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="${className} image-placeholder">TOOHUU</span>`;

let catalog = null, currentView = 'products', typeFilter = 'all', statusFilter = 'all', searchQuery = '', page = 1;
let draft = null, originalProduct = null, initialForm = '', dirty = false, saving = false, catalogLoading = false;
let auditRequest = 0;

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
function renderAxes(axes) {
  $('axis-list').innerHTML = axes.map((axis,index) => `<div class="axis-row"><span>${esc(axis.name==='Загвар'?'Хээ':axis.name)}</span><label><input class="axis-values" data-axis="${esc(axis.name)}" aria-label="${esc(axis.name==='Загвар'?'Хээ':axis.name)} сонголтууд" value="${esc(axis.values.join(', '))}" required maxlength="2000" placeholder="Утгуудыг таслалаар тусгаарла"></label></div>`).join('');
}
function updateTypeFields() {
  const type = $('product-type').value;
  $('audience-field').hidden = type !== 'boot';
  $('category-field').hidden = type !== 'socks';
  $('stock-unit').textContent = unit(type);
}
function updateImagePreview() {
  const image = safeImage($('product-image').value.trim());
  $('image-preview').innerHTML = image ? `<img src="${esc(image)}" alt="Зургийн харагдац" referrerpolicy="no-referrer">` : '<span>TOOHUU</span>';
}
function formState() {
  return JSON.stringify(Array.from(new FormData($('product-form')).entries()).concat(Array.from(document.querySelectorAll('.axis-values')).map(input=>[input.dataset.axis,input.value])));
}
function markDirty() {
  dirty = formState() !== initialForm;
  $('dirty-label').textContent = dirty ? 'Хадгалаагүй өөрчлөлт байна.' : 'Хадгалсны дараа сайтад нийтлэгдэнэ.';
  $('save-product').disabled = saving || (!dirty && !!originalProduct);
  const hiding = !($('product-active').checked) && (!originalProduct || originalProduct.is_active);
  $('save-reason').required = hiding;
  $('reason-required').hidden = !hiding;
}
function openEditor(id=null) {
  if (!catalog || saving) return;
  originalProduct = id ? catalog.products.find(product=>product.id === id) : null;
  if (id && !originalProduct) return;
  const type = typeFilter === 'all' ? 'boot' : typeFilter;
  draft = originalProduct ? clone(originalProduct) : {id:'m'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:'',type,audience:type==='boot'?'women':null,category:'main',base_price:0,stock_count:0,image:'',description:'',is_active:true,hot:false,fresh:true,axes:clone(DEFAULT_AXES[type])};
  $('product-form').reset();
  $('editor-kicker').textContent = originalProduct ? 'Бараа засах' : 'Шинэ загвар';
  $('editor-title').textContent = originalProduct ? originalProduct.name : 'Бараа нэмэх';
  for (const [name,id] of [['name','product-name'],['type','product-type'],['base_price','product-price'],['stock_count','product-stock'],['description','product-description']]) $(id).value = draft[name] ?? '';
  $('product-image').value = safeImage(draft.image);
  $('product-audience').value = draft.audience || 'women';
  $('product-category').value = draft.category || 'main';
  for (const name of ['is_active','hot','fresh']) $('product-'+({is_active:'active',hot:'hot',fresh:'fresh'}[name])).checked = !!draft[name];
  renderAxes(draft.axes || draft.option_axes || DEFAULT_AXES[draft.type]);
  updateTypeFields();
  updateImagePreview();
  showFormError('');
  initialForm = formState();
  dirty = false;
  markDirty();
  $('editor').showModal();
  document.querySelector('.editor-body').scrollTop = 0;
  $('product-name').focus();
}
function closeEditor() {
  if (saving) return;
  if (dirty && !confirm('Хадгалаагүй өөрчлөлтөө орхиод хаах уу?')) return;
  dirty = false;
  $('editor').close();
  draft = null;
}
function readProduct() {
  const type = $('product-type').value;
  const axes = Array.from(document.querySelectorAll('.axis-values')).map(input=>({name:input.dataset.axis,values:[...new Set(input.value.split(',').map(value=>value.trim()).filter(Boolean))]}));
  if (axes.some(axis=>axis.values.length < 1 || axis.values.length > 40 || axis.values.some(value=>value.length>60))) throw new Error('Сонголт бүрт 1–40 утга оруулна. Нэг утга 60 тэмдэгтээс хэтрэхгүй байна.');
  if (axes.reduce((count,axis)=>count*axis.values.length,1)>600) throw new Error('Хэмжээ, өнгө, хийцийн нийт хослол 600-аас хэтэрлээ. Сонголтын тоогоо багасгана уу.');
  const image = $('product-image').value.trim();
  if (image && !safeImage(image)) throw new Error('Зургийн холбоос https:// гэж эхэлсэн байх ёстой.');
  const name = $('product-name').value.trim();
  if (!name) throw new Error('Загварын нэрийг оруулна уу.');
  const result = {...draft,name,type,audience:type==='boot'?$('product-audience').value:null,category:type==='boot'?($('product-audience').value==='kids'?'kids':'main'):type==='socks'?$('product-category').value:'main',base_price:Number($('product-price').value),stock_count:Number($('product-stock').value),image,description:$('product-description').value.trim(),is_active:$('product-active').checked,hot:$('product-hot').checked,fresh:$('product-fresh').checked,axes};
  if (!originalProduct || originalProduct.type!==type || JSON.stringify(originalProduct.axes || originalProduct.option_axes)!==JSON.stringify(axes)) delete result.variants;
  return result;
}
function savingState(active) {
  saving = active;
  $('editor-fields').disabled = active;
  $('close-editor').disabled = active;
  $('cancel-edit').disabled = active;
  $('save-product').disabled = active;
  $('save-product').textContent = active ? 'Хадгалж байна…' : 'Хадгалах';
  $('product-form').setAttribute('aria-busy',String(active));
}
async function saveProduct(event) {
  event.preventDefault();
  if (saving || !catalog) return;
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
$('product-type').addEventListener('change',()=>{renderAxes(clone(DEFAULT_AXES[$('product-type').value]));updateTypeFields();markDirty();});
$('product-image').addEventListener('change',updateImagePreview);
window.addEventListener('beforeunload',event=>{if(dirty || saving){event.preventDefault();event.returnValue='';}});
document.addEventListener('error',event=>{if(event.target.tagName==='IMG'){event.target.hidden=true;const placeholder=document.createElement('span');placeholder.className=event.target.className+' image-placeholder';placeholder.textContent='TOOHUU';event.target.replaceWith(placeholder);}},true);
loadCatalog();
