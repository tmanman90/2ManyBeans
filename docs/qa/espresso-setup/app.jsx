// Authenticate only a synthetic local account, then boot the unchanged app
// entrypoint and its real providers, routing, data hooks and controls.
import { connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { auth, db } from '../../../src/firebase.js';
connectAuthEmulator(auth, 'http://127.0.0.1:59099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 58080);
await signInWithEmailAndPassword(auth, 'espresso-browser@example.test', 'local-fixture-only-123');
await import('../../../src/main.jsx');
