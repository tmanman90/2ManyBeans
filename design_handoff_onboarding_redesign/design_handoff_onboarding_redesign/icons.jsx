// Lightweight inline icons matching lucide-react styling used in the codebase.
// Kept minimal — stroke 2, rounded caps/joins, currentColor.

function Icn({ children, size = 20, strokeWidth = 2 }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const ChevronLeft = ({ size = 22, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

// Lucide "Cpu"
const IconCpu = ({ size, strokeWidth }) => (
  <Icn size={size} strokeWidth={strokeWidth}>
    <rect x="4" y="4" width="16" height="16" rx="2"/>
    <rect x="9" y="9" width="6" height="6"/>
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"/>
  </Icn>
);

// "Droplets"
const IconDrop = ({ size, strokeWidth }) => (
  <Icn size={size} strokeWidth={strokeWidth}>
    <path d="M7 16.3a4.07 4.07 0 0 1-2.4-7.36L7 5.5l2.4 3.44A4.07 4.07 0 0 1 7 16.3z"/>
    <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>
  </Icn>
);

// "FlaskConical"
const IconFlask = ({ size, strokeWidth }) => (
  <Icn size={size} strokeWidth={strokeWidth}>
    <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/>
    <path d="M8.5 2h7"/>
    <path d="M7 16h10"/>
  </Icn>
);

// "Coffee"
const IconCoffee = ({ size, strokeWidth }) => (
  <Icn size={size} strokeWidth={strokeWidth}>
    <path d="M17 8h1a4 4 0 1 1 0 8h-1"/>
    <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/>
    <line x1="6" y1="2" x2="6" y2="4"/>
    <line x1="10" y1="2" x2="10" y2="4"/>
    <line x1="14" y1="2" x2="14" y2="4"/>
  </Icn>
);

// "Zap"
const IconBolt = ({ size, strokeWidth }) => (
  <Icn size={size} strokeWidth={strokeWidth}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </Icn>
);

// "Sparkles"
const IconSparkle = ({ size, strokeWidth }) => (
  <Icn size={size} strokeWidth={strokeWidth}>
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"/>
    <path d="M19 14l.8 1.9 1.9.8-1.9.8L19 19.4l-.8-1.9-1.9-.8 1.9-.8L19 14z"/>
  </Icn>
);

Object.assign(window, {
  ChevronLeft,
  IconCpu, IconDrop, IconFlask, IconCoffee, IconBolt, IconSparkle,
});
