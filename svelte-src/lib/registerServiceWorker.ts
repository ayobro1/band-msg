import { browser } from '$app/environment';

export async function registerServiceWorker() {
  if (!browser || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map(async (registration) => {
        const scriptUrl =
          registration.active?.scriptURL ||
          registration.waiting?.scriptURL ||
          registration.installing?.scriptURL ||
          '';

        if (scriptUrl.includes('/firebase-messaging-sw.js')) {
          await registration.unregister().catch(() => {});
        }
      })
    );

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });

    await registration.update().catch(() => {});

    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<ServiceWorkerRegistration>((_, reject) => 
      setTimeout(() => reject(new Error('Service worker ready timeout')), 5000)
    );

    await Promise.race([readyPromise, timeoutPromise]).catch(err => {
      console.warn('[SW] Ready timeout, continuing anyway:', err);
    });

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
  }
}
