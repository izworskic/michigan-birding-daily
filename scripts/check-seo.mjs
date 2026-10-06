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

const profile = 'https://chrisizworski.com/chris-izworski/';
const homepage = 'https://chrisizworski.com/';
const person = 'https://chrisizworski.com/#person';
const homePage = readFileSync('public/index.html', 'utf8');
if (!homePage.includes(`<link rel="author" href="${profile}">`)) {
  throw new Error('Homepage must link author metadata to the canonical profile');
}
if (!homePage.includes(`"@id":"${person}"`) || !homePage.includes(`"url":"${homepage}"`)) {
  throw new Error('Homepage must define Chris Izworski with the canonical Person id and homepage URL');
}
if (!homePage.includes(`"author":{"@id":"${person}"}`) || !homePage.includes(`"publisher":{"@id":"${person}"}`)) {
  throw new Error('Homepage author and publisher must resolve to the canonical Person');
}
if (!homePage.includes(`Michigan Birding Daily &nbsp;·&nbsp; By <a href="${profile}">Chris Izworski</a>`)) {
  throw new Error('Visible creator credit must link to the canonical profile');
}
