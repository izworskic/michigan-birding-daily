// Server-rendered post page · reads from Redis, renders full SEO HTML
import { Redis } from '@upstash/redis';

function makeRedis() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export default async function handler(req, res) {
  const { slug } = req.query;
  const r = makeRedis();
  if (!r) return res.status(503).send('<h1>Storage unavailable</h1>');

  let post;
  try {
    const raw = await r.get(`birding:post:${slug}`);
    if (!raw) return res.status(404).send('<h1>Post not found</h1>');
    post = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch(e) {
    return res.status(500).send(`<h1>Error</h1><p>${escapeHtml(e.message)}</p>`);
  }

  const SITE = 'https://birdingdaily.chrisizworski.com';
  const AUTHOR = 'Chris Izworski';
  const AUTHOR_URL = 'https://chrisizworski.com';
  const postUrl = `${SITE}/post/${post.slug}`;
  const displayTitle = `${AUTHOR}: ${post.title}`;

  const dateLong = new Date(post.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': 'https://chrisizworski.com/#person',
        name: AUTHOR,
        url: AUTHOR_URL,
        sameAs: [
          AUTHOR_URL,
          'https://trout.chrisizworski.com',
          'https://troutdaily.chrisizworski.com',
          'https://birding.chrisizworski.com',
          'https://birdingdaily.chrisizworski.com',
          'https://gazette.chrisizworski.com',
          'https://lawn.chrisizworski.com',
          'https://freighterviewfarms.com',
          'https://www.wikidata.org/wiki/Q138283432',
        ],
      },
      {
        '@type': 'Article',
        headline: displayTitle,
        author: { '@id': 'https://chrisizworski.com/#person' },
        publisher: { '@type': 'Organization', name: 'Michigan Birding Daily', url: SITE },
        datePublished: post.date,
        dateModified: post.date,
        url: postUrl,
        mainEntityOfPage: postUrl,
        about: { '@type': 'AdministrativeArea', name: `${post.county} County, Michigan` },
        keywords: `${post.county} County birding, Michigan birding, ${AUTHOR}, eBird, Michigan birds`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: AUTHOR, item: AUTHOR_URL },
          { '@type': 'ListItem', position: 2, name: 'Michigan Birding Daily', item: SITE },
          { '@type': 'ListItem', position: 3, name: 'Archive', item: `${SITE}/chris-izworski` },
          { '@type': 'ListItem', position: 4, name: post.title, item: postUrl },
        ],
      },
    ],
  });

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(displayTitle)} | Michigan Birding Daily</title>
<meta name="description" content="${escapeHtml(AUTHOR)} on birding in ${escapeHtml(post.county)} County, Michigan. ${post.totalSpecies} species reported in the last two weeks, live eBird data, weather, and hotspot recommendations.">
<meta name="author" content="${escapeHtml(AUTHOR)}">
<meta name="keywords" content="${escapeHtml(post.county)} County birding, Michigan birding, eBird ${escapeHtml(post.county)}, ${escapeHtml(AUTHOR)}">
<link rel="canonical" href="${postUrl}">
<link rel="author" href="${AUTHOR_URL}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(displayTitle)}">
<meta property="og:description" content="${escapeHtml(AUTHOR)} on birding in ${escapeHtml(post.county)} County, Michigan.">
<meta property="og:url" content="${postUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:image" content="https://daily.michiganbirdingreport.com/og-image.png">
<meta name="twitter:image" content="https://daily.michiganbirdingreport.com/og-image.png">
<meta name="twitter:title" content="${escapeHtml(displayTitle)}">
<script type="application/ld+json">${schema}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=IBM+Plex+Mono:wght@300;400;600&display=swap" rel="stylesheet">
<style>
:root{--paper:#fbf8f2;--ink:#111;--ink-2:#333;--ink-3:#666;--accent:#2d5a3d}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Source Serif 4',Georgia,serif;background:var(--paper);color:var(--ink);line-height:1.7;font-size:18px}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.site-header{border-bottom:2px solid var(--ink);padding:18px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.site-brand{font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;color:var(--ink)}
.site-nav{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;display:flex;gap:22px}
.site-nav a{color:var(--ink-3)}
.wrap{max-width:760px;margin:0 auto;padding:28px 24px 80px}
.breadcrumb{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;color:var(--ink-3);text-transform:uppercase;margin-bottom:18px}
.post-date{font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:.12em;color:var(--ink-3);text-transform:uppercase;margin-bottom:10px}
h1{font-family:'Playfair Display',Georgia,serif;font-size:36px;font-weight:700;line-height:1.15;margin-bottom:20px;color:var(--ink)}
.post-meta{font-size:14px;color:var(--ink-3);padding-bottom:20px;border-bottom:1px solid #ddd;margin-bottom:28px}
.post-body h1{font-size:30px;margin-top:0}
.post-body h2{font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;margin:36px 0 14px;color:var(--ink)}
.post-body h3{font-family:'Playfair Display',Georgia,serif;font-size:19px;font-weight:700;margin:28px 0 10px}
.post-body p{margin-bottom:18px;color:var(--ink-2)}
.post-body a{color:var(--accent);text-decoration:underline}
.author-bio{border-top:2px solid var(--ink);margin-top:50px;padding-top:24px;font-size:15px;color:var(--ink-2)}
.author-bio strong{color:var(--ink)}
.author-bio a{color:var(--accent);font-weight:600}
.related{margin-top:40px;padding-top:24px;border-top:1px solid #ddd}
.related h3{font-family:'Playfair Display',Georgia,serif;font-size:18px;margin-bottom:12px}
.related ul{list-style:none;padding:0}
.related li{margin-bottom:8px;font-size:15px}
.footer{border-top:1px solid #ddd;padding:24px;text-align:center;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.1em;color:var(--ink-3);margin-top:60px}
.footer a{color:var(--accent)}
</style></head><body>
<header class="site-header">
  <a href="/" class="site-brand">Michigan Birding Daily</a>
  <nav class="site-nav">
    <a href="/">Today</a>
    <a href="/chris-izworski">Archive</a>
    <a href="${AUTHOR_URL}" target="_blank">${escapeHtml(AUTHOR)}</a>
  </nav>
</header>
<div class="wrap">
  <div class="breadcrumb"><a href="${AUTHOR_URL}">${escapeHtml(AUTHOR)}</a> &rsaquo; <a href="/">Michigan Birding Daily</a> &rsaquo; <a href="/chris-izworski">Archive</a> &rsaquo; ${escapeHtml(post.county)} County</div>
  <div class="post-date">${dateLong}</div>
  <h1>${escapeHtml(displayTitle)}</h1>
  <article class="post-body">
    ${(post.html || '').replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, '')}
  </article>
  <div class="post-meta" style="margin-top:30px;padding-top:20px;border-top:1px solid #ddd;border-bottom:none">
    County: ${escapeHtml(post.county)} &nbsp;·&nbsp; Species reported (14 days): ${post.totalSpecies} &nbsp;·&nbsp; Observations: ${post.totalObservations}
  </div>
  <div class="author-bio">
    <p><strong>About the author.</strong> <a href="${AUTHOR_URL}">${escapeHtml(AUTHOR)}</a> is a Michigan writer and birder based in Bay City. He publishes <a href="${SITE}">Michigan Birding Daily</a>, the <a href="https://birding.chrisizworski.com">Michigan Birding Report</a>, <a href="https://troutdaily.chrisizworski.com">Michigan Trout Daily</a>, and the <a href="https://gazette.chrisizworski.com">Great Lakes Gazette</a>.</p>
  </div>
  <div class="related">
    <h3>More from Chris Izworski</h3>
    <ul>
      <li><a href="/chris-izworski">All Michigan Birding Daily reports by Chris Izworski</a></li>
      <li><a href="https://birding.chrisizworski.com">Michigan Birding Report: live data for all 83 counties</a></li>
      <li><a href="https://troutdaily.chrisizworski.com">Michigan Trout Daily</a></li>
      <li><a href="https://gazette.chrisizworski.com">Great Lakes Gazette</a></li>
      <li><a href="${AUTHOR_URL}/about/">About Chris Izworski</a></li>
    </ul>
  </div>
</div>
<footer class="footer">
  Michigan Birding Daily &nbsp;·&nbsp; By <a href="${AUTHOR_URL}">${escapeHtml(AUTHOR)}</a> &nbsp;·&nbsp; Live eBird data
</footer>
</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
  return res.send(html);
}
