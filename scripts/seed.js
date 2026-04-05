// Backup seed script using Firebase Admin SDK
// Usage: GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json node scripts/seed.js <uid>
//
// Primary seeding is done client-side via the "Import Tal's inventory" button.
// This script exists as a CLI backup option.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const INITIAL_BEANS = [
  { roaster: "Apollon's Gold", name: "San Jose", origin: "Nicaragua", variety: "Pacamara", process: "Natural", roastDate: "2025-12-01", bagSize: 100, status: "ACTIVE", jarSlot: 1, openDate: "2026-02-11", finishDate: null, bagNotes: "muscat / violet / mango", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Degas 35–45d · Peak 60–90d · 1:17.5–1:19 · 90–93°C" },
  { roaster: "Apollon's Gold", name: "El Triangulo", origin: "Honduras", variety: "Geisha", process: "Washed", roastDate: "2025-12-07", bagSize: 100, status: "ACTIVE", jarSlot: 2, openDate: "2026-02-18", finishDate: null, bagNotes: "yuzu / muscat / lavender", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Degas 35–45d · Peak 60–90d · 1:17.5–1:19 · 90–93°C" },
  { roaster: "Apollon's Gold", name: "San Jose (extra)", origin: "Nicaragua", variety: "Pacamara", process: "Natural", roastDate: "2025-12-01", bagSize: 100, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "muscat / violet / mango", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Degas 35–45d · Peak 60–90d" },
  { roaster: "Apollon's Gold", name: "Mulish", origin: "Ethiopia", variety: "Heirloom", process: "Washed", roastDate: "2025-12-07", bagSize: 100, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "nectarine / honeysuckle / lavender", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Degas 35–45d · Peak 60–90d" },
  { roaster: "Apollon's Gold", name: "Arbegona", origin: "Ethiopia", variety: "74158", process: "Natural", roastDate: "2025-12-06", bagSize: 100, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "grapefruit / jasmine / strawberry", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Degas 35–45d · Peak 60–90d" },
  { roaster: "Apollon's Gold", name: "Chelbesa Natural", origin: "Ethiopia", variety: "Wolisho / Dega", process: "Natural", roastDate: "2025-12-06", bagSize: 100, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "strawberry / mango / lychee", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Degas 35–45d · Peak 60–90d" },
  { roaster: "Apollon's Gold", name: "San Isidro Labrador", origin: "Costa Rica", variety: "Geisha Classic", process: "Washed", roastDate: "2025-12-12", bagSize: 100, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "lychee / orange blossom / jasmine", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Degas 35–45d · Peak 60–90d" },
  { roaster: "Apollon's Gold", name: "El Injerto", origin: "Guatemala", variety: "Pacamara", process: "Washed", roastDate: "2025-12-15", bagSize: 100, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "guava / orange / blackcurrant", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Degas 35–45d · Peak 60–90d" },
  { roaster: "Prodigal", name: "Finca San Antonio", origin: "Colombia (Nariño)", variety: "", process: "Washed", roastDate: "2025-12-30", bagSize: 150, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "peach / orange marmalade / floral", producer: "Nilson Lopez", degasMin: 10, degasMax: 14, peakStart: 21, peakEnd: 60, guidance: "Ultra-Light (Loring) · Degas 10–14d · Peak 21–60d" },
  { roaster: "Leaves (Tokyo)", name: "Kenya Gichathaini AA", origin: "Kenya (Nyeri)", variety: "Ruiru 11, SL28, SL34, Batian", process: "Washed", roastDate: "2025-12-10", bagSize: 100, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "pomelo / blackberry / hibiscus tea / sugar cane / smooth", producer: "Gichathaini Factory", degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
  { roaster: "Dayglow", name: "Cafén", origin: "Colombia", variety: "Geisha", process: "Advanced Natural", roastDate: "2025-12-17", bagSize: 100, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "banana candy cake / cherry / orange blossom florals", producer: "", degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
  { roaster: "Dayglow (Promethium)", name: "El Placer", origin: "Colombia", variety: "Geisha", process: "Anaerobic White Honey", roastDate: "2026-02-05", bagSize: 100, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "gardenia flowers / Earl Grey tea / bergamot", producer: "Promethium Coffee", degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
  { roaster: "Koppi", name: "Finca La Fuente", origin: "Colombia (Tarqui, Huila)", variety: "Pink Bourbon", process: "Washed", roastDate: "2026-01-28", bagSize: 100, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "tropical fruits / floral / complex", producer: "", degasMin: 10, degasMax: 14, peakStart: 21, peakEnd: 60, guidance: "Nordic Light · Degas 10–14d · Peak 21–60d · Best before May 28" },
  { roaster: "Momos Coffee", name: "Ethiopia Wessi Tima", origin: "Ethiopia", variety: "", process: "Anaerobic Honey (G1)", roastDate: "2026-02-10", bagSize: 200, status: "SEALED", jarSlot: null, openDate: null, finishDate: null, bagNotes: "(not logged)", producer: "", degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
  { roaster: "Apollon's Gold", name: "Santa Teresa 2000", origin: "Costa Rica", variety: "SL28", process: "White Honey", roastDate: "2025-12-06", bagSize: 100, status: "FINISHED", jarSlot: null, openDate: null, finishDate: "2026-02-18", bagNotes: "Japanese cherry / jasmine / grapefruit", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { roaster: "Apollon's Gold", name: "Wadi Jannat", origin: "Yemen", variety: "SL34", process: "Natural", roastDate: "2025-12-09", bagSize: 100, status: "FINISHED", jarSlot: null, openDate: null, finishDate: "2026-02-08", bagNotes: "white guava / lavender / vanilla", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { roaster: "Apollon's Gold", name: "Elora", origin: "Ethiopia", variety: "74158", process: "Anaerobic Honey", roastDate: "2025-12-01", bagSize: 100, status: "FINISHED", jarSlot: null, openDate: null, finishDate: "2026-02-11", bagNotes: "starfruit / apricot / daisy", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { roaster: "Apollon's Gold", name: "Chelchele", origin: "Ethiopia", variety: "74112 / 74110", process: "Natural", roastDate: "2025-11-26", bagSize: 100, status: "FINISHED", jarSlot: null, openDate: null, finishDate: "2026-02-11", bagNotes: "rambutan / mango / blueberry", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { roaster: "Apollon's Gold", name: "Santa Ana", origin: "Guatemala", variety: "Dillaalghe", process: "Washed", roastDate: "2025-12-06", bagSize: 100, status: "FINISHED", jarSlot: null, openDate: null, finishDate: "2026-02-02", bagNotes: "bergamot / jasmine / longan", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { roaster: "Apollon's Gold", name: "Las Delicias Geisha", origin: "Nicaragua", variety: "Geisha", process: "Natural", roastDate: "2025-11-27", bagSize: 100, status: "FINISHED", jarSlot: null, openDate: null, finishDate: "2026-01-26", bagNotes: "kiwi / daisy / orange marmalade", producer: "", degasMin: 35, degasMax: 45, peakStart: 60, peakEnd: 90, guidance: "Apollon's Gold · Degas 35–45d · Peak 60–90d" },
  { roaster: "Wonderstate", name: "Layampata", origin: "Peru (Cusco)", variety: "Gesha Inka / SL9", process: "Washed", roastDate: "2025-12-01", bagSize: 100, status: "FINISHED", jarSlot: null, openDate: null, finishDate: "2026-01-20", bagNotes: "meyer lemon / white rose / riesling", producer: "", degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
  { roaster: "Dayglow", name: "Rareglow", origin: "Colombia", variety: "Geisha", process: "Advanced Natural", roastDate: "2025-12-17", bagSize: 100, status: "FINISHED", jarSlot: null, openDate: null, finishDate: "2026-01-15", bagNotes: "", producer: "", degasMin: 7, degasMax: 14, peakStart: 14, peakEnd: 60, guidance: "Specialty Light · Degas 7–14d · Peak 14–60d" },
];

const INITIAL_TASTINGS = [
  { beanName: "Chelchele", date: "2026-01-26", aroma: "Light floral", firstSip: "Bright, juicy", acidity: "Berry-like", sweetness: "Light sweetness", body: "Juicy, slightly creamy", finish: "Slightly drying", oneWord: "Solid", rating: null, notes: "Clean Ethiopian natural; likely to sweeten with a few days open", changeTomorrow: "" },
  { beanName: "Wadi Jannat", date: "2026-01-16", aroma: "", firstSip: "", acidity: "Apple-like", sweetness: "Vanilla", body: "Medium, round", finish: "", oneWord: "", rating: null, notes: "Funky; apple-like acidity; vanilla sweetness; round; medium body", changeTomorrow: "" },
];

async function main() {
  const uid = process.argv[2];
  if (!uid) {
    console.error('Usage: node scripts/seed.js <firebase-uid>');
    process.exit(1);
  }

  initializeApp({
    credential: cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '{}')),
  });

  const db = getFirestore();
  const batch = db.batch();
  const beanIdMap = {};

  for (const bean of INITIAL_BEANS) {
    const ref = db.collection('users').doc(uid).collection('beans').doc();
    beanIdMap[bean.name] = ref.id;
    batch.set(ref, {
      ...bean,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  for (const tasting of INITIAL_TASTINGS) {
    const ref = db.collection('users').doc(uid).collection('tastings').doc();
    const { beanName, ...rest } = tasting;
    batch.set(ref, {
      ...rest,
      beanId: beanIdMap[beanName] || '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  console.log(`Seeded ${INITIAL_BEANS.length} beans + ${INITIAL_TASTINGS.length} tastings for uid: ${uid}`);
}

main().catch(console.error);
