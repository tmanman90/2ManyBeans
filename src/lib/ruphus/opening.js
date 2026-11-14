const firstName = (profile) => String(profile?.displayName || '').trim().split(/\s+/)[0] || '';
const DAY_MS = 24 * 60 * 60 * 1000;
const elapsedDays = (value, now) => {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return null;
  const days = Math.floor((now - timestamp) / DAY_MS);
  return days >= 0 ? days : null;
};
const dayPhrase = (days, suffix) => days === 1 ? `1 ${suffix}` : `${days} ${suffix}s`;

export function buildRuphusOpening({ dataLoaded = false, coffees = [], profile = null, now = Date.now() } = {}) {
  const name = firstName(profile);
  if (!dataLoaded) return name ? `Hi ${name}. I’m here when you’re ready.` : 'I’m here when you’re ready.';
  const active = (Array.isArray(coffees) ? coffees : []).filter((coffee) => coffee?.status !== 'FINISHED' && coffee?.status !== 'SEALED');
  if (!active.length) return name ? `Hi ${name}. Tell me what you’re curious about, and we’ll find a good place to start.` : 'Tell me what you’re curious about, and we’ll find a good place to start.';
  if (active.length === 1) {
    const coffee = active[0];
    const roastDays = elapsedDays(coffee.roastDate, now);
    const lastBrewDays = elapsedDays(coffee.lastBrewAt || coffee.lastBrewDate || coffee.lastBrew?.date || coffee.lastBrew?.createdAt, now);
    if (roastDays !== null) return name ? `Hi ${name}. ${coffee.name || 'Your coffee'} is ${roastDays === 0 ? 'fresh off roast' : `${dayPhrase(roastDays, 'day')} off roast`}. What are you brewing today?` : `${coffee.name || 'Your coffee'} is ${roastDays === 0 ? 'fresh off roast' : `${dayPhrase(roastDays, 'day')} off roast`}. What are you brewing today?`;
    if (lastBrewDays !== null) return name ? `Hi ${name}. You last brewed ${coffee.name || 'this coffee'} ${lastBrewDays === 0 ? 'today' : `${dayPhrase(lastBrewDays, 'day')} ago`}. What should we notice next?` : `You last brewed ${coffee.name || 'this coffee'} ${lastBrewDays === 0 ? 'today' : `${dayPhrase(lastBrewDays, 'day')} ago`}. What should we notice next?`;
    return name ? `Hi ${name}. I’m keeping an eye on ${coffee.name || 'your coffee'}. What are you brewing today?` : `I’m keeping an eye on ${coffee.name || 'your coffee'}. What are you brewing today?`;
  }
  return name ? `Hi ${name}. You have ${active.length} coffees in rotation. Which cup is on your mind?` : `You have ${active.length} coffees in rotation. Which cup is on your mind?`;
}

export const openingText = buildRuphusOpening;
