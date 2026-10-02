import {json,readCatalog} from '../../lib/catalog.js';
export async function onRequestGet({env}){
  try{
    const result=await readCatalog(env);
    return json({...result,products:result.products.filter(p=>p.is_active)});
  }catch{return json({error:'Барааны мэдээлэл ачаалагдсангүй. Дахин оролдоно уу.'},503);}
}
