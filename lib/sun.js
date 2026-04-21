// NOAA simplified sunrise/sunset calculation
// Returns HH:MM local time strings for given lat/lon/date, using America/Detroit tz

export function calcSunTimes(lat, lon, date = new Date()) {
  const d = Math.floor((date - new Date(Date.UTC(date.getUTCFullYear(), 0, 0))) / (1000 * 60 * 60 * 24));
  const fracYear = (2 * Math.PI / 365) * (d - 1);
  const eqTime = 229.18 * (
    0.000075 + 0.001868 * Math.cos(fracYear) - 0.032077 * Math.sin(fracYear)
    - 0.014615 * Math.cos(2 * fracYear) - 0.040849 * Math.sin(2 * fracYear)
  );
  const decl = 0.006918 - 0.399912 * Math.cos(fracYear) + 0.070257 * Math.sin(fracYear)
             - 0.006758 * Math.cos(2 * fracYear) + 0.000907 * Math.sin(2 * fracYear)
             - 0.002697 * Math.cos(3 * fracYear) + 0.00148 * Math.sin(3 * fracYear);
  const latRad = lat * Math.PI / 180;
  const cosHA = (Math.cos(90.833 * Math.PI / 180) / (Math.cos(latRad) * Math.cos(decl)))
              - Math.tan(latRad) * Math.tan(decl);
  if (cosHA > 1)  return { sunrise: 'No sunrise', sunset: 'No sunset', dayLength: '0h', dawnChorus: '' };
  if (cosHA < -1) return { sunrise: 'Midnight sun', sunset: 'Midnight sun', dayLength: '24h', dawnChorus: '' };

  const HA = Math.acos(cosHA) * 180 / Math.PI;
  const solarNoon = 720 - 4 * lon - eqTime;
  const sunriseUTC = solarNoon - HA * 4;
  const sunsetUTC  = solarNoon + HA * 4;

  // Michigan timezone: tz name via Intl
  const fmtMin = (mins) => {
    // mins is UTC minutes from midnight; convert to local America/Detroit
    const ms = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + mins * 60 * 1000;
    const dt = new Date(ms);
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Detroit', hour12: true })
      .format(dt);
  };

  const sunrise = fmtMin(sunriseUTC);
  const sunset  = fmtMin(sunsetUTC);
  const dawnChorus = fmtMin(sunriseUTC - 30) + ' to ' + fmtMin(sunriseUTC + 90);
  const dayLengthMin = sunsetUTC - sunriseUTC;
  const dayLength = `${Math.floor(dayLengthMin / 60)}h ${Math.round(dayLengthMin % 60)}m`;

  return { sunrise, sunset, dayLength, dawnChorus };
}
