// Firebase configuration for LokshinEats
// This file connects our app to Firebase services

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBF-9ZByQqRSykNdEjFKOEwErsV_MWBEy0",
  authDomain: "kasieats-34391.firebaseapp.com",
  projectId: "kasieats-34391",
  storageBucket: "kasieats-34391.firebasestorage.app",
  messagingSenderId: "741301128340",
  appId: "1:741301128340:web:4837774d16c47668c5b881",
  measurementId: "741301128340"
};

// Initialize Firebase
// This checks if Firebase is already initialized to avoid errors
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase services
// Auth - handles user login, signup, password reset
export const auth = getAuth(app);

// Firestore - our database for users, orders, products, etc.
export const db = getFirestore(app);

// Storage - stores images like food photos, logos, etc.
export const storage = getStorage(app);

// Local development against the Firebase emulators.
//
// Off unless NEXT_PUBLIC_USE_FIREBASE_EMULATORS is "true", so a production
// build can never point here by accident — and because the flag is inlined at
// build time, a deployed bundle physically cannot switch to it at runtime.
//
// This is what lets the whole stack run locally: the emulators, the API, and
// this app all share one throwaway database, so checkout can be exercised end
// to end without writing test orders into the live project.
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true') {
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST ?? '127.0.0.1';

  // Guarded so React strict mode's double-invoke doesn't reconnect and throw.
  const globalFlag = globalThis as { __lokshinEmulatorsConnected?: boolean };
  if (!globalFlag.__lokshinEmulatorsConnected) {
    globalFlag.__lokshinEmulatorsConnected = true;
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    console.info('[LokshinEats] Using Firebase emulators — no live data.');
  }
}

export default app;
