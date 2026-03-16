import { browser } from '$app/environment';

export async function registerServiceWorker() {
  if (!browser || !('serviceWorker' in navigator)) {
    console.log('Service workers not supported');
    return null;
  }

  try {
    // Register the Firebase messaging service worker
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    
    console.log('Service Worker registered successfully:', registration);
    
    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;
    console.log('Service Worker is ready');
    
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}
