// eBird API wrapper — recent observations and notable (rare) sightings

const EBIRD_BASE = 'https://api.ebird.org/v2';

async function ebirdFetch(path, headers = {}) {
  const token = process.env.EBIRD_API_TOKEN;
  if (!token) throw new Error('EBIRD_API_TOKEN not configured');
  const res = await fetch(`${EBIRD_BASE}${path}`, {
    headers: { 'x-ebirdapitoken': token, ...headers },
  });
  if (!res.ok) throw new Error(`eBird ${res.status} on ${path}`);
  return res.json();
}

// Recent observations in a county (last 14 days, up to 200)
export async function fetchRecentObs(regionCode, days = 14) {
  return ebirdFetch(`/data/obs/${regionCode}/recent?back=${days}&maxResults=200`);
}

// Notable / rare sightings in a county (last 14 days)
export async function fetchNotable(regionCode, days = 14) {
  return ebirdFetch(`/data/obs/${regionCode}/recent/notable?back=${days}&detail=full`);
}

// Top hotspots in a county
export async function fetchHotspots(regionCode) {
  const res = await fetch(`${EBIRD_BASE}/ref/hotspot/${regionCode}?fmt=json`, {
    headers: { 'x-ebirdapitoken': process.env.EBIRD_API_TOKEN },
  });
  if (!res.ok) return [];
  return res.json();
}

// Summarize observations: unique species, total count, top species by count
export function summarizeObservations(obs) {
  const bySpecies = new Map();
  for (const o of obs) {
    const key = o.comName;
    if (!bySpecies.has(key)) {
      bySpecies.set(key, {
        comName: o.comName,
        sciName: o.sciName,
        speciesCode: o.speciesCode,
        totalCount: 0,
        locations: new Set(),
        recent: o.obsDt,
      });
    }
    const s = bySpecies.get(key);
    s.totalCount += (o.howMany || 1);
    s.locations.add(o.locName);
    if (o.obsDt > s.recent) s.recent = o.obsDt;
  }
  const species = [...bySpecies.values()].map(s => ({ ...s, locations: [...s.locations] }));
  species.sort((a, b) => b.totalCount - a.totalCount);
  return {
    totalSpecies: species.length,
    totalObservations: obs.length,
    species,
  };
}

// Pull out species seen in last 48h (the freshness window)
export function recentStandouts(obs, hoursBack = 48) {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  return obs.filter(o => {
    const t = new Date(o.obsDt).getTime();
    return t > cutoff;
  });
}
