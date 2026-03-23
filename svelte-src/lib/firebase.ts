import { browser } from '$app/environment';
import { registerServiceWorker } from './registerServiceWorker';
import { apiGet, apiPost } from './utils/api';

type SubscriptionResult = {
  success: boolean;
  error?: string;
};

type SerializedSubscription = {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
};

function isIOS(): boolean {
  if (!browser) return false;

  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (!browser) return false;

  return window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true;
}

function supportsPushNotifications(): boolean {
  if (!browser) return false;

  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return window.btoa(binary);
}

function serializeSubscription(subscription: PushSubscription): SerializedSubscription {
  return {
    endpoint: subscription.endpoint,
    p256dhKey: arrayBufferToBase64(subscription.getKey('p256dh')!),
    authKey: arrayBufferToBase64(subscription.getKey('auth')!)
  };
}

async function getVapidPublicKey(): Promise<string | null> {
  const response = await apiGet('/api/push/vapid-key');
  if (!response.ok) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  return typeof data.publicKey === 'string' ? data.publicKey : null;
}

async function getExistingSubscription(): Promise<PushSubscription | null> {
  const registration = await registerServiceWorker();
  if (!registration) return null;

  return registration.pushManager.getSubscription();
}

async function syncSubscription(subscription: PushSubscription): Promise<SubscriptionResult> {
  const response = await apiPost('/api/push/subscribe', serializeSubscription(subscription));
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return {
      success: false,
      error: typeof body.error === 'string' ? body.error : 'Failed to save subscription'
    };
  }

  return { success: true };
}

async function createPushSubscription(): Promise<PushSubscription | null> {
  const registration = await registerServiceWorker();
  if (!registration) {
    return null;
  }

  const vapidPublicKey = await getVapidPublicKey();
  if (!vapidPublicKey) {
    throw new Error('Push notifications are not configured yet.');
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource
  });
}

export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (!browser || !('Notification' in window)) {
    return null;
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  return Notification.requestPermission();
}

export async function subscribeToPushNotifications(): Promise<SubscriptionResult> {
  if (!browser) {
    return { success: false, error: 'Notifications are only available in the browser.' };
  }

  if (!supportsPushNotifications()) {
    return { success: false, error: 'This browser does not support push notifications.' };
  }

  if (isIOS() && !isStandalone()) {
    return {
      success: false,
      error: 'On iPhone and iPad, install Band Chat to your Home Screen first, then open the app there to enable notifications.'
    };
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return { success: false, error: 'Notification permission was not granted.' };
  }

  try {
    const existingSubscription = await getExistingSubscription();
    const subscription = existingSubscription ?? await createPushSubscription();

    if (!subscription) {
      return { success: false, error: 'Failed to create a push subscription.' };
    }

    return await syncSubscription(subscription);
  } catch (error) {
    console.error('[Push] Failed to subscribe:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to enable notifications.'
    };
  }
}

export async function unsubscribeFromPushNotifications(): Promise<SubscriptionResult> {
  if (!browser || !supportsPushNotifications()) {
    return { success: false, error: 'Push notifications are not supported here.' };
  }

  try {
    const registration = await registerServiceWorker();
    if (!registration) {
      return { success: false, error: 'Service worker is not available.' };
    }

    const subscription = await registration.pushManager.getSubscription();
    const endpoint = subscription?.endpoint;

    if (subscription) {
      await subscription.unsubscribe().catch(() => {});
    }

    const response = await apiPost('/api/push/unsubscribe', endpoint ? { endpoint } : {});
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        success: false,
        error: typeof body.error === 'string' ? body.error : 'Failed to disable notifications.'
      };
    }

    return { success: true };
  } catch (error) {
    console.error('[Push] Failed to unsubscribe:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to disable notifications.'
    };
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!browser || !supportsPushNotifications()) {
    return false;
  }

  try {
    const subscription = await getExistingSubscription();
    if (!subscription) {
      return false;
    }

    const syncResult = await syncSubscription(subscription);
    return syncResult.success;
  } catch (error) {
    console.error('[Push] Failed to inspect subscription state:', error);
    return false;
  }
}
