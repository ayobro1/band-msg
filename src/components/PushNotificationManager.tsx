"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface Channel {
  id: string;
  name: string;
}

interface PushNotificationManagerProps {
  channels?: Channel[];
}

/**
 * Handles push notification registration on mount.
 * Also renders a notification settings modal when `showSettings` is triggered.
 */
export default function PushNotificationManager({ channels = [] }: PushNotificationManagerProps) {
  const registeredRef = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [mutedChannels, setMutedChannels] = useState<string[]>([]);
  const [pushSupported, setPushSupported] = useState(() => {
    if (typeof window === "undefined") return true;
    return ("serviceWorker" in navigator) && ("PushManager" in window);
  });
  const [permissionState, setPermissionState] = useState<NotificationPermission | "unknown">(() => {
    if (typeof Notification !== "undefined") return Notification.permission;
    return "unknown";
  });
  const [saving, setSaving] = useState(false);

  // Load prefs on mount
  useEffect(() => {
    fetch("/api/push/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setPushEnabled(data.enabled);
          setMutedChannels(data.muted_channels ?? []);
        }
      })
      .catch(() => {});
  }, []);

  const registerPush = useCallback(async () => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

      const vapidRes = await fetch("/api/push/vapid");
      if (!vapidRes.ok) return;
      const { publicKey } = await vapidRes.json();
      if (!publicKey) return;

      const permission = await Notification.requestPermission();
      setPermissionState(permission);
      if (permission !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const applicationServerKey = urlBase64ToUint8Array(publicKey);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const subJson = subscription.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });
    } catch (error) {
      console.error("Push registration failed:", error);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(registerPush, 3000);
    return () => clearTimeout(timer);
  }, [registerPush]);

  const handleToggleEnabled = useCallback(async (enabled: boolean) => {
    setPushEnabled(enabled);
    setSaving(true);

    // If enabling and not yet granted permission, request it
    if (enabled && permissionState !== "granted") {
      registeredRef.current = false;
      await registerPush();
    }

    try {
      await fetch("/api/push/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, muted_channels: mutedChannels }),
      });
    } catch { /* ignore */ }
    setSaving(false);
  }, [mutedChannels, permissionState, registerPush]);

  const handleToggleMuteChannel = useCallback(async (channelId: string) => {
    const newMuted = mutedChannels.includes(channelId)
      ? mutedChannels.filter((c) => c !== channelId)
      : [...mutedChannels, channelId];
    setMutedChannels(newMuted);
    setSaving(true);
    try {
      await fetch("/api/push/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: pushEnabled, muted_channels: newMuted }),
      });
    } catch { /* ignore */ }
    setSaving(false);
  }, [mutedChannels, pushEnabled]);

  const handleUnsubscribe = useCallback(async () => {
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint }),
          });
        }
      }
    } catch { /* ignore */ }
    setPushEnabled(false);
    await handleToggleEnabled(false);
  }, [handleToggleEnabled]);

  return (
    <>
      {/* Notification settings bell button - position in header */}
      <button
        onClick={() => setShowSettings(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-gray-200"
        title="Notification Settings"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {!pushEnabled && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
        )}
      </button>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSettings(false)}>
          <div
            className="w-full max-w-sm rounded-xl bg-[#2b2d31] shadow-xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#3f4147] px-4 py-3">
              <h2 className="text-lg font-semibold text-white">Notification Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-[#404249] hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4">
              {!pushSupported ? (
                <p className="text-sm text-gray-400">Push notifications are not supported in this browser.</p>
              ) : permissionState === "denied" ? (
                <p className="text-sm text-gray-400">
                  Notifications are blocked by your browser. Please enable them in your browser settings.
                </p>
              ) : (
                <>
                  {/* Global toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">Push Notifications</p>
                      <p className="text-xs text-gray-400">Receive notifications for new messages</p>
                    </div>
                    <button
                      onClick={() => handleToggleEnabled(!pushEnabled)}
                      disabled={saving}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        pushEnabled ? "bg-[#5865f2]" : "bg-[#4e5058]"
                      } ${saving ? "opacity-50" : ""}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          pushEnabled ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {pushEnabled && channels.length > 0 && (
                    <>
                      <div className="mx-0 my-3 h-px bg-[#3f4147]" />
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Channel Notifications
                      </p>
                      <div className="max-h-52 space-y-1 overflow-y-auto">
                        {channels.map((ch) => {
                          const isMuted = mutedChannels.includes(ch.id);
                          return (
                            <div key={ch.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[#35373c]">
                              <span className="text-sm text-gray-300">
                                <span className="text-gray-500">#</span> {ch.name}
                              </span>
                              <button
                                onClick={() => handleToggleMuteChannel(ch.id)}
                                disabled={saving}
                                className={`relative h-5 w-9 rounded-full transition-colors ${
                                  !isMuted ? "bg-[#5865f2]" : "bg-[#4e5058]"
                                } ${saving ? "opacity-50" : ""}`}
                              >
                                <span
                                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                    !isMuted ? "left-[18px]" : "left-0.5"
                                  }`}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {pushEnabled && permissionState === "granted" && (
                    <button
                      onClick={handleUnsubscribe}
                      className="mt-3 w-full rounded-lg bg-[#ed4245]/10 px-3 py-2 text-sm text-[#ed4245] transition-colors hover:bg-[#ed4245]/20"
                    >
                      Unsubscribe from all notifications
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
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
