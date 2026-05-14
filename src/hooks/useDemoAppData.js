import { useState, useCallback, useMemo } from 'react';
import { INITIAL_BEANS, INITIAL_TASTINGS } from '../lib/seedData';

const DEMO_BEANS_SEED = [
  ...INITIAL_BEANS.filter(b => b.status === 'ACTIVE'),
  ...INITIAL_BEANS.filter(b => b.status === 'SEALED').slice(0, 3),
  ...INITIAL_BEANS.filter(b => b.status === 'FINISHED').slice(0, 2),
].map(b => ({ ...b, id: `demo-${b.seedId}` }));

const SEED_ID_TO_DEMO_ID = Object.fromEntries(
  DEMO_BEANS_SEED.map(b => [b.seedId, b.id])
);

const DEMO_TASTINGS_SEED = INITIAL_TASTINGS
  .filter(t => SEED_ID_TO_DEMO_ID[t.seedBeanId])
  .map((t, i) => ({
    ...t,
    id: `demo-tasting-${i}`,
    beanId: SEED_ID_TO_DEMO_ID[t.seedBeanId],
  }));

export function useDemoAppData(onWriteAttempt) {
  const [beans] = useState(DEMO_BEANS_SEED);
  const [tastings] = useState(DEMO_TASTINGS_SEED);

  const gatedWrite = useCallback(() => {
    onWriteAttempt?.();
  }, [onWriteAttempt]);

  const getBeanById = useCallback(
    (id) => beans.find(b => b.id === id) || null,
    [beans],
  );

  return useMemo(() => ({
    beans,
    tastings,
    loaded: true,
    addBean: gatedWrite,
    updateBean: gatedWrite,
    deleteBean: gatedWrite,
    addTasting: gatedWrite,
    updateTasting: gatedWrite,
    deleteTasting: gatedWrite,
    openBean: gatedWrite,
    finishBean: gatedWrite,
    returnBean: gatedWrite,
    getBeanById,
    seedTalData: () => {},
    refetch: () => {},
  }), [beans, tastings, gatedWrite, getBeanById]);
}
