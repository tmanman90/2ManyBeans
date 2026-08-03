export function semverSafeDevTimestamp(date = new Date()) {
  const compact = date.toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '')
    .replace('T', '.');
  const [day, time] = compact.split('.');
  return `d${day}.t${time}`;
}
