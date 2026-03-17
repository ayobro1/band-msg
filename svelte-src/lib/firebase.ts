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

// Request notification permission and get FCM token
export async function requestNotificationPermission(): Promise<string | null> {
  if (!browser) return null;
  
  try {
    console.log('[Firebase] Requesting notification permission...');
    console.log('[Firebase] Is iOS:', isIOS());
    
    // First, initialize Firebase before requesting permission
    await initializeFirebase();
    
    const permission = await Notification.requestPermission();
    console.log('[Firebase] Permission result:', permission);
    
    if (permission !== 'granted') {
      console.log('[Firebase] Notification permission denied');
      return null;
    }
    
    // iOS uses native push API, not Firebase
    if (isIOS()) {
      console.log('[Firebase] iOS detected - using native push API');
      
      // For iOS, we need to use the service worker's pushManager
      if (!swRegistration) {
        swRegistration = await registerServiceWorker();
      }
      
      if (!swRegistration) {
        console.error('[Firebase] Service worker not registered');
        return null;
      }
      
      // Check if already subscribed
      let subscription = await swRegistration.pushManager.getSubscription();
      
      if (!subscription) {
        // Subscribe using VAPID key
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        if (!vapidKey) {
          console.error('[Firebase] VAPID key missing');
          return null;
        }
        
        subscription = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey
        });
      }
      
      // Convert subscription to a token-like string for storage
      const subscriptionJSON = subscription.toJSON();
      const endpoint = subscriptionJSON.endpoint || '';
      const p256dh = subscriptionJSON.keys?.p256dh || '';
      const auth = subscriptionJSON.keys?.auth || '';
      
      console.log('[Firebase] iOS push subscription details:', {
        hasEndpoint: !!endpoint,
        hasP256dh: !!p256dh,
        hasAuth: !!auth
      });
      
      // Store the full subscription data
      if (!endpoint) {
        console.error('[Firebase] No endpoint in subscription');
        return null;
      }
      
      // Return endpoint as the "token" but we'll store keys separately
      return JSON.stringify({
        endpoint,
        p256dh,
        auth
      });
    }
    
    // Non-iOS: use Firebase Cloud Messaging
    console.log('[Firebase] Getting Firebase Messaging instance...');
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.error('[Firebase] Firebase Messaging not initialized');
      return null;
    }
    
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    console.log('[Firebase] VAPID key available:', !!vapidKey);
    console.log('[Firebase] VAPID key length:', vapidKey?.length);
    
    if (!vapidKey) {
      console.error('[Firebase] VAPID key is missing from environment variables');
      return null;
    }
    
    // Get FCM token with timeout
    console.log('[Firebase] Getting FCM token...');
    const tokenPromise = getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration || undefined });
    const timeoutPromise = new Promise<null>((_, reject) => 
      setTimeout(() => reject(new Error('FCM token request timed out after 10 seconds')), 10000)
    );
    
    const token = await Promise.race([tokenPromise, timeoutPromise]);
    console.log('[Firebase] FCM token received:', token ? 'Yes' : 'No');
    
    return token;
  } catch (error) {
    console.error('[Firebase] Error getting FCM token:', error);
    if (error instanceof Error) {
      console.error('[Firebase] Error message:', error.message);
      console.error('[Firebase] Error stack:', error.stack);
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

    // Parse subscription data (could be FCM token or iOS subscription object)
    let endpoint, p256dh, auth;
    
    try {
      const parsed = JSON.parse(tokenOrSubscription);
      endpoint = parsed.endpoint;
      p256dh = parsed.p256dh;
      auth = parsed.auth;
    } catch {
      // It's a plain FCM token
      endpoint = tokenOrSubscription;
      p256dh = 'fcm';
      auth = 'fcm';
    }

    await convex.mutation(api.pushSubscriptions.subscribe, {
      sessionToken,
      endpoint,
      p256dhKey: p256dh,
      authKey: auth
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
