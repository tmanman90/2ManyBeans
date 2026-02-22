import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { today } from '../lib/peakStatus';
import { INITIAL_BEANS, INITIAL_TASTINGS } from '../lib/seedData';

export const useAppData = (uid) => {
  const [beans, setBeans] = useState([]);
  const [tastings, setTastings] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Real-time Firestore listeners
  useEffect(() => {
    if (!uid) return;

    const beansRef = collection(db, 'users', uid, 'beans');
    const tastingsRef = collection(db, 'users', uid, 'tastings');

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
    await addDoc(beansRef, {
      ...beanData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, [uid]);

  const updateBean = useCallback(async (beanId, updates) => {
    if (!uid) return;
    const beanRef = doc(db, 'users', uid, 'beans', beanId);
    await updateDoc(beanRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }, [uid]);

  const deleteBean = useCallback(async (beanId) => {
    if (!uid) return;
    const beanRef = doc(db, 'users', uid, 'beans', beanId);
    await deleteDoc(beanRef);
  }, [uid]);

  const addTasting = useCallback(async (tastingData) => {
    if (!uid) return;
    const tastingsRef = collection(db, 'users', uid, 'tastings');
    await addDoc(tastingsRef, {
      ...tastingData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, [uid]);

  const updateTasting = useCallback(async (tastingId, updates) => {
    if (!uid) return;
    const tastingRef = doc(db, 'users', uid, 'tastings', tastingId);
    await updateDoc(tastingRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }, [uid]);

  const deleteTasting = useCallback(async (tastingId) => {
    if (!uid) return;
    const tastingRef = doc(db, 'users', uid, 'tastings', tastingId);
    await deleteDoc(tastingRef);
  }, [uid]);

  // Convenience: open a bean into a slot
  const openBean = useCallback(async (beanId, slot) => {
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

  // Seed Tal's initial data into Firestore
  const seedTalData = useCallback(async () => {
    if (!uid) return;
    const batch = writeBatch(db);

    // We need to create doc refs with auto IDs and track old->new ID mapping for tastings
    const idMap = {};

    for (const bean of INITIAL_BEANS) {
      const beanRef = doc(collection(db, 'users', uid, 'beans'));
      // Store mapping from old seed ID pattern to new Firestore ID
      // Use roaster+name as a stable key for tasting beanId lookup
      const key = `${bean.roaster}::${bean.name}`;
      idMap[key] = beanRef.id;

      batch.set(beanRef, {
        ...bean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const tasting of INITIAL_TASTINGS) {
      const tastingRef = doc(collection(db, 'users', uid, 'tastings'));
      // Map old beanId to the new Firestore doc ID
      // Find the bean in INITIAL_BEANS by old id to get roaster+name
      const oldBean = INITIAL_BEANS.find(b => {
        // Match by the old id pattern (e.g. "ag-chelchele")
        const oldId = tasting.beanId;
        // The seed data uses short ids like "ag-chelchele" which correspond to bean names
        const nameSlug = b.name.toLowerCase().replace(/\s+/g, '');
        return oldId.includes(nameSlug) || nameSlug.includes(oldId.replace(/^[a-z]+-/, ''));
      });

      let beanId = tasting.beanId; // fallback
      if (oldBean) {
        const key = `${oldBean.roaster}::${oldBean.name}`;
        if (idMap[key]) beanId = idMap[key];
      }

      batch.set(tastingRef, {
        ...tasting,
        beanId,
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
    seedTalData,
    loaded,
  };
};
