// Source-backed county report. No model, inferred sightings or private locations.
const DAY=86400000;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/[\u2013\u2014]/g,', ');
const clean=s=>String(s??'').trim();
const dateKey=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
function validDay(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const t=Date.parse(s+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?t:null;}
export function evidenceRows(rows,now=new Date()){
  if(!Array.isArray(rows))throw new Error('Unrecognized eBird response');
  const today=validDay(dateKey(now));
  return rows.filter(o=>{
    if(!o||typeof o!=='object'||!clean(o.comName)||!clean(o.speciesCode)||o.obsValid===false||o.locationPrivate===true||typeof o.obsDt!=='string')return false;
    const t=validDay(o.obsDt.slice(0,10));
    return t!==null&&t<=today&&today-t<=14*DAY;
  });
}
export function validateArticle(html){
  if(typeof html!=='string'||!/^\s*<h1\b[^>]*>[^<]+<\/h1>/i.test(html)||/[\u2013\u2014]|&(?:m|n)dash;|<\s*(?:script|iframe|object|embed|form|svg|img|style)\b|\bon\w+\s*=|javascript:/i.test(html))throw new Error('Invalid article structure or markup');
  const body=html.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>/i,'').replace(/<[^>]+>/g,' ').trim();
  if(!body.slice(0,300).includes('Chris Izworski')||body.split(/\s+/).length<250)throw new Error('Article lacks attribution or substantive body');
  return html;
}
export async function credentialedArticle(prompt,{env=process.env,request,validate=validateArticle}={}){
  const keys=[...new Set(['ANTHROPIC_API_KEY_FALL_COLOR','FALL_ANTHROPIC_API_KEY','ANTHROPIC_API_KEY'].map(n=>clean(env[n])).filter(Boolean))];
  for(const key of keys){
    let msg;
    try{msg=await request(key,prompt);}
    catch(e){if([401,403].includes(e?.status))continue;return {html:null,reason:'provider-unavailable'};}
    try{
      const html=(msg?.content||[]).filter(x=>x?.type==='text').map(x=>x.text).join('').trim().replace(/^\x60\x60\x60html?\s*/i,'').replace(/\s*\x60\x60\x60$/i,'').trim();
      return {html:validate(html),reason:null};
    }catch{return {html:null,reason:'invalid-provider-output'};}
  }
  return {html:null,reason:'credential-unavailable'};
}
export function measuredArticle(county,{summary,notable=[],hotspots=[],weather,sunTimes},now=new Date()){
  if(!summary?.species?.length||!summary.totalObservations)throw new Error('No usable recent public eBird observations; refusing an evidence-free edition');
  const name=esc(county.name),day=dateKey(now);
  const latest=summary.species.map(s=>s.recent.slice(0,10)).sort().at(-1);
  const records=summary.species.slice(0,15).map(s=>{
    const names=s.locations.filter(Boolean).slice(0,3).map(esc);
    const places=names.length?' Public reporting locations include '+names.join(', ')+'.':' No public location name was supplied.';
    return '<p>'+esc(s.comName)+' was reported most recently on '+esc(s.recent.slice(0,10))+'.'+places+'</p>';
  }).join('');
  const rare=notable.slice(0,6).map(o=>'<p>eBird flagged '+esc(o.comName)+' as notable on '+esc(o.obsDt.slice(0,10))+(o.locName?' at '+esc(o.locName):'')+'. This is a reported observation, not a promise the bird remains there.</p>').join('');
  const sites=hotspots.filter(h=>h&&clean(h.locName)).slice(0,5).map(h=>esc(h.locName)).join('; ');
  const forecast=weather?.today&&Number.isFinite(weather.today.tempF)&&clean(weather.today.forecast)?
    '<p>The available NWS forecast reads '+esc(weather.today.name)+': '+esc(weather.today.forecast)+', '+esc(weather.today.tempF)+' F'+(weather.today.wind?', wind '+esc(weather.today.wind):'')+'. This is a forecast for the county reference point, not a field observation at every location.</p>':
    '<p>A current usable NWS forecast was not available for this edition. Check the local forecast before departure.</p>';
  const light=sunTimes?.sunrise&&sunTimes?.sunset?'<p>Calculated daylight at the county reference point: sunrise '+esc(sunTimes.sunrise)+', sunset '+esc(sunTimes.sunset)+', in Eastern time. These are approximate planning times, not a report of bird activity.</p>':'';
  return validateArticle('<h1>'+name+' County: Recent Bird Reports, '+day+'</h1>'+
    '<p>Chris Izworski, reporting from Michigan on '+name+' County for '+day+'. This source-based edition uses recent public eBird observations, rather than an AI-written narrative. The returned sample contains '+summary.totalSpecies+' distinct species across '+summary.totalObservations+' observation records, with the most recent dated '+esc(latest)+'. The sample covers the previous two weeks and is limited by the records returned by eBird.</p>'+
    '<h2>What has been reported</h2>'+records+
    '<p>These are reports from observers, not a complete census. A species missing from the list may still be present, and repeated reports may refer to the same bird. The ordering is useful for reading the sample but should not be treated as a population estimate. No sighting is asserted for the publication date unless the source record is dated that day.</p>'+
    '<h2>Notable observations and public locations</h2>'+(rare||'<p>No usable public notable observations were returned for this edition. This is not evidence that rare birds are absent.</p>')+
    (sites?'<p>Public eBird hotspot names returned for the county: '+sites+'. These are places to research, not verified open access points or confirmed current sightings.</p>':'<p>No usable hotspot list was returned. Use the county map and check public access before choosing a location.</p>')+
    '<h2>Planning the next outing</h2>'+forecast+light+
    '<p>Begin with the dated reports rather than the headline alone. Compare the location with the habitat and the time of year, then review newer checklists if available. Pay particular attention to changes in weather and daylight, which can affect the practical time available for an outing. This edition does not forecast a migration event or claim a particular site will produce a sighting. Check opening hours, access rules and any temporary closures before traveling. Keep a respectful distance from wildlife and avoid disturbing roosting birds.</p>'+
    '<p>Review the <a href="https://michiganbirdingreport.com/">Michigan Birding Report</a> for the live county map and check <a href="https://ebird.org/">eBird</a> for source records. The dated observations above establish what was returned, not what will be present when you arrive.</p>');
}
