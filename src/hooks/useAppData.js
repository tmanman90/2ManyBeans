import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, query, orderBy, getDocs, limit
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { db } from '../firebase';
import { today } from '../lib/peakStatus';
import { deleteBeanPhoto } from '../lib/storage';
import { INITIAL_BEANS, INITIAL_TASTINGS } from '../lib/seedData';

export const useAppData = (uid) => {
  const [beans, setBeans] = useState([]);
  const [tastings, setTastings] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const pollRef = useRef(null);
  const skipNextPoll = useRef(false);
  const beansRef = useRef(beans);
  beansRef.current = beans; // Always track latest beans for stable callbacks

  // Refetch data on native after mutations (replaces real-time listener updates)
  const refetch = useCallback(async () => {
    if (!uid || !Capacitor.isNativePlatform()) return;
    try {
      const [beansSnap, tastingsSnap] = await Promise.all([
        getDocs(collection(db, 'users', uid, 'beans')),
        getDocs(collection(db, 'users', uid, 'tastings')),
      ]);
      setBeans(beansSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTastings(tastingsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      skipNextPoll.current = true; // Skip next poll since we just fetched
    } catch (err) { /* polling will catch up */ }
  }, [uid]);

  // Fetch data from Firestore
  useEffect(() => {
    if (!uid) return;

    // Clear previous user's data immediately
    setBeans([]);
    setTastings([]);
    setLoaded(false);

    const beansRef = collection(db, 'users', uid, 'beans');
    const tastingsRef = collection(db, 'users', uid, 'tastings');

    if (Capacitor.isNativePlatform()) {
      // Native: use getDocs (HTTP fetch) instead of onSnapshot (WebSocket).
      // WebSocket-based listeners are unreliable in WKWebView.
      const fetchData = async () => {
        try {
          const [beansSnap, tastingsSnap] = await Promise.all([
            getDocs(beansRef),
            getDocs(tastingsRef),
          ]);
          setBeans(beansSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          setTastings(tastingsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
          console.error('Firestore fetch error:', err);
        }
        setLoaded(true);
      };
      // Safety timeout: if fetch hangs, show app anyway after 5s
      const fetchTimeout = setTimeout(() => setLoaded(true), 5000);
      fetchData().finally(() => clearTimeout(fetchTimeout));

      // Poll every 60s to keep data fresh (replaces real-time listeners)
      const startPoll = () => {
        pollRef.current = setInterval(async () => {
          // Skip if a mutation refetch just happened
          if (skipNextPoll.current) {
            skipNextPoll.current = false;
            return;
          }
          try {
            const [beansSnap, tastingsSnap] = await Promise.all([
              getDocs(beansRef),
              getDocs(tastingsRef),
            ]);
            setBeans(beansSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setTastings(tastingsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          } catch (err) { /* silent retry next interval */ }
        }, 60000);
      };
      startPoll();

      // Pause polling when app is backgrounded (battery optimization)
      const handleVisibility = () => {
        if (document.hidden) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        } else {
          if (!pollRef.current) startPoll();
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        clearTimeout(fetchTimeout);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }

    // Web: use real-time listeners (WebSockets work fine in browser)
    let beansLoaded = false;
    let tastingsLoaded = false;
    const checkLoaded = () => {
      if (beansLoaded && tastingsLoaded) setLoaded(true);
    };

    const unsubBeans = onSnapshot(beansRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setBeans(data);
      beansLoaded = true;
      checkLoaded();
    });

    const unsubTastings = onSnapshot(tastingsRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTastings(data);
      tastingsLoaded = true;
      checkLoaded();
    });

    return () => {
      unsubBeans();
      unsubTastings();
    };
  }, [uid]);

  const addBean = useCallback(async (beanData) => {
    if (!uid) return;
    const beansRef = collection(db, 'users', uid, 'beans');
    const docRef = await addDoc(beansRef, {
      ...beanData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await refetch();
    return docRef.id;
  }, [uid, refetch]);

  const updateBean = useCallback(async (beanId, updates) => {
    if (!uid) return;
    const beanRef = doc(db, 'users', uid, 'beans', beanId);
    await updateDoc(beanRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await refetch();
  }, [uid, refetch]);

  const deleteBean = useCallback(async (beanId) => {
    if (!uid) return;
    // Clean up Storage photo (non-blocking)
    try { await deleteBeanPhoto(uid, beanId); } catch (e) { /* silent */ }
    const beanRef = doc(db, 'users', uid, 'beans', beanId);
    await deleteDoc(beanRef);
    await refetch();
  }, [uid, refetch]);

  const addTasting = useCallback(async (tastingData) => {
    if (!uid) return;
    const tastingsRef = collection(db, 'users', uid, 'tastings');
    const docRef = await addDoc(tastingsRef, {
      ...tastingData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await refetch();
    return docRef.id;
  }, [uid, refetch]);

  const updateTasting = useCallback(async (tastingId, updates) => {
    if (!uid) return;
    const tastingRef = doc(db, 'users', uid, 'tastings', tastingId);
    await updateDoc(tastingRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await refetch();
  }, [uid, refetch]);

  const deleteTasting = useCallback(async (tastingId) => {
    if (!uid) return;
    const tastingRef = doc(db, 'users', uid, 'tastings', tastingId);
    await deleteDoc(tastingRef);
    await refetch();
  }, [uid, refetch]);

  // Convenience: open a bean into a slot (maxSlot guards against invalid slot assignments)
  const openBean = useCallback(async (beanId, slot, maxSlot) => {
    if (maxSlot && slot > maxSlot) {
      console.warn(`[openBean] Slot ${slot} exceeds max ${maxSlot}, rejecting`);
      return;
    }
    // Clear slot from any other bean first (prevent duplicate slot assignment)
    const existing = beansRef.current.find(b => b.status === 'ACTIVE' && b.atmosSlot === slot && b.id !== beanId);
    if (existing) {
      await updateBean(existing.id, { atmosSlot: null, status: 'SEALED', openDate: null });
    }
    await updateBean(beanId, {
      status: 'ACTIVE',
      atmosSlot: slot,
      openDate: today(),
    });
  }, [updateBean]);

  // Convenience: finish a bean
  const finishBean = useCallback(async (beanId) => {
    await updateBean(beanId, {
      status: 'FINISHED',
      atmosSlot: null,
      finishDate: today(),
    });
  }, [updateBean]);

  // Convenience: return an active bean to sealed inventory
  const returnBean = useCallback(async (beanId) => {
    await updateBean(beanId, {
      status: 'SEALED',
      atmosSlot: null,
      openDate: null,
    });
  }, [updateBean]);

  // Seed Tal's initial data into Firestore
  const seedTalData = useCallback(async () => {
    if (!uid) return;

    // Idempotency guard: don't seed if beans already exist
    const beansRef = collection(db, 'users', uid, 'beans');
    const existing = await getDocs(query(beansRef, limit(1)));
    if (!existing.empty) return;

    const batch = writeBatch(db);

    // Map seedId -> new Firestore doc ID so tastings can reference the right bean
    const seedIdMap = {};

    for (const bean of INITIAL_BEANS) {
      const beanRef = doc(collection(db, 'users', uid, 'beans'));
      if (bean.seedId) seedIdMap[bean.seedId] = beanRef.id;

      const { seedId, ...beanData } = bean;
      batch.set(beanRef, {
        ...beanData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const tasting of INITIAL_TASTINGS) {
      const tastingRef = doc(collection(db, 'users', uid, 'tastings'));
      const { seedBeanId, ...tastingData } = tasting;

      batch.set(tastingRef, {
        ...tastingData,
        beanId: seedIdMap[seedBeanId] || seedBeanId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  }, [uid]);

  return {
    beans,
    tastings,
    addBean,
    updateBean,
    deleteBean,
    addTasting,
    updateTasting,
    deleteTasting,
    openBean,
    finishBean,
    returnBean,
    seedTalData,
    loaded,
    refetch,
  };
};
