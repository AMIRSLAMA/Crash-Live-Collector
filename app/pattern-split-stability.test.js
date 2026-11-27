'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {patternSplitStability}=require('./pattern-split-stability');

test('split stability audit runs predeclared chronological splits and summarizes recurrence',()=>{
 const values=Array.from({length:180},(_,i)=>({multiplier:i%10<5?1.4:2.7}));
 const report=patternSplitStability(values,{minTrainSupport:8,minTestSupport:3});
 assert.deepEqual(report.splits,[0.5,0.6,0.7,0.8]);
 assert.equal(report.reports.length,4);
 assert.ok(report.reports.every(r=>r.trainRounds+r.testRounds===180));
 assert.equal(report.assessment,'descriptive_split_stability_not_confirmatory');
 assert.ok(report.results.every(r=>r.appearances>=1&&r.appearances<=4));
 assert.ok(report.results.every(r=>r.splitsEvaluated===r.appearances));
 assert.ok(report.results.every(r=>r.totalSplits===4));
 assert.ok(report.results.every(r=>r.splitDetails.length===r.splitsEvaluated));
 assert.ok(report.consistentlyBetterCandidates.every(r=>r.appearances>=3&&r.betterThanBaselineCount>=3&&r.meanBrierDifferenceWhenPresent<0));
 assert.ok(report.recurrentCandidates.every(r=>r.appearances>=3));
});

test('split stability rejects malformed split controls and handles sparse data',()=>{
 assert.throws(()=>patternSplitStability([],{splits:[0.6]}),TypeError);
 assert.throws(()=>patternSplitStability([],{splits:[0.6,0.6]}),TypeError);
 assert.throws(()=>patternSplitStability([],{splits:[0.4,0.6]}),TypeError);
 const report=patternSplitStability(Array.from({length:8},()=>({multiplier:2})));
 assert.equal(report.results.length,0);
 assert.equal(report.reports.length,4);
});
