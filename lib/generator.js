// Michigan Birding Daily — post generator
// Uses Claude Haiku to write a 700-900w daily birding report for one Michigan county.

import Anthropic from '@anthropic-ai/sdk';
import { REGION_LABEL } from './counties.js';

function getSeasonNote(m) {
  if (m === 1 || m === 2) return 'Deep winter. Waterfowl concentrations on open water. Owl season. Winter finches when the cones are good. Christmas bird count aftermath.';
  if (m === 3) return 'Early spring. Tundra Swans and waterfowl migration on the rise. First returning blackbirds. Woodcock start displaying late in the month.';
  if (m === 4) return 'April migration. Waterfowl peak, sparrows arriving, early warblers (Pine, Palm, Yellow-rumped) coming north. Hawks move on south winds.';
  if (m === 5) return 'May is the month. Warbler wave. Thrushes, vireos, flycatchers. Michigan hosts Kirtland\'s Warbler in the Jack Pine plains. The birding superbowl.';
  if (m === 6) return 'Breeding season. Dawn chorus peaks in early June. Specialties settle in: Bobolinks, Savannah Sparrows, Piping Plovers along Great Lakes shorelines.';
  if (m === 7) return 'Post-breeding. Shorebird migration starts mid-July. Warblers quieter. Late-summer gathering of swallows on wires and over marshes.';
  if (m === 8) return 'Shorebirds peak. Fall warbler migration begins, mostly drab plumages. Nighthawk flights on still evenings. Late Common Loons.';
  if (m === 9) return 'Fall migration in force. Hawk flights at the Straits and along the lakeshores. Sparrows moving through weedy edges. Warblers still dropping in.';
  if (m === 10) return 'October. Late warblers, sparrows, kinglets, creepers, golden-crowned. Waterfowl building. Last nighthawks and flycatchers early in the month.';
  if (m === 11) return 'Late fall. Waterfowl and loons on the Great Lakes. Snow Buntings arriving. Rough-legged Hawks return. Check open water for rarities.';
  return 'December. Winter species settled in. CBC season. Gyrfalcon hopes along the lakeshore. Bohemian Waxwings when the fruit crop calls them south.';
}

function fmtObservations(summary, limit = 15) {
  if (!summary || !summary.species?.length) return '(no recent eBird observations available)';
  return summary.species.slice(0, limit).map(s => {
    const locCount = s.locations.length;
    const where = locCount === 1
      ? `seen at ${s.locations[0].slice(0, 80)}`
      : `reported from ${locCount} locations`;
    return `- ${s.comName} (${s.sciName}): ${s.totalCount} individual(s), ${where}. Most recent ${s.recent.slice(0,10)}.`;
  }).join('\n');
}

function fmtNotable(notable, limit = 8) {
  if (!notable?.length) return '(none flagged as notable/rare in the last two weeks)';
  return notable.slice(0, limit).map(o => {
    return `- ${o.comName}: ${o.howMany || 1} at ${o.locName.slice(0, 80)} on ${o.obsDt.slice(0, 10)}`;
  }).join('\n');
}

function fmtFeatured(featuredSighting) {
  if (!featuredSighting) return '(no single featured sighting selected)';
  const count = featuredSighting.howMany || 1;
  const source = featuredSighting.isNotable ? 'notable/rare eBird flag' : 'recent eBird report';
  return `- ${featuredSighting.comName} (${featuredSighting.sciName || 'scientific name unavailable'}): ${count} at ${featuredSighting.locName} on ${String(featuredSighting.obsDt).slice(0, 16)}. Source: ${source}.`;
}

function fmtHotspots(hotspots, limit = 6) {
  if (!hotspots?.length) return '(no hotspot data available)';
  const sorted = [...hotspots].sort((a, b) => (b.numSpeciesAllTime || 0) - (a.numSpeciesAllTime || 0));
  return sorted.slice(0, limit).map(h =>
    `- ${h.locName} (${h.numSpeciesAllTime || 0} species all-time)`
  ).join('\n');
}

export async function generateBirdingPost(county, data) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const month = new Date().getMonth() + 1;
  const { summary, notable, hotspots, weather, sunTimes, featuredSighting } = data;

  const prompt = `You are writing a daily birding post for Michigan Birding Daily, a site for serious Michigan birders. Today is ${today}.

Write 700-900 words about birding in ${county.name} County, Michigan (${REGION_LABEL[county.region]}). Write it the way a knowledgeable Michigan birder would: factual, specific, plainspoken, no tourism fluff. The reader already knows what a Yellow-rumped Warbler is. Do not explain basic birding concepts.

WHAT YOU KNOW ABOUT THE COUNTY:
- Name: ${county.name} County
- Region: ${REGION_LABEL[county.region]}
- Approximate center: ${county.lat.toFixed(2)}, ${county.lon.toFixed(2)}

LIVE EBIRD DATA (past 14 days):
- Total species reported: ${summary?.totalSpecies || 0}
- Total observations: ${summary?.totalObservations || 0}

FEATURED SIGHTING FOR TODAY'S LEDE:
${fmtFeatured(featuredSighting)}

TOP SPECIES BY COUNT:
${fmtObservations(summary, 15)}

NOTABLE / RARE SIGHTINGS FLAGGED BY EBIRD:
${fmtNotable(notable, 8)}

TOP HOTSPOTS IN THIS COUNTY:
${fmtHotspots(hotspots, 6)}
${weather ? `
NWS WEATHER FORECAST:
- Today: ${weather.today?.tempF}°F, ${weather.today?.forecast}, wind ${weather.today?.wind} from ${weather.today?.windDir}, rain chance ${weather.today?.rain}%
- Tonight: ${weather.tonight ? `${weather.tonight.tempF}°F, ${weather.tonight.forecast}` : 'unavailable'}
- Tomorrow: ${weather.tomorrow ? `${weather.tomorrow.tempF}°F, ${weather.tomorrow.forecast}, wind ${weather.tomorrow.wind} from ${weather.tomorrow.windDir}` : 'unavailable'}` : ''}
${sunTimes ? `
SUN TIMES:
- Sunrise: ${sunTimes.sunrise}  |  Sunset: ${sunTimes.sunset}
- Day length: ${sunTimes.dayLength}
- Dawn chorus window: ${sunTimes.dawnChorus}` : ''}

SEASON NOTE: ${getSeasonNote(month)}

WRITING RULES:
- The H1 must be topic-first. Do not start the H1 or first paragraph with Chris Izworski.
- If a featured sighting exists, make it the news hook in the H1 and opening paragraph. A good pattern is "<featured species> in ${county.name} County: Michigan Birding Daily for ${today}".
- Open with the county and what is actually being seen there right now based on the eBird data. Lead with the featured sighting, then other specific species and locations.
- BE SPECIFIC. Name actual species from the data, cite counts, cite hotspot names from the list above. Do not list species that are not in the data.
- WEATHER REASONING: Use the forecast meaningfully. Cold fronts move waterfowl. South winds push warblers north. Calm overcast mornings are prime dawn chorus. Use the numbers given.
- Call out notable/rare sightings if present. That is the news.
- Recommend one or two hotspots from the list for a birder heading out today.
- Be honest. If the data is thin, say so. If it is a slow time of year in that county, say so.
- No em dashes anywhere. Use commas, colons, periods, or semicolons.
- No bullet points. Prose only.
- No exclamation points.
- The county, the featured sighting, and the birds are the subject. Author attribution is handled outside the article body.
- Do not fabricate place names, counts, or species not in the data above.
- End with a single natural line pointing readers to https://michiganbirdingreport.com for the live map and full county data.
- Use H2 headers specific to this county and this day. Not generic labels like "The Birds" or "Weather."
- Output raw HTML only. Start with the opening < of the <h1> tag. Do not write code fences. First character of your response must be <.`;

  const client = new Anthropic();
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  });

  let html = msg.content[0].text.trim();
  // strip any code fences if model added them
  html = html.replace(/^```html?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return html;
}
