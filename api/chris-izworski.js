// GET /chris-izworski · Author archive listing all birding posts
import { Redis } from '@upstash/redis';

const SITE = 'https://daily.michiganbirdingreport.com';
const AUTHOR = 'Chris Izworski';
const AUTHOR_URL = 'https://chrisizworski.com/chris-izworski/';

function makeRedis() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildPage(posts) {
  const items = posts.map(p => {
    const dateObj = new Date(p.date + 'T12:00:00Z');
    const dateLong = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return `<li class="post-row">
      <div class="post-date">${dateLong} &nbsp;·&nbsp; ${escapeHtml(p.county)} County</div>
      <h2 class="post-title"><a href="/post/${escapeHtml(p.slug)}">${escapeHtml(AUTHOR)}: ${escapeHtml(p.title)}</a></h2>
      <div class="post-meta">${p.totalSpecies} species reported in past 14 days</div>
    </li>`;
  }).join('\n');

  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        mainEntity: {
          '@type': 'Person',
          '@id': 'https://chrisizworski.com/#person',
          name: AUTHOR,
          url: AUTHOR_URL,
          sameAs: [
            AUTHOR_URL,
            'https://trout.chrisizworski.com',
            'https://troutdaily.chrisizworski.com',
            'https://birding.chrisizworski.com',
            SITE,
            'https://gazette.chrisizworski.com',
            'https://lawn.chrisizworski.com',
            'https://freighterviewfarms.com',
            'https://www.wikidata.org/wiki/Q138283432',
          ],
        },
      },
      {
        '@type': 'CollectionPage',
        url: `${SITE}/chris-izworski`,
        name: `${AUTHOR} · Daily Michigan Birding Reports Archive`,
        description: `Complete archive of daily Michigan birding reports by ${AUTHOR}. ${posts.length} daily county-by-county reports using live eBird data.`,
        author: { '@id': 'https://chrisizworski.com/#person' },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: posts.length,
          itemListElement: posts.map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${SITE}/post/${p.slug}`,
            name: `${AUTHOR}: ${p.title}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: AUTHOR, item: AUTHOR_URL },
          { '@type': 'ListItem', position: 2, name: 'Michigan Birding Daily', item: SITE },
          { '@type': 'ListItem', position: 3, name: 'Archive', item: `${SITE}/chris-izworski` },
        ],
      },
    ],
  });

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(AUTHOR)} · Daily Michigan Birding Reports Archive | Michigan Birding Daily</title>
<meta name="description" content="Complete archive of daily Michigan birding reports by ${escapeHtml(AUTHOR)}. ${posts.length} daily county-by-county reports using live eBird data, weather, and hotspot recommendations.">
<meta name="author" content="${escapeHtml(AUTHOR)}">
<meta name="keywords" content="Chris Izworski, Michigan birding, eBird Michigan, Michigan birds, county birding reports, Bay City birder">
<link rel="canonical" href="${SITE}/chris-izworski">
<link rel="author" href="${AUTHOR_URL}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${escapeHtml(AUTHOR)} · Michigan Birding Daily Archive">
<meta property="og:description" content="${posts.length} daily Michigan birding reports by ${escapeHtml(AUTHOR)}.">
<meta property="og:url" content="${SITE}/chris-izworski">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:image" content="https://daily.michiganbirdingreport.com/og-image.png">
<meta name="twitter:image" content="https://daily.michiganbirdingreport.com/og-image.png">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🦅%3C/text%3E%3C/svg%3E">
<script type="application/ld+json">${schema}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Serif+4:wght@400;600;700&family=IBM+Plex+Mono:wght@300;400;600&display=swap" rel="stylesheet">
<style>
:root{--paper:#fbf8f2;--ink:#111;--ink-2:#333;--ink-3:#666;--accent:#2d5a3d}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Source Serif 4',Georgia,serif;background:var(--paper);color:var(--ink);line-height:1.65;font-size:17px}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.site-header{border-bottom:2px solid var(--ink);padding:18px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.site-brand{font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;color:var(--ink)}
.site-nav{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;display:flex;gap:22px}
.site-nav a{color:var(--ink-3)}
.wrap{max-width:780px;margin:0 auto;padding:24px 24px 80px}
.breadcrumb{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;color:var(--ink-3);text-transform:uppercase;padding:16px 0}
h1{font-family:'Playfair Display',Georgia,serif;font-size:40px;font-weight:700;color:var(--ink);margin-bottom:14px;line-height:1.1}
.lede{font-style:italic;color:var(--ink-2);font-size:18px;margin-bottom:22px}
.author-intro{font-size:15px;color:var(--ink-2);line-height:1.7;padding-bottom:24px;border-bottom:2px solid var(--ink);margin-bottom:30px}
.author-intro a{color:var(--accent);font-weight:600}
ul{list-style:none;padding:0}
.post-row{padding:18px 0;border-bottom:1px solid #ddd}
.post-date{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-bottom:6px}
.post-title{font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:700;line-height:1.3;margin-bottom:4px}
.post-title a{color:var(--ink)}
.post-title a:hover{color:var(--accent);text-decoration:none}
.post-meta{font-size:13px;color:var(--ink-3)}
.empty{padding:40px 0;text-align:center;color:var(--ink-3);font-style:italic}
.footer{border-top:1px solid #ddd;padding:24px;text-align:center;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.08em;color:var(--ink-3);margin-top:60px}
.footer a{color:var(--accent)}
</style></head><body>
<header class="site-header">
  <a href="/" class="site-brand">Michigan Birding Daily</a>
  <nav class="site-nav"><a href="/">Today</a><a href="/chris-izworski">Archive</a><a href="${AUTHOR_URL}" target="_blank">${escapeHtml(AUTHOR)}</a></nav>
</header>
<div class="wrap">
  <div class="breadcrumb"><a href="${AUTHOR_URL}">${escapeHtml(AUTHOR)}</a> &rsaquo; <a href="/">Michigan Birding Daily</a> &rsaquo; Archive</div>
  <h1>${escapeHtml(AUTHOR)}</h1>
  <p class="lede">Daily Michigan birding reports archive ${posts.length ? ` (${posts.length} entries)` : ''}.</p>
  <div class="author-intro">
    <a href="${AUTHOR_URL}">${escapeHtml(AUTHOR)}</a> is a Michigan birder and the founder of the <a href="https://birding.chrisizworski.com">Michigan Birding Report</a>. This page is the complete archive of his daily county-by-county birding reports. Each report covers one Michigan county, pulls live data from eBird for the past 14 days, includes the NWS weather forecast, and recommends specific hotspots for birders heading out that day. Published every morning at 8 AM.
  </div>
  ${posts.length ? `<ul>${items}</ul>` : '<div class="empty">No reports published yet. Check back tomorrow morning at 8 AM.</div>'}
</div>
<footer class="footer">
  Michigan Birding Daily &nbsp;·&nbsp; By <a href="${AUTHOR_URL}">${escapeHtml(AUTHOR)}</a> &nbsp;·&nbsp; Live eBird data, NWS weather, and Michigan county hotspots
</footer>
</body></html>`;
}

export default async function handler(req, res) {
  const r = makeRedis();
  if (!r) return res.status(503).send('<h1>Storage unavailable</h1>');

  try {
    const slugs = await r.lrange('birding:post:index', 0, 499);
    const posts = [];
    if (slugs && slugs.length) {
      const keys = slugs.map(s => `birding:post:${s}`);
      const rawPosts = await r.mget(...keys);
      for (const raw of rawPosts) {
        if (!raw) continue;
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
        posts.push({
          slug: p.slug,
          date: p.date,
          title: p.title,
          county: p.county,
          totalSpecies: p.totalSpecies,
        });
      }
      posts.sort((a, b) => b.date.localeCompare(a.date));
    }

    const html = buildPage(posts);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=600');
    return res.send(html);
  } catch(e) {
    console.error('[chris-izworski archive]', e.message);
    return res.status(500).send(`<h1>Error</h1><p>${escapeHtml(e.message)}</p>`);
  }
}
