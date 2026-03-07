<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Drawer } from "vaul-svelte";
  import { parseMarkdown, QUICK_EMOJIS, REACTION_ICONS, type ReactionDef } from "$lib/markdown";

  type User = { username: string; role: "admin" | "member"; status: "approved" | "pending" };
  type Server = { id: string; name: string; description: string; iconUrl?: string };
  type Channel = { id: string; name: string; description: string };
  type Message = {
    id: string;
    author: string;
    content: string;
    createdAt: number;
    reactions?: Array<{ emoji: string; count: number; users: string[] }>;
  };
  type Event = { id: string; title: string; description: string; startsAt: number; endsAt: number; location: string };
  type Member = { id: string; username: string; role: string; presenceStatus: string };

  let me: User | null = null;
  let servers: Server[] = [];
  let channels: Channel[] = [];
  let messages: Message[] = [];
  let events: Event[] = [];
  let members: Member[] = [];
  let selectedServerId = "";
  let selectedChannelId = "";
  let selectedChannelName = "";
  let typingUsers: string[] = [];

  let registerUsername = "";
  let registerPassword = "";
  let loginUsername = "";
  let loginPassword = "";
  let newMessage = "";
  let newChannel = "";
  let newChannelDescription = "";

  let inviteCode = "";
  let isLoggingIn = false;
  let authMode: "login" | "register" = "login";
  let headerSessionToken = "";
  let toastMessage = "";
  let toastType: "error" | "success" = "error";
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;
  let typingTimeout: ReturnType<typeof setTimeout> | null = null;
  let showEmojiPicker = false;
  let showCalendar = false;

  let showInviteModal = false;
  let showEventCreate = false;
  let showMemberList = false;
  let showChannelSidebar = false;
  let showAdminPanel = false;
  let selectedMessageForReaction = "";
  let messageContainer: HTMLElement | null = null;

  type PendingUser = { id: string; username: string; role: string; status: string; createdAt: number };
  let pendingUsers: PendingUser[] = [];

  let emojiSearchQuery = "";

  type GifItem = { id: string; title: string; url: string; preview: string; width: number; height: number };
  let showGifPicker = false;
  let gifSearchQuery = "";
  let gifResults: GifItem[] = [];
  let isLoadingGifs = false;
  let gifSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  let reactionPickerTab: "emoji" | "gif" = "emoji";
  let reactionGifSearch = "";
  let reactionGifResults: GifItem[] = [];
  let isLoadingReactionGifs = false;
  let reactionGifSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  let isLoadingMessages = false;
  let connectionStatus: "connected" | "reconnecting" = "connected";
  let failedPollCount = 0;

  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  let contextMenuMessageId = "";
  let contextMenuAuthor = "";
  let contextMenuX = 0;
  let contextMenuY = 0;

  let newEventTitle = "";
  let newEventDescription = "";
  let newEventLocation = "";
  let newEventStartsAt = "";
  let newEventEndsAt = "";

  let notificationPref: 'all' | 'mentions' | 'dms' | 'none' = 'mentions';
  let showNotificationPrefs = false;
  let pushNotificationsEnabled = false;

  let showNewMessagesBar = false;
  let newMessagesCount = 0;
  let lastReadMessageId = "";
  let hasUserScrolled = false;

  function setNotificationPref(pref: 'all' | 'mentions' | 'dms' | 'none') {
    notificationPref = pref;
    localStorage.setItem('notificationPref', pref);
  }

  async function togglePushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('Push notifications not supported in this browser', 'error');
      return;
    }
    try {
      const { subscribeToPush, unsubscribeFromPush, isPushSubscribed } = await import('$lib/push-notifications');
      if (pushNotificationsEnabled) {
        const success = await unsubscribeFromPush();
        if (success) {
          pushNotificationsEnabled = false;
          showToast('Push notifications disabled', 'success');
        } else {
          showToast('Failed to disable push notifications', 'error');
        }
      } else {
        const alreadySubscribed = await isPushSubscribed();
        if (alreadySubscribed) {
          pushNotificationsEnabled = true;
          showToast('Push notifications already enabled', 'success');
          return;
        }
        const success = await subscribeToPush();
        if (success) {
          pushNotificationsEnabled = true;
          showToast('Push notifications enabled', 'success');
        } else {
          showToast('Failed to enable push notifications', 'error');
        }
      }
    } catch (error) {
      console.error('Failed to toggle push notifications:', error);
      showToast('Failed to toggle push notifications', 'error');
    }
  }

  async function checkPushNotificationStatus() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const { isPushSubscribed } = await import('$lib/push-notifications');
      pushNotificationsEnabled = await isPushSubscribed();
    } catch (error) {
      console.error('Failed to check push notification status:', error);
    }
  }

  $: isAuthenticated = !!me;
  $: myPresence = members.find(m => m.username === me?.username)?.presenceStatus || 'online';
  $: filteredEmojis = emojiSearchQuery
    ? REACTION_ICONS.filter(e => e.label.toLowerCase().includes(emojiSearchQuery.toLowerCase()))
    : REACTION_ICONS;
  $: nextEvent = events.filter(e => e.startsAt > Date.now()).sort((a, b) => a.startsAt - b.startsAt)[0] ?? null;
  $: rehearsalCountdown = (() => {
    if (!nextEvent) return null;
    const diff = nextEvent.startsAt - Date.now();
    const days = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}d ${hrs}h`;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  })();

  function showToast(message: string, type: "error" | "success" = "error") {
    toastMessage = message;
    toastType = type;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toastMessage = ""; toastTimeout = null; }, 4500);
  }

  function getCookie(name: string): string {
    if (typeof document === "undefined") return "";
    const prefix = `${encodeURIComponent(name)}=`;
    const found = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    return found ? decodeURIComponent(found.slice(prefix.length)) : "";
  }

  async function apiPost(path: string, payload: Record<string, unknown>) {
    const csrf = getCookie("band_chat_csrf");
    const headers: Record<string, string> = { "content-type": "application/json", "x-csrf-token": csrf };
    if (headerSessionToken) headers.authorization = `Bearer ${headerSessionToken}`;
    return fetch(path, { method: "POST", credentials: "same-origin", headers, body: JSON.stringify(payload) });
  }

  async function apiGet(path: string) {
    const headers: Record<string, string> = {};
    if (headerSessionToken) headers.authorization = `Bearer ${headerSessionToken}`;
    return fetch(path, { credentials: "same-origin", headers });
  }

  async function readApiError(res: Response, fallback: string): Promise<string> {
    try {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await res.json();
        if (typeof body?.error === "string" && body.error.trim()) return body.error;
      }
      const text = (await res.text()).trim();
      if (text) return `${fallback} (${res.status}): ${text.slice(0, 220)}`;
    } catch {}
    return `${fallback} (${res.status})`;
  }

  async function refreshMe(): Promise<{ ok: boolean; error?: string; status?: number }> {
    const res = await apiGet("/api/auth/me");
    if (!res.ok) { me = null; return { ok: false, status: res.status, error: await readApiError(res, "Auth check failed") }; }
    me = await res.json();
    if (me) await apiPost("/api/presence", { status: "online" });
    return { ok: true };
  }

  async function refreshServers() {
    if (!me) return;
    const res = await apiGet("/api/servers");
    if (!res.ok) return;
    servers = await res.json();
    if (!selectedServerId && servers.length > 0) { selectedServerId = servers[0].id; await refreshChannels(); }
  }

  async function refreshChannels() {
    if (!me) return;
    const res = await apiGet("/api/channels");
    if (!res.ok) return;
    channels = await res.json();
    if (!selectedChannelId && channels.length > 0) { selectedChannelId = channels[0].id; selectedChannelName = channels[0].name; await refreshMessages(); }
  }

  async function refreshMessages() {
    if (!selectedChannelId) return;
    const isInitialLoad = messages.length === 0;
    const wasAtBottom = isAtBottom();
    if (isInitialLoad) isLoadingMessages = true;
    try {
      const res = await apiGet(`/api/messages?channelId=${encodeURIComponent(selectedChannelId)}`);
      if (!res.ok) { failedPollCount++; if (failedPollCount >= 2) connectionStatus = "reconnecting"; return; }
      const msgs = await res.json();
      const messageIds = msgs.map((m: Message) => m.id);
      if (messageIds.length > 0) {
        const reactionsRes = await apiGet(`/api/reactions?messageIds=${messageIds.map((id: string) => encodeURIComponent(id)).join(',')}`);
        if (reactionsRes.ok) {
          const allReactions = await reactionsRes.json();
          msgs.forEach((msg: Message) => { msg.reactions = allReactions[msg.id] || []; });
        }
      }
      if (!isInitialLoad && msgs.length > messages.length) {
        const newCount = msgs.length - messages.length;
        newMessagesCount += newCount;
        if (!wasAtBottom && !isInitialLoad) showNewMessagesBar = true;
      }
      messages = msgs;
      if (isInitialLoad || wasAtBottom) { scrollToBottom(); showNewMessagesBar = false; newMessagesCount = 0; }
      failedPollCount = 0;
      connectionStatus = "connected";
    } catch { failedPollCount++; if (failedPollCount >= 2) connectionStatus = "reconnecting"; }
    finally { isLoadingMessages = false; }
  }

  async function refreshEvents() {
    if (!selectedServerId) return;
    const res = await apiGet(`/api/events?serverId=${encodeURIComponent(selectedServerId)}`);
    if (!res.ok) return;
    events = await res.json();
  }

  async function refreshMembers() {
    if (!selectedServerId) return;
    try {
      const res = await apiGet(`/api/members?serverId=${encodeURIComponent(selectedServerId)}`);
      if (!res.ok) return;
      members = await res.json();
    } catch {}
  }

  async function refreshTyping() {
    if (!selectedChannelId) return;
    try {
      const res = await apiGet(`/api/typing?channelId=${encodeURIComponent(selectedChannelId)}`);
      if (!res.ok) return;
      const users = await res.json();
      typingUsers = users.map((u: any) => u.username);
    } catch {}
  }

  function isUserNearBottom(): boolean {
    if (!messageContainer) return true;
    return messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight < 150;
  }

  function scrollToBottom() {
    setTimeout(() => { if (messageContainer) messageContainer.scrollTop = messageContainer.scrollHeight; }, 50);
  }

  function isAtBottom() {
    if (!messageContainer) return true;
    return messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight < 100;
  }

  function jumpToBottom() {
    scrollToBottom();
    showNewMessagesBar = false;
    newMessagesCount = 0;
    hasUserScrolled = false;
  }

  function handleScroll() {
    if (!messageContainer) return;
    if (isAtBottom()) { showNewMessagesBar = false; newMessagesCount = 0; hasUserScrolled = false; }
    else { hasUserScrolled = true; }
  }

  async function register() {
    const res = await apiPost("/api/auth/register", { username: registerUsername, password: registerPassword });
    if (!res.ok) { showToast(await readApiError(res, "Registration failed"), "error"); return; }
    registerUsername = ""; registerPassword = "";
    showToast("Registered successfully.", "success");
  }

  async function login() {
    if (isLoggingIn) return;
    const attemptedPassword = loginPassword;
    isLoggingIn = true;
    try {
      const res = await apiPost("/api/auth/login", { username: loginUsername, password: loginPassword });
      if (!res.ok) { loginPassword = attemptedPassword; showToast(await readApiError(res, "Login failed"), "error"); return; }
      const body = await res.json().catch(() => null);
      headerSessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : "";
      const authState = await refreshMe();
      if (!authState.ok || !me) { loginPassword = attemptedPassword; showToast(authState.error || "Signed in response received, but session was not established.", "error"); return; }
      loginPassword = "";
      await refreshServers();
      await refreshChannels();
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
        import('$lib/push-notifications').then(({ subscribeToPush }) => { subscribeToPush(); }).catch(err => console.error('Failed to load push notifications:', err));
      }
      if (headerSessionToken) { showToast("Signed in using header-session fallback (cookies blocked by browser).", "success"); return; }
      showToast("Signed in.", "success");
    } finally { isLoggingIn = false; }
  }

  async function logout() {
    await apiPost("/api/auth/logout", {});
    await apiPost("/api/presence", { status: "offline" });
    headerSessionToken = ""; me = null; servers = []; channels = []; messages = []; events = []; members = [];
    selectedServerId = ""; selectedChannelId = "";
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedChannelId) return;
    await apiPost("/api/typing", { channelId: selectedChannelId, action: "stop" });
    if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
    const res = await apiPost("/api/messages", { channelId: selectedChannelId, content: newMessage });
    if (!res.ok) return;
    newMessage = "";
    await refreshMessages();
  }

  async function handleTyping() {
    if (!selectedChannelId || !newMessage.trim()) return;
    await apiPost("/api/typing", { channelId: selectedChannelId, action: "start" });
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(async () => { await apiPost("/api/typing", { channelId: selectedChannelId, action: "stop" }); typingTimeout = null; }, 3000);
  }

  async function createChannel() {
    if (!newChannel.trim()) return;
    const res = await apiPost("/api/channels", { name: newChannel, description: newChannelDescription });
    if (!res.ok) { showToast(await readApiError(res, "Create channel failed"), "error"); return; }
    newChannel = ""; newChannelDescription = "";
    showToast("Channel created.", "success");
    await refreshChannels();
  }

  async function confirmDeleteChannel(channelId: string, channelName: string) {
    if (!confirm(`Delete #${channelName}? This will permanently remove the channel and all its messages.`)) return;
    const res = await apiPost("/api/channels/delete", { channelId });
    if (!res.ok) { showToast(await readApiError(res, "Failed to delete channel"), "error"); return; }
    showToast(`#${channelName} deleted.`, "success");
    if (selectedChannelId === channelId) { selectedChannelId = ""; selectedChannelName = ""; messages = []; }
    await refreshChannels();
  }

  async function selectServer(server: Server) {
    selectedServerId = server.id; selectedChannelId = "";
    await refreshChannels(); await refreshEvents(); await refreshMembers();
  }

  async function selectChannel(channel: Channel) {
    selectedChannelId = channel.id; selectedChannelName = channel.name;
    await refreshMessages();
  }

  async function addReaction(messageId: string, emoji: string) {
    const res = await apiPost("/api/reactions", { messageId, emoji, action: "add" });
    if (res.ok) await refreshMessages();
    showEmojiPicker = false; selectedMessageForReaction = "";
  }

  async function removeReaction(messageId: string, emoji: string) {
    const res = await apiPost("/api/reactions", { messageId, emoji, action: "remove" });
    if (res.ok) await refreshMessages();
  }

  async function searchGifs(query: string, forReaction = false) {
    if (forReaction) isLoadingReactionGifs = true; else isLoadingGifs = true;
    try {
      const params = new URLSearchParams({ q: query, limit: "20" });
      const res = await apiGet(`/api/giphy?${params}`);
      if (res.ok) { const data = await res.json(); if (forReaction) reactionGifResults = data.gifs || []; else gifResults = data.gifs || []; }
    } finally { if (forReaction) isLoadingReactionGifs = false; else isLoadingGifs = false; }
  }

  async function loadTrendingGifs(forReaction = false) {
    if (forReaction) isLoadingReactionGifs = true; else isLoadingGifs = true;
    try {
      const res = await apiGet("/api/giphy?limit=20");
      if (res.ok) { const data = await res.json(); if (forReaction) reactionGifResults = data.gifs || []; else gifResults = data.gifs || []; }
    } finally { if (forReaction) isLoadingReactionGifs = false; else isLoadingGifs = false; }
  }

  function handleGifSearch(query: string, forReaction = false) {
    const timeout = forReaction ? reactionGifSearchTimeout : gifSearchTimeout;
    if (timeout) clearTimeout(timeout);
    const newTimeout = setTimeout(() => { if (query.trim()) searchGifs(query, forReaction); else loadTrendingGifs(forReaction); }, 300);
    if (forReaction) reactionGifSearchTimeout = newTimeout; else gifSearchTimeout = newTimeout;
  }

  function openGifPicker() { showGifPicker = true; gifSearchQuery = ""; gifResults = []; loadTrendingGifs(); }
  function closeGifPicker() { showGifPicker = false; gifSearchQuery = ""; gifResults = []; }

  async function sendGifMessage(gif: GifItem) {
    if (!selectedChannelId) return;
    const res = await apiPost("/api/messages", { channelId: selectedChannelId, content: `[gif:${gif.url}]` });
    if (res.ok) { closeGifPicker(); await refreshMessages(); }
  }

  async function addGifReaction(messageId: string, gif: GifItem) {
    const res = await apiPost("/api/reactions", { messageId, emoji: `gif:${gif.url}`, action: "add" });
    if (res.ok) await refreshMessages();
    showEmojiPicker = false; selectedMessageForReaction = ""; reactionPickerTab = "emoji"; reactionGifSearch = ""; reactionGifResults = [];
  }

  const ALLOWED_GIF_HOSTS = ["media.giphy.com", "media0.giphy.com", "media1.giphy.com", "media2.giphy.com", "media3.giphy.com", "media4.giphy.com", "i.giphy.com"];

  function isAllowedGifUrl(url: string): boolean {
    try { return ALLOWED_GIF_HOSTS.includes(new URL(url).hostname); } catch { return false; }
  }

  function isGifMessage(content: string): { isGif: boolean; url: string } {
    const match = content.match(/^\[gif:(https:\/\/[^\]]+)\]$/);
    if (match && isAllowedGifUrl(match[1])) return { isGif: true, url: match[1] };
    return { isGif: false, url: "" };
  }

  function isGifReaction(emoji: string): { isGif: boolean; url: string } {
    if (emoji.startsWith("gif:")) { const url = emoji.slice(4); if (isAllowedGifUrl(url)) return { isGif: true, url }; }
    return { isGif: false, url: "" };
  }

  async function useInvite() {
    if (!inviteCode.trim()) return;
    const res = await apiPost("/api/invites", { action: "use", code: inviteCode });
    if (!res.ok) { showToast(await readApiError(res, "Invalid invite"), "error"); return; }
    inviteCode = ""; showInviteModal = false;
    showToast("Joined server!", "success");
    await refreshServers();
  }

  async function createInvite(serverId: string) {
    const res = await apiPost("/api/invites", { serverId, maxUses: 0, expiresInMs: 7 * 24 * 60 * 60 * 1000 });
    if (!res.ok) { showToast(await readApiError(res, "Failed to create invite"), "error"); return; }
    const data = await res.json();
    navigator.clipboard.writeText(window.location.origin + "?invite=" + data.code);
    showToast("Invite link copied to clipboard!", "success");
  }

  async function refreshPendingUsers() {
    if (me?.role !== "admin") return;
    const res = await apiGet("/api/admin/users");
    if (!res.ok) return;
    pendingUsers = await res.json();
  }

  async function approveUser(username: string) {
    const res = await apiPost("/api/admin/users/approve", { username });
    if (!res.ok) { showToast(await readApiError(res, "Failed to approve user"), "error"); return; }
    showToast(`${username} approved!`, "success");
    await refreshPendingUsers();
  }

  async function rejectPendingUser(username: string) {
    const res = await apiPost("/api/admin/users/reject", { username });
    if (!res.ok) { showToast(await readApiError(res, "Failed to reject user"), "error"); return; }
    showToast(`${username} rejected.`, "success");
    await refreshPendingUsers();
  }

  async function createEvent() {
    if (!newEventTitle.trim() || !newEventStartsAt || !newEventEndsAt) return;
    const res = await apiPost("/api/events", {
      serverId: selectedServerId, title: newEventTitle, description: newEventDescription,
      location: newEventLocation, startsAt: new Date(newEventStartsAt).getTime(), endsAt: new Date(newEventEndsAt).getTime()
    });
    if (!res.ok) { showToast(await readApiError(res, "Failed to create event"), "error"); return; }
    newEventTitle = ""; newEventDescription = ""; newEventLocation = ""; newEventStartsAt = ""; newEventEndsAt = "";
    showEventCreate = false;
    showToast("Event created!", "success");
    await refreshEvents();
  }

  function formatEventTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function openEmojiPicker(messageId: string) { selectedMessageForReaction = messageId; showEmojiPicker = true; }

  function getReactionIcon(id: string): ReactionDef | undefined {
    return REACTION_ICONS.find(r => r.id === id);
  }

  async function unsendMessage(messageId: string) {
    const csrf = getCookie("band_chat_csrf");
    const headers: Record<string, string> = { "content-type": "application/json", "x-csrf-token": csrf };
    if (headerSessionToken) headers.authorization = `Bearer ${headerSessionToken}`;
    const deleteRes = await fetch("/api/messages", { method: "DELETE", credentials: "same-origin", headers, body: JSON.stringify({ messageId }) });
    if (!deleteRes.ok) { showToast(await readApiError(deleteRes, "Failed to unsend"), "error"); return; }
    showToast("Message unsent.", "success");
    contextMenuMessageId = "";
    await refreshMessages();
  }

  function handleMessagePointerDown(event: PointerEvent, messageId: string, author: string) {
    longPressTimer = setTimeout(() => {
      contextMenuMessageId = messageId; contextMenuAuthor = author;
      contextMenuX = Math.min(event.clientX || window.innerWidth / 2, window.innerWidth - 160);
      contextMenuY = Math.min(event.clientY || window.innerHeight / 2, window.innerHeight - 200);
      longPressTimer = null;
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  }

  function handleMessagePointerUp() { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } }

  function handleMessageContextMenu(event: MouseEvent, messageId: string, author: string) {
    event.preventDefault();
    contextMenuMessageId = messageId; contextMenuAuthor = author;
    contextMenuX = event.clientX; contextMenuY = event.clientY;
  }

  function closeContextMenu() { contextMenuMessageId = ""; }

  function closeEmojiPicker() {
    showEmojiPicker = false; reactionPickerTab = "emoji"; reactionGifSearch = ""; reactionGifResults = []; emojiSearchQuery = "";
  }

  function closeSidebars() { showChannelSidebar = false; showMemberList = false; }

  function toggleMemberList() {
    showMemberList = !showMemberList;
    if (showMemberList) { showCalendar = false; showChannelSidebar = false; }
  }

  function toggleChannelSidebar() {
    showChannelSidebar = !showChannelSidebar;
    if (showChannelSidebar) { showMemberList = false; showCalendar = false; }
  }

  function toggleCalendar() {
    showCalendar = !showCalendar;
    if (showCalendar) { showMemberList = false; showChannelSidebar = false; }
  }

  function isAudioMessage(content: string): { isAudio: boolean; url: string; name: string } {
    const match = content.match(/^(https?:\/\/\S+\.(mp3|wav|ogg|flac|aac|m4a))$/i);
    if (match) return { isAudio: true, url: match[1], name: match[1].split('/').pop() || 'audio' };
    return { isAudio: false, url: '', name: '' };
  }

  const statusColors: Record<string, string> = {
    online: 'bg-status-online',
    idle: 'bg-status-idle',
    dnd: 'bg-status-dnd',
    offline: 'bg-status-offline',
  };

  const avatarColors = ['#7c3aed', '#2563eb', '#e11d48', '#059669', '#d97706', '#db2777', '#4f46e5', '#ca8a04', '#be185d', '#0891b2'];

  function getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
  }

  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const invite = urlParams.get("invite");
    if (invite) { inviteCode = invite; showInviteModal = true; }

    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        if ('PushManager' in window) {
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) pushNotificationsEnabled = true;
        }
      } catch (error) { console.error('Service Worker registration failed:', error); }
    }

    // DEV MODE: skip auth and load mock data when no DB is available
    const DEV_PREVIEW = location.search.includes('preview');
    if (DEV_PREVIEW) {
      me = { username: 'jude', role: 'admin', status: 'approved' };
      servers = [{ id: '1', name: 'Jazz Ensemble', description: 'Main server', iconUrl: '' }];
      selectedServerId = '1';
      channels = [
        { id: 'c1', name: 'general', description: 'General chat' },
        { id: 'c2', name: 'practice-log', description: 'Log your practice sessions' },
        { id: 'c3', name: 'setlist', description: 'Upcoming setlist discussion' },
      ];
      selectedChannelId = 'c1';
      selectedChannelName = 'general';
      members = [
        { id: 'm1', username: 'jude', role: 'admin', presenceStatus: 'online' },
        { id: 'm2', username: 'alex', role: 'member', presenceStatus: 'online' },
        { id: 'm3', username: 'sam', role: 'member', presenceStatus: 'idle' },
        { id: 'm4', username: 'nina', role: 'member', presenceStatus: 'offline' },
      ];
      messages = [
        { id: '1', author: 'alex', content: 'Hey everyone! Practice at 7pm tomorrow?', createdAt: Date.now() - 3600000, reactions: [] },
        { id: '2', author: 'jude', content: 'Sounds good, I\'ll bring the charts', createdAt: Date.now() - 3500000, reactions: [] },
        { id: '3', author: 'sam', content: 'I might be 10 min late but I\'ll be there', createdAt: Date.now() - 3000000, reactions: [] },
        { id: '4', author: 'alex', content: 'No worries. Let\'s run through the new arrangement first', createdAt: Date.now() - 2500000, reactions: [] },
        { id: '5', author: 'jude', content: 'Perfect. See you all there!', createdAt: Date.now() - 2000000, reactions: [] },
      ];
      events = [
        { id: 'e1', title: 'Weekly Rehearsal', description: 'Run through setlist', startsAt: Date.now() + 86400000, endsAt: Date.now() + 86400000 + 7200000, location: 'Studio B' },
      ];
      pendingUsers = [{ id: 'p1', username: 'newbie', role: 'member', status: 'pending', createdAt: Date.now() - 86400000 }];
      scrollToBottom();
      return;
    }

    await refreshMe();
    await refreshServers();
    await refreshChannels();
    await refreshMembers();
    await refreshPendingUsers();

    refreshInterval = setInterval(async () => {
      await refreshMessages();
      await refreshTyping();
      await refreshMembers();
    }, 2000);
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
    if (typingTimeout) clearTimeout(typingTimeout);
    if (toastTimeout) clearTimeout(toastTimeout);
    if (longPressTimer) clearTimeout(longPressTimer);
  });
</script>

<svelte:head>
  <title>Band Chat</title>
</svelte:head>

<!-- ==================== AUTH SCREEN ==================== -->
{#if !isAuthenticated}
  <div class="fixed inset-0 flex items-center justify-center bg-surface-0 px-6 py-10 sm:px-10">
    <!-- Subtle radial glow behind the card -->
    <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-accent/[0.04] blur-[120px]"></div>

    <div class="animate-fade-in relative w-full max-w-[440px] rounded-3xl border border-border bg-surface-1 px-8 py-10 sm:px-10 sm:py-12 shadow-2xl shadow-black/30">
      <!-- Logo & Header -->
      <div class="mb-10 text-center">
        <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent shadow-lg shadow-accent/20">
          <svg viewBox="0 0 32 32" width="30" height="30" fill="none">
            <path d="M9 22V10l7 6 7-6v12" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">
          {authMode === "login" ? "Welcome back" : "Create account"}
        </h1>
        <p class="mt-2 text-[14px] leading-relaxed text-text-tertiary">
          {authMode === "login" ? "Sign in to continue to your band." : "First account becomes the admin."}
        </p>
      </div>

      <!-- Tabs -->
      <div class="mb-8 grid grid-cols-2 rounded-xl bg-surface-0/80 p-1.5">
        <button
          class="rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all duration-200 {authMode === 'login' ? 'bg-surface-3 text-text-primary shadow-md shadow-black/20' : 'text-text-tertiary hover:text-text-secondary'}"
          on:click={() => authMode = "login"}
        >Sign in</button>
        <button
          class="rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all duration-200 {authMode === 'register' ? 'bg-surface-3 text-text-primary shadow-md shadow-black/20' : 'text-text-tertiary hover:text-text-secondary'}"
          on:click={() => authMode = "register"}
        >Register</button>
      </div>

      <!-- Fields -->
      {#if authMode === "login"}
        <div class="space-y-5">
          <label class="block">
            <span class="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-text-tertiary">Username</span>
            <input
              class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-3 text-[15px] text-text-primary outline-none transition-all duration-200 placeholder:text-text-tertiary/60 focus:border-accent/50 focus:bg-surface-0 focus:ring-2 focus:ring-accent/10"
              bind:value={loginUsername} placeholder="your-username" autocomplete="username"
              on:keydown={(e) => e.key === 'Enter' && login()}
            />
          </label>
          <label class="block">
            <span class="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-text-tertiary">Password</span>
            <input
              class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-3 text-[15px] text-text-primary outline-none transition-all duration-200 placeholder:text-text-tertiary/60 focus:border-accent/50 focus:bg-surface-0 focus:ring-2 focus:ring-accent/10"
              bind:value={loginPassword} type="password" placeholder="Enter password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
              on:keydown={(e) => e.key === 'Enter' && login()}
            />
          </label>
          <button
            class="mt-3 w-full rounded-xl bg-accent px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-accent/20 transition-all duration-200 hover:bg-accent-hover hover:shadow-accent/30 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
            on:click={login} disabled={isLoggingIn}
          >{isLoggingIn ? "Signing in..." : "Sign in"}</button>
        </div>
      {:else}
        <div class="space-y-5">
          <label class="block">
            <span class="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-text-tertiary">Username</span>
            <input
              class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-3 text-[15px] text-text-primary outline-none transition-all duration-200 placeholder:text-text-tertiary/60 focus:border-accent/50 focus:bg-surface-0 focus:ring-2 focus:ring-accent/10"
              bind:value={registerUsername} placeholder="Choose a username" autocomplete="username"
              on:keydown={(e) => e.key === 'Enter' && register()}
            />
          </label>
          <label class="block">
            <span class="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-text-tertiary">Password</span>
            <input
              class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-3 text-[15px] text-text-primary outline-none transition-all duration-200 placeholder:text-text-tertiary/60 focus:border-accent/50 focus:bg-surface-0 focus:ring-2 focus:ring-accent/10"
              bind:value={registerPassword} type="password" placeholder="12+ characters" autocomplete="new-password"
              on:keydown={(e) => e.key === 'Enter' && register()}
            />
          </label>
          <button
            class="mt-3 w-full rounded-xl bg-accent px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-accent/20 transition-all duration-200 hover:bg-accent-hover hover:shadow-accent/30 hover:-translate-y-px active:translate-y-0"
            on:click={register}
          >Create account</button>
        </div>
      {/if}
    </div>
  </div>

<!-- ==================== MAIN APP ==================== -->
{:else}
  <div class="fixed inset-0 flex flex-col bg-surface-0" style="padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px);">
    <div class="flex min-h-0 flex-1 overflow-hidden">

      <!-- ===== CHANNEL SIDEBAR ===== -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      {#if showChannelSidebar}
        <div class="fixed inset-0 z-40 bg-black/60 md:hidden" on:click={() => showChannelSidebar = false}></div>
      {/if}
      <aside class="
        fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-surface-1 transition-transform duration-200 md:relative md:z-auto md:w-[240px] md:translate-x-0
        {showChannelSidebar ? 'translate-x-0' : '-translate-x-full'}
      " style="padding-top: env(safe-area-inset-top, 0px);">
        <!-- Server Header -->
        <div class="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 class="truncate text-[15px] font-semibold tracking-tight text-text-primary">
            {servers.find(s => s.id === selectedServerId)?.name || "Band Chat"}
          </h2>
          <div class="flex items-center gap-1">
            {#if selectedServerId}
              <button class="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-glass-hover hover:text-text-secondary" on:click={() => createInvite(selectedServerId)} title="Create Invite">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            {/if}
            <button class="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-glass-hover hover:text-text-secondary md:hidden" on:click={() => showChannelSidebar = false}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <button class="icon-btn desktop-close-btn" on:click={() => showChannelSidebar = false} title="Close">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        </div>

        <!-- Admin Section -->
        {#if me?.role === "admin"}
          <div class="border-b border-border px-3 py-2">
            <button
              class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:bg-glass-hover hover:text-text-primary"
              on:click={() => showAdminPanel = !showAdminPanel}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6m3-3h-6"/></svg>
              Admin
              {#if pendingUsers.length > 0}
                <span class="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{pendingUsers.length}</span>
              {/if}
            </button>

          </div>
        {/if}

        <!-- Channel List -->
        <div class="flex-1 overflow-y-auto px-2 pt-3 pb-2">
          {#if rehearsalCountdown && nextEvent}
            <div class="mb-3 flex items-center gap-2 rounded-lg bg-accent-subtle px-3 py-2 text-[12px] text-text-primary">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>Next: <strong>{nextEvent.title}</strong> in <strong>{rehearsalCountdown}</strong></span>
            </div>
          {/if}

          <p class="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Text Channels</p>

          {#if channels.length === 0}
            <p class="px-2 py-4 text-center text-[13px] text-text-tertiary">No channels yet.</p>
          {/if}

          <div class="space-y-px">
            {#each channels as channel}
              <button
                class="group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-left transition-all duration-150
                  {channel.id === selectedChannelId
                    ? 'bg-glass-selected text-text-primary'
                    : 'text-text-secondary hover:bg-glass-hover hover:text-text-primary'}"
                on:click={() => { selectChannel(channel); showChannelSidebar = false; }}
                on:contextmenu={(e) => { if (me?.role === 'admin') { e.preventDefault(); confirmDeleteChannel(channel.id, channel.name); } }}
              >
                <span class="shrink-0 text-[16px] leading-none opacity-50 font-medium">#</span>
                <span class="truncate text-[14px] font-medium">{channel.name}</span>
                {#if me?.role === "admin"}
                  <span
                    class="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-tertiary/0 transition-colors group-hover:text-text-tertiary group-hover:hover:text-danger"
                    on:click|stopPropagation={() => confirmDeleteChannel(channel.id, channel.name)}
                    role="button"
                    tabindex="-1"
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- User Footer -->
        <div class="flex h-[52px] shrink-0 items-center gap-2.5 border-t border-border bg-surface-0/50 px-3">
          <div class="relative">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
              {me?.username?.slice(0, 1).toUpperCase()}
            </div>
            <span class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[2.5px] border-surface-1 {statusColors[myPresence] || 'bg-status-online'}"></span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-semibold leading-tight text-text-primary">{me?.username}</p>
            <p class="truncate text-[11px] leading-tight text-text-tertiary capitalize">{myPresence}</p>
          </div>
          <button class="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-glass-hover hover:text-danger" on:click={logout} title="Sign out">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </aside>

      <!-- ===== MAIN CHAT AREA ===== -->
      <section class="flex min-w-0 flex-1 flex-col bg-surface-2">
        <!-- Chat Header -->
        <header class="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <div class="flex items-center gap-2">
            <button class="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-glass-hover hover:text-text-secondary md:hidden" on:click={toggleChannelSidebar}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            {#if selectedChannelName}
              <span class="text-[17px] font-medium text-text-secondary opacity-60">#</span>
              <h3 class="text-[15px] font-semibold tracking-tight text-text-primary">{selectedChannelName}</h3>
            {:else}
              <h3 class="text-[15px] font-medium text-text-tertiary">Select a channel</h3>
            {/if}
          </div>
          <div class="flex items-center gap-1">
            <button
              class="flex h-8 w-8 items-center justify-center rounded-lg transition-colors {showCalendar ? 'bg-glass-selected text-text-primary' : 'text-text-tertiary hover:bg-glass-hover hover:text-text-secondary'}"
              on:click={toggleCalendar} title="Events"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </button>
            <button
              class="flex h-8 w-8 items-center justify-center rounded-lg transition-colors {showMemberList ? 'bg-glass-selected text-text-primary' : 'text-text-tertiary hover:bg-glass-hover hover:text-text-secondary'}"
              on:click={toggleMemberList} title="Members"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
            </button>
            <div class="relative">
              <button
                class="flex h-8 w-8 items-center justify-center rounded-lg transition-colors {showNotificationPrefs ? 'bg-glass-selected text-text-primary' : 'text-text-tertiary hover:bg-glass-hover hover:text-text-secondary'}"
                on:click={() => showNotificationPrefs = !showNotificationPrefs} title="Notifications"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </button>
              {#if showNotificationPrefs}
                <div class="absolute right-0 top-10 z-50 min-w-[200px] rounded-xl border border-border bg-surface-3 p-3 shadow-xl shadow-black/40">
                  <div class="mb-2 flex items-center justify-between border-b border-border pb-2">
                    <span class="text-[13px] font-semibold text-text-primary">Push Notifications</span>
                    <button
                      class="rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors {pushNotificationsEnabled ? 'bg-status-online text-surface-0' : 'bg-surface-4 text-text-secondary'}"
                      on:click|stopPropagation={togglePushNotifications}
                    >{pushNotificationsEnabled ? 'On' : 'Off'}</button>
                  </div>
                  {#each /** @type {const} */ ([['all', 'All messages'], ['mentions', 'Mentions only'], ['dms', 'DMs only'], ['none', 'None']]) as [value, label]}
                    <label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-text-secondary transition-colors hover:bg-glass-hover hover:text-text-primary">
                      <input type="radio" name="notif" class="accent-accent" checked={notificationPref === value} on:change={() => setNotificationPref(value as 'all' | 'mentions' | 'dms' | 'none')} />
                      {label}
                    </label>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </header>

        <!-- Reconnecting -->
        {#if connectionStatus === "reconnecting"}
          <div class="flex items-center gap-2 bg-status-idle/10 px-4 py-1.5 text-[12px] font-medium text-status-idle">
            <span class="h-2 w-2 rounded-full bg-status-idle animate-pulse-skeleton"></span> Reconnecting...
          </div>
        {/if}

        <!-- New Messages Bar -->
        {#if showNewMessagesBar}
          <button class="flex items-center justify-center gap-2 bg-accent px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-accent-hover" on:click={jumpToBottom}>
            {newMessagesCount} new {newMessagesCount === 1 ? 'message' : 'messages'} — Jump to bottom
          </button>
        {/if}

        <!-- Calendar View -->
        {#if showCalendar}
          <div class="flex-1 overflow-y-auto">
            <div class="mx-auto max-w-2xl p-4">
              <div class="mb-4 flex items-center justify-between">
                <h2 class="text-lg font-semibold text-text-primary">Events</h2>
                <button class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover" on:click={() => showEventCreate = true}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Create Event
                </button>
              </div>

              {#if events.length === 0}
                <div class="flex flex-col items-center justify-center py-16 text-center">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1" class="mb-3 text-text-tertiary"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <p class="text-[14px] text-text-secondary">No events scheduled</p>
                  <p class="mt-1 text-[12px] text-text-tertiary">Create an event to get started</p>
                </div>
              {:else}
                <div class="space-y-3">
                  {#each events as event}
                    <div class="rounded-xl border border-border bg-surface-1 p-4 transition-colors hover:border-border-hover">
                      <h3 class="text-[15px] font-semibold text-text-primary">{event.title}</h3>
                      <div class="mt-2 flex items-center gap-1.5 text-[13px] text-text-secondary">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {formatEventTime(event.startsAt)}
                      </div>
                      {#if event.location}
                        <div class="mt-1 flex items-center gap-1.5 text-[13px] text-text-secondary">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {event.location}
                        </div>
                      {/if}
                      {#if event.description}
                        <p class="mt-2 text-[13px] leading-relaxed text-text-tertiary">{event.description}</p>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

        <!-- Messages -->
        {:else}
          <div class="flex-1 overflow-y-auto" bind:this={messageContainer} on:scroll={handleScroll}>
            <div class="flex min-h-full flex-col justify-end px-4 pb-4">
              {#if isLoadingMessages}
                {#each Array(5) as _}
                  <div class="mt-4 flex gap-3">
                    <div class="h-10 w-10 shrink-0 rounded-full bg-surface-3 animate-pulse-skeleton"></div>
                    <div class="flex-1 space-y-2 py-1">
                      <div class="h-3 w-24 rounded bg-surface-3 animate-pulse-skeleton"></div>
                      <div class="h-3 w-48 rounded bg-surface-3 animate-pulse-skeleton"></div>
                      <div class="h-3 w-32 rounded bg-surface-3 animate-pulse-skeleton"></div>
                    </div>
                  </div>
                {/each}
              {:else if messages.length === 0}
                <div class="flex flex-col items-center justify-center py-16 text-center">
                  <p class="text-[14px] text-text-secondary">No messages yet</p>
                  <p class="mt-1 text-[12px] text-text-tertiary">Start the conversation!</p>
                </div>
              {:else}
                {#each messages as msg, i}
                  {@const isFirstInGroup = i === 0 || messages[i - 1].author !== msg.author || (msg.createdAt - messages[i - 1].createdAt > 300000)}
                  {#if isFirstInGroup}
                    <!-- First message in group -->
                    <div
                      class="group relative mt-[17px] -mx-2 flex gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-glass"
                      on:contextmenu={(e) => handleMessageContextMenu(e, msg.id, msg.author)}
                      on:pointerdown={(e) => handleMessagePointerDown(e, msg.id, msg.author)}
                      on:pointerup={handleMessagePointerUp}
                      on:pointerleave={handleMessagePointerUp}
                    >
                      <div
                        class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                        style:background-color={getAvatarColor(msg.author)}
                      >{msg.author.slice(0, 1).toUpperCase()}</div>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-baseline gap-2">
                          <span class="text-[14px] font-semibold text-text-primary">{msg.author}</span>
                          <span class="text-[11px] text-text-tertiary">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        {#if isGifMessage(msg.content).isGif}
                          <img src={isGifMessage(msg.content).url} alt="GIF" loading="lazy" draggable="false" class="mt-1 max-w-[300px] rounded-lg" />
                        {:else if isAudioMessage(msg.content).isAudio}
                          <div class="mt-1 flex items-center gap-3 rounded-lg bg-surface-3 px-3 py-2">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="shrink-0 text-accent"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
                            <div class="min-w-0 flex-1">
                              <span class="block truncate text-[13px] text-text-secondary">{isAudioMessage(msg.content).name}</span>
                              <!-- svelte-ignore a11y-media-has-caption -->
                              <audio controls src={isAudioMessage(msg.content).url} class="mt-1 h-8 w-full"></audio>
                            </div>
                          </div>
                        {:else}
                          <p class="text-[15px] leading-[1.45] text-text-primary/90">{@html parseMarkdown(msg.content)}</p>
                        {/if}

                        <!-- Reactions -->
                        {#if msg.reactions && msg.reactions.length > 0}
                          <div class="mt-1.5 flex flex-wrap gap-1.5">
                            {#each msg.reactions as reaction}
                              {@const icon = getReactionIcon(reaction.emoji)}
                              <button
                                class="flex items-center gap-1 rounded-full px-2 py-[3px] text-[12px] transition-all
                                  {reaction.users.includes(me?.username || '')
                                    ? 'bg-accent-subtle border border-accent/30 text-text-primary'
                                    : 'bg-glass border border-border text-text-secondary hover:bg-glass-hover hover:border-border-hover'}"
                                on:click={() => {
                                  if (reaction.users.includes(me?.username || '')) removeReaction(msg.id, reaction.emoji);
                                  else addReaction(msg.id, reaction.emoji);
                                }}
                                title={reaction.users.join(', ')}
                              >
                                <span class="flex items-center">
                                  {#if isGifReaction(reaction.emoji).isGif}
                                    <img src={isGifReaction(reaction.emoji).url} alt="GIF" class="h-4 w-4 rounded" />
                                  {:else if icon}
                                    {@html icon.svg}
                                  {:else}
                                    {reaction.emoji}
                                  {/if}
                                </span>
                                <span class="font-medium">{reaction.count}</span>
                              </button>
                            {/each}
                          </div>
                        {/if}
                      </div>

                      <!-- Hover toolbar -->
                      <div class="absolute -top-3.5 right-2 flex items-center rounded-lg border border-border bg-surface-3 opacity-0 shadow-lg shadow-black/30 transition-all duration-150 group-hover:opacity-100">
                        {#each REACTION_ICONS.slice(0, 4) as icon}
                          <button class="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:text-text-primary" on:click={() => addReaction(msg.id, icon.id)} title={icon.label}>
                            {@html icon.svg}
                          </button>
                        {/each}
                        <button class="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:text-text-secondary" on:click={() => { selectedMessageForReaction = msg.id; showEmojiPicker = true; }} title="More">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                      </div>
                    </div>
                  {:else}
                    <!-- Continuation message -->
                    <div
                      class="group relative -mx-2 flex gap-3 rounded-lg px-2 transition-colors hover:bg-glass"
                      on:contextmenu={(e) => handleMessageContextMenu(e, msg.id, msg.author)}
                      on:pointerdown={(e) => handleMessagePointerDown(e, msg.id, msg.author)}
                      on:pointerup={handleMessagePointerUp}
                      on:pointerleave={handleMessagePointerUp}
                    >
                      <div class="w-10 shrink-0 pt-[3px] text-center">
                        <span class="hidden text-[10px] font-medium text-text-tertiary group-hover:inline">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div class="min-w-0 flex-1 py-[1px]">
                        {#if isGifMessage(msg.content).isGif}
                          <img src={isGifMessage(msg.content).url} alt="GIF" loading="lazy" draggable="false" class="max-w-[300px] rounded-lg" />
                        {:else if isAudioMessage(msg.content).isAudio}
                          <div class="flex items-center gap-3 rounded-lg bg-surface-3 px-3 py-2">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="shrink-0 text-accent"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
                            <div class="min-w-0 flex-1">
                              <span class="block truncate text-[13px] text-text-secondary">{isAudioMessage(msg.content).name}</span>
                              <!-- svelte-ignore a11y-media-has-caption -->
                              <audio controls src={isAudioMessage(msg.content).url} class="mt-1 h-8 w-full"></audio>
                            </div>
                          </div>
                        {:else}
                          <p class="text-[15px] leading-[1.45] text-text-primary/90">{@html parseMarkdown(msg.content)}</p>
                        {/if}

                        {#if msg.reactions && msg.reactions.length > 0}
                          <div class="mt-1.5 flex flex-wrap gap-1.5">
                            {#each msg.reactions as reaction}
                              {@const icon = getReactionIcon(reaction.emoji)}
                              <button
                                class="flex items-center gap-1 rounded-full px-2 py-[3px] text-[12px] transition-all
                                  {reaction.users.includes(me?.username || '')
                                    ? 'bg-accent-subtle border border-accent/30 text-text-primary'
                                    : 'bg-glass border border-border text-text-secondary hover:bg-glass-hover hover:border-border-hover'}"
                                on:click={() => {
                                  if (reaction.users.includes(me?.username || '')) removeReaction(msg.id, reaction.emoji);
                                  else addReaction(msg.id, reaction.emoji);
                                }}
                                title={reaction.users.join(', ')}
                              >
                                <span class="flex items-center">
                                  {#if isGifReaction(reaction.emoji).isGif}
                                    <img src={isGifReaction(reaction.emoji).url} alt="GIF" class="h-4 w-4 rounded" />
                                  {:else if icon}
                                    {@html icon.svg}
                                  {:else}
                                    {reaction.emoji}
                                  {/if}
                                </span>
                                <span class="font-medium">{reaction.count}</span>
                              </button>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/if}
                {/each}
              {/if}

              <!-- Typing -->
              {#if typingUsers.length > 0}
                <div class="mt-2 px-2 text-[12px] text-text-tertiary">
                  <strong class="text-text-secondary">{typingUsers.join(', ')}</strong> {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </div>
              {/if}
            </div>
          </div>

          <!-- Message Input -->
          <div class="shrink-0 px-4 pb-4 pt-1">
            <div class="flex items-center rounded-xl bg-surface-3/80 transition-colors focus-within:bg-surface-3">
              <button
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-l-xl text-text-tertiary transition-colors hover:text-text-secondary disabled:opacity-30"
                on:click={openGifPicker} disabled={!selectedChannelId} title="GIF"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="3"/><text x="12" y="14.5" text-anchor="middle" font-size="7" font-weight="800" fill="currentColor" stroke="none">GIF</text></svg>
              </button>
              <input
                class="min-w-0 flex-1 bg-transparent py-3 text-[14px] text-text-primary placeholder-text-tertiary outline-none"
                bind:value={newMessage}
                on:input={handleTyping}
                placeholder={selectedChannelId ? `Message #${selectedChannelName || "channel"}` : "Select a channel"}
                disabled={!selectedChannelId}
                on:keydown={(event) => event.key === "Enter" && sendMessage()}
              />
              <button
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-r-xl transition-colors {newMessage.trim() && selectedChannelId ? 'text-accent hover:text-accent-hover' : 'text-text-tertiary/30'}"
                on:click={sendMessage} disabled={!selectedChannelId || !newMessage.trim()}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </div>
          </div>
        {/if}
      </section>

      <!-- ===== MEMBER SIDEBAR ===== -->
      {#if showMemberList}
        <div class="fixed inset-0 z-40 bg-black/60 md:hidden" on:click={() => showMemberList = false}></div>
      {/if}
      <aside class="
        fixed inset-y-0 right-0 z-50 flex w-[280px] flex-col bg-surface-1 transition-transform duration-200 md:relative md:z-auto md:w-[240px] md:translate-x-0
        {showMemberList ? 'translate-x-0' : 'translate-x-full md:hidden'}
      " style="padding-top: env(safe-area-inset-top, 0px);">
        <div class="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 class="text-[15px] font-semibold text-text-primary">Members</h2>
          <button class="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-glass-hover hover:text-text-secondary md:hidden" on:click={() => showMemberList = false}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-3 pt-4 pb-4">
          {#each ['online', 'idle', 'dnd', 'offline'] as status}
            {@const statusMembers = members.filter(m => m.presenceStatus === status)}
            {#if statusMembers.length > 0}
              <h4 class="mb-1.5 mt-4 px-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary first:mt-0">
                {status === 'dnd' ? 'Do Not Disturb' : status.charAt(0).toUpperCase() + status.slice(1)} &mdash; {statusMembers.length}
              </h4>
              {#each statusMembers as member}
                <div class="flex items-center gap-2.5 rounded-lg px-2 py-[6px] transition-all duration-150 hover:bg-glass-hover {status === 'offline' ? 'opacity-40' : ''}">
                  <div class="relative">
                    <div
                      class="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style:background-color={getAvatarColor(member.username)}
                    >{member.username.slice(0, 1).toUpperCase()}</div>
                    <span class="absolute -bottom-0.5 -right-0.5 h-[11px] w-[11px] rounded-full border-[2px] border-surface-1 {statusColors[member.presenceStatus] || 'bg-status-offline'}"></span>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <span class="truncate text-[13px] font-medium text-text-primary">{member.username}</span>
                      {#if member.role === 'admin'}
                        <span class="shrink-0 rounded bg-glass px-1.5 py-px text-[10px] font-medium text-accent">Admin</span>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          {/each}
          {#if members.length === 0}
            <p class="py-8 text-center text-[13px] text-text-tertiary">No members found.</p>
          {/if}
        </div>
      </aside>
    </div>

    <!-- Mobile Header Bar (replaces bottom nav) -->
    <!-- On mobile the header icons (events/members/settings) are already in the chat header,
         and the channel sidebar is opened via the hamburger in the chat header.
         No redundant bottom tab bar needed. -->
  </div>
{/if}

<!-- ==================== DRAWERS (vaul-svelte) ==================== -->

<!-- Emoji/Reaction Picker -->
<Drawer.Root bind:open={showEmojiPicker} onClose={closeEmojiPicker}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 z-[60] bg-black/60" />
    <Drawer.Content class="fixed inset-x-0 bottom-0 z-[60] flex max-h-[85vh] flex-col rounded-t-2xl bg-surface-2 outline-none">
      <div class="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-surface-4"></div>
      <Drawer.Title class="px-5 pt-3 pb-1 text-[16px] font-semibold text-text-primary">Add Reaction</Drawer.Title>

      <div class="flex gap-0 border-b border-border px-5">
        <button
          class="border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-semibold transition-colors {reactionPickerTab === 'emoji' ? 'border-accent text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-secondary'}"
          on:click={() => reactionPickerTab = "emoji"}
        >Emoji</button>
        <button
          class="border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-semibold transition-colors {reactionPickerTab === 'gif' ? 'border-accent text-text-primary' : 'border-transparent text-text-tertiary hover:text-text-secondary'}"
          on:click={() => { reactionPickerTab = "gif"; if (reactionGifResults.length === 0) loadTrendingGifs(true); }}
        >GIF</button>
      </div>

      {#if reactionPickerTab === "emoji"}
        <div class="px-5 pt-3" data-vaul-no-drag>
          <input class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent/50" bind:value={emojiSearchQuery} placeholder="Search emoji..." />
        </div>
        <div class="grid grid-cols-6 gap-1 overflow-y-auto p-5" data-vaul-no-drag>
          {#each filteredEmojis as icon}
            <button class="flex h-11 w-full items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-glass-hover hover:text-text-primary active:scale-90" on:click={() => { addReaction(selectedMessageForReaction, icon.id); closeEmojiPicker(); }} title={icon.label}>
              {@html icon.svg}
            </button>
          {/each}
          {#if filteredEmojis.length === 0}
            <p class="col-span-6 py-6 text-center text-[13px] text-text-tertiary">No emoji found.</p>
          {/if}
        </div>
      {:else}
        <div class="px-5 pt-3" data-vaul-no-drag>
          <input class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent/50" bind:value={reactionGifSearch} on:input={() => handleGifSearch(reactionGifSearch, true)} placeholder="Search GIFs..." />
        </div>
        <div class="overflow-y-auto p-5" data-vaul-no-drag>
          {#if isLoadingReactionGifs}
            <p class="py-8 text-center text-[13px] text-text-tertiary">Loading GIFs...</p>
          {:else if reactionGifResults.length === 0}
            <p class="py-8 text-center text-[13px] text-text-tertiary">No GIFs found.</p>
          {:else}
            <div class="grid grid-cols-2 gap-2">
              {#each reactionGifResults as gif}
                <button class="overflow-hidden rounded-xl transition-transform hover:scale-[1.02] active:scale-95" on:click={() => addGifReaction(selectedMessageForReaction, gif)}>
                  <img src={gif.preview || gif.url} alt={gif.title} loading="lazy" class="h-24 w-full object-cover" />
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <div class="border-t border-border px-5 py-2 text-center text-[10px] text-text-tertiary">Powered by GIPHY</div>
      {/if}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<!-- GIF Picker -->
<Drawer.Root bind:open={showGifPicker} onClose={closeGifPicker}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 z-[60] bg-black/60" />
    <Drawer.Content class="fixed inset-x-0 bottom-0 z-[60] flex max-h-[80vh] flex-col rounded-t-2xl bg-surface-2 outline-none">
      <div class="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-surface-4"></div>
      <Drawer.Title class="px-5 pt-3 pb-1 text-[16px] font-semibold text-text-primary">Choose a GIF</Drawer.Title>
      <div class="px-5 pb-3" data-vaul-no-drag>
        <input class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent/50" bind:value={gifSearchQuery} on:input={() => handleGifSearch(gifSearchQuery)} placeholder="Search GIFs..." />
      </div>
      <div class="overflow-y-auto px-5 pb-5" data-vaul-no-drag>
        {#if isLoadingGifs}
          <p class="py-8 text-center text-[13px] text-text-tertiary">Loading GIFs...</p>
        {:else if gifResults.length === 0}
          <p class="py-8 text-center text-[13px] text-text-tertiary">No GIFs found.</p>
        {:else}
          <div class="grid grid-cols-2 gap-2">
            {#each gifResults as gif}
              <button class="overflow-hidden rounded-xl transition-transform hover:scale-[1.02] active:scale-95" on:click={() => sendGifMessage(gif)}>
                <img src={gif.preview || gif.url} alt={gif.title} loading="lazy" class="h-28 w-full object-cover" />
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <div class="border-t border-border px-5 py-2 text-center text-[10px] text-text-tertiary">Powered by GIPHY</div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<!-- Context Menu (long-press actions) -->
<Drawer.Root open={!!contextMenuMessageId} onClose={closeContextMenu}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 z-[70] bg-black/60" />
    <Drawer.Content class="fixed inset-x-0 bottom-0 z-[70] rounded-t-2xl bg-surface-2 outline-none">
      <div class="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-surface-4"></div>
      <Drawer.Title class="sr-only">Message Actions</Drawer.Title>
      <div class="space-y-0.5 px-3 py-3">
        <button class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14px] font-medium text-text-primary transition-colors hover:bg-glass-hover active:bg-glass-active" on:click={() => { selectedMessageForReaction = contextMenuMessageId; showEmojiPicker = true; closeContextMenu(); }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          Add Reaction
        </button>
        {#if contextMenuAuthor === me?.username || me?.role === 'admin'}
          <button class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[14px] font-medium text-danger transition-colors hover:bg-danger/10 active:bg-danger/15" on:click={() => unsendMessage(contextMenuMessageId)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Unsend Message
          </button>
        {/if}
      </div>
      <div class="px-3 pb-4">
        <button class="w-full rounded-xl bg-surface-3 py-3 text-center text-[14px] font-medium text-text-secondary transition-colors hover:bg-surface-4 active:bg-glass-active" on:click={closeContextMenu}>Cancel</button>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<!-- Invite Drawer -->
<Drawer.Root bind:open={showInviteModal}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 z-[60] bg-black/60" />
    <Drawer.Content class="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl bg-surface-2 outline-none">
      <div class="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-surface-4"></div>
      <div class="px-5 pt-4 pb-6">
        <Drawer.Title class="text-[16px] font-semibold text-text-primary">Join Server</Drawer.Title>
        <p class="mt-1 text-[13px] text-text-tertiary">Enter an invite code to join a server</p>
        <input class="mt-4 w-full rounded-xl border border-border bg-surface-0/60 px-4 py-3 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent/50" bind:value={inviteCode} placeholder="Invite code" data-vaul-no-drag />
        <div class="mt-5 flex gap-3">
          <button class="flex-1 rounded-xl bg-surface-3 py-3 text-[14px] font-medium text-text-secondary transition-colors hover:bg-surface-4" on:click={() => showInviteModal = false}>Cancel</button>
          <button class="flex-1 rounded-xl bg-accent py-3 text-[14px] font-semibold text-white transition-colors hover:bg-accent-hover" on:click={useInvite}>Join</button>
        </div>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<!-- Create Event Drawer -->
<Drawer.Root bind:open={showEventCreate}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 z-[60] bg-black/60" />
    <Drawer.Content class="fixed inset-x-0 bottom-0 z-[60] max-h-[90vh] overflow-y-auto rounded-t-2xl bg-surface-2 outline-none">
      <div class="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-surface-4"></div>
      <div class="space-y-4 px-5 pt-4 pb-6" data-vaul-no-drag>
        <Drawer.Title class="text-[16px] font-semibold text-text-primary">Create Event</Drawer.Title>
        <input class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-3 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent/50" bind:value={newEventTitle} placeholder="Event title" />
        <textarea class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-3 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent/50" bind:value={newEventDescription} placeholder="Description" rows="3"></textarea>
        <input class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-3 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent/50" bind:value={newEventLocation} placeholder="Location (optional)" />
        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Starts</span>
            <input class="w-full rounded-xl border border-border bg-surface-0/60 px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-accent/50" type="datetime-local" bind:value={newEventStartsAt} />
          </label>
          <label class="block">
            <span class="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Ends</span>
            <input class="w-full rounded-xl border border-border bg-surface-0/60 px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-accent/50" type="datetime-local" bind:value={newEventEndsAt} />
          </label>
        </div>
        <div class="flex gap-3 pt-1">
          <button class="flex-1 rounded-xl bg-surface-3 py-3 text-[14px] font-medium text-text-secondary transition-colors hover:bg-surface-4" on:click={() => showEventCreate = false}>Cancel</button>
          <button class="flex-1 rounded-xl bg-accent py-3 text-[14px] font-semibold text-white transition-colors hover:bg-accent-hover" on:click={createEvent}>Create</button>
        </div>
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<!-- Admin Panel Drawer -->
<Drawer.Root bind:open={showAdminPanel}>
  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 z-[60] bg-black/60" />
    <Drawer.Content class="fixed inset-x-0 bottom-0 z-[60] max-h-[80vh] rounded-t-2xl bg-surface-2 outline-none">
      <div class="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-surface-4"></div>
      <div class="px-5 pt-4 pb-6">
        <Drawer.Title class="text-[16px] font-semibold text-text-primary">Admin Panel</Drawer.Title>

        <!-- Create Channel -->
        <div class="mt-5">
          <p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Create Channel</p>
          <div class="space-y-2" data-vaul-no-drag>
            <input class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-3 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent/50" bind:value={newChannel} placeholder="channel-name" />
            <input class="w-full rounded-xl border border-border bg-surface-0/60 px-4 py-3 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent/50" bind:value={newChannelDescription} placeholder="Description (optional)" />
            <button class="w-full rounded-xl bg-accent py-3 text-[14px] font-semibold text-white transition-colors hover:bg-accent-hover" on:click={createChannel}>Create Channel</button>
          </div>
        </div>

        <!-- Pending Requests -->
        <div class="mt-6">
          <p class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Pending Requests</p>
        </div>
        {#if pendingUsers.length === 0}
          <div class="flex flex-col items-center py-10 text-center">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" class="mb-3 text-text-tertiary"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
            <p class="text-[14px] text-text-tertiary">No pending requests</p>
          </div>
        {:else}
          <div class="mt-4 space-y-2" data-vaul-no-drag>
            {#each pendingUsers as user}
              <div class="flex items-center justify-between rounded-xl bg-surface-1 px-4 py-3.5">
                <div>
                  <p class="text-[14px] font-medium text-text-primary">{user.username}</p>
                  <p class="mt-0.5 text-[11px] text-text-tertiary">Registered {new Date(user.createdAt).toLocaleDateString()}</p>
                </div>
                <div class="flex gap-2">
                  <button class="rounded-lg bg-status-online/15 px-3.5 py-1.5 text-[12px] font-semibold text-status-online transition-colors hover:bg-status-online/25" on:click={() => approveUser(user.username)}>Approve</button>
                  <button class="rounded-lg bg-danger/10 px-3.5 py-1.5 text-[12px] font-semibold text-danger transition-colors hover:bg-danger/20" on:click={() => rejectPendingUser(user.username)}>Deny</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
 main
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<!-- Toast -->
{#if toastMessage}
  <div class="animate-toast fixed bottom-6 right-6 z-[80] flex min-w-[280px] max-w-[420px] items-center gap-3 rounded-xl border border-border bg-surface-3 px-4 py-3 shadow-xl shadow-black/40" style="bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px)); right: calc(1.5rem + env(safe-area-inset-right, 0px));">
    <div class="h-full w-1 shrink-0 self-stretch rounded-full {toastType === 'error' ? 'bg-danger' : 'bg-success'}"></div>
    <span class="text-[13px] font-semibold text-text-primary">{toastMessage}</span>
  </div>
{/if}
=======
    </div>
  {/if}

  {#if toastMessage}
    <section class="toast" class:error={toastType === "error"} class:success={toastType === "success"} role="status">
      {toastMessage}
    </section>
  {/if}
</main>

<style>
  /* ===== BASE ===== */
  .discord-app {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-root);
    color: var(--text-body);
    font-size: 0.875rem;
    overflow: hidden;
  }

  /* ===== TOAST ===== */
  .toast {
    position: fixed;
    right: max(1rem, env(safe-area-inset-right, 0px));
    bottom: max(1.5rem, env(safe-area-inset-bottom, 0px));
    z-index: 30;
    min-width: min(360px, calc(100vw - 2rem));
    max-width: 420px;
    padding: 0.75rem 1rem 0.75rem 1.25rem;
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-weight: 600;
    font-size: 0.875rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    box-shadow: 0 12px 32px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    /* Prevent overlap with home indicator */
    max-height: calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 3rem);
  }

  .toast::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
  }

  .toast.error::before {
    background: var(--error);
  }

  .toast.success::before {
    background: var(--success);
  }

  /* ===== AUTH ===== */
  .auth-shell {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    animation: auth-fade-in 0.5s ease-out;
  }

  @keyframes auth-fade-in {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .auth-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 2.5rem;
    width: min(400px, 100%);
    display: grid;
    gap: 1.5rem;
  }

  .auth-header {
    display: grid;
    gap: 0.5rem;
    text-align: center;
    justify-items: center;
  }

  .auth-logo {
    margin-bottom: 0.25rem;
  }

  .auth-header h1 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.375rem;
    font-weight: 600;
    letter-spacing: -0.025em;
  }

  .auth-header p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .auth-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    background: var(--bg-inset);
    border-radius: var(--radius-md);
    padding: 3px;
  }

  .auth-tab {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.5rem 0.75rem;
    border-radius: 7px;
    cursor: pointer;
    transition: all 150ms ease-out;
    font-family: inherit;
  }

  .auth-tab:hover {
    color: var(--text-secondary);
  }

  .auth-tab.active {
    background: var(--bg-elevated);
    color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
  }

  .auth-fields {
    display: grid;
    gap: 1rem;
  }

  .field-label {
    display: grid;
    gap: 0.375rem;
  }

  .field-label span {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    letter-spacing: -0.01em;
  }

  .auth-submit {
    margin-top: 0.25rem;
    padding: 0.75rem 1rem;
  }

  /* ===== CHAT SHELL ===== */
  .chat-shell {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  /* ===== MAIN CHAT AREA ===== */
  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .messages-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.5rem;
    scroll-behavior: smooth;
    min-height: 0;
  }

  .sidebar-overlay {
    display: none;
  }

  /* ===== CHANNEL SIDEBAR ===== */
  .channel-sidebar {
    height: 100%;
    background: var(--bg-surface);
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border-subtle);
    min-height: 0;
    padding-top: env(safe-area-inset-top, 0px);
  }

  .sidebar-header {
    padding: 0.875rem 1rem;
    padding-top: calc(0.875rem + env(safe-area-inset-top, 0px));
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }

  .sidebar-header h2,
  .chat-header h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-header-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .mobile-close-btn {
    display: none;
  }

  .desktop-close-btn {
    display: grid;
  }

  /* Admin Section */
  .admin-section {
    margin: 8px;
    border-radius: 8px;
    overflow: hidden;
  }

  .admin-section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--bg-base-tertiary, #1e1f22);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 150ms ease-out;
    color: var(--text-muted, #949ba4);
    font-size: 13px;
    font-weight: 600;
    width: 100%;
    text-align: left;
  }

  .admin-section-header:hover {
    background: var(--bg-modifier-hover, rgba(79,84,92,0.16));
    color: var(--text-normal, #dbdee1);
  }

  .admin-badge {
    margin-left: auto;
    background: var(--red-500, #f04054);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
  }

  .admin-panel-content {
    padding: 8px;
    background: var(--bg-base-tertiary, #1e1f22);
    margin-top: 4px;
    border-radius: 8px;
  }

  .admin-panel-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #949ba4);
    text-transform: uppercase;
    margin: 0 0 8px 0;
  }

  .admin-empty {
    font-size: 13px;
    color: var(--text-muted, #949ba4);
    padding: 8px;
    text-align: center;
  }

  .pending-user-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px;
    background: var(--bg-base-secondary, #2b2d31);
    border-radius: 6px;
    margin-bottom: 4px;
  }

  .pending-username {
    font-size: 13px;
    color: var(--text-normal, #dbdee1);
    font-weight: 500;
  }

  .pending-actions {
    display: flex;
    gap: 4px;
  }

  .admin-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    display: grid;
    place-items: center;
    font-size: 14px;
    font-weight: 700;
    transition: all 150ms ease-out;
  }

  .admin-btn.approve {
    background: var(--green-500, #00ba7c);
    color: #fff;
  }

  .admin-btn.approve:hover {
    background: var(--green-600, #00965e);
  }

  .admin-btn.deny {
    background: var(--red-500, #f04054);
    color: #fff;
  }

  .admin-btn.deny:hover {
    background: var(--red-600, #da373c);
  }

  .admin-create {
    padding: 0.75rem 0.875rem;
    display: grid;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border-subtle);
  }

  .section-title {
    margin: 0;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.6875rem;
    font-weight: 600;
  }

  .channels-wrap {
    flex: 1;
    min-height: 0;
    padding: 0.5rem 0.5rem 0.75rem;
    display: grid;
    gap: 0.25rem;
    overflow-y: auto;
    align-content: start;
  }

  .channel-list {
    overflow-y: auto;
    overflow-x: hidden;
    display: grid;
    gap: 1px;
    align-content: start;
  }

  .channel-link {
    border: 0;
    background: transparent;
    color: var(--text-muted, #949ba4);
    text-align: left;
    padding: 8px 10px;
    border-radius: var(--radius-sm, 6px);
    cursor: pointer;
    font-weight: 500;
    font-size: 0.9375rem;
    transition: all 150ms ease-out;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .channel-link:hover {
    background: var(--bg-modifier-hover, rgba(79,84,92,0.16));
    color: var(--text-normal, #dbdee1);
  }

  .channel-link.active {
    background: var(--bg-modifier-selected, rgba(79,84,92,0.32));
    color: var(--text-normal, #dbdee1);
  }

  .channel-link::before {
    content: '#';
    font-size: 1.25rem;
    color: var(--text-muted, #949ba4);
    font-weight: 400;
  }

  .channel-link-row {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .channel-link-row .channel-link {
    flex: 1;
    min-width: 0;
  }

  .channel-delete-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm, 6px);
    background: transparent;
    border: none;
    color: var(--text-muted, #949ba4);
    cursor: pointer;
    display: grid;
    place-items: center;
    opacity: 0;
    transition: all 150ms ease-out;
    flex-shrink: 0;
    padding: 0;
  }

  .channel-link-row:hover .channel-delete-btn {
    opacity: 1;
  }

  .channel-delete-btn:hover {
    background: var(--red-500, #f04054);
    color: #fff;
  }

  .user-footer {
    background: var(--bg-base-tertiary, #1e1f22);
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  }

  .user-footer strong {
    color: var(--text-normal, #dbdee1);
    font-size: 13px;
    font-weight: 600;
  }

  .footer-actions {
    display: flex;
    gap: 4px;
  }

  /* ===== MAIN CHAT AREA ===== */
  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-root);
  }

  .chat-header {
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-root);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .chat-header-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }

  .chat-header-left h3 {
    font-size: 0.9375rem;
  }

  .hamburger-btn {
    display: none;
  }

  .chat-header-actions {
    display: flex;
    gap: 0.25rem;
  }

  .chat-header-actions .icon-btn.active {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* ===== RECONNECTING ===== */
  .reconnecting-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 5;
    background: var(--warning);
    color: var(--bg-root);
    text-align: center;
    padding: 0.35rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .reconnecting-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--bg-root);
    animation: reconnect-pulse 1.2s ease-in-out infinite;
  }

  @keyframes reconnect-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  /* ===== SKELETON ===== */
  .message-row.skeleton {
    pointer-events: none;
  }

  .skeleton-avatar {
    background: var(--bg-hover) !important;
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  .skeleton-line {
    height: 0.85rem;
    border-radius: 4px;
    background: var(--bg-hover);
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  .skeleton-name {
    width: 120px;
    margin-bottom: 0.4rem;
  }

  .skeleton-text {
    width: 80%;
  }

  .skeleton-text.short {
    width: 45%;
    margin-top: 0.3rem;
  }

  @keyframes skeleton-shimmer {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.6; }
  }

  /* ===== PRESENCE ===== */
  .presence-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--bg-inset);
    flex-shrink: 0;
  }

  .presence-dot.online { background: var(--online); }
  .presence-dot.idle { background: var(--idle); }
  .presence-dot.dnd { background: var(--dnd); }
  .presence-dot.offline { background: var(--offline); }

  .user-footer-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  /* ===== MESSAGES ===== */
  .messages-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.5rem;
    scroll-behavior: smooth;
    min-height: 0;
  }

  .message-row {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-sm, 6px);
    transition: background 150ms ease-out;
    user-select: none;
    -webkit-user-select: none;
    position: relative;
  }

  .message-row:hover {
    background: var(--background-message-hover, rgba(4,4,5,0.07));
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full, 50%);
    background: var(--brand-experiment, #5865f2);
    color: #fff;
    display: grid;
    place-items: center;
    font-weight: 600;
    font-size: 0.875rem;
    flex-shrink: 0;
    cursor: pointer;
    transition: border-radius 150ms ease-out;
  }

  .avatar:hover {
    border-radius: var(--radius-md, 8px);
  }

  .message-content {
    min-width: 0;
    padding-top: 2px;
  }

  .message-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 2px;
  }

  .message-head strong {
    color: var(--text-normal, #dbdee1);
    font-size: 1rem;
    font-weight: 500;
    letter-spacing: 0;
    cursor: pointer;
  }

  .message-head strong:hover {
    text-decoration: underline;
  }

  .message-head .msg-time {
    color: var(--text-muted, #949ba4);
    font-size: 0.75rem;
    font-weight: 400;
    opacity: 0.6;
    transition: opacity 150ms ease-out;
  }

  .message-row:hover .msg-time {
    opacity: 1;
  }

  .message-content :global(p.message-text) {
    margin: 0;
    color: var(--text-normal, #dbdee1);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.375rem;
    font-size: 0.9375rem;
    font-weight: 400;
  }

  /* Markdown */
  .message-content :global(code) {
    background: var(--bg-base-tertiary, #1e1f22);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
    padding: 0.125rem 0.3rem;
    border-radius: 4px;
    font-family: "Consolas", "Monaco", "Courier New", monospace;
    font-size: 0.85em;
    color: var(--text-normal, #dbdee1);
  }

  .message-content :global(pre) {
    background: var(--bg-base-tertiary, #1e1f22);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
    padding: 1rem;
    border-radius: var(--radius-md, 8px);
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .message-content :global(pre code) {
    background: none;
    border: none;
    padding: 0;
  }

  .message-content :global(a) {
    color: var(--text-link, #00a8fc);
    text-decoration: none;
  }

  .message-content :global(a:hover) {
    text-decoration: underline;
  }

  .message-content :global(.mention) {
    background: var(--brand-experiment-100, rgba(88,101,242,0.1));
    color: var(--brand-experiment-500, #5865f2);
    padding: 0 0.25rem;
    border-radius: 3px;
    cursor: pointer;
  }

  .message-content :global(.mention:hover) {
    background: var(--brand-experiment-200, rgba(88,101,242,0.2));
  }

  .message-content :global(.channel-ref) {
    background: var(--bg-modifier-hover, rgba(79,84,92,0.16));
    color: var(--text-normal, #dbdee1);
    padding: 0 0.25rem;
    border-radius: 3px;
    cursor: pointer;
  }

  .message-content :global(.channel-ref:hover) {
    background: var(--bg-modifier-selected, rgba(79,84,92,0.32));
    text-decoration: underline;
  }

  /* ===== QUICK REACTIONS ===== */
  .quick-reactions {
    display: none;
    gap: 0.25rem;
    position: absolute;
    top: 0.25rem;
    right: 0.5rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 0.2rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 2;
  }

  .message-row:hover .quick-reactions,
  .message-row:focus-within .quick-reactions {
    display: flex;
    pointer-events: auto;
  }

  @media (hover: none) {
    .quick-reactions {
      position: static;
      display: flex;
      pointer-events: auto;
      background: transparent;
      border: none;
      padding: 0;
      box-shadow: none;
      margin-top: 0.35rem;
    }
  }

  .quick-react-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-full);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    color: var(--text-muted);
    display: grid;
    place-items: center;
    cursor: pointer;
    padding: 0;
    transition: all 150ms ease-out;
  }

  .quick-react-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
    color: var(--text-secondary);
    transform: scale(1.15);
  }

  .quick-react-btn :global(svg) {
    width: 14px;
    height: 14px;
  }

  .more-react-btn {
    background: transparent;
    border-style: dashed;
  }

  /* ===== REACTIONS ===== */
  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.5rem;
  }

  .reaction-badge {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    padding: 0.2rem 0.55rem;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    transition: all 150ms ease-out;
    font-family: inherit;
  }

  .reaction-badge:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
    transform: translateY(-1px);
  }

  .reaction-badge.own-reaction {
    background: var(--accent-subtle);
    border-color: var(--accent);
  }

  .reaction-badge .reaction-icon {
    display: flex;
    align-items: center;
    width: 16px;
    height: 16px;
    color: var(--text-secondary);
  }

  .reaction-badge .reaction-icon :global(svg) {
    width: 16px;
    height: 16px;
  }

  .reaction-badge.own-reaction .reaction-icon {
    color: var(--accent-text);
  }

  .reaction-badge .count {
    font-size: 0.6875rem;
    color: var(--text-muted);
    font-weight: 600;
  }

  .reaction-badge.own-reaction .count {
    color: var(--accent-text);
  }

  /* ===== CONTEXT MENU ===== */
  .context-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0,0,0,0.4);
    cursor: default;
  }

  .context-menu {
    position: fixed;
    background: var(--bg-base-secondary, #2b2d31);
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
    border-radius: 8px;
    padding: 8px 0;
    min-width: 180px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    z-index: 10000;
    pointer-events: auto;
  }

  .context-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    background: transparent;
    border: none;
    color: var(--text-normal, #dbdee1);
    text-align: left;
    padding: 10px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-family: inherit;
    transition: background 150ms ease-out;
    pointer-events: auto;
  }

  .context-item:hover {
    background: var(--brand-experiment, #5865f2);
  }

  .context-item.danger {
    color: var(--red-400, #f45768);
  }

  .context-item.danger:hover {
    background: var(--red-500, #f04054);
    color: #fff;
  }

  /* ===== TYPING ===== */
  .typing-indicator {
    color: var(--text-muted);
    font-size: 0.8125rem;
    font-style: italic;
    padding: 0 0.5rem;
  }

  .typing-indicator strong {
    color: var(--text-body);
    font-weight: 600;
  }

  /* ===== COMPOSER ===== */
  .composer {
    padding: 0 1rem 1rem;
  }

  .composer-input-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.375rem 0.5rem;
    transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
  }

  .composer-input-row:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .composer-input-row .field {
    flex: 1;
    border: none;
    background: transparent;
    padding: 0.5rem 0.5rem;
  }

  .composer-input-row .field:focus {
    border-color: transparent;
    box-shadow: none;
  }

  .gif-btn {
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    padding: 6px;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms ease-out, color 150ms ease-out;
    flex-shrink: 0;
  }

  .gif-btn:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .gif-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ===== FORM ELEMENTS ===== */
  .field,
  textarea.field {
    width: 100%;
    border: 1px solid var(--border);
    background: var(--bg-inset);
    color: var(--text-primary);
    border-radius: var(--radius-md);
    padding: 0.625rem 0.75rem;
    outline: none;
    font-family: inherit;
    font-size: 0.875rem;
    resize: vertical;
    transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
  }

  .field:focus,
  textarea.field:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }

  .field::placeholder {
    color: var(--text-muted);
  }

  .field:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ===== BUTTONS ===== */
  .primary-btn,
  .ghost-btn,
  .icon-btn {
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 600;
    font-family: inherit;
    font-size: 0.875rem;
    transition: all 150ms ease-out;
  }

  .primary-btn {
    background: linear-gradient(180deg, #1E1E24 0%, #2A2A32 100%);
    border: 1px solid rgba(255,255,255,0.10);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.04);
    color: var(--text-primary);
    padding: 0.625rem 1rem;
  }

  .primary-btn:hover {
    background: linear-gradient(180deg, #252530 0%, #32323C 100%);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.8), 0 4px 8px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.06);
  }

  .primary-btn:active {
    transform: scale(0.98);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.20);
  }

  .primary-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }

  .ghost-btn {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.08);
    color: var(--text-body);
    padding: 0.625rem 1rem;
  }

  .ghost-btn:hover {
    background: rgba(255,255,255,0.08);
    border-color: rgba(255,255,255,0.12);
  }

  .ghost-btn:active {
    transform: scale(0.98);
  }

  .icon-btn {
    background: transparent;
    border: none;
    padding: 6px;
    color: var(--text-muted);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-btn:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  /* ===== CALENDAR FULL PAGE ===== */
  .calendar-fullpage {
    position: fixed;
    inset: 0;
    background: var(--bg-root);
    z-index: 50;
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
  }

  .calendar-fullpage-header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-surface);
  }

  .calendar-fullpage-header h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.125rem;
    font-weight: 600;
  }

  .calendar-fullpage-content {
    padding: 1.5rem;
    overflow: auto;
    display: grid;
    gap: 1.5rem;
    align-content: start;
    max-width: 800px;
    width: 100%;
    margin: 0 auto;
  }

  .calendar-actions-bar {
    display: flex;
    gap: 0.75rem;
  }

  .calendar-events-grid {
    display: grid;
    gap: 0.75rem;
  }

  .calendar-empty {
    display: grid;
    place-items: center;
    gap: 0.5rem;
    padding: 3rem 1rem;
    color: var(--text-muted);
    text-align: center;
  }

  .calendar-empty p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.9375rem;
  }

  .calendar-empty-sub {
    font-size: 0.8125rem !important;
    color: var(--text-muted);
  }

  .event-card {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 0.75rem;
  }

  .event-header strong {
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .event-time,
  .event-location,
  .event-desc {
    margin: 0.3rem 0 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  /* ===== MEMBER SIDEBAR ===== */
  .member-sidebar {
    background: var(--bg-surface);
    border-left: 1px solid var(--border-subtle);
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
    overflow: hidden;
    width: 0;
    transition: width 200ms ease-out;
    padding-top: env(safe-area-inset-top, 0px);
  }

  .member-sidebar.open {
    width: 240px;
  }

  .member-sidebar .sidebar-header {
    padding-top: calc(0.875rem + env(safe-area-inset-top, 0px));
  }

  .member-list-content {
    padding: 0.75rem;
    overflow: auto;
    display: grid;
    gap: 0.15rem;
    align-content: start;
  }

  .member-list-content .section-title {
    margin-top: 0.75rem;
    margin-bottom: 0.35rem;
  }

  .member-list-content .section-title:first-child {
    margin-top: 0;
  }

  .member-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.5rem;
    border-radius: var(--radius-sm);
    cursor: default;
    transition: background 150ms ease-out;
  }

  .member-item:hover {
    background: var(--bg-hover);
  }

  .member-avatar-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .member-avatar-wrap .presence-dot {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 12px;
    height: 12px;
  }

  .avatar.small {
    width: 32px;
    height: 32px;
    font-size: 0.75rem;
    border-radius: var(--radius-sm);
  }

  .member-info {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .member-name {
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .member-name.admin {
    color: var(--accent-text);
  }

  .member-role-badge {
    font-size: 0.6875rem;
    background: var(--accent-subtle);
    color: var(--accent-text);
    padding: 0.1rem 0.4rem;
    border-radius: var(--radius-full);
    font-weight: 600;
    flex-shrink: 0;
  }

  /* ===== MODALS ===== */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.60);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  .modal {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 1.75rem;
    min-width: min(420px, 90vw);
    max-width: 600px;
    display: grid;
    gap: 1rem;
    box-shadow: 0 32px 64px -16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
  }

  .modal h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.0625rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .modal p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
  }

  .modal-actions {
    display: flex;
    gap: 0.6rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  /* ===== ADMIN PANEL ===== */
  .admin-panel-modal {
    max-height: 80vh;
    overflow-y: auto;
  }

  .admin-empty {
    display: grid;
    place-items: center;
    gap: 0.5rem;
    padding: 1.5rem 0;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .admin-empty p {
    margin: 0;
    color: var(--text-muted);
  }

  .pending-users-list {
    display: grid;
    gap: 0.5rem;
  }

  .pending-user-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-subtle);
  }

  .pending-user-info {
    display: grid;
    gap: 0.125rem;
    min-width: 0;
  }

  .pending-user-name {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .pending-user-date {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .pending-user-actions {
    display: flex;
    gap: 0.375rem;
    flex-shrink: 0;
  }

  .primary-btn.small,
  .ghost-btn.small {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
  }

  .danger-text {
    color: var(--error);
  }

  .danger-text:hover {
    background: var(--error-subtle);
    color: var(--error);
  }

  .badge-dot {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 8px;
    height: 8px;
    background: var(--error);
    border-radius: 50%;
    border: 2px solid var(--bg-surface);
  }

  .icon-btn.has-badge {
    position: relative;
  }

  /* ===== REACTION / GIF PICKER ===== */
  .reaction-picker,
  .gif-picker-modal {
    min-width: min(420px, 90vw);
    max-width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .reaction-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .reaction-picker-header h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1rem;
    font-weight: 600;
  }

  .picker-close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    transition: color 150ms ease-out;
  }

  .picker-close-btn:hover {
    color: var(--text-primary);
  }

  .reaction-tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
    background: var(--bg-inset);
    border-radius: var(--radius-md);
    padding: 0.2rem;
  }

  .reaction-tab {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-muted);
    padding: 0.45rem 0.75rem;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    transition: all 150ms ease-out;
  }

  .reaction-tab:hover {
    color: var(--text-secondary);
  }

  .reaction-tab.active {
    background: var(--bg-elevated);
    color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }

  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.35rem;
    overflow-y: auto;
    max-height: 280px;
  }

  .emoji-search-bar {
    margin-bottom: 0.6rem;
  }

  .emoji-btn {
    background: var(--bg-inset);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    padding: 0.65rem;
    cursor: pointer;
    transition: all 150ms ease-out;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .emoji-btn :global(svg) {
    width: 28px;
    height: 28px;
  }

  .emoji-btn:hover {
    background: var(--accent);
    transform: scale(1.08);
    color: var(--text-primary);
    border-color: var(--accent);
  }

  /* ===== GIF PICKER ===== */
  .gif-search-container {
    margin-bottom: 0.5rem;
  }

  .gif-search-input {
    font-size: 0.875rem;
  }

  .gif-grid-container {
    flex: 1;
    overflow-y: auto;
    min-height: 200px;
    max-height: 400px;
    border-radius: var(--radius-md);
  }

  .gif-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem;
  }

  .gif-item {
    background: var(--bg-inset);
    border: 2px solid transparent;
    border-radius: var(--radius-md);
    overflow: hidden;
    cursor: pointer;
    padding: 0;
    transition: all 150ms ease-out;
    aspect-ratio: auto;
  }

  .gif-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 8px;
  }

  .gif-item:hover {
    border-color: var(--accent);
    transform: scale(1.02);
  }

  .gif-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .gif-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--bg-hover);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .giphy-attribution {
    text-align: center;
    font-size: 0.6875rem;
    color: var(--text-muted);
    padding-top: 0.5rem;
    letter-spacing: 0.02em;
  }

  /* ===== GIF MESSAGES ===== */
  .gif-message {
    margin-top: 0.25rem;
    max-width: 320px;
    border-radius: var(--radius-lg);
    overflow: hidden;
    border: 1px solid var(--border-subtle);
  }

  .gif-message img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: var(--radius-lg);
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    pointer-events: none;
  }

  .gif-reaction-img {
    width: 18px;
    height: 18px;
    object-fit: cover;
    border-radius: 3px;
  }

  .gif-empty {
    padding: 1rem;
  }

  /* ===== UTILITY ===== */
  .empty-state {
    color: var(--text-muted);
    margin: 0;
    font-size: 0.875rem;
  }

  /* ===== REHEARSAL COUNTDOWN ===== */
  .rehearsal-countdown {
    background: var(--accent-subtle);
    border: 1px solid var(--accent);
    border-radius: var(--radius-md);
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }

  .rehearsal-countdown strong {
    color: var(--text-primary);
  }

  /* ===== AUDIO PLAYER ===== */
  .audio-player {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 0.65rem 0.9rem;
    margin-top: 0.25rem;
    max-width: 400px;
  }

  .audio-player-icon {
    color: var(--accent);
    flex-shrink: 0;
  }

  .audio-player-body {
    display: grid;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
  }

  .audio-player-name {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .audio-element {
    width: 100%;
    height: 32px;
    accent-color: var(--accent);
  }

  /* ===== BOTTOM SHEET ===== */
  .bottom-sheet-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .bottom-sheet {
    border-radius: 20px 20px 0 0;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    max-height: 55vh;
    padding: 0.5rem 1.25rem 1.25rem;
    animation: slide-up 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  }

  .bottom-sheet-handle {
    width: 36px;
    height: 4px;
    background: var(--bg-hover);
    border-radius: 2px;
    margin: 0.5rem auto 1rem;
  }

  @keyframes slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  /* ===== FOCUS VISIBLE ===== */
  :global(:focus-visible) {
    outline: none;
    box-shadow: 0 0 0 2px var(--bg-root), 0 0 0 4px var(--accent);
  }

  /* ===== RESPONSIVE ===== */
  @media (max-width: 1200px) {
    .chat-shell,
    .chat-shell:has(.member-sidebar),
    .chat-shell:has(.member-sidebar.open) {
      grid-template-columns: clamp(200px, 18vw, 280px) minmax(0, 1fr);
    }

    .member-sidebar {
      position: fixed;
      right: 0;
      top: 0;
      bottom: 0;
      z-index: 50;
      box-shadow: -4px 0 16px rgba(0,0,0,0.4);
      transform: translateX(100%);
      transition: transform 250ms cubic-bezier(0.32, 0.72, 0, 1), width 0s;
      width: 240px !important;
      padding-top: env(safe-area-inset-top, 0px);
    }

    .member-sidebar.open {
      transform: translateX(0);
    }
  }

  /* ===== DISCORD LAYOUT ===== */
  .discord-layout {
    display: flex;
    height: 100vh;
    height: 100dvh;
    background: var(--bg-base-primary, #313338);
    overflow: hidden;
  }

  /* Server Rail */
  .server-rail {
    width: 72px;
    background: var(--bg-base-tertiary, #1e1f22);
    display: flex;
    flex-direction: column;
    padding: 12px 0;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .server-rail-top {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .server-separator {
    width: 32px;
    height: 2px;
    background: var(--border-subtle, rgba(255,255,255,0.06));
    border-radius: 1px;
  }

  .server-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--bg-base-secondary, #2b2d31);
    border: none;
    color: var(--text-normal, #dbdee1);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: all 200ms ease-out;
    position: relative;
    overflow: hidden;
  }

  .server-icon:hover {
    border-radius: 16px;
    background: var(--brand-experiment, #5865f2);
    color: #fff;
  }

  .server-icon.active {
    border-radius: 16px;
    background: var(--brand-experiment, #5865f2);
  }

  .server-icon.active::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 50%;
    transform: translateY(-50%);
    width: 8px;
    height: 24px;
    background: #fff;
    border-radius: 0 4px 4px 0;
  }

  .server-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .server-icon-text {
    font-size: 14px;
    font-weight: 600;
  }

  .home-icon {
    background: var(--bg-base-secondary, #2b2d31);
  }

  .home-icon:hover,
  .home-icon.active {
    background: var(--brand-experiment, #5865f2);
  }

  .add-server {
    background: var(--bg-base-secondary, #2b2d31);
    color: var(--green-500, #00ba7c);
  }

  .add-server:hover {
    background: var(--green-500, #00ba7c);
    color: #fff;
  }

  .server-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }

  /* Channel Sidebar */
  .channel-sidebar {
    width: 240px;
    background: var(--bg-base-secondary, #2b2d31);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .channel-sidebar.no-server-rail {
    width: 280px;
  }

  .server-header {
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
    flex-shrink: 0;
  }

  .server-header h1 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-normal, #dbdee1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-action {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--text-normal, #dbdee1);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background 150ms ease-out;
  }

  .header-action:hover {
    background: var(--bg-modifier-hover, rgba(79,84,92,0.16));
  }

  .channels-container {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .channel-section {
    margin-bottom: 16px;
  }

  .channel-section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px 8px;
    color: var(--text-muted, #949ba4);
    cursor: pointer;
  }

  .channel-section-header:hover {
    color: var(--text-normal, #dbdee1);
  }

  .channel-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 8px;
  }

  .channel-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--text-muted, #949ba4);
    cursor: pointer;
    transition: all 150ms ease-out;
    text-align: left;
    width: 100%;
  }

  .channel-item:hover {
    background: var(--bg-modifier-hover, rgba(79,84,92,0.16));
    color: var(--text-normal, #dbdee1);
  }

  .channel-item.active {
    background: var(--bg-modifier-selected, rgba(79,84,92,0.32));
    color: var(--text-normal, #dbdee1);
  }

  .channel-hash {
    font-size: 20px;
    color: var(--text-muted, #949ba4);
    font-weight: 400;
  }

  .channel-name {
    flex: 1;
    font-size: 15px;
    font-weight: 500;
  }

  .channel-delete {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--text-muted, #949ba4);
    cursor: pointer;
    display: grid;
    place-items: center;
    opacity: 0;
    transition: all 150ms ease-out;
  }

  .channel-item:hover .channel-delete {
    opacity: 1;
  }

  .channel-delete:hover {
    background: var(--red-500, #f04054);
    color: #fff;
  }

  .event-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    margin: 8px;
    background: var(--bg-base-tertiary, #1e1f22);
    border-radius: 8px;
    cursor: pointer;
    transition: background 150ms ease-out;
  }

  .event-card:hover {
    background: var(--bg-modifier-hover, rgba(79,84,92,0.16));
  }

  .event-icon {
    color: var(--brand-experiment, #5865f2);
  }

  .event-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .event-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-normal, #dbdee1);
  }

  .event-time {
    font-size: 12px;
    color: var(--text-muted, #949ba4);
  }

  /* User Panel */
  .user-panel {
    height: 52px;
    background: var(--bg-base-tertiary, #1e1f22);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    flex-shrink: 0;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--brand-experiment, #5865f2);
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 600;
  }

  .user-details {
    display: flex;
    flex-direction: column;
  }

  .username {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-normal, #dbdee1);
  }

  .user-status {
    font-size: 11px;
    color: var(--text-muted, #949ba4);
  }

  .user-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .icon-btn-small {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--text-normal, #dbdee1);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background 150ms ease-out;
    position: relative;
  }

  .icon-btn-small:hover {
    background: var(--bg-modifier-hover, rgba(79,84,92,0.16));
  }

  .notification-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    background: var(--red-500, #f04054);
    border-radius: 50%;
  }

  /* Chat Area */
  .chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--bg-base-primary, #313338);
  }

  .chat-header {
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
    flex-shrink: 0;
  }

  .chat-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .channel-hash-lg {
    font-size: 24px;
    color: var(--text-muted, #949ba4);
    font-weight: 300;
  }

  .channel-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-normal, #dbdee1);
  }

  .header-divider {
    width: 1px;
    height: 24px;
    background: var(--border-subtle, rgba(255,255,255,0.08));
  }

  .channel-topic {
    font-size: 13px;
    color: var(--text-muted, #949ba4);
  }

  .chat-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-btn {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--text-muted, #949ba4);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: all 150ms ease-out;
  }

  .header-btn:hover {
    background: var(--bg-modifier-hover, rgba(79,84,92,0.16));
    color: var(--text-normal, #dbdee1);
  }

  /* Messages */
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px 0;
    display: flex;
    flex-direction: column;
  }

  .messages-loading,
  .messages-welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 48px 16px;
    color: var(--text-muted, #949ba4);
  }

  .welcome-icon {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background: var(--bg-base-tertiary, #1e1f22);
    display: grid;
    place-items: center;
    font-size: 32px;
    color: var(--text-muted, #949ba4);
  }

  .messages-welcome h3 {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-normal, #dbdee1);
    margin: 0;
  }

  .messages-welcome p {
    font-size: 14px;
    color: var(--text-muted, #949ba4);
    margin: 0;
  }

  .message {
    display: flex;
    gap: 16px;
    padding: 4px 16px;
    margin: 2px 0;
    border-radius: 4px;
    transition: background 150ms ease-out;
  }

  .message:hover {
    background: var(--background-message-hover, rgba(4,4,5,0.07));
  }

  .message-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--brand-experiment, #5865f2);
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 14px;
    font-weight: 600;
    flex-shrink: 0;
    cursor: pointer;
    transition: border-radius 150ms ease-out;
  }

  .message-avatar:hover {
    border-radius: 12px;
  }

  .message-content {
    flex: 1;
    min-width: 0;
  }

  .message-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
  }

  .message-author {
    font-size: 15px;
    font-weight: 500;
    color: var(--text-normal, #dbdee1);
    cursor: pointer;
  }

  .message-author:hover {
    text-decoration: underline;
  }

  .message-time {
    font-size: 12px;
    color: var(--text-muted, #949ba4);
  }

  .message-text {
    font-size: 15px;
    line-height: 1.375;
    color: var(--text-normal, #dbdee1);
    word-break: break-word;
  }

  .message-reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .reaction {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--bg-modifier-hover, rgba(79,84,92,0.16));
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    transition: all 150ms ease-out;
  }

  .reaction:hover {
    border-color: var(--brand-experiment, #5865f2);
  }

  .reaction.own {
    background: var(--brand-experiment-100, rgba(88,101,242,0.1));
    border-color: var(--brand-experiment-200, rgba(88,101,242,0.2));
  }

  .reaction-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted, #949ba4);
  }

  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    font-size: 13px;
    color: var(--text-muted, #949ba4);
  }

  .typing-dots {
    display: flex;
    gap: 4px;
  }

  .typing-dots span {
    width: 6px;
    height: 6px;
    background: var(--text-muted, #949ba4);
    border-radius: 50%;
    animation: typing-bounce 1.4s infinite;
  }

  .typing-dots span:nth-child(2) {
    animation-delay: 0.2s;
  }

  .typing-dots span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes typing-bounce {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-4px); }
  }

  /* Message Input */
  .message-input-container {
    padding: 0 16px 24px;
    flex-shrink: 0;
  }

  /* New Messages Notification Bar */
  .new-messages-bar {
    position: absolute;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--brand-experiment, #5865f2);
    color: #fff;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 12px rgba(88,101,242,0.4);
    z-index: 100;
    transition: all 200ms ease-out;
  }

  .new-messages-bar:hover {
    background: var(--brand-experiment-600, #3f45ba);
    transform: translateX(-50%) scale(1.02);
  }

  .new-messages-bar.hidden {
    opacity: 0;
    pointer-events: none;
    transform: translateX(-50%) translateY(-20px);
  }

  .message-input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-base-secondary, #2b2d31);
    border-radius: 8px;
    padding: 0 12px;
  }

  .input-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: transparent;
    border: none;
    color: var(--text-muted, #949ba4);
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: all 150ms ease-out;
    flex-shrink: 0;
  }

  .input-btn:hover {
    color: var(--text-normal, #dbdee1);
  }

  .input-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .message-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--text-normal, #dbdee1);
    font-size: 15px;
    padding: 12px 0;
    outline: none;
  }

  .message-input::placeholder {
    color: var(--text-muted, #949ba4);
  }

  /* Member Sidebar */
  .member-sidebar {
    width: 240px;
    background: var(--bg-base-secondary, #2b2d31);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  }

  .member-header {
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
    flex-shrink: 0;
  }

  .member-header h2 {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted, #949ba4);
    text-transform: uppercase;
  }

  .member-count {
    font-size: 12px;
    color: var(--text-muted, #949ba4);
  }

  .member-list {
    padding: 16px 8px;
    overflow-y: auto;
  }

  .member-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 150ms ease-out;
  }

  .member-item:hover {
    background: var(--bg-modifier-hover, rgba(79,84,92,0.16));
  }

  .member-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--brand-experiment, #5865f2);
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
    position: relative;
  }

  .member-avatar::after {
    content: '';
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 12px;
    height: 12px;
    background: var(--offline, #80848e);
    border: 2px solid var(--bg-base-secondary, #2b2d31);
    border-radius: 50%;
  }

  .member-avatar.online::after {
    background: var(--online, #23a559);
  }

  .member-avatar.idle::after {
    background: var(--idle, #f0b232);
  }

  .member-avatar.dnd::after {
    background: var(--dnd, #f23f43);
  }

  .member-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .member-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-normal, #dbdee1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .member-role {
    font-size: 11px;
    color: var(--text-muted, #949ba4);
  }

  /* Context Menu */
  .context-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }

  .context-menu {
    position: absolute;
    background: var(--bg-base-secondary, #2b2d31);
    border-radius: 8px;
    padding: 8px 0;
    min-width: 200px;
    box-shadow: var(--elevation-high, 0 8px 16px rgba(0,0,0,0.24));
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  }

  .context-option {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 16px;
    background: transparent;
    border: none;
    color: var(--text-normal, #dbdee1);
    cursor: pointer;
    text-align: left;
    font-size: 14px;
    transition: background 150ms ease-out;
  }

  .context-option:hover {
    background: var(--brand-experiment, #5865f2);
  }

  .context-option.danger {
    color: var(--red-400, #f45768);
  }

  .context-option.danger:hover {
    background: var(--red-500, #f04054);
    color: #fff;
  }

  /* Empty message */
  .empty-message {
    padding: 8px 16px;
    color: var(--text-muted, #949ba4);
    font-size: 14px;
  }

  /* Spinner */
  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--bg-modifier-hover, rgba(79,84,92,0.16));
    border-top-color: var(--brand-experiment, #5865f2);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ===== DISCORD-LIKE MOBILE UI ===== */
  @media (max-width: 980px) {
    .discord-layout,
    .chat-shell,
    .discord-layout:has(.member-sidebar),
    .chat-shell:has(.member-sidebar),
    .discord-layout:has(.member-sidebar.open),
    .chat-shell:has(.member-sidebar.open) {
      grid-template-columns: 1fr;
      height: 100%;
      height: 100dvh;
    }

    /* Hide server rail on mobile */
    .server-rail {
      display: none;
    }

    /* Show mobile close button on mobile */
    .mobile-close-btn {
      display: grid;
    }

    .desktop-close-btn {
      display: none;
    }

    .mobile-nav {
      display: flex;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: calc(64px + env(safe-area-inset-bottom, 0px));
      background: var(--bg-base-tertiary, #1e1f22);
      border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
      z-index: 1000;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      padding-top: 4px;
    }

    .mobile-nav-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      background: transparent;
      border: none;
      color: var(--text-muted, #949ba4);
      cursor: pointer;
      transition: all 150ms ease-out;
      padding: 6px 0;
      position: relative;
      min-width: 60px;
    }

    .mobile-nav-item.active {
      color: var(--text-normal, #dbdee1);
    }

    .mobile-nav-item.active::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 32px;
      height: 3px;
      background: var(--brand-experiment, #5865f2);
      border-radius: 0 0 4px 4px;
    }

    .mobile-nav-item svg {
      width: 24px;
      height: 24px;
    }

    .mobile-nav-item span {
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    .mobile-nav-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--brand-experiment, #5865f2);
      color: #fff;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(88,101,242,0.4);
      transition: transform 150ms ease-out;
    }

    .mobile-nav-toggle:active {
      transform: scale(0.95);
    }

    /* Channel drawer - Discord mobile style */
    .channel-sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: calc(60px + env(safe-area-inset-bottom, 0px));
      width: 85%;
      max-width: 320px;
      z-index: 110;
      transform: translateX(-100%);
      transition: transform 250ms cubic-bezier(0.32, 0.72, 0, 1);
      background: var(--bg-base-secondary, #2b2d31);
      border-right: none;
      box-shadow: 4px 0 24px rgba(0,0,0,0.5);
      padding-top: env(safe-area-inset-top, 0px);
      display: flex;
      flex-direction: column;
    }

    .channel-sidebar.open {
      transform: translateX(0);
    }

    .channel-sidebar .sidebar-header {
      background: var(--bg-base-tertiary, #1e1f22);
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
      padding: 12px 16px;
      padding-top: calc(12px + env(safe-area-inset-top, 0px));
      min-height: 56px;
    }

    .channel-sidebar .sidebar-header h2 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-normal, #dbdee1);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .channel-sidebar .user-footer {
      margin-top: auto;
      border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
      background: var(--bg-base-tertiary, #1e1f22);
      padding: 12px 16px;
      padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    }

    /* Member list drawer */
    .member-sidebar {
      position: fixed;
      right: 0;
      top: 0;
      bottom: calc(60px + env(safe-area-inset-bottom, 0px));
      width: 80%;
      max-width: 280px;
      z-index: 110;
      transform: translateX(100%);
      transition: transform 250ms cubic-bezier(0.32, 0.72, 0, 1);
      background: var(--bg-base-secondary, #2b2d31);
      border-left: none;
      box-shadow: -4px 0 24px rgba(0,0,0,0.5);
      padding-top: env(safe-area-inset-top, 0px);
    }

    .member-sidebar.open {
      transform: translateX(0);
    }

    .member-sidebar .sidebar-header {
      background: var(--bg-base-tertiary, #1e1f22);
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
      padding: 12px 16px;
      min-height: 56px;
    }

    /* Overlay backdrop */
    .sidebar-overlay {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 105;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      opacity: 0;
      animation: fade-in 200ms ease-out forwards;
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Chat header - mobile optimized */
    .chat-header {
      padding: 12px 16px;
      padding-top: calc(12px + env(safe-area-inset-top, 0px));
      min-height: 56px;
      background: var(--bg-base-primary, #313338);
      border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
    }

    .chat-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .chat-header h3 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-normal, #dbdee1);
    }

    .chat-header-actions {
      display: flex;
      gap: 8px;
    }

    .chat-header-actions .icon-btn {
      width: 36px;
      height: 36px;
    }

    /* Chat Area - mobile */
    .chat-area {
      padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
    }

    /* Message Input - mobile optimized */
    .message-input-container {
      padding: 0 16px 24px;
      flex-shrink: 0;
      padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
    }

    .message-input-wrapper {
      background: var(--bg-base-secondary, #2b2d31);
      border-radius: 8px;
      padding: 0 12px;
    }

    .message-input {
      font-size: 16px; /* Prevents iOS zoom */
      padding: 12px 0;
    }

    .input-btn {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
    }

    /* Composer - mobile optimized (legacy) */
    .composer {
      padding: 8px 16px;
      padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
      background: var(--bg-base-primary, #313338);
    }

    .composer-input-row {
      gap: 8px;
    }

    .composer-input-row .field {
      min-height: 44px;
      font-size: 16px; /* Prevents iOS zoom */
    }

    .composer-input-row .primary-btn {
      min-width: 70px;
      height: 44px;
      font-size: 14px;
      font-weight: 600;
    }

    /* Messages - mobile optimized */
    .messages-scroll {
      padding: 8px 0;
    }

    .message-row {
      padding: 8px 16px;
      gap: 12px;
    }

    .message-row .avatar {
      width: 36px;
      height: 36px;
      font-size: 14px;
    }

    .message-content :global(p.message-text) {
      font-size: 15px;
      line-height: 1.4;
    }

    /* Quick reactions - larger touch targets */
    .quick-reactions {
      gap: 6px;
    }

    .quick-reactions .quick-react-btn {
      width: 32px;
      height: 32px;
    }

    /* Context menu - mobile friendly */
    .context-backdrop {
      padding: 16px;
    }

    .context-menu {
      max-width: calc(100% - 32px);
      min-width: 200px;
    }

    .context-item {
      padding: 14px 16px;
      font-size: 1rem;
    }

    /* Bottom sheet for modals */
    .bottom-sheet {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      max-height: 80vh;
      border-radius: 16px 16px 0 0;
      margin: 0;
      width: 100%;
    }

    .bottom-sheet-backdrop {
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
    }

    /* Emoji picker - mobile */
    .reaction-picker {
      max-height: 70vh;
      width: 100%;
      border-radius: 16px 16px 0 0;
    }

    .emoji-grid {
      grid-template-columns: repeat(6, 1fr);
      gap: 4px;
    }

    .emoji-btn {
      width: 44px;
      height: 44px;
      font-size: 24px;
    }

    /* GIF picker - mobile */
    .gif-picker-modal {
      max-height: 80vh;
      width: 100%;
      border-radius: 16px 16px 0 0;
    }

    .gif-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
    }

    /* Auth - mobile */
    .auth-shell {
      padding: 16px;
      padding-top: calc(16px + env(safe-area-inset-top, 0px));
    }

    .auth-card {
      padding: 24px 16px;
    }

    .auth-fields .field {
      min-height: 48px;
      font-size: 16px;
    }

    .auth-submit {
      height: 48px;
      font-size: 16px;
      font-weight: 600;
    }

    /* Calendar - mobile */
    .calendar-fullpage {
      padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
    }

    /* Member list items - larger touch targets */
    .member-item {
      min-height: 52px;
      padding: 12px 16px;
    }

    /* Section titles */
    .section-title {
      padding: 12px 16px 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted, #949ba4);
      font-weight: 600;
    }

    /* Channel links - larger touch targets */
    .channel-link {
      min-height: 44px;
      padding: 10px 12px;
      font-size: 15px;
    }

    .channel-link::before {
      font-size: 18px;
    }

    /* Notification prefs menu */
    .notification-prefs-menu {
      right: 8px;
      left: auto;
      max-width: calc(100% - 16px);
    }

    /* Rehearsal countdown - mobile */
    .rehearsal-countdown {
      margin: 8px 12px;
      padding: 10px 12px;
      font-size: 13px;
      gap: 8px;
    }

    /* Admin panel - mobile */
    .admin-panel-modal {
      max-height: 80vh;
      overflow-y: auto;
    }

    .pending-user-item {
      min-height: 60px;
    }

    .pending-user-item .primary-btn,
    .pending-user-item .ghost-btn {
      min-height: 36px;
      min-width: 80px;
      font-size: 13px;
      font-weight: 600;
    }

    /* Toast - mobile positioning */
    .toast {
      bottom: calc(76px + env(safe-area-inset-bottom, 0px));
      left: 16px;
      right: 16px;
      max-width: none;
      border-radius: 8px;
      padding: 14px 16px;
      font-size: 14px;
    }

    /* Presence dot in footer */
    .presence-dot {
      width: 10px;
      height: 10px;
    }

    /* Icon buttons - consistent sizing */
    .icon-btn {
      width: 40px;
      height: 40px;
      min-width: 40px;
      min-height: 40px;
    }

    /* Server name in sidebar header - truncate */
    .sidebar-header h2 {
      max-width: calc(100% - 100px);
    }

    /* Hide desktop-only close button on mobile, use X in header */
    .mobile-close-btn {
      display: flex;
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: var(--bg-modifier-hover, rgba(79,84,92,0.16));
      color: var(--text-normal, #dbdee1);
    }

    /* Improved scrolling */
    .channels-wrap,
    .member-list-content {
      -webkit-overflow-scrolling: touch;
    }

    /* Prevent pull-to-refresh on chat */
    .messages-scroll {
      overscroll-behavior-y: contain;
    }
  }

  /* Small phones */
  @media (max-width: 400px) {
    .mobile-nav {
      height: calc(56px + env(safe-area-inset-bottom, 0px));
    }

    .mobile-nav-item svg {
      width: 22px;
      height: 22px;
    }

    .mobile-nav-item span {
      font-size: 9px;
    }

    .message-row {
      padding: 6px 12px;
    }

    .message-row .avatar {
      width: 32px;
      height: 32px;
    }

    .channel-sidebar,
    .member-sidebar {
      width: 90%;
    }
  }
</style>
