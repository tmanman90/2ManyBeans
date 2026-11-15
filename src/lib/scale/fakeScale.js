// A pretend Acaia scale for the simulator (which has no Bluetooth) and for
// tests. It streams 10 weight readings a second and, after a tare, pours each
// target of the recipe at its scheduled time, the way a person would.

const SAMPLE_MS = 100;
const POUR_GPS = 5;
const GROSS_G = 412.6;
const DEFAULT_PLAN = [
  { atSec: 0, toG: 60 },
  { atSec: 45, toG: 160 },
  { atSec: 90, toG: 240 },
  { atSec: 135, toG: 320 },
];

// Net weight `elapsedSec` after the first pour began.
export function fakePourWeight(plan, elapsedSec) {
  let grams = 0;
  for (const pour of plan) {
    if (elapsedSec < pour.atSec) break;
    grams = Math.min(pour.toG, grams + (elapsedSec - pour.atSec) * POUR_GPS);
    if (grams < pour.toG) return grams;
  }
  return grams;
}

export function createFakeTransport({ firstPourDelayMs = 2500, now = () => Date.now() } = {}) {
  return {
    scan(onFound) {
      const timers = [
        setTimeout(() => onFound({ deviceId: 'fake-pearl-s', name: 'PEARLS-0F2A', model: 'Pearl S', rssi: -52 }), 600),
        setTimeout(() => onFound({ deviceId: 'fake-lunar', name: 'LUNAR-61C2', model: 'Lunar', rssi: -84 }), 1400),
      ];
      return () => timers.forEach(clearTimeout);
    },

    async connect(device, { onMessage, pourPlan }) {
      const plan = pourPlan?.length ? pourPlan : DEFAULT_PLAN;
      let taredAt = null;
      onMessage({ kind: 'settings', battery: 78, units: 'grams' });
      const stream = setInterval(() => {
        const net = taredAt == null ? GROSS_G : fakePourWeight(plan, (now() - taredAt - firstPourDelayMs) / 1000);
        const jitter = (Math.random() - 0.5) * 0.2;
        onMessage({ kind: 'weight', grams: Math.round((net + jitter) * 10) / 10 });
      }, SAMPLE_MS);
      return {
        protocol: 'fake',
        async tare() {
          taredAt = now();
        },
        async disconnect() {
          clearInterval(stream);
        },
      };
    },
  };
}
