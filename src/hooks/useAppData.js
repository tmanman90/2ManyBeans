import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, query, where, orderBy, getDocs, limit, deleteField
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
  // Monotonic fetch ID. Every fetchAndCache call claims the next ID; when it
  // resolves, if its ID is no longer the highest-seen, its result is discarded.
  // This prevents an older poll from stomping a newer mutation's refetch
  // (or vice versa) when they overlap on slow networks.
  const fetchIdRef = useRef(0);
  const latestAppliedFetchIdRef = useRef(0);
  // Single-flight coalescing: if a fetch is already in flight, subsequent
  // refetch() calls return the same promise instead of kicking off parallel
  // getDocs. Reduces bandwidth and eliminates setBeans race across siblings.
  const inflightFetchRef = useRef(null);
  // Mirror of `beans` state accessible synchronously from stable callbacks like
  // openBean. Intentionally named distinctly from the local `beansColl` Firestore
  // collection reference used inside the fetch effect to avoid shadowing bugs.
  const beansStateRef = useRef(beans);
  beansStateRef.current = beans;
  // Serializes openBean calls so rapid taps can't overlap two slot moves.
  const openBeanInflightRef = useRef(false);

  // Shared fetch+cache helper for native (used by initial load, poll, and refetch).
  // Applies a monotonic fetch ID so late-arriving results never overwrite fresher ones.
  const fetchAndCache = useCallback(async (bColl, tColl, bKey, tKey) => {
    const myId = ++fetchIdRef.current;
    const [beansSnap, tastingsSnap] = await Promise.all([getDocs(bColl), getDocs(tColl)]);
    // If a newer fetch has already applied its results, drop ours.
    if (myId < latestAppliedFetchIdRef.current) return;
    latestAppliedFetchIdRef.current = myId;
    const freshBeans = beansSnap.docs.map(normalizeBean);
    const freshTastings = tastingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    setBeans(freshBeans);
    setTastings(freshTastings);
    cacheWrite(bKey, freshBeans);
    cacheWrite(tKey, freshTastings);
  }, []);

  // Refetch data on native after mutations (replaces real-time listener updates).
  // Coalesces parallel callers onto one in-flight promise.
  const refetch = useCallback(async () => {
    if (!uid || !Capacitor.isNativePlatform()) return;
    if (inflightFetchRef.current) return inflightFetchRef.current;
    const p = (async () => {
      try {
        await fetchAndCache(
          collection(db, 'users', uid, 'beans'),
          collection(db, 'users', uid, 'tastings'),
          `beans_${uid}`, `tastings_${uid}`,
        );
      } catch (err) { /* polling will catch up */ }
      finally { inflightFetchRef.current = null; }
    })();
    inflightFetchRef.current = p;
    return p;
  }, [uid, fetchAndCache]);

  // Fetch data from Firestore
  useEffect(() => {
    if (!uid) return;

    // Clear previous user's data immediately
    setBeans([]);
    setTastings([]);
    setLoaded(false);

    const beansColl = collection(db, 'users', uid, 'beans');
    const tastingsColl = collection(db, 'users', uid, 'tastings');

    if (Capacitor.isNativePlatform()) {
      // Native: load from IDB cache first for instant render, then fetch
      // from Firestore in background to get fresh data. Cache reads are now
      // async (IDB) but this is fine -- the fetchTimeout safety-net at line
      // 120 covers the case where the cache read is slow.
      const beansCacheKey = `beans_${uid}`;
      const tastingsCacheKey = `tastings_${uid}`;
      let hydrateCancelled = false;
      (async () => {
        const [cachedBeans, cachedTastings] = await Promise.all([
          cacheRead(beansCacheKey),
          cacheRead(tastingsCacheKey),
        ]);
        if (hydrateCancelled) return;
        if (cachedBeans || cachedTastings) {
          setBeans(cachedBeans || []);
          setTastings(cachedTastings || []);
          setLoaded(true);
        }
      })();

      // Network fetch (updates cache on success)
      const fetchData = async () => {
        try {
          await fetchAndCache(beansColl, tastingsColl, beansCacheKey, tastingsCacheKey);
        } catch (err) {
          console.error('Firestore fetch error:', err);
        }
        setLoaded(true);
      };
      // Safety timeout: if fetch hangs, show app anyway after 5s
      // (harmless if cache already set loaded=true above)
      const fetchTimeout = setTimeout(() => setLoaded(true), 5000);
      fetchData().finally(() => clearTimeout(fetchTimeout));

      // Poll every 60s to keep data fresh (replaces real-time listeners).
      // Skip this tick if a mutation's refetch is already in flight -- the
      // in-flight result will cover us and is at least as fresh.
      const startPoll = () => {
        pollRef.current = setInterval(async () => {
          if (inflightFetchRef.current) return;
          try {
            await fetchAndCache(beansColl, tastingsColl, beansCacheKey, tastingsCacheKey);
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
        hydrateCancelled = true;
        if (pollRef.current) clearInterval(pollRef.current);
        clearTimeout(fetchTimeout);
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }

    // Web: use real-time listeners (WebSockets work fine in browser).
    // activeUid pins the uid this effect instance belongs to. If a snapshot
    // callback fires after the effect has been torn down for a new uid
    // (account switch, logout), the bail check prevents us from setting the
    // previous user's beans into the new user's state -- which otherwise
    // causes a ~200ms flash of the wrong user's data.
    const activeUid = uid;
    let cancelled = false;
    let beansLoaded = false;
    let tastingsLoaded = false;
    const checkLoaded = () => {
      if (beansLoaded && tastingsLoaded) setLoaded(true);
    };

    const unsubBeans = onSnapshot(beansColl, (snapshot) => {
      if (cancelled || activeUid !== uid) return;
      const data = snapshot.docs.map(normalizeBean);
      setBeans(data);
      beansLoaded = true;
      checkLoaded();
    });

    const unsubTastings = onSnapshot(tastingsColl, (snapshot) => {
      if (cancelled || activeUid !== uid) return;
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTastings(data);
      tastingsLoaded = true;
      checkLoaded();
    });

    return () => {
      cancelled = true;
      unsubBeans();
      unsubTastings();
    };
  }, [uid]);

  const addBean = useCallback(async (beanData, existingId = null) => {
    if (!uid) return;
    if (existingId) {
      // Use pre-allocated ID (from product shot pre-generation)
      const beanRef = doc(db, 'users', uid, 'beans', existingId);
      await setDoc(beanRef, { ...beanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await refetch();
      return existingId;
    }
    // Default: auto-generate ID
    const beansColl = collection(db, 'users', uid, 'beans');
    const docRef = await addDoc(beansColl, { ...beanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
    // Cascade-delete all tastings for this bean. Narrow the query to just this
    // bean's tastings instead of scanning the entire collection.
    const tastingsColl = collection(db, 'users', uid, 'tastings');
    const beanTastingsSnap = await getDocs(query(tastingsColl, where('beanId', '==', beanId)));
    const batch = writeBatch(db);
    beanTastingsSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, 'users', uid, 'beans', beanId));
    await batch.commit();
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

  // Convenience: open a bean into a slot.
  // Atomic: eviction (if any) and new assignment go in a single writeBatch so
  // a network failure between them can't leave slot 2 empty with the new bean
  // orphaned. openBeanInflightRef serializes rapid taps so two parallel calls
  // can't both evict + assign against the same slot.
  const openBean = useCallback(async (beanId, slot, maxSlot) => {
    if (maxSlot && slot > maxSlot) {
      console.warn(`[openBean] Slot ${slot} exceeds max ${maxSlot}, rejecting`);
      return;
    }
    if (openBeanInflightRef.current) {
      console.warn('[openBean] Already moving a bean, ignoring concurrent call');
      return;
    }
    openBeanInflightRef.current = true;
    try {
      const existing = beansStateRef.current.find(
        b => b.status === 'ACTIVE' && b.jarSlot === slot && b.id !== beanId
      );
      const batch = writeBatch(db);
      if (existing) {
        batch.update(doc(db, 'users', uid, 'beans', existing.id), {
          jarSlot: null,
          atmosSlot: deleteField(),
          status: 'SEALED',
          openDate: null,
          updatedAt: serverTimestamp(),
        });
      }
      batch.update(doc(db, 'users', uid, 'beans', beanId), {
        status: 'ACTIVE',
        jarSlot: slot,
        atmosSlot: deleteField(),
        openDate: today(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await refetch();
    } finally {
      openBeanInflightRef.current = false;
    }
  }, [uid, refetch]);

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
