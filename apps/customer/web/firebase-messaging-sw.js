// Firebase Cloud Messaging service worker, for push in the browser.
//
// Only used when the app is built with a VAPID key
// (--dart-define=FCM_VAPID_KEY=...). Without one the app never asks for push
// on the web and this file is never registered; the in-app inbox is the
// notification instead.
//
// It shows a push that arrives while no LokshinEats tab is in front, and
// opens the order when it is clicked. The SDK version matches what the
// FlutterFire web plugin loads (firebase_core_web's
// supportedFirebaseJsSdkVersion), so the page and the worker speak the same
// messaging protocol. Update the two together.

importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js');

// The customer app's web registration - the same values as the `web` entry in
// lib/firebase_options.dart. These are public identifiers, not secrets.
firebase.initializeApp({
  apiKey: 'AIzaSyBF-9ZByQqRSykNdEjFKOEwErsV_MWBEy0',
  appId: '1:741301128340:web:4837774d16c47668c5b881',
  messagingSenderId: '741301128340',
  projectId: 'kasieats-34391',
  authDomain: 'kasieats-34391.firebaseapp.com',
  storageBucket: 'kasieats-34391.firebasestorage.app',
});

// Pushes carry a `notification` block, which the SDK shows by itself while
// the app is in the background. Initialising messaging is what enables that.
firebase.messaging();

// Clicking one opens the app on the order it is about.
self.addEventListener('notificationclick', (event) => {
  const orderId = event.notification?.data?.FCM_MSG?.data?.orderId;
  event.notification.close();
  event.waitUntil(clients.openWindow(orderId ? `/?order=${orderId}` : '/'));
});
