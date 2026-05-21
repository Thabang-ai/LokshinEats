// Firebase configuration for LokshinEats
// This file connects our app to Firebase services

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

export default app;
