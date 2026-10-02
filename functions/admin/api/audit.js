import {json} from '../../../lib/catalog.js';
export async function onRequestGet({env}){
  try{
    const {results}=await env.CATALOG_DB.prepare('SELECT actor, action, created_at, reason, summary, revision FROM audit_log ORDER BY revision DESC LIMIT 50').all();
    return json({entries:results.map(r=>({...r,summary:JSON.parse(r.summary)}))});
  }catch{return json({error:'Өөрчлөлтийн түүх ачаалагдсангүй.'},503);}
}
