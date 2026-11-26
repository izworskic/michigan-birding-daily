// Michigan Birding Daily - daily cron
// 8am CT (13:00 UTC during CST, 12:00 UTC during CDT). Schedule in vercel.json at 13:00 UTC.
// Rotates through 83 Michigan counties, generates a post, stores in private state, pings IndexNow.

import { ToolState } from '../lib/tool-state.cjs';
import { COUNTIES } from '../lib/counties.js';
import { fetchRecentObs, fetchNotable, fetchHotspots, summarizeObservations } from '../lib/ebird.js';
import { fetchWeather } from '../lib/weather.js';
import { calcSunTimes } from '../lib/sun.js';
import { generateBirdingPost } from '../lib/generator.js';
import { evidenceRows, validateArticle } from '../lib/publishing-resilience.js';

function ts() { return new Date().toISOString(); }
function todayUTC() { return new Date().toISOString().slice(0, 10); }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function secondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.floor((midnight - now) / 1000);
}

function makeState() {
      if (!process.env.TOOL_STATE_URL) return null;
  return new ToolState();
}

export default async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const log = [];
  const publicationDay = todayUTC();
  const r = makeState();
  if (!r) return res.status(500).json({ error: 'private state not configured' });

  try {
    // A bounded lock is longer than the 300-second function timeout. Do not
    // proceed on storage failures or competing triggers; expiry allows retry.
    const latest = await r.lrange('birding:post:index', 0, 0);
    if (Array.isArray(latest) && latest[0] && String(latest[0]).startsWith(publicationDay+'-')) {
      const existing = await r.get('birding:post:'+latest[0]);
      if (!existing?.html) throw new Error('Current index entry has no article');
      validateArticle(existing.html);
      return res.status(200).json({ok:true,skipped:'already published today',slug:latest[0],log});
    }
    const lock = await r.set('birding:publish-lock:'+publicationDay,'1',{nx:true,ex:360});
    if(lock!=='OK')return res.status(409).json({ok:false,error:'publisher already running',log});

    // County rotation - stored in private state, incremented each run, wraps at 83
    let idx = 0;
    try {
      idx = (await r.incr('birding:county:index')) - 1;
      idx = idx % COUNTIES.length;
    } catch(e) {
      idx = Math.floor(Math.random() * COUNTIES.length);
    }
    const county = COUNTIES[idx];
    log.push(`[${ts()}] Birding post: ${county.name} County (${county.region}) - index ${idx}`);

    // Fetch everything in parallel
    const [rawObs, notable, hotspots, weather] = await Promise.all([
      fetchRecentObs(county.code, 14).catch(e => { log.push(`[ebird obs err] ${e.message}`); return []; }),
      fetchNotable(county.code, 14).catch(e => { log.push(`[ebird notable err] ${e.message}`); return []; }),
      fetchHotspots(county.code).catch(e => { log.push(`[ebird hotspots err] ${e.message}`); return []; }),
      fetchWeather(county.lat, county.lon).catch(e => { log.push(`[weather err] ${e.message}`); return null; }),
    ]);

    const observed = evidenceRows(rawObs);
    if (!observed.length) throw new Error('No usable recent public eBird observations');
    const publicNotable = evidenceRows(notable);
    const publicHotspots = Array.isArray(hotspots) ? hotspots.filter(h=>h && typeof h.locName==='string' && h.locName.trim()) : [];
    const summary = summarizeObservations(observed);
    const sunTimes = calcSunTimes(county.lat, county.lon, new Date());

    log.push(`[${ts()}] Data: ${summary.totalSpecies} species, ${summary.totalObservations} obs, ${notable.length} notable, ${hotspots.length} hotspots, weather=${weather ? 'ok' : 'none'}`);

    // Generate post
    const generated = await generateBirdingPost(county, { summary, notable:publicNotable, hotspots:publicHotspots, weather, sunTimes });
    const html = validateArticle(generated.html);
    log.push('Generation mode: '+generated.mode+(generated.reason?' ('+generated.reason+')':''));

    // Extract title from H1
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : `${county.name} County Birding Report`;

    // Slug: YYYY-MM-DD-county-name
    const slug = `${publicationDay}-${slugify(county.name)}-county`;

    const post = {
      slug,
      date: publicationDay,
      county: county.name,
      countyCode: county.code,
      region: county.region,
      title,
      html,
      totalSpecies: summary.totalSpecies,
      totalObservations: summary.totalObservations,
      notableCount: publicNotable.length,
      generationMode: generated.mode,
      generationReason: generated.reason,
      generatedAt: ts(),
    };

    // Store in private state
    await r.set(`birding:post:${slug}`, JSON.stringify(post));
    // Keep an index of all post slugs, newest first
    await r.lpush('birding:post:index', slug);
    log.push(`[${ts()}] Stored post in private state: ${slug}`);

    // IndexNow ping (Bing/Yandex)
    const postUrl    = `https://daily.michiganbirdingreport.com/post/${slug}`;
    const archiveUrl = `https://daily.michiganbirdingreport.com/chris-izworski`;
    try {
      await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host:        'daily.michiganbirdingreport.com',
          key:         'c9d2a1b5e7f3468a9c4d2e5f1a6b7c8d',
          keyLocation: 'https://daily.michiganbirdingreport.com/c9d2a1b5e7f3468a9c4d2e5f1a6b7c8d.txt',
          urlList:     [postUrl, archiveUrl],
        }),
      });
      log.push(`[${ts()}] IndexNow pinged`);
    } catch(e) { log.push(`[${ts()}] IndexNow err: ${e.message}`); }

    return res.status(200).json({ ok: true, post: { slug, title, county: county.name, generationMode: generated.mode }, log });
  } catch(e) {
    log.push(`[${ts()}] FATAL: ${e.message}`);
    console.error('[cron]', e);
    return res.status(500).json({ error: e.message, log });
  }
}
