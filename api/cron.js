// Michigan Birding Daily — daily cron
// 8am CT (13:00 UTC during CST, 12:00 UTC during CDT). Schedule in vercel.json at 13:00 UTC.
// Prefers a statewide notable sighting, then falls back to county rotation, generates a post,
// stores in Redis, and pings IndexNow.

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

const SITE = 'https://daily.michiganbirdingreport.com';
const INDEXNOW_KEY = 'c9d2a1b5e7f3468a9c4d2e5f1a6b7c8d';
const COUNTY_BY_CODE = new Map(COUNTIES.map(c => [c.code, c]));
const COUNTY_BY_NAME = new Map(COUNTIES.map(c => [c.name.toLowerCase(), c]));

function makeRedis() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function obsTimeMs(o) {
  const t = Date.parse(String(o?.obsDt || '').replace(' ', 'T'));
  return Number.isFinite(t) ? t : 0;
}

function normalizeSighting(o, source) {
  if (!o?.comName || !o?.locName || !o?.obsDt) return null;
  const count = Number(o.howMany || 1);
  return {
    comName: o.comName,
    sciName: o.sciName || '',
    speciesCode: o.speciesCode || '',
    locName: o.locName,
    obsDt: o.obsDt,
    howMany: Number.isFinite(count) && count > 0 ? count : 1,
    lat: o.lat,
    lng: o.lng,
    subnational2Code: o.subnational2Code || o.subnational2 || '',
    subnational2Name: o.subnational2Name || '',
    obsValid: Boolean(o.obsValid),
    obsReviewed: Boolean(o.obsReviewed),
    source,
    isNotable: source === 'notable',
  };
}

function sightingScore(sighting) {
  const count = Number(sighting.howMany || 1);
  const ageHours = Math.max(0, (Date.now() - obsTimeMs(sighting)) / 36e5);
  let score = sighting.isNotable ? 1000 : 0;
  if (sighting.obsReviewed) score += 100;
  if (sighting.obsValid) score += 50;
  if (count === 1) score += 20;
  else if (count <= 5) score += 12;
  score += Math.max(0, 120 - ageHours);
  return score;
}

function pickFeaturedSighting(notable = [], recent = []) {
  const candidates = [
    ...notable.map(o => normalizeSighting(o, 'notable')),
    ...recent.map(o => normalizeSighting(o, 'recent')),
  ].filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((a, b) => sightingScore(b) - sightingScore(a) || obsTimeMs(b) - obsTimeMs(a));
  return candidates[0];
}

function countyForSighting(sighting) {
  if (!sighting) return null;
  if (sighting.subnational2Code && COUNTY_BY_CODE.has(sighting.subnational2Code)) {
    return COUNTY_BY_CODE.get(sighting.subnational2Code);
  }
  const rawName = String(sighting.subnational2Name || '').replace(/\s+County$/i, '').trim().toLowerCase();
  if (rawName && COUNTY_BY_NAME.has(rawName)) return COUNTY_BY_NAME.get(rawName);
  return null;
}

async function rotatingCounty(r) {
  try {
    let idx = (await r.incr('birding:county:index')) - 1;
    idx = idx % COUNTIES.length;
    return { county: COUNTIES[idx], idx };
  } catch(e) {
    const idx = Math.floor(Math.random() * COUNTIES.length);
    return { county: COUNTIES[idx], idx };
  }
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
    const [stateNotable, stateRecent] = await Promise.all([
      fetchNotable('US-MI', 7).catch(e => { log.push(`[state notable err] ${e.message}`); return []; }),
      fetchRecentObs('US-MI', 3).catch(e => { log.push(`[state obs err] ${e.message}`); return []; }),
    ]);

    let statewideFeatured = pickFeaturedSighting(stateNotable, stateRecent);
    let county = countyForSighting(statewideFeatured);
    if (county) {
      log.push(`[${ts()}] Birding post selected by statewide sighting: ${statewideFeatured.comName} at ${statewideFeatured.locName}, ${county.name} County`);
    } else {
      const fallback = await rotatingCounty(r);
      county = fallback.county;
      statewideFeatured = null;
      log.push(`[${ts()}] Birding post selected by county rotation: ${county.name} County (${county.region}) — index ${fallback.idx}`);
    }

    // Fetch everything in parallel
    const [rawObs, notable, hotspots, weather] = await Promise.all([
      fetchRecentObs(county.code, 14).catch(e => { log.push(`[ebird obs err] ${e.message}`); return []; }),
      fetchNotable(county.code, 14).catch(e => { log.push(`[ebird notable err] ${e.message}`); return []; }),
      fetchHotspots(county.code).catch(e => { log.push(`[ebird hotspots err] ${e.message}`); return []; }),
      fetchWeather(county.lat, county.lon).catch(e => { log.push(`[weather err] ${e.message}`); return null; }),
    ]);

    const summary = summarizeObservations(rawObs);
    const sunTimes = calcSunTimes(county.lat, county.lon, new Date());
    const featuredSighting = statewideFeatured || pickFeaturedSighting(notable, rawObs);

    log.push(`[${ts()}] Data: ${summary.totalSpecies} species, ${summary.totalObservations} obs, ${notable.length} notable, ${hotspots.length} hotspots, weather=${weather ? 'ok' : 'none'}`);
    if (featuredSighting) log.push(`[${ts()}] Featured sighting: ${featuredSighting.comName} at ${featuredSighting.locName}`);

    // Generate post
    const html = await generateBirdingPost(county, { summary, notable, hotspots, weather, sunTimes, featuredSighting });

    // Extract title from H1
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : `${county.name} County Birding Report`;

    // Slug: YYYY-MM-DD-featured-species-county-name, falling back to county when data is thin.
    const slugSubject = featuredSighting?.comName
      ? `${featuredSighting.comName}-${county.name}-county`
      : `${county.name}-county`;
    const slug = `${todayUTC()}-${slugify(slugSubject)}`;

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
      featuredSighting,
      generatedAt: ts(),
    };

    // Store in Redis
    await r.set(`birding:post:${slug}`, JSON.stringify(post));
    // Keep an index of all post slugs, newest first
    await r.lpush('birding:post:index', slug);
    log.push(`[${ts()}] Stored post in Redis: ${slug}`);

    // IndexNow ping (Bing/Yandex)
    const postUrl    = `${SITE}/post/${slug}`;
    const archiveUrl = `${SITE}/chris-izworski`;
    try {
      await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host:        new URL(SITE).host,
          key:         INDEXNOW_KEY,
          keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
          urlList:     [postUrl, archiveUrl],
        }),
      });
      log.push(`[${ts()}] IndexNow pinged`);
    } catch(e) { log.push(`[${ts()}] IndexNow err: ${e.message}`); }

    // Google sitemap ping (legacy but works)
    try {
      await fetch(`https://www.google.com/ping?sitemap=${SITE}/sitemap.xml`);
      log.push(`[${ts()}] Google pinged`);
    } catch(e) {}

    return res.status(200).json({ ok: true, post: { slug, title, county: county.name, featuredSighting }, log });
  } catch(e) {
    log.push(`[${ts()}] FATAL: ${e.message}`);
    console.error('[cron]', e);
    return res.status(500).json({ error: e.message, log });
  }
}
