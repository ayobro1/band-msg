"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Registers push notification subscription after the user logs in.
 * Silently fails if push is not supported or user denies permission.
 */
export default function PushNotificationManager() {
  const registeredRef = useRef(false);

  const registerPush = useCallback(async () => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

      // Get VAPID public key from server
      const vapidRes = await fetch("/api/push/vapid");
      if (!vapidRes.ok) return;
      const { publicKey } = await vapidRes.json();
      if (!publicKey) return;

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const registration = await navigator.serviceWorker.ready;

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Convert VAPID key from base64url to Uint8Array
        const applicationServerKey = urlBase64ToUint8Array(publicKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      // Send subscription to server
      const subJson = subscription.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });
    } catch (error) {
      console.error("Push registration failed:", error);
    }
  }, []);

  useEffect(() => {
    // Delay registration to avoid blocking initial render
    const timer = setTimeout(registerPush, 3000);
    return () => clearTimeout(timer);
  }, [registerPush]);

  return null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray as Uint8Array<ArrayBuffer>;
}
