// Peak status utilities — ported from prototype lines 86-107
import { C } from '../styles/theme';

export const today = () => new Date().toISOString().split("T")[0];

export const daysBetween = (a, b) => {
  if (!a || !b) return null;
  return Math.floor((new Date(b) - new Date(a)) / 86400000);
};

export const daysSinceRoast = (roastDate) => daysBetween(roastDate, today());

export const daysOpen = (openDate) => openDate ? daysBetween(openDate, today()) : null;

export const getPeakStatus = (bean) => {
  const days = daysSinceRoast(bean.roastDate);
  if (days === null) return { label: "Unknown", color: C.textMuted, bg: C.borderLight };
  if (days < bean.degasMin) return { label: "Degassing", color: C.purple, bg: C.purpleBg, days };
  if (days < bean.peakStart) return { label: "Resting", color: C.amber, bg: C.amberBg, days };
  if (days <= bean.peakEnd) {
    const pct = Math.round(((days - bean.peakStart) / (bean.peakEnd - bean.peakStart)) * 100);
    return { label: `In Peak (${pct}%)`, color: C.green, bg: C.greenBg, days };
  }
  const over = days - bean.peakEnd;
  if (over <= 14) return { label: `Fading (+${over}d)`, color: C.amber, bg: C.amberBg, days };
  if (over <= 30) return { label: `Past Peak (+${over}d)`, color: C.red, bg: C.redBg, days };
  return { label: `Stale (+${over}d)`, color: C.red, bg: C.redBg, days };
};
