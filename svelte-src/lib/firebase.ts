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

// Detect if running on iOS
function isIOS(): boolean {
  if (!browser) return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Request notification permission and get FCM token
export async function requestNotificationPermission(): Promise<string | null> {
  if (!browser) return null;
  
  try {
    console.log('[Firebase] Requesting notification permission...');
    console.log('[Firebase] Is iOS:', isIOS());
    
    // First, initialize Firebase before requesting permission
    console.log('[Firebase] Initializing Firebase...');
    const initResult = await initializeFirebase();
    if (!initResult) {
      console.error('[Firebase] Failed to initialize Firebase');
      return null;
    }
    console.log('[Firebase] Firebase initialized successfully');
    
    console.log('[Firebase] Requesting permission from browser...');
    const permission = await Notification.requestPermission();
    console.log('[Firebase] Permission result:', permission);
    
    if (permission !== 'granted') {
      console.log('[Firebase] Notification permission denied');
      return null;
    }
    
    // Use Firebase Cloud Messaging for all platforms (including iOS)
    // Firebase handles the complexity of APNs for iOS
    console.log('[Firebase] Getting Firebase Messaging instance...');
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.error('[Firebase] Firebase Messaging not initialized');
      return null;
    }
    
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    console.log('[Firebase] VAPID key available:', !!vapidKey);
    
    if (!vapidKey) {
      console.error('[Firebase] VAPID key is missing from environment variables');
      return null;
    }
    
    // Get FCM token with timeout
    console.log('[Firebase] Getting FCM token...');
    const tokenPromise = getToken(messaging, { 
      vapidKey, 
      serviceWorkerRegistration: swRegistration || undefined 
    });
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('FCM token request timed out after 10 seconds')), 10000)
    );
    
    const token = await Promise.race([tokenPromise, timeoutPromise]);
    console.log('[Firebase] FCM token received:', token ? 'Yes' : 'No');
    
    return token;
  } catch (error) {
    console.error('[Firebase] Error getting FCM token:', error);
    if (error instanceof Error) {
      console.error('[Firebase] Error message:', error.message);
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
    const tokenOrSubscription = await requestNotificationPermission();
    
    if (!tokenOrSubscription) {
      return { success: false, error: 'Failed to get push subscription' };
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

    // tokenOrSubscription is now always a plain FCM token
    await convex.mutation(api.pushSubscriptions.subscribe, {
      sessionToken,
      endpoint: tokenOrSubscription,
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
    const unsubscribe = convexMessageStore.subscribe(state => {
      sessionToken = state.sessionToken;
    });
    unsubscribe(); // Immediately unsubscribe after getting the value

    console.log('[Firebase] Session token exists:', !!sessionToken);

    if (!sessionToken) {
      console.log('[Firebase] No session token, returning false');
      return false;
    }

    const result = await convex.query(api.pushSubscriptions.isSubscribed, { sessionToken });
    console.log('[Firebase] Subscription check result:', result);
    return result.subscribed === true;
  } catch (error) {
    console.error('[Firebase] Error checking subscription status:', error);
    return false;
  }
}
