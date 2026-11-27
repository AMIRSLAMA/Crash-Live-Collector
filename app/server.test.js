const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs');
async function freePort(){const probe=net.createServer();await new Promise((resolve,reject)=>probe.once('error',reject).listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));return port;}
async function startService(t){const port=await freePort();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crash-collector-'));const child=spawn(process.execPath,[path.join(__dirname,'server.js')],{env:{...process.env,PORT:String(port),DATA_FILE:path.join(dir,'rounds.jsonl')},stdio:['ignore','ignore','pipe']});let startupError='';child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{startupError+=chunk;});const base='http://127.0.0.1:'+port;t.after(()=>{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});});for(let i=0;i<40;i++){try{const r=await fetch(base+'/health');if(r.ok)return base;}catch{}await new Promise(resolve=>setTimeout(resolve,75));}throw Error('service did not start: '+startupError.trim());}
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
  assert.equal(result.blocks[1].iqr, 9);
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


test('predictive test endpoint scores strictly out of sample and exposes an audit trail', async t => {
  const base = await startService(t);
  const values = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 2.5, 1, 1, 3];
  const inserted = await fetch(base + '/api/rounds', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rounds: values.map((multiplier, index) => ({ roundId: 'oos-' + index, multiplier })) })
  });
  assert.equal(inserted.status, 201);
  const response = await fetch(base + '/api/predictive-test?window=10');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.evaluated, 4);
  assert.equal(result.recentEvaluations[0].roundIndex, 11);
  assert.equal(result.recentEvaluations[0].rollingProbabilityBelow2, 0.5);
  assert.equal(result.recentEvaluations[0].baselineProbabilityBelow2, 0.5);
  assert.equal(result.assessment, 'descriptive_only_need_at_least_100_evaluations');
});

test('predictive test dashboard is connected to the new API', async t => {
  const base = await startService(t);
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /اختبار احتمالات أقل من 2x خارج العينة/);
  assert.match(html, /runOosTest/);
  const result = await (await fetch(base + '/api/predictive-test')).json();
  assert.equal(result.evaluated, 0);
  assert.equal(result.assessment, 'insufficient_history');
});


test('connection status tracks only recent rounds forwarded by the bundled extension', async t => {
  const base = await startService(t);
  let status = await (await fetch(base + '/api/connection')).json();
  assert.equal(status.connected, false);
  assert.equal(status.liveRounds, 0);
  await fetch(base + '/api/rounds', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roundId: 'manual-only', multiplier: 2.1 })
  });
  status = await (await fetch(base + '/api/connection')).json();
  assert.equal(status.connected, false);
  await fetch(base + '/api/rounds', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roundId: 'extension-round-1', multiplier: 1.87, source: 'chrome-extension' })
  });
  status = await (await fetch(base + '/api/connection')).json();
  assert.equal(status.connected, true);
  assert.equal(status.lastRoundId, 'extension-round-1');
  assert.equal(status.liveRounds, 1);
});

test('dashboard includes the integrated extension connection page', async t => {
  const base = await startService(t);
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /الاتصال وإضافة المتصفح/);
  assert.match(html, /collectorConnection/);
  assert.match(html, /تحميل حزمة الإضافة ZIP/);
  assert.match(html, /refreshConnection/);
});

test('bundled Chrome extension is Manifest V3 and forwards completed results only', () => {
  const extensionDir = path.join(__dirname, '..', 'browser-extension');
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'));
  const background = fs.readFileSync(path.join(extensionDir, 'background.js'), 'utf8');
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.ok(manifest.host_permissions.includes('http://127.0.0.1:3038/*'));
  assert.match(background, /event\?\.target!==\"OnCrash\"/);
  assert.match(background, /source/);
  assert.ok(fs.existsSync(path.join(extensionDir, 'inject.js')));
  assert.ok(fs.existsSync(path.join(extensionDir, 'content.js')));
});


test('proportion confidence endpoint returns Wilson interval for sample',async t=>{
  const base=await startService(t);
  const values=[1.2,1.8,2,3,1.5];
  const added=await fetch(base+'/api/rounds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rounds:values.map((multiplier,index)=>({roundId:'ci-'+index,multiplier}))})});
  assert.equal(added.status,201);
  const result=await(await fetch(base+'/api/proportion-confidence')).json();
  assert.equal(result.totalRounds,5);
  assert.equal(result.belowThreshold,3);
  assert.equal(result.percent,60);
  assert.equal(result.method,'wilson_score');
  assert.ok(result.confidenceInterval.lowerPercent<60);
  assert.ok(result.confidenceInterval.upperPercent>60);
});

test('sequence-pattern endpoint compares walk-forward pattern matches with a rolling baseline', async t => {
  const base = await startService(t);
  const pattern = '1111100000';
  const values = Array.from({ length: 85 }, (_, i) => pattern[i % pattern.length] === '1' ? 1.4 : 2.6);
  const inserted = await fetch(base + '/api/rounds', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rounds: values.map((multiplier, index) => ({ roundId: 'pattern-' + index, multiplier })) }) });
  assert.equal(inserted.status, 201);
  const result = await (await fetch(base + '/api/sequence-pattern-test?window=30')).json();
  assert.equal(result.evaluated, 55);
  assert.equal(result.window, 30);
  assert.equal(typeof result.rollingBrier, 'number');
  assert.equal(typeof result.baselineBrier, 'number');
  assert.match(result.message, /strict_walk_forward/);
});

test('sequence-pattern dashboard is wired to the endpoint', async t => {
  const base = await startService(t);
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /محرك مقارنة الأنماط/);
  assert.match(html, /runPatternTest/);
  assert.match(html, /patternAudit/);
  assert.match(html, /holdoutPanel/);
  assert.match(html, /runHoldout/);
  const result = await (await fetch(base + '/api/sequence-pattern-test')).json();
  assert.equal(result.evaluated, 0);
  assert.equal(result.assessment, 'insufficient_history');
});

test('holdout discovery API returns separate train/test candidate scores and caveats', async t => {
  const base = await startService(t);
  const pattern = '1111100000';
  const values = Array.from({ length: 120 }, (_, i) => pattern[i % pattern.length] === '1' ? 1.4 : 2.6);
  const inserted = await fetch(base + '/api/rounds', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rounds: values.map((multiplier, index) => ({ roundId: 'holdout-' + index, multiplier })) })
  });
  assert.equal(inserted.status, 201);
  const result = await (await fetch(base + '/api/pattern-holdout-discovery')).json();
  assert.equal(result.trainRounds, 72);
  assert.equal(result.testRounds, 48);
  assert.ok(result.candidatesDiscovered > 0);
  assert.ok(result.results.every(row => row.trainMatches >= 8 && row.testMatches >= 5));
  assert.match(result.assessment, /exploratory_holdout/);
});

test('holdout discovery API is explicit about insufficient data', async t => {
  const base = await startService(t);
  const result = await (await fetch(base + '/api/pattern-holdout-discovery')).json();
  assert.equal(result.assessment, 'insufficient_history');
  assert.equal(result.results.length, 0);
});

test('pattern split stability endpoint exposes repeat split audit and caveats',async t=>{
 const base=await startService(t);
 const pattern='1111100000';
 const values=Array.from({length:180},(_,i)=>pattern[i%pattern.length]==='1'?1.4:2.6);
 const inserted=await fetch(base+'/api/rounds',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rounds:values.map((multiplier,index)=>({roundId:'stability-'+index,multiplier}))})});
 assert.equal(inserted.status,201);
 const response=await fetch(base+'/api/pattern-split-stability');
 assert.equal(response.status,200);
 const report=await response.json();
 assert.deepEqual(report.splits,[0.5,0.6,0.7,0.8]);
 assert.equal(report.reports.length,4);
 assert.equal(report.assessment,'descriptive_split_stability_not_confirmatory');
 assert.ok(report.caveats.some(note=>note.includes('overlap')));
});
