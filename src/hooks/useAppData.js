import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, query, orderBy, getDocs, limit, deleteField
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { db } from '../firebase';
import { today } from '../lib/peakStatus';
import { deleteBeanPhoto } from '../lib/storage';
import { INITIAL_BEANS, INITIAL_TASTINGS } from '../lib/seedData';
import { cacheRead, cacheWrite } from '../lib/offlineCache';

// Normalize legacy atmosSlot field to jarSlot on read (migration shim, added 2026-04-05)
const normalizeBean = (d) => {
  const { atmosSlot, ...rest } = d.data();
  return {
    ...rest,
    id: d.id,
    jarSlot: rest.jarSlot ?? atmosSlot ?? null,
  };
};

export const useAppData = (uid) => {
  const [beans, setBeans] = useState([]);
  const [tastings, setTastings] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const pollRef = useRef(null);
  const skipNextPoll = useRef(false);
  const beansRef = useRef(beans);
  beansRef.current = beans; // Always track latest beans for stable callbacks

  // Shared fetch+cache helper for native (used by initial load, poll, and refetch)
  const fetchAndCache = useCallback(async (bColl, tColl, bKey, tKey) => {
    const [beansSnap, tastingsSnap] = await Promise.all([getDocs(bColl), getDocs(tColl)]);
    const freshBeans = beansSnap.docs.map(normalizeBean);
    const freshTastings = tastingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setBeans(freshBeans);
    setTastings(freshTastings);
    cacheWrite(bKey, freshBeans);
    cacheWrite(tKey, freshTastings);
  }, []);

  // Refetch data on native after mutations (replaces real-time listener updates)
  const refetch = useCallback(async () => {
    if (!uid || !Capacitor.isNativePlatform()) return;
    try {
      await fetchAndCache(
        collection(db, 'users', uid, 'beans'),
        collection(db, 'users', uid, 'tastings'),
        `beans_${uid}`, `tastings_${uid}`,
      );
      skipNextPoll.current = true;
    } catch (err) { /* polling will catch up */ }
  }, [uid, fetchAndCache]);

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
      // Native: load from localStorage cache first for instant render,
      // then fetch from Firestore in background to get fresh data.
      const beansCacheKey = `beans_${uid}`;
      const tastingsCacheKey = `tastings_${uid}`;
      const cachedBeans = cacheRead(beansCacheKey);
      const cachedTastings = cacheRead(tastingsCacheKey);
      if (cachedBeans && cachedTastings) {
        setBeans(cachedBeans);
        setTastings(cachedTastings);
        setLoaded(true);
      }

      // Network fetch (updates cache on success)
      const fetchData = async () => {
        try {
          await fetchAndCache(beansRef, tastingsRef, beansCacheKey, tastingsCacheKey);
        } catch (err) {
          console.error('Firestore fetch error:', err);
        }
        setLoaded(true);
      };
      // Safety timeout: if fetch hangs, show app anyway after 5s
      // (harmless if cache already set loaded=true above)
      const fetchTimeout = setTimeout(() => setLoaded(true), 5000);
      fetchData().finally(() => clearTimeout(fetchTimeout));

      // Poll every 60s to keep data fresh (replaces real-time listeners)
      const startPoll = () => {
        pollRef.current = setInterval(async () => {
          if (skipNextPoll.current) {
            skipNextPoll.current = false;
            return;
          }
          try {
            await fetchAndCache(beansRef, tastingsRef, beansCacheKey, tastingsCacheKey);
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
      const data = snapshot.docs.map(normalizeBean);
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
    const existing = beansRef.current.find(b => b.status === 'ACTIVE' && b.jarSlot === slot && b.id !== beanId);
    if (existing) {
      await updateBean(existing.id, { jarSlot: null, atmosSlot: deleteField(), status: 'SEALED', openDate: null });
    }
    await updateBean(beanId, {
      status: 'ACTIVE',
      jarSlot: slot,
      atmosSlot: deleteField(),
      openDate: today(),
    });
  }, [updateBean]);

  // Convenience: finish a bean
  const finishBean = useCallback(async (beanId) => {
    await updateBean(beanId, {
      status: 'FINISHED',
      jarSlot: null,
      atmosSlot: deleteField(),
      finishDate: today(),
    });
  }, [updateBean]);

  // Convenience: return an active bean to sealed inventory
  const returnBean = useCallback(async (beanId) => {
    await updateBean(beanId, {
      status: 'SEALED',
      jarSlot: null,
      atmosSlot: deleteField(),
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
