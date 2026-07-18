import { Redis } from '@upstash/redis';

function makeRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export default async function handler(req, res) {
  const r = makeRedis();
  const today = new Date().toISOString().slice(0, 10);
  const SITE = 'https://daily.michiganbirdingreport.com';

  let postUrls = '';
  if (r) {
    try {
      const slugs = await r.lrange('birding:post:index', 0, 499);
      if (slugs && slugs.length) {
        const keys = slugs.map(s => `birding:post:${s}`);
        const raw  = await r.mget(...keys);
        const posts = raw.filter(Boolean).map(p => typeof p === 'string' ? JSON.parse(p) : p);
        postUrls = posts.map(p => `
  <url>
    <loc>${SITE}/post/${p.slug}</loc>
    <lastmod>${p.date}</lastmod>
    <changefreq>never</changefreq>
    <priority>0.8</priority>
  </url>`).join('');
      }
    } catch(e) { console.error('sitemap err', e.message); }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE}/chris-izworski</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>${postUrls}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
  return res.send(xml);
}
