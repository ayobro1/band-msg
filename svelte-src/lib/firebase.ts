import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { browser } from '$app/environment';
import { registerServiceWorker } from './registerServiceWorker';
import { apiPost } from './utils/api';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

// Initialize Firebase
export async function initializeFirebase() {
  if (!browser) return null;
  
  // Register service worker first
  if (!swRegistration) {
    swRegistration = await registerServiceWorker();
  }
  
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  
  return app;
}

// Get Firebase Messaging instance
export function getFirebaseMessaging() {
  if (!browser || !app) return null;
  
  if (!messaging) {
    try {
      messaging = getMessaging(app);
    } catch (error) {
      console.error('Error initializing Firebase Messaging:', error);
      return null;
    }
  }
  
  return messaging;
}

// Request notification permission and get FCM token
export async function requestNotificationPermission(): Promise<string | null> {
  if (!browser) return null;
  
  try {
    console.log('Requesting notification permission...');
    const permission = await Notification.requestPermission();
    console.log('Permission result:', permission);
    
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return null;
    }
    
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.error('Firebase Messaging not initialized');
      return null;
    }
    
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    console.log('VAPID key available:', !!vapidKey);
    console.log('VAPID key length:', vapidKey?.length);
    
    if (!vapidKey) {
      console.error('VAPID key is missing from environment variables');
      return null;
    }
    
    // Get FCM token
    console.log('Getting FCM token...');
    const token = await getToken(messaging, { vapidKey });
    console.log('FCM token received:', token ? 'Yes' : 'No');
    
    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return null;
  }
}

// Listen for foreground messages
export function onForegroundMessage(callback: (payload: any) => void) {
  if (!browser) return () => {};
  
  const messaging = getFirebaseMessaging();
  if (!messaging) return () => {};
  
  return onMessage(messaging, callback);
}

// Subscribe to push notifications
export async function subscribeToPushNotifications(): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await requestNotificationPermission();
    
    if (!token) {
      return { success: false, error: 'Failed to get FCM token' };
    }
    
    const { convex } = await import('./convex');
    const { api } = await import('../../convex/_generated/api');
    const { convexMessageStore } = await import('./stores/convexMessages');
    
    let sessionToken = '';
    const unsubscribe = convexMessageStore.subscribe(state => {
      sessionToken = state.sessionToken;
    });
    unsubscribe();

    if (!sessionToken) {
      return { success: false, error: 'Not authenticated' };
    }

    await convex.mutation(api.pushSubscriptions.subscribe, {
      sessionToken,
      endpoint: token,
      p256dhKey: 'fcm',
      authKey: 'fcm'
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('Error subscribing to push notifications:', error);
    return { success: false, error: error.message };
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPushNotifications(): Promise<{ success: boolean; error?: string }> {
  try {
    const { convex } = await import('./convex');
    const { api } = await import('../../convex/_generated/api');
    const { convexMessageStore } = await import('./stores/convexMessages');
    
    let sessionToken = '';
    const unsubscribe = convexMessageStore.subscribe(state => {
      sessionToken = state.sessionToken;
    });
    unsubscribe();

    if (!sessionToken) {
      return { success: false, error: 'Not authenticated' };
    }

    await convex.mutation(api.pushSubscriptions.unsubscribe, { sessionToken });
    
    return { success: true };
  } catch (error: any) {
    console.error('Error unsubscribing from push notifications:', error);
    return { success: false, error: error.message };
  }
}

// Check if user is subscribed
export async function isPushSubscribed(): Promise<boolean> {
  if (!browser) return false;
  
  try {
    console.log('[Firebase] Checking push subscription status...');
    await initializeFirebase();
    const { convex } = await import('./convex');
    const { api } = await import('../../convex/_generated/api');
    const { convexMessageStore } = await import('./stores/convexMessages');
    
    let sessionToken = '';
    convexMessageStore.subscribe(state => {
      sessionToken = state.sessionToken;
    })();

    console.log('[Firebase] Session token exists:', !!sessionToken);

    if (!sessionToken) return false;

    const result = await convex.query(api.pushSubscriptions.isSubscribed, { sessionToken });
    console.log('[Firebase] Subscription check result:', result);
    return result.subscribed === true;
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
}
