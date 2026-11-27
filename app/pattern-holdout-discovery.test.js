'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {patternHoldoutDiscovery}=require('./pattern-holdout-discovery');

test('holdout discovery separates chronological train from test and emits supported candidates',()=>{
  const vals=Array.from({length:160},(_,i)=>({multiplier: i%10<5?1.4:2.7}));
  const report=patternHoldoutDiscovery(vals,{trainFraction:0.6,minTrainSupport:8,minTestSupport:3});
  assert.equal(report.trainRounds,96);
  assert.equal(report.testRounds,64);
  assert.ok(report.candidatesDiscovered>0);
  assert.ok(report.results.every(x=>x.trainMatches>=8&&x.testMatches>=3));
  assert.equal(report.assessment,'exploratory_holdout_only_multiple_candidate_selection_not_corrected');
});

test('holdout discovery is deterministic and does not use test labels to discover candidates',()=>{
  const values=Array.from({length:100},(_,i)=>({multiplier:i%2?1.3:2.2}));
  const a=patternHoldoutDiscovery(values), b=patternHoldoutDiscovery(values);
  assert.deepEqual(a,b);
  const changed=values.slice(); changed.splice(70,1,{multiplier:99});
  const c=patternHoldoutDiscovery(changed);
  assert.deepEqual(a.results.map(r=>r.pattern),c.results.map(r=>r.pattern));
});

test('holdout discovery returns explicit insufficient history and validates options',()=>{
  assert.equal(patternHoldoutDiscovery(Array.from({length:10},()=>({multiplier:2}))).assessment,'insufficient_history');
  assert.throws(()=>patternHoldoutDiscovery([], {trainFraction:0.9}),TypeError);
  assert.throws(()=>patternHoldoutDiscovery([{multiplier:0}]),TypeError);
});
