import test from 'node:test';
import assert from 'node:assert/strict';
import {credentialedArticle,evidenceRows,measuredArticle,validateArticle} from '../lib/publishing-resilience.js';
import {generateBirdingPost} from '../lib/generator.js';
import {summarizeObservations} from '../lib/ebird.js';
const now=new Date('2026-11-26T13:00:00Z'),county={name:'Bay',region:'NLP',lat:43.7,lon:-83.9};
const obs={comName:'Mallard',speciesCode:'mallar3',sciName:'Anas platyrhynchos',obsDt:'2026-11-25 09:00',locName:'Public Bay <site>',howMany:4};
const data={summary:summarizeObservations([obs]),notable:[],hotspots:[],weather:null,sunTimes:null};
test('only usable dated public records enter the publisher',()=>{
 assert.deepEqual(evidenceRows([obs,{...obs,locationPrivate:true},{...obs,obsDt:'2026-10-20'},{...obs,obsDt:'2026-11-27'},{...obs,obsValid:false},null],now),[obs]);
 assert.throws(()=>evidenceRows({},now));
 assert.equal(summarizeObservations([{...obs,howMany:undefined}]).species[0].totalCount,0);
});
test('source-based edition is substantive, escaped, and refuses no evidence',()=>{
 const html=measuredArticle(county,data,now);
 assert.match(html,/Mallard/);assert.match(html,/2026-11-25/);
 assert.match(html,/&lt;site&gt;/);assert.doesNotMatch(html,/<site>/);
 assert.match(html,/not a complete census/);assert.match(html,/not available/);
 assert.throws(()=>measuredArticle(county,{...data,summary:{species:[],totalObservations:0}},now));
 assert.throws(()=>validateArticle('<h1>Stub</h1><script>alert(1)</script>'));
});
test('only authentication rejection retries another configured key',async()=>{
 let calls=[];const html=measuredArticle(county,data,now);
 const out=await credentialedArticle('prompt',{env:{ANTHROPIC_API_KEY_FALL_COLOR:'fixture-a',ANTHROPIC_API_KEY:'fixture-b'},request:async k=>{calls.push(k);if(k==='fixture-a')throw Object.assign(new Error('auth'),{status:401});return {content:[{type:'text',text:html}]}}});
 assert.deepEqual(calls,['fixture-a','fixture-b']);assert.equal(out.html,html);
 calls=[];const failure=await credentialedArticle('prompt',{env:{ANTHROPIC_API_KEY_FALL_COLOR:'a',ANTHROPIC_API_KEY:'b'},request:async k=>{calls.push(k);throw Object.assign(new Error('unavailable'),{status:503})}});
 assert.deepEqual(calls,['a']);assert.equal(failure.html,null);
});
test('actual generator falls back on credential loss and rejects invalid model output',async()=>{
 const missing=await generateBirdingPost(county,data,{now,env:{},request:async()=>{throw new Error('must not call')}});
 assert.equal(missing.mode,'source-fallback');assert.match(missing.html,/Mallard/);
 const bad=await generateBirdingPost(county,data,{now,env:{ANTHROPIC_API_KEY:'fixture'},request:async()=>({content:[{type:'text',text:'<h1>Stub</h1>'}]})});
 assert.equal(bad.mode,'source-fallback');assert.equal(bad.reason,'invalid-provider-output');
 await assert.rejects(generateBirdingPost(county,{...data,summary:{species:[],totalObservations:0}},{now,env:{}}));
});
