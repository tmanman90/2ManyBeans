const firstName = (profile) => String(profile?.displayName || '').trim().split(/\s+/)[0] || '';

export function buildRuphusOpening({ dataLoaded = false, coffees = [], profile = null } = {}) {
  const name = firstName(profile);
  if (!dataLoaded) return name ? `Hi ${name}. I’m here when you’re ready.` : 'I’m here when you’re ready.';
  const active = (Array.isArray(coffees) ? coffees : []).filter((coffee) => coffee?.status !== 'FINISHED' && coffee?.status !== 'SEALED');
  if (!active.length) return name ? `Hi ${name}. Tell me what you’re curious about, and we’ll find a good place to start.` : 'Tell me what you’re curious about, and we’ll find a good place to start.';
  if (active.length === 1) return name ? `Hi ${name}. I’m keeping an eye on ${active[0].name || 'your coffee'}. What are you brewing today?` : `I’m keeping an eye on ${active[0].name || 'your coffee'}. What are you brewing today?`;
  return name ? `Hi ${name}. You have ${active.length} coffees in rotation. Which cup is on your mind?` : `You have ${active.length} coffees in rotation. Which cup is on your mind?`;
}

export const openingText = buildRuphusOpening;
