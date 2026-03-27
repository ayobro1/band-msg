// Firebase Cloud Messaging Service Worker
// This file is auto-generated - do not edit manually
// Keys are public client keys (not secrets) but restricted by domain

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase config - these are public client keys, secured by:
// 1. API key restrictions (domain whitelist)
// 2. Firebase Security Rules
// 3. Not secrets - designed to be in client code
firebase.initializeApp({
  apiKey: "AIzaSyAHNjaVYDIbSk3QCPRsOUZGAzkl1ThmwLw",
  authDomain: "band-project-30472.firebaseapp.com",
  projectId: "band-project-30472",
  storageBucket: "band-project-30472.firebasestorage.app",
  messagingSenderId: "777483042635",
  appId: "1:777483042635:web:74da0cc0fbc5195d1872ce"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);
  
  const notificationTitle = payload.notification?.title || 'New Message';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message',
    icon: '/notification-icon.png',
    badge: '/notification-icon.png',
    tag: payload.data?.channelId || 'default',
    data: payload.data,
    requireInteraction: false,
    vibrate: [200, 100, 200]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();

  // Open the app or focus existing window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
