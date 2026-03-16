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

  $: isAuthenticated = !!me && me.status === "approved";
  $: isPendingApproval = !!me && me.status === "pending";
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
    // Auto-login after registration
    loginUsername = registerUsername;
    loginPassword = registerPassword;
    registerUsername = ""; registerPassword = "";
    await login();
  }

  let approvalPollInterval: ReturnType<typeof setInterval> | null = null;

  function startApprovalPolling() {
    if (approvalPollInterval) return;
    approvalPollInterval = setInterval(async () => {
      await refreshMe();
      if (me?.status === "approved") {
        stopApprovalPolling();
        showToast("Account approved! Welcome in.", "success");
        await refreshServers();
        await refreshChannels();
        await refreshMembers();
        await refreshPendingUsers();
        startMainPolling();
      }
    }, 3000);
  }

  function stopApprovalPolling() {
    if (approvalPollInterval) { clearInterval(approvalPollInterval); approvalPollInterval = null; }
  }

  function startMainPolling() {
    if (refreshInterval) return;
    refreshInterval = setInterval(async () => {
      await refreshMessages();
      await refreshTyping();
      await refreshMembers();
    }, 2000);
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

      if (me.status === "pending") {
        startApprovalPolling();
        return;
      }

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
    stopApprovalPolling();
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
    messages = []; isLoadingMessages = true;
    showChannelSidebar = false;
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
      if (navigator.vibrate) navigator.vibrate(30);
    }, 350);
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

    if (me?.status === "pending") {
      startApprovalPolling();
    } else if (me) {
      await refreshServers();
      await refreshChannels();
      await refreshMembers();
      await refreshPendingUsers();
      startMainPolling();
    }
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
    stopApprovalPolling();
    if (typingTimeout) clearTimeout(typingTimeout);
    if (toastTimeout) clearTimeout(toastTimeout);
    if (longPressTimer) clearTimeout(longPressTimer);
  });
</script>

<svelte:head>
  <title>Band Chat</title>
</svelte:head>

<!-- ==================== PENDING APPROVAL SCREEN ==================== -->
{#if isPendingApproval}
  <div class="flex h-full items-center justify-center bg-surface-0 px-6 py-10 sm:px-10">
    <div class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-accent/[0.04] blur-[120px]"></div>

    <div class="animate-fade-in relative w-full max-w-[440px] rounded-3xl border border-border bg-surface-1 px-8 py-10 sm:px-10 sm:py-12 shadow-2xl shadow-black/30">
      <div class="text-center">
        <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-3 shadow-lg shadow-black/10">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" class="text-text-tertiary">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <h1 class="text-2xl font-bold tracking-tight text-text-primary">Waiting for approval</h1>
        <p class="mt-3 text-[14px] leading-relaxed text-text-tertiary">
          Your account <strong class="text-text-secondary">{me?.username}</strong> has been created. An admin needs to approve your access before you can join.
        </p>
        <div class="mt-6 flex items-center justify-center gap-2 text-[13px] text-text-tertiary">
          <div class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></div>
          Checking automatically...
        </div>
        <button
          class="mt-8 text-[13px] font-medium text-text-tertiary transition-colors hover:text-text-secondary"
          on:click={logout}
        >Sign out</button>
      </div>
    </div>
  </div>

<!-- ==================== AUTH SCREEN ==================== -->
{:else if !isAuthenticated}
  <div class="flex h-full items-center justify-center bg-surface-0 px-6 py-10 sm:px-10">
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
  <div class="flex h-full flex-col bg-surface-0" style="padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px);">
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
                class="group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-all duration-150 active:scale-[0.98] active:bg-glass-active
                  {channel.id === selectedChannelId
                    ? 'bg-glass-selected text-text-primary'
                    : 'text-text-secondary hover:bg-glass-hover hover:text-text-primary'}"
                on:click={() => selectChannel(channel)}
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
          <button class="flex h-9 w-9 items-center justify-center rounded-xl text-text-tertiary transition-all hover:bg-glass-hover hover:text-danger active:scale-95 active:bg-glass-active" on:click={logout} title="Sign out">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </aside>

      <!-- ===== MAIN CHAT AREA ===== -->
      <section class="flex min-w-0 flex-1 flex-col bg-surface-2">
        <!-- Chat Header -->
        <header class="flex h-13 shrink-0 items-center justify-between border-b border-border px-3">
          <div class="flex items-center gap-1.5">
            <button class="flex h-10 w-10 items-center justify-center rounded-xl text-text-tertiary transition-all hover:bg-glass-hover hover:text-text-secondary active:scale-95 active:bg-glass-active md:hidden" on:click={toggleChannelSidebar}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            {#if selectedChannelName}
              <span class="text-[17px] font-medium text-text-secondary opacity-60">#</span>
              <h3 class="text-[15px] font-semibold tracking-tight text-text-primary">{selectedChannelName}</h3>
            {:else}
              <h3 class="text-[15px] font-medium text-text-tertiary">Select a channel</h3>
            {/if}
          </div>
          <div class="flex items-center gap-0.5">
            <button
              class="flex h-10 w-10 items-center justify-center rounded-xl transition-all active:scale-95 {showCalendar ? 'bg-glass-selected text-text-primary' : 'text-text-tertiary hover:bg-glass-hover hover:text-text-secondary active:bg-glass-active'}"
              on:click={toggleCalendar} title="Events"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </button>
            <button
              class="flex h-10 w-10 items-center justify-center rounded-xl transition-all active:scale-95 {showMemberList ? 'bg-glass-selected text-text-primary' : 'text-text-tertiary hover:bg-glass-hover hover:text-text-secondary active:bg-glass-active'}"
              on:click={toggleMemberList} title="Members"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/></svg>
            </button>
            <div class="relative">
              <button
                class="flex h-10 w-10 items-center justify-center rounded-xl transition-all active:scale-95 {showNotificationPrefs ? 'bg-glass-selected text-text-primary' : 'text-text-tertiary hover:bg-glass-hover hover:text-text-secondary active:bg-glass-active'}"
                on:click={() => showNotificationPrefs = !showNotificationPrefs} title="Notifications"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
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
          <div class="animate-content-in flex-1 overflow-y-auto">
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
                {#each Array(6) as _, i}
                  <div class="mt-5 flex gap-3" style:opacity={1 - i * 0.12}>
                    <div class="h-10 w-10 shrink-0 rounded-full bg-surface-4/60 animate-pulse-skeleton"></div>
                    <div class="flex-1 space-y-2.5 py-1">
                      <div class="h-3.5 rounded-md bg-surface-4/60 animate-pulse-skeleton" style:width="{60 + (i * 17) % 40}px"></div>
                      <div class="h-3.5 rounded-md bg-surface-4/40 animate-pulse-skeleton" style:width="{120 + (i * 37) % 180}px"></div>
                      {#if i % 2 === 0}
                        <div class="h-3.5 rounded-md bg-surface-4/30 animate-pulse-skeleton" style:width="{80 + (i * 23) % 100}px"></div>
                      {/if}
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
                                class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] transition-all active:scale-95
                                  {reaction.users.includes(me?.username || '')
                                    ? 'bg-accent-subtle border border-accent/30 text-text-primary'
                                    : 'bg-glass border border-border text-text-secondary hover:bg-glass-hover hover:border-border-hover'}"
                                on:click={() => {
                                  if (reaction.users.includes(me?.username || '')) removeReaction(msg.id, reaction.emoji);
                                  else addReaction(msg.id, reaction.emoji);
                                }}
                                title={reaction.users.join(', ')}
                              >
                                <span class="text-[15px] leading-none">
                                  {#if isGifReaction(reaction.emoji).isGif}
                                    <img src={isGifReaction(reaction.emoji).url} alt="GIF" class="h-5 w-5 rounded" />
                                  {:else if icon}
                                    {icon.emoji}
                                  {:else}
                                    {reaction.emoji}
                                  {/if}
                                </span>
                                <span class="font-semibold">{reaction.count}</span>
                              </button>
                            {/each}
                          </div>
                        {/if}
                      </div>

                      <!-- Hover toolbar (desktop) -->
                      <div class="pointer-events-none absolute -top-4 right-2 flex items-center gap-0.5 rounded-lg border border-border bg-surface-3 px-1 py-0.5 opacity-0 shadow-lg shadow-black/30 transition-all duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
                        {#each REACTION_ICONS.slice(0, 5) as icon}
                          <button class="flex h-8 w-8 items-center justify-center rounded-md text-[16px] transition-all hover:scale-110 hover:bg-glass-hover active:scale-95" on:click={() => addReaction(msg.id, icon.id)} title={icon.label}>
                            {icon.emoji}
                          </button>
                        {/each}
                        <button class="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-all hover:bg-glass-hover hover:text-text-secondary active:scale-95" on:click={() => { selectedMessageForReaction = msg.id; showEmojiPicker = true; }} title="More">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
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
                                class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] transition-all active:scale-95
                                  {reaction.users.includes(me?.username || '')
                                    ? 'bg-accent-subtle border border-accent/30 text-text-primary'
                                    : 'bg-glass border border-border text-text-secondary hover:bg-glass-hover hover:border-border-hover'}"
                                on:click={() => {
                                  if (reaction.users.includes(me?.username || '')) removeReaction(msg.id, reaction.emoji);
                                  else addReaction(msg.id, reaction.emoji);
                                }}
                                title={reaction.users.join(', ')}
                              >
                                <span class="text-[15px] leading-none">
                                  {#if isGifReaction(reaction.emoji).isGif}
                                    <img src={isGifReaction(reaction.emoji).url} alt="GIF" class="h-5 w-5 rounded" />
                                  {:else if icon}
                                    {icon.emoji}
                                  {:else}
                                    {reaction.emoji}
                                  {/if}
                                </span>
                                <span class="font-semibold">{reaction.count}</span>
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
            <div class="flex items-center gap-1 rounded-2xl bg-surface-3/80 px-1 transition-colors focus-within:bg-surface-3">
              <button
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-tertiary transition-all hover:text-text-secondary active:scale-90 disabled:opacity-30"
                on:click={openGifPicker} disabled={!selectedChannelId} title="GIF"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="3"/><text x="12" y="14.5" text-anchor="middle" font-size="7" font-weight="800" fill="currentColor" stroke="none">GIF</text></svg>
              </button>
              <input
                class="min-w-0 flex-1 bg-transparent py-3.5 text-[15px] text-text-primary placeholder-text-tertiary outline-none"
                bind:value={newMessage}
                on:input={handleTyping}
                placeholder={selectedChannelId ? `Message #${selectedChannelName || "channel"}` : "Select a channel"}
                disabled={!selectedChannelId}
                on:keydown={(event) => event.key === "Enter" && sendMessage()}
              />
              <button
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all active:scale-90 {newMessage.trim() && selectedChannelId ? 'text-accent hover:text-accent-hover' : 'text-text-tertiary/30'}"
                on:click={sendMessage} disabled={!selectedChannelId || !newMessage.trim()}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
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
        <div class="grid grid-cols-7 gap-0.5 overflow-y-auto px-4 py-3" data-vaul-no-drag>
          {#each filteredEmojis as icon}
            <button class="flex aspect-square w-full items-center justify-center rounded-xl text-[22px] transition-all hover:bg-glass-hover active:scale-90 active:bg-glass-active" on:click={() => { addReaction(selectedMessageForReaction, icon.id); closeEmojiPicker(); }} title={icon.label}>
              {icon.emoji}
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

      <!-- Quick reactions row -->
      <div class="flex items-center justify-center gap-2 px-5 pt-4 pb-2">
        {#each REACTION_ICONS.slice(0, 6) as icon}
          <button
            class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-3 text-[22px] transition-all hover:bg-surface-4 active:scale-90 active:bg-glass-active"
            on:click={() => { addReaction(contextMenuMessageId, icon.id); closeContextMenu(); }}
            title={icon.label}
          >{icon.emoji}</button>
        {/each}
        <button
          class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-3 text-text-tertiary transition-all hover:bg-surface-4 active:scale-90"
          on:click={() => { selectedMessageForReaction = contextMenuMessageId; showEmojiPicker = true; closeContextMenu(); }}
          title="More reactions"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>

      <div class="space-y-0.5 px-4 py-2">
        {#if contextMenuAuthor === me?.username || me?.role === 'admin'}
          <button class="flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left text-[15px] font-medium text-danger transition-colors hover:bg-danger/10 active:bg-danger/15" on:click={() => unsendMessage(contextMenuMessageId)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Unsend Message
          </button>
        {/if}
      </div>
      <div class="px-4 pb-5 pt-1">
        <button class="w-full rounded-xl bg-surface-3 py-3.5 text-center text-[15px] font-medium text-text-secondary transition-colors hover:bg-surface-4 active:bg-glass-active" on:click={closeContextMenu}>Cancel</button>
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
