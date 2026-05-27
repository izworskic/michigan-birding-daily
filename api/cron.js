// Michigan Birding Daily — daily cron
// 8am CT (13:00 UTC during CST, 12:00 UTC during CDT). Schedule in vercel.json at 13:00 UTC.
// Rotates through 83 Michigan counties, generates a post, stores in Redis, pings IndexNow.

import { Redis } from '@upstash/redis';
import { COUNTIES } from '../lib/counties.js';
import { fetchRecentObs, fetchNotable, fetchHotspots, summarizeObservations } from '../lib/ebird.js';
import { fetchWeather } from '../lib/weather.js';
import { calcSunTimes } from '../lib/sun.js';
import { generateBirdingPost } from '../lib/generator.js';

function ts() { return new Date().toISOString(); }
function todayUTC() { return new Date().toISOString().slice(0, 10); }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function secondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.floor((midnight - now) / 1000);
}

function makeRedis() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export default async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const log = [];
  const r = makeRedis();
  if (!r) return res.status(500).json({ error: 'Redis not configured' });

  try {
    // Idempotency: if today's post already exists, skip. Prevents double-posting
    // when both the Vercel cron and the GitHub Actions trigger fire the same day.
    try {
      const latest = await r.lrange('birding:post:index', 0, 0);
      if (Array.isArray(latest) && latest[0] && String(latest[0]).startsWith(`${todayUTC()}-`)) {
        log.push(`[${ts()}] Skip: already published today (${latest[0]})`);
        return res.status(200).json({ ok: true, skipped: 'already published today', slug: latest[0], log });
      }
    } catch(e) { log.push(`[${ts()}] idempotency check failed, proceeding: ${e.message}`); }

    // County rotation — stored in Redis, incremented each run, wraps at 83
    let idx = 0;
    try {
      idx = (await r.incr('birding:county:index')) - 1;
      idx = idx % COUNTIES.length;
    } catch(e) {
      idx = Math.floor(Math.random() * COUNTIES.length);
    }
    const county = COUNTIES[idx];
    log.push(`[${ts()}] Birding post: ${county.name} County (${county.region}) — index ${idx}`);

    // Fetch everything in parallel
    const [rawObs, notable, hotspots, weather] = await Promise.all([
      fetchRecentObs(county.code, 14).catch(e => { log.push(`[ebird obs err] ${e.message}`); return []; }),
      fetchNotable(county.code, 14).catch(e => { log.push(`[ebird notable err] ${e.message}`); return []; }),
      fetchHotspots(county.code).catch(e => { log.push(`[ebird hotspots err] ${e.message}`); return []; }),
      fetchWeather(county.lat, county.lon).catch(e => { log.push(`[weather err] ${e.message}`); return null; }),
    ]);

    const summary = summarizeObservations(rawObs);
    const sunTimes = calcSunTimes(county.lat, county.lon, new Date());

    log.push(`[${ts()}] Data: ${summary.totalSpecies} species, ${summary.totalObservations} obs, ${notable.length} notable, ${hotspots.length} hotspots, weather=${weather ? 'ok' : 'none'}`);

    // Generate post
    const html = await generateBirdingPost(county, { summary, notable, hotspots, weather, sunTimes });

    // Extract title from H1
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : `${county.name} County Birding Report`;

    // Slug: YYYY-MM-DD-county-name
    const slug = `${todayUTC()}-${slugify(county.name)}-county`;

    const post = {
      slug,
      date: todayUTC(),
      county: county.name,
      countyCode: county.code,
      region: county.region,
      title,
      html,
      totalSpecies: summary.totalSpecies,
      totalObservations: summary.totalObservations,
      notableCount: notable.length,
      generatedAt: ts(),
    };

    // Store in Redis
    await r.set(`birding:post:${slug}`, JSON.stringify(post));
    // Keep an index of all post slugs, newest first
    await r.lpush('birding:post:index', slug);
    log.push(`[${ts()}] Stored post in Redis: ${slug}`);

    // IndexNow ping (Bing/Yandex)
    const postUrl    = `https://birdingdaily.chrisizworski.com/post/${slug}`;
    const archiveUrl = `https://birdingdaily.chrisizworski.com/chris-izworski`;
    try {
      await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host:        'birdingdaily.chrisizworski.com',
          key:         'c9d2a1b5e7f3468a9c4d2e5f1a6b7c8d',
          keyLocation: 'https://birdingdaily.chrisizworski.com/c9d2a1b5e7f3468a9c4d2e5f1a6b7c8d.txt',
          urlList:     [postUrl, archiveUrl],
        }),
      });
      log.push(`[${ts()}] IndexNow pinged`);
    } catch(e) { log.push(`[${ts()}] IndexNow err: ${e.message}`); }

    // Google sitemap ping (legacy but works)
    try {
      await fetch('https://www.google.com/ping?sitemap=https://birdingdaily.chrisizworski.com/sitemap.xml');
      log.push(`[${ts()}] Google pinged`);
    } catch(e) {}

    return res.status(200).json({ ok: true, post: { slug, title, county: county.name }, log });
  } catch(e) {
    log.push(`[${ts()}] FATAL: ${e.message}`);
    console.error('[cron]', e);
    return res.status(500).json({ error: e.message, log });
  }
}
