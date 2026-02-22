import { useState, useEffect, useRef, useCallback } from "react";
import { Coffee, Package, Droplets, MessageCircle, Archive, ChevronRight, ChevronDown, X, Send, Star, RotateCcw, AlertCircle, Check, Clock, Plus, Trash2, Pencil } from "lucide-react";

// ─── Color Palette ───────────────────────────────────────────────
const C = {
  bg: "#FAF6F1", cream: "#FFF8F0", card: "#FFFFFF",
  text: "#2C1810", textMuted: "#8B7B6F", textLight: "#A89888",
  accent: "#8B5E3C", accentLight: "#C49A6C", accentDark: "#5C3D2E",
  border: "#E8DDD3", borderLight: "#F0E8DF",
  green: "#4A7C59", greenBg: "#EDF5F0",
  amber: "#B8860B", amberBg: "#FDF6E3",
  red: "#A0522D", redBg: "#FDF0EB",
  purple: "#6B5B95", purpleBg: "#F0EDF5",
};

// ─── Roaster Profiles (research-backed peak timing) ─────────────
const ROASTER_PROFILES = {
  // Explicit roaster guidance (from bag)
  "Apollon's Gold": { degasMin:35, degasMax:45, peakStart:60, peakEnd:90, category:"Apollon's Gold", guidance:"Degas 35–45d · Peak 60–90d (bag guidance)" },
  // Nordic / Ultra-light roasters (Loring / air roast, extended rest)
  "Koppi":    { degasMin:10, degasMax:14, peakStart:21, peakEnd:60, category:"Nordic/Ultra-Light", guidance:"Nordic Light · Degas 10–14d · Peak 21–60d" },
  "Prodigal": { degasMin:10, degasMax:14, peakStart:21, peakEnd:60, category:"Nordic/Ultra-Light", guidance:"Ultra-Light (Loring) · Degas 10–14d · Peak 21–60d" },
  "La Cabra":  { degasMin:10, degasMax:14, peakStart:21, peakEnd:60, category:"Nordic/Ultra-Light", guidance:"Nordic Light · Degas 10–14d · Peak 21–60d" },
  "Coffee Collective": { degasMin:10, degasMax:14, peakStart:21, peakEnd:60, category:"Nordic/Ultra-Light", guidance:"Nordic Light · Degas 10–14d · Peak 21–60d" },
  "Drop Coffee": { degasMin:10, degasMax:14, peakStart:21, peakEnd:60, category:"Nordic/Ultra-Light", guidance:"Nordic Light · Degas 10–14d · Peak 21–60d" },
  "Tim Wendelboe": { degasMin:10, degasMax:14, peakStart:21, peakEnd:60, category:"Nordic/Ultra-Light", guidance:"Nordic Light · Degas 10–14d · Peak 21–60d" },
  // Specialty light roasters (standard specialty)
  "Dayglow":  { degasMin:7, degasMax:14, peakStart:14, peakEnd:60, category:"Specialty Light", guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
  "Dayglow (Promethium)": { degasMin:7, degasMax:14, peakStart:14, peakEnd:60, category:"Specialty Light", guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
  "Leaves (Tokyo)": { degasMin:7, degasMax:14, peakStart:14, peakEnd:60, category:"Specialty Light", guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
  "Momos Coffee": { degasMin:7, degasMax:14, peakStart:14, peakEnd:60, category:"Specialty Light", guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
  "Wonderstate": { degasMin:7, degasMax:14, peakStart:14, peakEnd:60, category:"Specialty Light", guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
  "SEY":      { degasMin:7, degasMax:14, peakStart:14, peakEnd:60, category:"Specialty Light", guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
  "Onyx":     { degasMin:7, degasMax:14, peakStart:14, peakEnd:60, category:"Specialty Light", guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
};
const DEFAULT_PROFILE = { degasMin:7, degasMax:14, peakStart:14, peakEnd:60, category:"Specialty Light (default)", guidance:"Specialty Light · Degas 7–14d · Peak 14–60d (est.)" };

const getProfileForRoaster = (roasterName) => {
  if (!roasterName) return DEFAULT_PROFILE;
  // Exact match first
  if (ROASTER_PROFILES[roasterName]) return ROASTER_PROFILES[roasterName];
  // Case-insensitive / partial match
  const lower = roasterName.toLowerCase();
  for (const [key, val] of Object.entries(ROASTER_PROFILES)) {
    if (key.toLowerCase() === lower || lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return val;
  }
  return DEFAULT_PROFILE;
};

// ─── Initial Data ────────────────────────────────────────────────
const INITIAL_BEANS = [
  // ACTIVE
  { id:"ag-sanjose-1", roaster:"Apollon's Gold", name:"San Jose", origin:"Nicaragua", variety:"Pacamara", process:"Natural", roastDate:"2025-12-01", bagSize:100, status:"ACTIVE", atmosSlot:1, openDate:"2026-02-11", finishDate:null, bagNotes:"muscat / violet / mango", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Degas 35–45d · Peak 60–90d · 1:17.5–1:19 · 90–93°C" },
  { id:"ag-triangulo", roaster:"Apollon's Gold", name:"El Triangulo", origin:"Honduras", variety:"Geisha", process:"Washed", roastDate:"2025-12-07", bagSize:100, status:"ACTIVE", atmosSlot:2, openDate:"2026-02-18", finishDate:null, bagNotes:"yuzu / muscat / lavender", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Degas 35–45d · Peak 60–90d · 1:17.5–1:19 · 90–93°C" },
  // SEALED - Apollon's Gold
  { id:"ag-sanjose-2", roaster:"Apollon's Gold", name:"San Jose (extra)", origin:"Nicaragua", variety:"Pacamara", process:"Natural", roastDate:"2025-12-01", bagSize:100, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"muscat / violet / mango", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Degas 35–45d · Peak 60–90d" },
  { id:"ag-mulish", roaster:"Apollon's Gold", name:"Mulish", origin:"Ethiopia", variety:"Heirloom", process:"Washed", roastDate:"2025-12-07", bagSize:100, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"nectarine / honeysuckle / lavender", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Degas 35–45d · Peak 60–90d" },
  { id:"ag-arbegona", roaster:"Apollon's Gold", name:"Arbegona", origin:"Ethiopia", variety:"74158", process:"Natural", roastDate:"2025-12-06", bagSize:100, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"grapefruit / jasmine / strawberry", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Degas 35–45d · Peak 60–90d" },
  { id:"ag-chelbesa", roaster:"Apollon's Gold", name:"Chelbesa Natural", origin:"Ethiopia", variety:"Wolisho / Dega", process:"Natural", roastDate:"2025-12-06", bagSize:100, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"strawberry / mango / lychee", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Degas 35–45d · Peak 60–90d" },
  { id:"ag-sanisidro", roaster:"Apollon's Gold", name:"San Isidro Labrador", origin:"Costa Rica", variety:"Geisha Classic", process:"Washed", roastDate:"2025-12-12", bagSize:100, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"lychee / orange blossom / jasmine", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Degas 35–45d · Peak 60–90d" },
  { id:"ag-elinjerto", roaster:"Apollon's Gold", name:"El Injerto", origin:"Guatemala", variety:"Pacamara", process:"Washed", roastDate:"2025-12-15", bagSize:100, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"guava / orange / blackcurrant", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Degas 35–45d · Peak 60–90d" },
  // SEALED - Other roasters
  { id:"prodigal-fsa", roaster:"Prodigal", name:"Finca San Antonio", origin:"Colombia (Nariño)", variety:"", process:"Washed", roastDate:"2025-12-30", bagSize:150, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"peach / orange marmalade / floral", producer:"Nilson Lopez", degasMin:10, degasMax:14, peakStart:21, peakEnd:60, guidance:"Ultra-Light (Loring) · Degas 10–14d · Peak 21–60d" },
  { id:"leaves-kenya", roaster:"Leaves (Tokyo)", name:"Kenya Gichathaini AA", origin:"Kenya (Nyeri)", variety:"Ruiru 11, SL28, SL34, Batian", process:"Washed", roastDate:"2025-12-10", bagSize:100, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"pomelo / blackberry / hibiscus tea / sugar cane / smooth", producer:"Gichathaini Factory", degasMin:7, degasMax:14, peakStart:14, peakEnd:60, guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
  { id:"dg-cafen", roaster:"Dayglow", name:"Cafén", origin:"Colombia", variety:"Geisha", process:"Advanced Natural", roastDate:"2025-12-17", bagSize:100, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"banana candy cake / cherry / orange blossom florals", producer:"", degasMin:7, degasMax:14, peakStart:14, peakEnd:60, guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
  { id:"dg-elplacer", roaster:"Dayglow (Promethium)", name:"El Placer", origin:"Colombia", variety:"Geisha", process:"Anaerobic White Honey", roastDate:"2026-02-05", bagSize:100, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"gardenia flowers / Earl Grey tea / bergamot", producer:"Promethium Coffee", degasMin:7, degasMax:14, peakStart:14, peakEnd:60, guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
  { id:"koppi-fuente", roaster:"Koppi", name:"Finca La Fuente", origin:"Colombia (Tarqui, Huila)", variety:"Pink Bourbon", process:"Washed", roastDate:"2026-01-28", bagSize:100, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"tropical fruits / floral / complex", producer:"", degasMin:10, degasMax:14, peakStart:21, peakEnd:60, guidance:"Nordic Light · Degas 10–14d · Peak 21–60d · Best before May 28" },
  { id:"momos-wessi", roaster:"Momos Coffee", name:"Ethiopia Wessi Tima", origin:"Ethiopia", variety:"", process:"Anaerobic Honey (G1)", roastDate:"2026-02-10", bagSize:200, status:"SEALED", atmosSlot:null, openDate:null, finishDate:null, bagNotes:"(not logged)", producer:"", degasMin:7, degasMax:14, peakStart:14, peakEnd:60, guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
  // FINISHED
  { id:"ag-santateresa", roaster:"Apollon's Gold", name:"Santa Teresa 2000", origin:"Costa Rica", variety:"SL28", process:"White Honey", roastDate:"2025-12-06", bagSize:100, status:"FINISHED", atmosSlot:null, openDate:null, finishDate:"2026-02-18", bagNotes:"Japanese cherry / jasmine / grapefruit", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { id:"ag-wadijannat", roaster:"Apollon's Gold", name:"Wadi Jannat", origin:"Yemen", variety:"SL34", process:"Natural", roastDate:"2025-12-09", bagSize:100, status:"FINISHED", atmosSlot:null, openDate:null, finishDate:"2026-02-08", bagNotes:"white guava / lavender / vanilla", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { id:"ag-elora", roaster:"Apollon's Gold", name:"Elora", origin:"Ethiopia", variety:"74158", process:"Anaerobic Honey", roastDate:"2025-12-01", bagSize:100, status:"FINISHED", atmosSlot:null, openDate:null, finishDate:"2026-02-11", bagNotes:"starfruit / apricot / daisy", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { id:"ag-chelchele", roaster:"Apollon's Gold", name:"Chelchele", origin:"Ethiopia", variety:"74112 / 74110", process:"Natural", roastDate:"2025-11-26", bagSize:100, status:"FINISHED", atmosSlot:null, openDate:null, finishDate:"2026-02-11", bagNotes:"rambutan / mango / blueberry", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { id:"ag-santaana", roaster:"Apollon's Gold", name:"Santa Ana", origin:"Guatemala", variety:"Dillaalghe", process:"Washed", roastDate:"2025-12-06", bagSize:100, status:"FINISHED", atmosSlot:null, openDate:null, finishDate:"2026-02-02", bagNotes:"bergamot / jasmine / longan", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { id:"ag-lasdelicias", roaster:"Apollon's Gold", name:"Las Delicias Geisha", origin:"Nicaragua", variety:"Geisha", process:"Natural", roastDate:"2025-11-27", bagSize:100, status:"FINISHED", atmosSlot:null, openDate:null, finishDate:"2026-01-26", bagNotes:"kiwi / daisy / orange marmalade", producer:"", degasMin:35, degasMax:45, peakStart:60, peakEnd:90, guidance:"Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { id:"ws-layampata", roaster:"Wonderstate", name:"Layampata", origin:"Peru (Cusco)", variety:"Gesha Inka / SL9", process:"Washed", roastDate:"2025-12-01", bagSize:100, status:"FINISHED", atmosSlot:null, openDate:null, finishDate:"2026-01-20", bagNotes:"meyer lemon / white rose / riesling", producer:"", degasMin:7, degasMax:14, peakStart:14, peakEnd:60, guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
  { id:"dg-rareglow", roaster:"Dayglow", name:"Rareglow", origin:"Colombia", variety:"Geisha", process:"Advanced Natural", roastDate:"2025-12-17", bagSize:100, status:"FINISHED", atmosSlot:null, openDate:null, finishDate:"2026-01-15", bagNotes:"", producer:"", degasMin:7, degasMax:14, peakStart:14, peakEnd:60, guidance:"Specialty Light · Degas 7–14d · Peak 14–60d" },
];

const INITIAL_TASTINGS = [
  { id:"t1", beanId:"ag-chelchele", date:"2026-01-26", aroma:"Light floral", firstSip:"Bright, juicy", acidity:"Berry-like", sweetness:"Light sweetness", body:"Juicy, slightly creamy", finish:"Slightly drying", oneWord:"Solid", rating:null, notes:"Clean Ethiopian natural; likely to sweeten with a few days open", changeTomorrow:"" },
  { id:"t2", beanId:"ag-wadijannat", date:"2026-01-16", aroma:"", firstSip:"", acidity:"Apple-like", sweetness:"Vanilla", body:"Medium, round", finish:"", oneWord:"", rating:null, notes:"Funky; apple-like acidity; vanilla sweetness; round; medium body", changeTomorrow:"" },
];

// ─── Utilities ───────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];
const daysBetween = (a, b) => {
  if (!a || !b) return null;
  return Math.floor((new Date(b) - new Date(a)) / 86400000);
};
const daysSinceRoast = (roastDate) => daysBetween(roastDate, today());
const daysOpen = (openDate) => openDate ? daysBetween(openDate, today()) : null;

const getPeakStatus = (bean) => {
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

const getRecommendations = (beans, count = 3) => {
  const sealed = beans.filter(b => b.status === "SEALED");
  if (sealed.length === 0) return [];
  const active = beans.filter(b => b.status === "ACTIVE");
  const activeOrigins = active.map(b => b.origin);
  const activeProcesses = active.map(b => b.process);

  const scored = sealed.map(b => {
    let score = 0;
    const ps = getPeakStatus(b);
    // Strongly prefer beans in peak window
    if (ps.label.startsWith("In Peak")) score += 50;
    // Fading beans need to be opened ASAP
    if (ps.label.startsWith("Fading")) score += 60;
    // Past peak / stale — still better to open than let sit more
    if (ps.label.startsWith("Past Peak") || ps.label.startsWith("Stale")) score += 30;
    // Prefer beans approaching end of peak
    if (ps.days && ps.days > b.peakStart + (b.peakEnd - b.peakStart) * 0.5) score += 20;
    // Prefer beans past degassing
    if (ps.days >= b.degasMin) score += 10;
    // Prefer smaller bags
    if (b.bagSize <= 100) score += 10;
    if (b.bagSize <= 150) score += 5;
    // Variety bonus (different origin than active)
    if (!activeOrigins.includes(b.origin)) score += 15;
    if (!activeProcesses.includes(b.process)) score += 10;
    // Penalize if still degassing
    if (ps.days < b.degasMin) score -= 30;
    return { bean: b, score, peakStatus: ps };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.min(count, scored.length));
};

const uid = () => Math.random().toString(36).slice(2, 10);

// ─── Storage Hook ────────────────────────────────────────────────
const DATA_VERSION = 2; // bump this to reset stored data to INITIAL_BEANS

const useAppData = () => {
  const [beans, setBeans] = useState([]);
  const [tastings, setTastings] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimeout = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await window.storage.get("coffee-app-data");
        if (data && data.value) {
          const parsed = JSON.parse(data.value);
          if (parsed.version === DATA_VERSION) {
            setBeans(parsed.beans || []);
            setTastings(parsed.tastings || []);
          } else {
            // Version mismatch — reset to new defaults
            setBeans(INITIAL_BEANS);
            setTastings(parsed.tastings || INITIAL_TASTINGS);
            await window.storage.set("coffee-app-data", JSON.stringify({ version: DATA_VERSION, beans: INITIAL_BEANS, tastings: parsed.tastings || INITIAL_TASTINGS }));
          }
        } else {
          setBeans(INITIAL_BEANS);
          setTastings(INITIAL_TASTINGS);
          await window.storage.set("coffee-app-data", JSON.stringify({ version: DATA_VERSION, beans: INITIAL_BEANS, tastings: INITIAL_TASTINGS }));
        }
      } catch {
        setBeans(INITIAL_BEANS);
        setTastings(INITIAL_TASTINGS);
        try { await window.storage.set("coffee-app-data", JSON.stringify({ version: DATA_VERSION, beans: INITIAL_BEANS, tastings: INITIAL_TASTINGS })); } catch {}
      }
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback((newBeans, newTastings) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      try { await window.storage.set("coffee-app-data", JSON.stringify({ version: DATA_VERSION, beans: newBeans, tastings: newTastings })); } catch {}
    }, 300);
  }, []);

  const updateBeans = useCallback((fn) => {
    setBeans(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      persist(next, tastings);
      return next;
    });
  }, [tastings, persist]);

  const addTasting = useCallback((tasting) => {
    setTastings(prev => {
      const next = [tasting, ...prev];
      persist(beans, next);
      return next;
    });
  }, [beans, persist]);

  const updateTastings = useCallback((fn) => {
    setTastings(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      persist(beans, next);
      return next;
    });
  }, [beans, persist]);

  return { beans, tastings, updateBeans, addTasting, updateTastings, loaded };
};

// ─── Shared Components ───────────────────────────────────────────
const Badge = ({ children, color, bg }) => (
  <span style={{ background: bg, color, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap", letterSpacing: 0.3 }}>{children}</span>
);

const Btn = ({ children, onClick, variant = "primary", style = {}, disabled = false }) => {
  const base = { border: "none", borderRadius: 10, cursor: disabled ? "default" : "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, transition: "all 0.15s", opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 };
  const variants = {
    primary: { ...base, background: C.accent, color: "#fff", padding: "10px 18px" },
    secondary: { ...base, background: C.borderLight, color: C.text, padding: "10px 18px" },
    ghost: { ...base, background: "transparent", color: C.accent, padding: "8px 12px" },
    danger: { ...base, background: C.redBg, color: C.red, padding: "10px 18px" },
    small: { ...base, background: C.borderLight, color: C.text, padding: "6px 12px", fontSize: 12 },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...variants[variant], ...style }}>{children}</button>;
};

const BeanCard = ({ bean, actions, compact = false }) => {
  const ps = getPeakStatus(bean);
  const dOpen = daysOpen(bean.openDate);
  return (
    <div style={{ background: C.card, borderRadius: 14, padding: compact ? 14 : 18, border: `1px solid ${C.border}`, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: compact ? 16 : 18, color: C.text, lineHeight: 1.2 }}>{bean.name}</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{bean.roaster} · {bean.origin}</div>
        </div>
        <Badge color={ps.color} bg={ps.bg}>{ps.label}</Badge>
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, display: "flex", flexWrap: "wrap", gap: "4px 14px", marginBottom: bean.bagNotes ? 6 : 0 }}>
        <span>{bean.variety} · {bean.process}</span>
        {bean.bagSize && <span>{bean.bagSize}g</span>}
        {bean.roastDate && <span>Roasted {bean.roastDate}</span>}
        {ps.days !== undefined && <span>{ps.days}d post-roast</span>}
        {dOpen !== null && <span style={{ color: C.accent }}>{dOpen}d open</span>}
      </div>
      {bean.bagNotes && bean.bagNotes !== "(not logged)" && (
        <div style={{ fontSize: 12, color: C.accentLight, fontStyle: "italic", marginBottom: actions ? 10 : 0 }}>☕ {bean.bagNotes}</div>
      )}
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
};

// ─── Modal ───────────────────────────────────────────────────────
const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(44,24,16,0.4)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: C.bg, borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", width: "100%", maxWidth: 480, maxHeight: "80vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: C.text }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={20} color={C.textMuted}/></button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ─── Rotation Tab ────────────────────────────────────────────────
const RotationTab = ({ beans, updateBeans, onOpenBean }) => {
  const [showRec, setShowRec] = useState(false);
  const [recBlurb, setRecBlurb] = useState("");
  const [recLoading, setRecLoading] = useState(false);
  const [slotPicker, setSlotPicker] = useState(null); // { beanId } when picking slot
  const slots = [1, 2, 3].map(n => beans.find(b => b.status === "ACTIVE" && b.atmosSlot === n) || null);
  const recs = getRecommendations(beans);
  const emptySlots = [1, 2, 3].filter(n => !beans.find(b => b.status === "ACTIVE" && b.atmosSlot === n));

  const finishBean = (bean) => {
    updateBeans(prev => prev.map(b => b.id === bean.id ? { ...b, status: "FINISHED", finishDate: today(), atmosSlot: null } : b));
  };

  const openBeanInSlot = (beanId, slot) => {
    updateBeans(prev => prev.map(b => b.id === beanId ? { ...b, status: "ACTIVE", atmosSlot: slot, openDate: today() } : b));
    setSlotPicker(null);
  };

  const handleOpenRec = (beanId) => {
    if (emptySlots.length === 0) return;
    if (emptySlots.length === 1) {
      openBeanInSlot(beanId, emptySlots[0]);
    } else {
      setSlotPicker({ beanId });
    }
  };

  const fetchRecBlurb = async () => {
    if (recs.length === 0) return;
    setRecLoading(true);
    setRecBlurb("");
    try {
      const activeDesc = slots.filter(Boolean).map(b => {
        const ps = getPeakStatus(b);
        return `Atmos #${b.atmosSlot}: ${b.roaster} ${b.name} (${b.origin}, ${b.variety} ${b.process}) — ${ps.days}d post-roast, ${ps.label}`;
      }).join("\n");

      const recDesc = recs.map((r, i) => {
        return `${i+1}. ${r.bean.roaster} ${r.bean.name} (${r.bean.origin}, ${r.bean.variety} ${r.bean.process}) — ${r.peakStatus.days}d post-roast, ${r.peakStatus.label}, ${r.bean.bagSize}g. Notes: ${r.bean.bagNotes || "none"}`;
      }).join("\n");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 400,
          system: `You're a concise specialty coffee advisor. Given a current rotation and candidate beans, write a brief 2-4 sentence analysis of why each candidate would complement the rotation. Consider: timing urgency (fading beans first), flavor variety (different origins/processes from what's active), and peak window. Be warm and opinionated. No headers or bullets — just a flowing paragraph.`,
          messages: [{ role: "user", content: `Current rotation:\n${activeDesc || "(empty)"}\n\nTop candidates:\n${recDesc}\n\nWhy would each be a good pick?` }],
        }),
      });
      const data = await response.json();
      setRecBlurb(data.content?.map(c => c.text || "").join("") || "");
    } catch {
      setRecBlurb("Couldn't load analysis — but the picks below are sorted by urgency and variety.");
    }
    setRecLoading(false);
  };

  const toggleRec = () => {
    const next = !showRec;
    setShowRec(next);
    if (next && !recBlurb && !recLoading) fetchRecBlurb();
  };

  return (
    <div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.text, marginBottom: 4 }}>Active Rotation</div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>Your 3 Atmos canisters</div>
      {slots.map((bean, i) => (
        <div key={i}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.accentLight, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Atmos #{i + 1}</div>
          {bean ? (
            <BeanCard bean={bean} actions={
              <>
                <Btn variant="danger" onClick={() => finishBean(bean)}><Check size={14}/> Finish Bag</Btn>
              </>
            }/>
          ) : (
            <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `2px dashed ${C.border}`, marginBottom: 10, textAlign: "center" }}>
              <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 10 }}>Empty slot</div>
              <Btn variant="primary" onClick={() => onOpenBean(i + 1)}><Plus size={14}/> Open a Bean</Btn>
            </div>
          )}
        </div>
      ))}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Btn variant="ghost" onClick={toggleRec} style={{ fontSize: 14 }}>
            <Star size={14}/> {showRec ? "Hide" : "Show"} Recommendations
          </Btn>
          {showRec && (
            <div style={{ marginTop: 10 }}>
              {/* AI Blurb */}
              <div style={{ background: C.amberBg, borderRadius: 14, padding: 16, border: `1px solid #E8D5A0`, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  <Star size={12} style={{ verticalAlign: -1, marginRight: 4 }}/>What to Open Next
                </div>
                {recLoading ? (
                  <div style={{ fontSize: 13, color: C.textMuted, fontStyle: "italic" }}>Analyzing your rotation...</div>
                ) : recBlurb ? (
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{recBlurb}</div>
                ) : null}
              </div>

              {/* Recommendation Cards */}
              {recs.map((r, idx) => (
                <div key={r.bean.id} style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, background: C.amberBg, padding: "2px 7px", borderRadius: 6 }}>#{idx + 1}</span>
                        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 17, color: C.text }}>{r.bean.name}</div>
                      </div>
                      <div style={{ fontSize: 13, color: C.textMuted }}>{r.bean.roaster} · {r.bean.origin} · {r.bean.variety} {r.bean.process}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <Badge color={r.peakStatus.color} bg={r.peakStatus.bg}>{r.peakStatus.label}</Badge>
                        <Badge color={C.textMuted} bg={C.bg}>{r.bean.bagSize}g</Badge>
                        <Badge color={C.textMuted} bg={C.bg}>{r.peakStatus.days}d post-roast</Badge>
                      </div>
                      {r.bean.bagNotes && r.bean.bagNotes !== "(not logged)" && (
                        <div style={{ fontSize: 12, color: C.accentLight, fontStyle: "italic", marginTop: 6 }}>☕ {r.bean.bagNotes}</div>
                      )}
                    </div>
                  </div>

                  {/* Open button / slot picker */}
                  {emptySlots.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {slotPicker?.beanId === r.bean.id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: C.textMuted }}>Which canister?</span>
                          {emptySlots.map(s => (
                            <Btn key={s} variant="primary" onClick={() => openBeanInSlot(r.bean.id, s)} style={{ fontSize: 12, padding: "5px 12px" }}>
                              Atmos #{s}
                            </Btn>
                          ))}
                          <Btn variant="ghost" onClick={() => setSlotPicker(null)} style={{ fontSize: 12, padding: "5px 8px" }}><X size={12}/></Btn>
                        </div>
                      ) : (
                        <Btn variant="small" onClick={() => handleOpenRec(r.bean.id)}>
                          <Plus size={12}/> Open This Bean
                        </Btn>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Inventory Tab ───────────────────────────────────────────────
const InventoryTab = ({ beans, onOpenBean, updateBeans }) => {
  const sealed = beans.filter(b => b.status === "SEALED");
  const emptySlots = [1, 2, 3].filter(n => !beans.find(b => b.status === "ACTIVE" && b.atmosSlot === n));
  const [showAdd, setShowAdd] = useState(false);
  const grouped = {};
  sealed.forEach(b => { (grouped[b.roaster] = grouped[b.roaster] || []).push(b); });

  // Sort within groups by peak status priority
  Object.keys(grouped).forEach(k => {
    grouped[k].sort((a, b) => {
      const pa = getPeakStatus(a), pb = getPeakStatus(b);
      const order = { "Past Peak": 0, "Fading": 0, "Stale": 0, "In Peak": 1, "Resting": 2, "Degassing": 3, "Unknown": 4 };
      const catA = pa.label.startsWith("In Peak") ? "In Peak" : pa.label.split(" (")[0].split(" +")[0];
      const catB = pb.label.startsWith("In Peak") ? "In Peak" : pb.label.split(" (")[0].split(" +")[0];
      return (order[catA] ?? 4) - (order[catB] ?? 4);
    });
  });

  const handleAddBean = (newBean) => {
    updateBeans(prev => [...prev, newBean]);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.text }}>Sealed Inventory</div>
        <Btn variant="primary" onClick={() => setShowAdd(true)} style={{ padding: "8px 14px" }}><Plus size={14}/> Add Bean</Btn>
      </div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>{sealed.length} bags waiting · {emptySlots.length} empty slot{emptySlots.length !== 1 ? "s" : ""}</div>
      {Object.entries(grouped).map(([roaster, rBeans]) => (
        <div key={roaster} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accentLight, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>{roaster}</div>
          {rBeans.map(bean => (
            <BeanCard key={bean.id} bean={bean} compact actions={
              emptySlots.length > 0 ? <Btn variant="small" onClick={() => onOpenBean(emptySlots[0], bean.id)}><Plus size={12}/> Open</Btn> : null
            }/>
          ))}
        </div>
      ))}
      {sealed.length === 0 && <div style={{ textAlign: "center", color: C.textMuted, padding: 40 }}>No sealed beans. Time to order!</div>}
      <AddBeanForm open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAddBean}/>
    </div>
  );
};

// ─── Tasting Tab ─────────────────────────────────────────────────
const StarRating = ({ value, onChange, size = 22 }) => {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n}
          onClick={() => onChange?.(value === n ? 0 : n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{ cursor: onChange ? "pointer" : "default", fontSize: size, lineHeight: 1, color: n <= (hover || value) ? "#D4A053" : C.borderLight, transition: "color 0.1s" }}
        >{n <= (hover || value) ? "★" : "☆"}</span>
      ))}
    </div>
  );
};

const TastingTab = ({ beans, tastings, addTasting, updateTastings }) => {
  const active = beans.filter(b => b.status === "ACTIVE");
  const [sel, setSel] = useState(active[0]?.id || "");
  const emptyForm = { aroma: "", firstSip: "", acidity: "", sweetness: "", body: "", finish: "", oneWord: "", rating: 0, notes: "", changeTomorrow: "" };
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState("list"); // "list" | "form" | "chat"
  const [sortBy, setSortBy] = useState("rating");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  // Chat tasting state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatExtracted, setChatExtracted] = useState(null);
  const chatScrollRef = useRef(null);

  const tastingFields = { aroma: "Aroma", firstSip: "First sip", acidity: "Acidity", sweetness: "Sweetness", body: "Body", finish: "Finish", oneWord: "One-word score", notes: "Notes", changeTomorrow: "Change tomorrow?" };
  const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: "'DM Sans', sans-serif", fontSize: 14, background: C.bg, color: C.text, boxSizing: "border-box" };

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  const handleSubmit = () => {
    if (!sel) return;
    addTasting({ id: uid(), beanId: sel, date: today(), ...form, rating: form.rating || null });
    setForm(emptyForm);
    setMode("list");
  };

  const getBeanName = (id) => { const b = beans.find(x => x.id === id); return b ? `${b.name} (${b.roaster})` : "Unknown"; };

  const sorted = [...tastings].sort((a, b) => {
    if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
    return b.date > a.date ? 1 : -1;
  });

  // Inline star update
  const updateRating = (id, rating) => {
    updateTastings(prev => prev.map(t => t.id === id ? { ...t, rating } : t));
  };

  // Full edit
  const startEdit = (t) => { setEditingId(t.id); setEditForm({ ...t }); };
  const saveEdit = () => {
    updateTastings(prev => prev.map(t => t.id === editingId ? { ...editForm } : t));
    setEditingId(null); setEditForm(null);
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  // ─── Chat Tasting Flow ──────────────
  const startChat = () => {
    const beanName = sel ? getBeanName(sel) : "your coffee";
    setMode("chat");
    setChatMessages([{ role: "assistant", content: `Let's taste ${beanName}! ☕ I'll walk you through it step by step.\n\n**Step 1 — Smell it first.** Bring the cup to your nose and breathe in slowly. What do you notice?\n\n🍓 Fruity — berries, citrus, tropical?\n🌸 Floral — jasmine, rose, tea-like?\n🍫 Sweet — chocolate, caramel, honey?\n🌰 Nutty or earthy?\n🧀 Funky or fermented?\n\nOr just describe it in your own words — there's no wrong answer!` }]);
    setChatExtracted(null);
  };

  const buildChatSystem = () => {
    const beanName = sel ? getBeanName(sel) : "unknown bean";
    return `You are a patient, encouraging coffee tasting COACH helping a novice taster log a tasting for: ${beanName}.

CRITICAL RULES:
- Tal is learning to taste. NEVER ask vague questions like "how is it?" or "what do you notice?"
- ALWAYS give specific instructions: what to do physically, what to pay attention to, and multiple-choice options to pick from
- Teach tasting vocabulary naturally by labeling what he describes (e.g. "That funky smell? That's classic natural process fermentation!")
- Be warm, encouraging, and brief (2-3 sentences + options per turn)

GUIDED FLOW (follow this order across your turns):
1. AROMA — already asked in first message. When he responds, validate and label what he described, then move to step 2.
2. FIRST SIP — "Take a sip and let it sit on your tongue for a sec. Is it: bright/tangy like citrus? Smooth and round? Sharp/sour? Sweet right away?"
3. BODY & FINISH — "How heavy does it feel in your mouth? Light like tea, medium like juice, or thick like milk? And after you swallow — does the taste disappear quickly or linger?"
4. SWEETNESS — "How sweet is it? Barely there, noticeable, or really present?"
5. ONE WORD — "If you had to describe this whole cup in one word, what would it be?"
6. BREW DIAL-IN — Don't ask "what would you change?" Instead, run a quick diagnostic:
   "Quick check — was the cup: (a) too sour/bright, (b) too bitter/harsh, (c) too weak/watery, or (d) pretty good as-is?"
   Then TELL them the fix: sour→finer grind or hotter water, bitter→coarser or cooler, weak→more coffee, good→keep it.

After covering these areas (typically 3-4 exchanges), end your message with EXACTLY:

---EXTRACT---
{"aroma":"...","firstSip":"...","acidity":"...","sweetness":"...","body":"...","finish":"...","oneWord":"...","notes":"...","changeTomorrow":"...","rating":0}
---END---

For rating, suggest 1-5 stars based on enthusiasm. 0 if unclear.
Keep values concise (2-8 words). Use "" for fields not discussed.`;
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: "user", content: chatInput.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const history = [...chatMessages.filter(m => m.role !== "system"), userMsg].slice(-10);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, system: buildChatSystem(), messages: history }),
      });
      const data = await response.json();
      const text = data.content?.map(c => c.text || "").join("") || "Sorry, something went wrong.";

      const extractMatch = text.match(/---EXTRACT---\s*([\s\S]*?)\s*---END---/);
      if (extractMatch) {
        try {
          const extracted = JSON.parse(extractMatch[1].trim());
          setChatExtracted(extracted);
          const cleanText = text.replace(/---EXTRACT---[\s\S]*?---END---/, "").trim();
          setChatMessages(prev => [...prev, { role: "assistant", content: cleanText || "Great session! Review below and save when ready." }]);
        } catch {
          setChatMessages(prev => [...prev, { role: "assistant", content: text.replace(/---EXTRACT---[\s\S]*?---END---/, "").trim() }]);
        }
      } else {
        setChatMessages(prev => [...prev, { role: "assistant", content: text }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Couldn't reach the AI. Try again." }]);
    }
    setChatLoading(false);
  };

  const saveChatTasting = () => {
    if (!chatExtracted || !sel) return;
    addTasting({ id: uid(), beanId: sel, date: today(), ...chatExtracted, rating: chatExtracted.rating || null });
    setChatExtracted(null); setChatMessages([]); setMode("list");
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.text }}>Tasting Log</div>
          <div style={{ fontSize: 13, color: C.textMuted }}>{tastings.length} tastings logged</div>
        </div>
        {mode === "list" ? (
          <div style={{ display: "flex", gap: 6 }}>
            <Btn variant="ghost" onClick={startChat} style={{ fontSize: 12, padding: "6px 10px" }}><MessageCircle size={13}/> Chat It</Btn>
            <Btn variant="primary" onClick={() => setMode("form")} style={{ fontSize: 12, padding: "6px 10px" }}><Plus size={13}/> Log</Btn>
          </div>
        ) : (
          <Btn variant="ghost" onClick={() => { setMode("list"); setChatMessages([]); setChatExtracted(null); }}>Cancel</Btn>
        )}
      </div>

      {/* Bean selector for form/chat */}
      {(mode === "form" || mode === "chat") && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Bean</label>
          <select value={sel} onChange={e => setSel(e.target.value)} style={inputStyle}>
            {active.map(b => <option key={b.id} value={b.id}>{b.name} (#{b.atmosSlot})</option>)}
          </select>
        </div>
      )}

      {/* ─── Form Mode ─── */}
      {mode === "form" && (
        <div style={{ background: C.card, borderRadius: 14, padding: 18, border: `1px solid ${C.border}`, marginBottom: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 6 }}>Rating</label>
            <StarRating value={form.rating} onChange={r => setForm(p => ({ ...p, rating: r }))} size={28}/>
          </div>
          {Object.entries(tastingFields).map(([key, label]) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>{label}</label>
              {key === "notes" ? (
                <textarea value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "vertical" }}/>
              ) : (
                <input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={inputStyle}/>
              )}
            </div>
          ))}
          <Btn variant="primary" onClick={handleSubmit} style={{ width: "100%", justifyContent: "center", marginTop: 4 }}><Check size={14}/> Save Tasting</Btn>
        </div>
      )}

      {/* ─── Chat Mode ─── */}
      {mode === "chat" && (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, marginBottom: 20, overflow: "hidden" }}>
          <div ref={chatScrollRef} style={{ maxHeight: 320, overflowY: "auto", padding: 16 }}>
            {chatMessages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                <div style={{
                  maxWidth: "80%", padding: "10px 14px", borderRadius: 14, fontSize: 14, lineHeight: 1.5,
                  background: m.role === "user" ? C.accent : C.bg, color: m.role === "user" ? "#fff" : C.text,
                  borderBottomRightRadius: m.role === "user" ? 4 : 14, borderBottomLeftRadius: m.role === "user" ? 14 : 4,
                  whiteSpace: "pre-wrap"
                }}>{m.content}</div>
              </div>
            ))}
            {chatLoading && <div style={{ fontSize: 13, color: C.textMuted, padding: "4px 0" }}>Thinking...</div>}
          </div>

          {chatExtracted && (
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, background: C.greenBg }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.green, marginBottom: 8 }}>✓ Tasting captured — review & save</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <StarRating value={chatExtracted.rating || 0} onChange={r => setChatExtracted(p => ({ ...p, rating: r }))} size={22}/>
                {chatExtracted.oneWord && <span style={{ fontSize: 13, color: C.text }}>"{chatExtracted.oneWord}"</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
                {chatExtracted.aroma && <span>Aroma: {chatExtracted.aroma}</span>}
                {chatExtracted.acidity && <span>Acidity: {chatExtracted.acidity}</span>}
                {chatExtracted.body && <span>Body: {chatExtracted.body}</span>}
                {chatExtracted.finish && <span>Finish: {chatExtracted.finish}</span>}
              </div>
              {chatExtracted.notes && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>{chatExtracted.notes}</div>}
              <Btn variant="primary" onClick={saveChatTasting} style={{ width: "100%", justifyContent: "center" }}><Check size={14}/> Save Tasting</Btn>
            </div>
          )}

          {!chatExtracted && (
            <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: `1px solid ${C.border}` }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Describe your cup..."
                onKeyDown={e => e.key === "Enter" && sendChatMessage()} style={{ ...inputStyle, flex: 1 }}/>
              <Btn variant="primary" onClick={sendChatMessage} disabled={chatLoading} style={{ padding: "8px 12px" }}><Send size={14}/></Btn>
            </div>
          )}
        </div>
      )}

      {/* ─── Sort Controls ─── */}
      {mode === "list" && tastings.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[["rating","★ Top Rated"],["date","📅 Recent"]].map(([k,l]) => (
            <Btn key={k} variant={sortBy === k ? "primary" : "ghost"} onClick={() => setSortBy(k)} style={{ fontSize: 12, padding: "5px 12px" }}>{l}</Btn>
          ))}
        </div>
      )}

      {/* ─── Tasting Cards ─── */}
      {mode === "list" && sorted.map(t => {
        const isEditing = editingId === t.id;

        if (isEditing && editForm) return (
          <div key={t.id} style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.accent}`, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, color: C.text }}>{getBeanName(t.beanId)}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn variant="primary" onClick={saveEdit} style={{ fontSize: 11, padding: "4px 10px" }}><Check size={12}/> Save</Btn>
                <Btn variant="ghost" onClick={cancelEdit} style={{ fontSize: 11, padding: "4px 10px" }}>Cancel</Btn>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Rating</label>
              <StarRating value={editForm.rating || 0} onChange={r => setEditForm(p => ({ ...p, rating: r }))} size={26}/>
            </div>
            {Object.entries(tastingFields).map(([key, label]) => (
              <div key={key} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 3 }}>{label}</label>
                {key === "notes" ? (
                  <textarea value={editForm[key] || ""} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} rows={2} style={{ ...inputStyle, fontSize: 13, resize: "vertical" }}/>
                ) : (
                  <input value={editForm[key] || ""} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} style={{ ...inputStyle, fontSize: 13 }}/>
                )}
              </div>
            ))}
          </div>
        );

        return (
          <div key={t.id} style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, color: C.text }}>{getBeanName(t.beanId)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: C.textMuted }}>{t.date}</span>
                <span onClick={() => startEdit(t)} style={{ cursor: "pointer", color: C.textMuted, padding: 2 }}><Pencil size={13}/></span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <StarRating value={t.rating || 0} onChange={r => updateRating(t.id, r)} size={18}/>
              {t.oneWord && <span style={{ fontSize: 12, color: C.textMuted }}>"{t.oneWord}"</span>}
            </div>
            {t.notes && <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{t.notes}</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", marginTop: 6, fontSize: 12, color: C.textLight }}>
              {t.aroma && <span>Aroma: {t.aroma}</span>}
              {t.acidity && <span>Acidity: {t.acidity}</span>}
              {t.body && <span>Body: {t.body}</span>}
              {t.finish && <span>Finish: {t.finish}</span>}
            </div>
          </div>
        );
      })}
      {mode === "list" && tastings.length === 0 && <div style={{ textAlign: "center", color: C.textMuted, padding: 40 }}>No tastings yet. Brew something!</div>}
    </div>
  );
};

// ─── AI Chat Tab ─────────────────────────────────────────────────
const ChatTab = ({ beans, tastings }) => {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hey Tal! Ask me anything about your rotation, inventory, or what to brew next. I can see your full coffee state." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const buildContext = () => {
    const active = beans.filter(b => b.status === "ACTIVE").map(b => {
      const ps = getPeakStatus(b);
      return `  Atmos #${b.atmosSlot}: ${b.roaster} — ${b.name} (${b.origin}) | ${b.variety} ${b.process} | ${ps.days}d post-roast (${ps.label}) | Opened: ${b.openDate} (${daysOpen(b.openDate)}d ago) | Notes: ${b.bagNotes}`;
    }).join("\n");

    const sealed = beans.filter(b => b.status === "SEALED").map(b => {
      const ps = getPeakStatus(b);
      return `  ${b.roaster} — ${b.name} (${b.origin}) | ${b.variety} ${b.process} | ${b.bagSize}g | ${ps.days}d post-roast (${ps.label}) | Notes: ${b.bagNotes}`;
    }).join("\n");

    const finished = beans.filter(b => b.status === "FINISHED").slice(0, 5).map(b => `  ${b.roaster} — ${b.name} (${b.origin}) | Finished: ${b.finishDate}`).join("\n");

    const recentTastings = tastings.slice(0, 5).map(t => {
      const bean = beans.find(x => x.id === t.beanId);
      return `  ${t.date}: ${bean?.name || "?"} — ${t.oneWord || ""} ${t.rating ? "★".repeat(t.rating) : ""} — ${t.notes || ""}`;
    }).join("\n");

    return `You are Tal's coffee assistant. You have access to his REAL, CURRENT coffee data. NEVER suggest beans that are already finished or opened. Only recommend from SEALED inventory.

TODAY: ${today()}

ACTIVE ROTATION (Atmos canisters):
${active || "  (none)"}

SEALED INVENTORY:
${sealed || "  (none)"}

RECENTLY FINISHED:
${finished || "  (none)"}

RECENT TASTINGS:
${recentTastings || "  (none)"}

ROTATION RULES:
- Keep 3 beans active (Atmos #1–#3)
- Priority: (1) Already opened, (2) In/approaching peak window, (3) Smaller bags first
- Apollon's Gold: Degas 35–45 days, Peak 60–90 days post-roast, 1:17.5–1:19 ratio, 90–93°C
- Other roasters without guidance: rest 7–14 days, general peak 14–60 days
- After opening (Atmos): finish within 2–4 weeks; 100g bags within 7–14 days
- Bag-stated guidance always overrides defaults

Be concise, warm, and opinionated. If recommending a bean, explain WHY based on timing and variety.`;
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = [...messages.filter(m => m.role !== "system"), userMsg].slice(-10);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildContext(),
          messages: history,
        }),
      });
      const data = await response.json();
      const text = data.content?.map(c => c.text || "").join("") || "Sorry, something went wrong.";
      setMessages(prev => [...prev, { role: "assistant", content: text }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Couldn't reach the AI. Try again in a sec." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)", minHeight: 400 }}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.text, marginBottom: 4 }}>Coffee Chat</div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>AI with your real inventory data</div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", background: m.role === "user" ? C.accent : C.card, color: m.role === "user" ? "#fff" : C.text, borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 14px", fontSize: 14, lineHeight: 1.5, border: m.role === "user" ? "none" : `1px solid ${C.border}`, whiteSpace: "pre-wrap" }}>
            {m.content}
          </div>
        ))}
        {loading && <div style={{ alignSelf: "flex-start", background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px 16px 16px 4px", padding: "10px 14px", fontSize: 14, color: C.textMuted }}>Thinking...</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="What should I open next?" style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.border}`, fontFamily: "'DM Sans', sans-serif", fontSize: 14, background: C.card, color: C.text, outline: "none" }}/>
        <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 12, width: 44, height: 44, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: loading || !input.trim() ? 0.5 : 1 }}><Send size={18}/></button>
      </div>
    </div>
  );
};

// ─── Archive Tab ─────────────────────────────────────────────────
const ArchiveTab = ({ beans }) => {
  const finished = beans.filter(b => b.status === "FINISHED").sort((a, b) => (b.finishDate || "").localeCompare(a.finishDate || ""));
  return (
    <div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: C.text, marginBottom: 4 }}>Archive</div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>{finished.length} beans finished</div>
      {finished.map(bean => (
        <div key={bean.id} style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, marginBottom: 10, opacity: 0.85 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, color: C.text }}>{bean.name}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{bean.roaster} · {bean.origin} · {bean.variety} {bean.process}</div>
            </div>
            {bean.finishDate && <span style={{ fontSize: 11, color: C.textLight }}>Finished {bean.finishDate}</span>}
          </div>
          {bean.bagNotes && bean.bagNotes !== "" && <div style={{ fontSize: 12, color: C.textLight, fontStyle: "italic", marginTop: 4 }}>☕ {bean.bagNotes}</div>}
        </div>
      ))}
    </div>
  );
};

// ─── Add Bean Form (Photo-First) ─────────────────────────────────
const AddBeanForm = ({ open, onClose, onAdd }) => {
  const empty = { roaster:"", name:"", origin:"", variety:"", process:"Washed", roastDate:today(), bagSize:100, bagNotes:"", producer:"" };
  const [f, setF] = useState(empty);
  const [profileInfo, setProfileInfo] = useState(null);
  const [step, setStep] = useState("photo"); // "photo" | "scanning" | "review"
  const [scanError, setScanError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (f.roaster.trim()) {
      const p = getProfileForRoaster(f.roaster);
      setProfileInfo({ ...p, known: p !== DEFAULT_PROFILE });
    } else {
      setProfileInfo(null);
    }
  }, [f.roaster]);

  const reset = () => { setF(empty); setStep("photo"); setScanError(null); setPreviewUrl(null); setProfileInfo(null); };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setStep("scanning");

    // Preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    // Convert to base64
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = () => rej(new Error("Failed to read file"));
      r.readAsDataURL(file);
    });

    const mediaType = file.type || "image/jpeg";

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: `You are reading a specialty coffee bag label. Extract all info you can find and respond ONLY with a JSON object (no markdown, no backticks, no explanation). Use these exact keys:

{
  "roaster": "roaster/brand name",
  "name": "coffee name or lot name",
  "origin": "country and region if shown",
  "variety": "coffee variety/cultivar if shown",
  "process": "processing method (Washed, Natural, Honey, Anaerobic Honey, Anaerobic Natural, White Honey, Advanced Natural, or Other)",
  "roastDate": "YYYY-MM-DD if shown, otherwise empty string",
  "bagSize": number in grams (default 100 if not shown),
  "bagNotes": "tasting notes from the bag, separated by ' / '",
  "producer": "farm or producer name if shown"
}

If a field is not visible on the label, use an empty string (or 100 for bagSize). For roastDate, look for "roasted on", "roast date", or any date that appears to be a roast date — convert to YYYY-MM-DD format. For best-before dates, do NOT use those as roast date.` }
            ]
          }]
        })
      });

      const data = await resp.json();
      const text = data.content?.map(c => c.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      setF({
        roaster: parsed.roaster || "",
        name: parsed.name || "",
        origin: parsed.origin || "",
        variety: parsed.variety || "",
        process: parsed.process || "Washed",
        roastDate: parsed.roastDate || today(),
        bagSize: parsed.bagSize || 100,
        bagNotes: parsed.bagNotes || "",
        producer: parsed.producer || "",
      });
      setStep("review");
    } catch (err) {
      console.error("Scan error:", err);
      setScanError("Couldn't read the label. You can fill in details manually.");
      setStep("review");
    }
  };

  const handleSave = () => {
    if (!f.roaster.trim() || !f.name.trim()) return;
    const p = getProfileForRoaster(f.roaster);

    onAdd({
      id: uid(),
      roaster: f.roaster.trim(),
      name: f.name.trim(),
      origin: f.origin.trim(),
      variety: f.variety.trim(),
      process: f.process,
      roastDate: f.roastDate,
      bagSize: Number(f.bagSize) || 100,
      status: "SEALED",
      atmosSlot: null,
      openDate: null,
      finishDate: null,
      bagNotes: f.bagNotes.trim(),
      producer: f.producer.trim(),
      degasMin: p.degasMin,
      degasMax: p.degasMax,
      peakStart: p.peakStart,
      peakEnd: p.peakEnd,
      guidance: p.guidance,
    });
    reset();
    onClose();
  };

  const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: "'DM Sans', sans-serif", fontSize: 14, background: C.bg, color: C.text, boxSizing: "border-box" };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 4, display: "block" };
  const rowStyle = { marginBottom: 12 };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Add New Bean">
      {/* STEP 1: Photo upload */}
      {step === "photo" && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }}/>
          <div onClick={() => fileRef.current?.click()} style={{ cursor: "pointer", background: C.card, border: `2px dashed ${C.border}`, borderRadius: 16, padding: "40px 20px", marginBottom: 16, transition: "border-color 0.15s" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📸</div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: C.text, marginBottom: 4 }}>Snap the bag label</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>Take a photo or upload an image</div>
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>— or —</div>
          <Btn variant="ghost" onClick={() => setStep("review")} style={{ margin: "0 auto" }}>Type it manually</Btn>
        </div>
      )}

      {/* STEP 2: Scanning */}
      {step === "scanning" && (
        <div style={{ textAlign: "center", padding: "30px 0" }}>
          {previewUrl && <img src={previewUrl} alt="bag" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 12, marginBottom: 16, opacity: 0.7 }}/>}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ width: 16, height: 16, border: `2px solid ${C.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
            <span style={{ fontSize: 14, color: C.textMuted }}>Reading label...</span>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* STEP 3: Review / Edit */}
      {step === "review" && (<>
        {previewUrl && (
          <div style={{ marginBottom: 12, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
            <img src={previewUrl} alt="bag" style={{ width: "100%", maxHeight: 140, objectFit: "cover" }}/>
          </div>
        )}
        {scanError && (
          <div style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, background: C.amberBg, color: C.amber, marginBottom: 12 }}>
            ⚠ {scanError}
          </div>
        )}
        <div style={rowStyle}>
          <label style={labelStyle}>Roaster *</label>
          <input value={f.roaster} onChange={e => setF(p => ({ ...p, roaster: e.target.value }))} placeholder="e.g. Apollon's Gold, Koppi..." style={inputStyle}/>
          {profileInfo && (
            <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 8, fontSize: 12, background: profileInfo.known ? C.greenBg : C.amberBg, color: profileInfo.known ? C.green : C.amber }}>
              {profileInfo.known ? "✓ " : "⚠ Unknown roaster — "}
              Degas {profileInfo.degasMin}–{profileInfo.degasMax}d · Peak {profileInfo.peakStart}–{profileInfo.peakEnd}d
              {!profileInfo.known && " (est.)"}
            </div>
          )}
        </div>
        <div style={rowStyle}>
          <label style={labelStyle}>Coffee Name *</label>
          <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Finca San Antonio" style={inputStyle}/>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, ...rowStyle }}>
          <div>
            <label style={labelStyle}>Origin</label>
            <input value={f.origin} onChange={e => setF(p => ({ ...p, origin: e.target.value }))} placeholder="e.g. Colombia" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Variety</label>
            <input value={f.variety} onChange={e => setF(p => ({ ...p, variety: e.target.value }))} placeholder="e.g. Geisha" style={inputStyle}/>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, ...rowStyle }}>
          <div>
            <label style={labelStyle}>Process</label>
            <select value={f.process} onChange={e => setF(p => ({ ...p, process: e.target.value }))} style={inputStyle}>
              {["Washed", "Natural", "Anaerobic Honey", "Anaerobic Natural", "White Honey", "Advanced Natural", "Honey", "Other"].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Bag Size (g)</label>
            <input value={f.bagSize} onChange={e => setF(p => ({ ...p, bagSize: e.target.value }))} type="number" min={1} style={inputStyle}/>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, ...rowStyle }}>
          <div>
            <label style={labelStyle}>Roast Date</label>
            <input value={f.roastDate} onChange={e => setF(p => ({ ...p, roastDate: e.target.value }))} type="date" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Producer</label>
            <input value={f.producer} onChange={e => setF(p => ({ ...p, producer: e.target.value }))} placeholder="Optional" style={inputStyle}/>
          </div>
        </div>
        <div style={rowStyle}>
          <label style={labelStyle}>Tasting Notes</label>
          <input value={f.bagNotes} onChange={e => setF(p => ({ ...p, bagNotes: e.target.value }))} placeholder="e.g. peach / floral / citrus" style={inputStyle}/>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" onClick={() => { reset(); }} style={{ flex: 0 }}>
            <RotateCcw size={14}/> Rescan
          </Btn>
          <Btn variant="primary" onClick={handleSave} style={{ flex: 1, justifyContent: "center", opacity: (f.roaster.trim() && f.name.trim()) ? 1 : 0.4 }}>
            <Plus size={14}/> Add to Inventory
          </Btn>
        </div>
      </>)}
    </Modal>
  );
};

// ─── Open Bean Modal ─────────────────────────────────────────────
const OpenBeanFlow = ({ open, onClose, beans, updateBeans, targetSlot }) => {
  const [selectedId, setSelectedId] = useState(null);
  const sealed = beans.filter(b => b.status === "SEALED");
  const emptySlots = [1, 2, 3].filter(n => !beans.find(b => b.status === "ACTIVE" && b.atmosSlot === n));

  const doOpen = () => {
    if (!selectedId) return;
    const slot = targetSlot || emptySlots[0];
    if (!slot) return;
    updateBeans(prev => prev.map(b => b.id === selectedId ? { ...b, status: "ACTIVE", atmosSlot: slot, openDate: today() } : b));
    onClose();
    setSelectedId(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Open a Bean">
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>
        Opening into Atmos #{targetSlot || emptySlots[0] || "?"} · Tap to select:
      </div>
      {sealed.map(bean => {
        const ps = getPeakStatus(bean);
        const isSel = selectedId === bean.id;
        return (
          <div key={bean.id} onClick={() => setSelectedId(bean.id)} style={{ background: isSel ? C.amberBg : C.card, borderRadius: 12, padding: 14, border: `2px solid ${isSel ? C.amber : C.border}`, marginBottom: 8, cursor: "pointer", transition: "all 0.15s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, color: C.text }}>{bean.name}</div>
                <div style={{ fontSize: 12, color: C.textMuted }}>{bean.roaster} · {bean.origin} · {bean.variety} · {bean.bagSize || "?"}g</div>
              </div>
              <Badge color={ps.color} bg={ps.bg}>{ps.label}</Badge>
            </div>
            {bean.bagNotes && bean.bagNotes !== "(not logged)" && <div style={{ fontSize: 11, color: C.accentLight, fontStyle: "italic", marginTop: 4 }}>☕ {bean.bagNotes}</div>}
          </div>
        );
      })}
      <Btn variant="primary" onClick={doOpen} disabled={!selectedId} style={{ width: "100%", justifyContent: "center", marginTop: 10 }}><Check size={14}/> Open Selected Bean</Btn>
    </Modal>
  );
};

// ─── Main App ────────────────────────────────────────────────────
const tabs = [
  { key: "rotation", label: "Rotation", icon: Coffee },
  { key: "inventory", label: "Inventory", icon: Package },
  { key: "tasting", label: "Tasting", icon: Droplets },
  { key: "chat", label: "Chat", icon: MessageCircle },
  { key: "archive", label: "Archive", icon: Archive },
];

export default function CoffeeHub() {
  const { beans, tastings, updateBeans, addTasting, updateTastings, loaded } = useAppData();
  const [tab, setTab] = useState("rotation");
  const [openModal, setOpenModal] = useState(false);
  const [targetSlot, setTargetSlot] = useState(null);

  const handleOpenBean = (slot, preselectedBeanId) => {
    setTargetSlot(slot);
    if (preselectedBeanId) {
      updateBeans(prev => prev.map(b => b.id === preselectedBeanId ? { ...b, status: "ACTIVE", atmosSlot: slot, openDate: today() } : b));
    } else {
      setOpenModal(true);
    }
  };

  if (!loaded) return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted }}>
      <Coffee size={32} style={{ marginRight: 12, opacity: 0.5 }}/> Loading your beans...
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        input:focus, textarea:focus, select:focus { outline: none; border-color: ${C.accentLight} !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "16px 20px 8px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Coffee size={20} color="#fff"/>
        </div>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: C.text, lineHeight: 1.1 }}>Coffee Hub</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>{today()}</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 100px" }}>
        {tab === "rotation" && <RotationTab beans={beans} updateBeans={updateBeans} onOpenBean={handleOpenBean}/>}
        {tab === "inventory" && <InventoryTab beans={beans} onOpenBean={handleOpenBean} updateBeans={updateBeans}/>}
        {tab === "tasting" && <TastingTab beans={beans} tastings={tastings} addTasting={addTasting} updateTastings={updateTastings}/>}
        {tab === "chat" && <ChatTab beans={beans} tastings={tastings}/>}
        {tab === "archive" && <ArchiveTab beans={beans}/>}
      </div>

      {/* Bottom Tab Bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.cream, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-around", padding: "8px 0 env(safe-area-inset-bottom, 12px)", zIndex: 100 }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 12px", opacity: active ? 1 : 0.5, transition: "opacity 0.15s" }}>
              <Icon size={20} color={active ? C.accent : C.textMuted} strokeWidth={active ? 2.5 : 2}/>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? C.accent : C.textMuted }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Open Bean Modal */}
      <OpenBeanFlow open={openModal} onClose={() => { setOpenModal(false); setTargetSlot(null); }} beans={beans} updateBeans={updateBeans} targetSlot={targetSlot}/>
    </div>
  );
}
