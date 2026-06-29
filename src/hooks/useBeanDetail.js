// useBeanDetail — shared detail-card + hero-morph state for any tab that opens the
// flip BeanDetailCard. Owns the selected bean and the originating bag rect (captured
// on tap) that the card flies the bag from. Each tab renders <BeanDetailCard
// bean={detailBean} originRect={morphRect} onClose={closeDetail} …/> with its own
// action handlers. Tabs are conditionally mounted (App.jsx), so only the active tab's
// card exists — no double host.
import { useState, useCallback } from 'react';

export function useBeanDetail() {
  const [detailBean, setDetailBean] = useState(null);
  const [morphRect, setMorphRect] = useState(null);
  const openDetail = useCallback((bean, rect) => { setMorphRect(rect || null); setDetailBean(bean); }, []);
  const closeDetail = useCallback(() => setDetailBean(null), []);
  return { detailBean, morphRect, openDetail, closeDetail };
}
