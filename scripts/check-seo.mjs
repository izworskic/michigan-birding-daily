import { readFileSync } from 'node:fs';

const canonicalHost = 'daily.michiganbirdingreport.com';
const legacyHost = 'birdingdaily.chrisizworski.com';
const canonicalFiles = [
  'api/chris-izworski.js',
  'api/cron.js',
  'api/post/[slug].js',
  'api/sitemap.js',
  'public/index.html',
  'public/robots.txt',
];

for (const path of canonicalFiles) {
  const contents = readFileSync(path, 'utf8');
  if (!contents.includes(canonicalHost)) {
    throw new Error(`${path} does not reference the canonical host`);
  }
  if (contents.includes(legacyHost)) {
    throw new Error(`${path} still references the legacy host`);
  }
}

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const legacyRedirects = vercel.redirects?.filter(rule =>
  rule.has?.some(condition =>
    condition.type === 'host' && condition.value === 'birdingdaily\\.chrisizworski\\.com'
  )
);

if (legacyRedirects?.length !== 2 || legacyRedirects.some(rule => rule.permanent !== true)) {
  throw new Error('vercel.json must permanently redirect the legacy host at / and all public paths');
}
if (legacyRedirects.some(rule => !rule.destination.startsWith(`https://${canonicalHost}/`))) {
  throw new Error('Legacy-host redirect must target the canonical host');
}

console.log('SEO host checks passed.');
