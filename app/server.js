const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const port = Number(process.env.PORT || 3000);
const dataFile = process.env.DATA_FILE || path.join(process.cwd(), 'data', 'rounds.jsonl');
const MAX_BODY = 1024 * 1024;
let rounds = [];
function loadRounds() {
  try { rounds = fs.readFileSync(dataFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; rounds = []; }
}
function json(res, status, value) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(value));
}
function normalizeRound(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const multiplier = Number(input.multiplier);
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 1000000) return null;
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return null;
  const roundId = input.roundId == null || input.roundId === '' ? randomUUID() : String(input.roundId).trim();
  if (!roundId || roundId.length > 120) return null;
  return {roundId,multiplier,occurredAt:occurredAt.toISOString(),recordedAt:new Date().toISOString()};
}
function statsFor(items) {
  if (!items.length) return {count:0,median:null,last30Median:null,below2Percent:null,atLeast2Percent:null,min:null,max:null};
  const sorted=items.map(x=>x.multiplier).sort((a,b)=>a-b);
  const median=values=>{const mid=Math.floor(values.length/2);return values.length%2?values[mid]:(values[mid-1]+values[mid])/2;};
  const below2=items.filter(x=>x.multiplier<2).length;
  return {count:items.length,median:median(sorted),last30Median:median(items.slice(-30).map(x=>x.multiplier).sort((a,b)=>a-b)),below2Percent:Number((below2/items.length*100).toFixed(1)),atLeast2Percent:Number(((items.length-below2)/items.length*100).toFixed(1)),min:sorted[0],max:sorted[sorted.length-1]};
}
async function readBody(req) {
  let body=''; for await (const chunk of req) {body+=chunk;if(Buffer.byteLength(body)>MAX_BODY)throw Object.assign(new Error('payload_too_large'),{status:413});}
  try{return JSON.parse(body);}catch{throw Object.assign(new Error('invalid_json'),{status:400});}
}
const dashboard = "<!doctype html>\n<html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Crash Live Collector</title>\n<style>\n:root{color-scheme:dark;--bg:#0b1020;--panel:#151d31;--line:#293550;--muted:#9aa8c2;--gold:#e6b85c;--green:#5bd49a}*{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#0b1020,#111a2d);color:#edf2ff;font:15px system-ui,Segoe UI,Tahoma,sans-serif}main{max-width:1100px;margin:auto;padding:28px 18px}header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:22px}h1{font-size:25px;margin:0}header p{color:var(--muted);margin:6px 0 0}.tag{border:1px solid #42634f;color:var(--green);padding:7px 12px;border-radius:30px;font-size:13px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.panel,.stat{background:var(--panel);border:1px solid var(--line);border-radius:15px;padding:17px}.stat small{color:var(--muted)}.stat strong{display:block;font-size:25px;margin-top:9px;color:var(--gold);direction:ltr;text-align:right}.section{margin-top:16px}.section h2{font-size:17px;margin:0 0 12px}.entry{display:flex;gap:10px;flex-wrap:wrap}input,button{border-radius:9px;border:1px solid var(--line);padding:11px 13px;background:#0e1628;color:#fff;font:inherit}input{min-width:150px;flex:1}button{background:var(--gold);color:#17130b;font-weight:700;cursor:pointer;border:0}button.secondary{background:#26334d;color:#eaf0ff}.note{color:var(--muted);font-size:13px;line-height:1.7}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:500px}th,td{text-align:right;padding:12px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:500}.ltr{direction:ltr;text-align:left;font-variant-numeric:tabular-nums}.empty{text-align:center;color:var(--muted);padding:25px}@media(max-width:760px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:20px 12px}}\n</style></head><body><main>\n<header><div><h1>Crash Live Collector</h1><p>تسجيل الجولات وتحليل الإحصائيات الوصفية</p></div><span class=\"tag\">● النظام يعمل</span></header>\n<div class=\"grid\"><div class=\"stat\"><small>إجمالي الجولات</small><strong id=\"count\">—</strong></div><div class=\"stat\"><small>وسيط المضاعف</small><strong id=\"median\">—</strong></div><div class=\"stat\"><small>أقل من 2x</small><strong id=\"below\">—</strong></div><div class=\"stat\"><small>وسيط آخر 30 جولة</small><strong id=\"recent\">—</strong></div></div>\n<section class=\"panel section\"><h2>إضافة جولة يدويًا</h2><form id=\"entry\" class=\"entry\"><input id=\"roundId\" maxlength=\"120\" placeholder=\"معرّف الجولة (اختياري)\"><input id=\"multiplier\" type=\"number\" min=\"1\" max=\"1000000\" step=\"0.01\" placeholder=\"المضاعف مثل 2.45\" required><input id=\"occurredAt\" type=\"datetime-local\" aria-label=\"وقت الجولة\"><button type=\"submit\">حفظ الجولة</button></form><p class=\"note\">أدخل نتائج متاحة لديك ومصرّح باستخدامها. المؤشرات وصفية تاريخية وليست توقعات للنتائج القادمة.</p><p id=\"message\" class=\"note\" role=\"status\"></p></section>\n<section class=\"panel section\"><div class=\"entry\" style=\"justify-content:space-between;align-items:center\"><h2>سجل الجولات</h2><button id=\"refresh\" class=\"secondary\" type=\"button\">تحديث</button></div><div class=\"table-wrap\"><table><thead><tr><th>المعرّف</th><th>المضاعف</th><th>وقت الجولة</th></tr></thead><tbody id=\"rows\"><tr><td colspan=\"3\" class=\"empty\">لا توجد جولات مسجلة بعد</td></tr></tbody></table></div></section>\n</main><script>\nconst $=id=>document.getElementById(id),fmt=v=>v==null?'—':Number(v).toFixed(2)+'x';\nasync function refresh(){const [s,r]=await Promise.all([fetch('/api/stats'),fetch('/api/rounds?limit=100')]);if(!s.ok||!r.ok)throw Error('تعذر تحميل البيانات');const stats=await s.json(),data=await r.json();$('count').textContent=stats.count;$('median').textContent=fmt(stats.median);$('below').textContent=stats.below2Percent==null?'—':stats.below2Percent+'%';$('recent').textContent=fmt(stats.last30Median);const items=data.rounds.slice().reverse();$('rows').innerHTML='';if(!items.length){$('rows').innerHTML='<tr><td colspan=\"3\" class=\"empty\">لا توجد جولات مسجلة بعد</td></tr>';return}for(const x of items){const tr=document.createElement('tr');for(const value of [x.roundId,fmt(x.multiplier),new Date(x.occurredAt).toLocaleString('ar-EG')]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td)}$('rows').appendChild(tr)}}\n$('entry').addEventListener('submit',async e=>{e.preventDefault();$('message').textContent='جارٍ الحفظ...';const raw=$('occurredAt').value;const payload={roundId:$('roundId').value||undefined,multiplier:Number($('multiplier').value),occurredAt:raw?new Date(raw).toISOString():undefined};try{const r=await fetch('/api/rounds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw Error(data.error||'تعذر الحفظ');$('message').textContent='تم حفظ الجولة بنجاح';$('entry').reset();await refresh()}catch(err){$('message').textContent=err.message}});\n$('refresh').addEventListener('click',()=>refresh().catch(e=>$('message').textContent=e.message));refresh().catch(e=>$('message').textContent=e.message);\n</script></body></html>";
loadRounds();
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{status:'ok',service:'crash-live-collector'});
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});return res.end(dashboard);}
  if(req.method==='GET'&&url.pathname==='/api/rounds'){const limit=Math.min(1000,Math.max(1,Number(url.searchParams.get('limit')||100)));return json(res,200,{rounds:rounds.slice(-limit)});}
  if(req.method==='GET'&&url.pathname==='/api/stats')return json(res,200,statsFor(rounds));
  if(req.method==='POST'&&url.pathname==='/api/rounds'){
    try{
      const body=await readBody(req);const inputs=Array.isArray(body.rounds)?body.rounds:[body];
      if(!inputs.length||inputs.length>500)return json(res,400,{error:'rounds_must_contain_1_to_500_items'});
      const normalized=inputs.map(normalizeRound);if(normalized.some(x=>!x))return json(res,400,{error:'invalid_round'});
      const ids=new Set(rounds.map(x=>x.roundId));for(const item of normalized){if(ids.has(item.roundId))return json(res,409,{error:'duplicate_round_id',roundId:item.roundId});ids.add(item.roundId);}
      fs.mkdirSync(path.dirname(dataFile),{recursive:true});fs.appendFileSync(dataFile,normalized.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600});rounds.push(...normalized);
      return json(res,201,{inserted:normalized.length,total:rounds.length});
    }catch(error){return json(res,error.status||500,{error:error.status?error.message:'internal_error'});}
  }
  return json(res,404,{error:'not_found'});
});
server.listen(port,'0.0.0.0',()=>process.stdout.write('Crash Live Collector listening on '+port+'\n'));
