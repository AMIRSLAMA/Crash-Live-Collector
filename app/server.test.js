const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs');
async function freePort(){const probe=net.createServer();await new Promise((resolve,reject)=>probe.once('error',reject).listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port;}
async function startService(t){const port=await freePort();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crash-collector-'));const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),DATA_FILE:path.join(dir,'rounds.jsonl')},stdio:'ignore'});const base='http://127.0.0.1:'+port;t.after(()=>{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});});for(let i=0;i<40;i++){try{const r=await fetch(base+'/health');if(r.ok)return base;}catch{}await new Promise(resolve=>setTimeout(resolve,75));}throw Error('service did not start');}
test('health endpoint returns healthy JSON',async t=>{const base=await startService(t);const r=await fetch(base+'/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'ok',service:'crash-live-collector'});});
test('dashboard is served',async t=>{const base=await startService(t);const r=await fetch(base+'/');assert.equal(r.status,200);const html=await r.text();assert.match(html,/Crash Live Collector/);assert.match(html,/backtestWindow/);assert.match(html,/runBacktest/);});
test('rounds are validated, persisted and summarized',async t=>{const base=await startService(t);const add=await fetch(base+'/api/rounds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rounds:[{roundId:'r1',multiplier:1.5},{roundId:'r2',multiplier:2},{roundId:'r3',multiplier:4.5}]})});assert.equal(add.status,201);assert.equal((await add.json()).inserted,3);const stats=await(await fetch(base+'/api/stats')).json();assert.equal(stats.count,3);assert.equal(stats.median,2);assert.equal(stats.below2Percent,33.3);assert.equal(stats.atLeast2Percent,66.7);const list=await(await fetch(base+'/api/rounds')).json();assert.equal(list.rounds.length,3);assert.equal(list.rounds[0].roundId,'r1');});
test('rejects invalid and duplicate rounds',async t=>{const base=await startService(t);const invalid=await fetch(base+'/api/rounds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({multiplier:0})});assert.equal(invalid.status,400);const payload={roundId:'same',multiplier:2};await fetch(base+'/api/rounds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const duplicate=await fetch(base+'/api/rounds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});assert.equal(duplicate.status,409);});


test('imports CSV history in one atomic batch',async t=>{
  const base=await startService(t);
  const csv='roundId,multiplier,occurredAt\nold-1,1.75,2026-11-20T10:00:00Z\nold-2,3.25,2026-11-20T10:01:00Z';
  const response=await fetch(base+'/api/import',{method:'POST',headers:{'content-type':'text/csv'},body:csv});
  assert.equal(response.status,201);
  assert.equal((await response.json()).inserted,2);
  const stats=await(await fetch(base+'/api/stats')).json();
  assert.equal(stats.count,2);
  assert.equal(stats.median,2.5);
});
test('JSON import rejects a bad batch without saving partial rows',async t=>{
  const base=await startService(t);
  const response=await fetch(base+'/api/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify([{roundId:'good',multiplier:2},{roundId:'bad',multiplier:0}])});
  assert.equal(response.status,400);
  const stats=await(await fetch(base+'/api/stats')).json();
  assert.equal(stats.count,0);
});

test('exports recorded history as downloadable CSV',async t=>{
  const base=await startService(t);
  await fetch(base+'/api/rounds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roundId:'export-1',multiplier:2.75,occurredAt:'2026-11-20T10:00:00Z'})});
  const response=await fetch(base+'/api/export.csv');
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\/csv/);
  assert.match(await response.text(),/export-1,2.75,2026-11-20T10:00:00.000Z/);
});


test('walk-forward backtest evaluates only later rounds against a fixed baseline',async t=>{
  const base=await startService(t);
  const values=[1.2,1.5,2.5,3,1.1,1.3,2.2,2.8,1.4,1.6,1.2,3];
  const inserted=await fetch(base+'/api/rounds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rounds:values.map((multiplier,index)=>({roundId:'bt-'+index,multiplier}))})});
  assert.equal(inserted.status,201);
  const response=await fetch(base+'/api/backtest?window=10');
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.window,10);
  assert.equal(result.evaluated,2);
  assert.equal(typeof result.rollingMae,'number');
  assert.equal(typeof result.baselineMae,'number');
  assert.equal(result.message,'historical_backtest_not_a_future_prediction');
});

test('backtest reports insufficient history without inventing a score',async t=>{
  const base=await startService(t);
  const response=await fetch(base+'/api/backtest?window=30');
  const result=await response.json();
  assert.equal(result.evaluated,0);
  assert.equal(result.rollingMae,null);
  assert.equal(result.message,'insufficient_history');
});


test('distribution endpoint summarizes all rounds and recent windows',async t=>{
  const base=await startService(t);
  const values=[1.2,1.8,2,2.5,3.5,5,12];
  const inserted=await fetch(base+'/api/rounds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rounds:values.map((multiplier,index)=>({roundId:'dist-'+index,multiplier}))})});
  assert.equal(inserted.status,201);
  const response=await fetch(base+'/api/distribution');
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.total.count,7);
  assert.equal(result.total.median,2.5);
  assert.equal(result.total.below2Percent,28.6);
  assert.deepEqual(result.total.bins.map(bin=>bin.count),[1,1,2,1,1,1]);
  assert.equal(result.windows[0].count,7);
  assert.equal(result.windows[1].count,7);
  assert.equal(result.windows[2].count,7);
});

test('dashboard includes the descriptive distribution panel',async t=>{
  const base=await startService(t);
  const html=await(await fetch(base+'/')).text();
  assert.match(html,/توزيع المضاعفات ومقارنة الفترات/);
  assert.match(html,/loadDistribution/);assert.match(html,/تسلسل الجولات والاستمراريات/);assert.match(html,/loadSequence/);
});

test('sequence endpoint reports transitions, streaks and sequential blocks',async t=>{
  const base=await startService(t);
  const values=[1.2,1.5,2.1,2.5,1.8,1.4,3,4,1.7,2.2,2.8];
  const inserted=await fetch(base+'/api/rounds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rounds:values.map((multiplier,index)=>({roundId:'seq-'+index,multiplier}))})});
  assert.equal(inserted.status,201);
  const response=await fetch(base+'/api/sequence?groupSize=5');
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.totalRounds,11);
  assert.equal(result.groupSize,5);
  assert.equal(result.transitions.below2.below2,2);
  assert.equal(result.transitions.below2.atLeast2,3);
  assert.equal(result.transitions.atLeast2.below2,2);
  assert.equal(result.transitions.atLeast2.atLeast2,3);
  assert.deepEqual(result.streaks.current,{category:'atLeast2',length:2});
  assert.equal(result.streaks.below2.longest,2);
  assert.equal(result.blocks.length,3);
  assert.equal(result.blocks[2].count,1);
});

test('volatility endpoint compares sequential groups by IQR and MAD', async t => {
  const base = await startService(t);
  const values = [
    2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
    1, 1, 1, 10, 1, 10, 1, 10, 1, 10,
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10
  ];
  const inserted = await fetch(base + '/api/rounds', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rounds: values.map((multiplier, index) => ({ roundId: 'vol-' + index, multiplier })) })
  });
  assert.equal(inserted.status, 201);
  const response = await fetch(base + '/api/volatility?groupSize=10');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.totalRounds, 30);
  assert.equal(result.totalBlocks, 3);
  assert.equal(result.blocks[0].iqr, 0);
  assert.equal(result.blocks[1].iqr, 4.5);
  assert.equal(result.interpretation, 'descriptive_historical_volatility_not_a_future_prediction');
  assert.equal(Object.values(result.groups).reduce((sum, group) => sum + group.blocks, 0), 3);
});

test('volatility dashboard and API are wired together', async t => {
  const base = await startService(t);
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /مقارنة فترات الهدوء والتذبذب/);
  assert.match(html, /loadVolatility/);
  const result = await (await fetch(base + '/api/volatility')).json();
  assert.equal(result.totalRounds, 0);
  assert.equal(result.totalBlocks, 0);
});
