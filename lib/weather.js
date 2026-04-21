// NWS weather for a lat/lon — fetches today's forecast period + tonight + next day

const UA = 'MichiganBirdingDaily/1.0 (chrisizworski.com)';

async function fetchGrid(lat, lon) {
  const res = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
    headers: { 'User-Agent': UA, 'Accept': 'application/geo+json' },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchWeather(lat, lon) {
  try {
    const pts = await fetchGrid(lat, lon);
    if (!pts?.properties?.forecast) return null;
    const fcRes = await fetch(pts.properties.forecast, { headers: { 'User-Agent': UA } });
    if (!fcRes.ok) return null;
    const fc = await fcRes.json();
    const periods = fc.properties?.periods || [];
    const today   = periods.find(p => p.isDaytime) || periods[0];
    const tonight = periods.find(p => !p.isDaytime);
    const tomorrow = periods.filter(p => p.isDaytime)[1];

    return {
      today: today ? {
        name: today.name,
        tempF: today.temperature,
        forecast: today.shortForecast,
        detail: today.detailedForecast,
        wind: today.windSpeed,
        windDir: today.windDirection,
        rain: today.probabilityOfPrecipitation?.value || 0,
      } : null,
      tonight: tonight ? {
        name: tonight.name,
        tempF: tonight.temperature,
        forecast: tonight.shortForecast,
      } : null,
      tomorrow: tomorrow ? {
        name: tomorrow.name,
        tempF: tomorrow.temperature,
        forecast: tomorrow.shortForecast,
        wind: tomorrow.windSpeed,
        windDir: tomorrow.windDirection,
      } : null,
    };
  } catch(e) {
    return null;
  }
}
