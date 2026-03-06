<script lang="ts">
  import { onMount, onDestroy } from "svelte";
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
  let showChannelSidebar = false; // mobile drawer
  let showAdminPanel = false;
  let selectedMessageForReaction = "";
  let messageContainer: HTMLElement | null = null;

  // Admin panel state
  type PendingUser = { id: string; username: string; role: string; status: string; createdAt: number };
  let pendingUsers: PendingUser[] = [];

  // Emoji search
  let emojiSearchQuery = "";

  // GIF picker state
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

  // Long-press state for reactions
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  // Context menu state (for unsend)
  let contextMenuMessageId = "";
  let contextMenuAuthor = "";
  let contextMenuX = 0;
  let contextMenuY = 0;

  // New event form
  let newEventTitle = "";
  let newEventDescription = "";
  let newEventLocation = "";
  let newEventStartsAt = "";
  let newEventEndsAt = "";

  // Notification preferences
  let notificationPref: 'all' | 'mentions' | 'dms' | 'none' = 'mentions';
  let showNotificationPrefs = false;
  let pushNotificationsEnabled = false;

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

  // Check push notification status on mount
  async function checkPushNotificationStatus() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

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
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    toastTimeout = setTimeout(() => {
      toastMessage = "";
      toastTimeout = null;
    }, 4500);
  }

  function getCookie(name: string): string {
    if (typeof document === "undefined") return "";
    const prefix = `${encodeURIComponent(name)}=`;
    const found = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    return found ? decodeURIComponent(found.slice(prefix.length)) : "";
  }

  async function apiPost(path: string, payload: Record<string, unknown>) {
    const csrf = getCookie("band_chat_csrf");
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-csrf-token": csrf
    };

    if (headerSessionToken) {
      headers.authorization = `Bearer ${headerSessionToken}`;
    }

    return fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify(payload)
    });
  }

  async function apiGet(path: string) {
    const headers: Record<string, string> = {};
    if (headerSessionToken) {
      headers.authorization = `Bearer ${headerSessionToken}`;
    }

    return fetch(path, {
      credentials: "same-origin",
      headers
    });
  }

  async function readApiError(res: Response, fallback: string): Promise<string> {
    try {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await res.json();
        if (typeof body?.error === "string" && body.error.trim()) {
          return body.error;
        }
      }

      const text = (await res.text()).trim();
      if (text) {
        return `${fallback} (${res.status}): ${text.slice(0, 220)}`;
      }
    } catch {
      // no-op
    }
    return `${fallback} (${res.status})`;
  }

  async function refreshMe(): Promise<{ ok: boolean; error?: string; status?: number }> {
    const res = await apiGet("/api/auth/me");
    if (!res.ok) {
      me = null;
      return {
        ok: false,
        status: res.status,
        error: await readApiError(res, "Auth check failed")
      };
    }
    me = await res.json();
    
    // Set online status
    if (me) {
      await apiPost("/api/presence", { status: "online" });
    }
    
    return { ok: true };
  }

  async function refreshServers() {
    if (!me) return;
    const res = await apiGet("/api/servers");
    if (!res.ok) return;
    servers = await res.json();
    if (!selectedServerId && servers.length > 0) {
      selectedServerId = servers[0].id;
      await refreshChannels();
    }
  }

  async function refreshChannels() {
    if (!me) return;
    const res = await apiGet("/api/channels");
    if (!res.ok) return;
    channels = await res.json();
    if (!selectedChannelId && channels.length > 0) {
      selectedChannelId = channels[0].id;
      selectedChannelName = channels[0].name;
      await refreshMessages();
    }
  }

  async function refreshMessages() {
    if (!selectedChannelId) return;
    const isInitialLoad = messages.length === 0;
    if (isInitialLoad) isLoadingMessages = true;
    
    try {
      const res = await apiGet(`/api/messages?channelId=${encodeURIComponent(selectedChannelId)}`);
      if (!res.ok) {
        failedPollCount++;
        if (failedPollCount >= 2) {
          connectionStatus = "reconnecting";
        }
        return;
      }
      const msgs = await res.json();
      
      // Load reactions for each message
      for (const msg of msgs) {
        const reactionsRes = await apiGet(`/api/reactions?messageId=${encodeURIComponent(msg.id)}`);
        if (reactionsRes.ok) {
          msg.reactions = await reactionsRes.json();
        }
      }
      
      messages = msgs;
      scrollToBottom();
      
      // Reset connection status on success
      failedPollCount = 0;
      connectionStatus = "connected";
    } catch {
      failedPollCount++;
      if (failedPollCount >= 2) {
        connectionStatus = "reconnecting";
      }
    } finally {
      isLoadingMessages = false;
    }
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
    } catch {
      // Silently fail - member list is non-critical
    }
  }

  async function refreshTyping() {
    if (!selectedChannelId) return;
    try {
      const res = await apiGet(`/api/typing?channelId=${encodeURIComponent(selectedChannelId)}`);
      if (!res.ok) return;
      const users = await res.json();
      typingUsers = users.map((u: any) => u.username);
    } catch {
      // Silently fail - typing is non-critical
    }
  }

  function isUserNearBottom(): boolean {
    if (!messageContainer) return true;
    const threshold = 150;
    return messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight < threshold;
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (messageContainer) {
        messageContainer.scrollTop = messageContainer.scrollHeight;
      }
    }, 50);
  }

  async function register() {
    const res = await apiPost("/api/auth/register", {
      username: registerUsername,
      password: registerPassword
    });

    if (!res.ok) {
      showToast(await readApiError(res, "Registration failed"), "error");
      return;
    }

    registerUsername = "";
    registerPassword = "";
    showToast("Registered successfully.", "success");
  }

  async function login() {
    if (isLoggingIn) return;
    const attemptedPassword = loginPassword;
    isLoggingIn = true;
    try {
      const res = await apiPost("/api/auth/login", {
        username: loginUsername,
        password: loginPassword
      });

      if (!res.ok) {
        loginPassword = attemptedPassword;
        showToast(await readApiError(res, "Login failed"), "error");
        return;
      }

      const body = await res.json().catch(() => null);
      headerSessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : "";

      const authState = await refreshMe();
      if (!authState.ok || !me) {
        loginPassword = attemptedPassword;
        showToast(authState.error || "Signed in response received, but session was not established.", "error");
        return;
      }

      loginPassword = "";
      await refreshServers();
      await refreshChannels();
      
      // Subscribe to push notifications
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
        import('$lib/push-notifications').then(({ subscribeToPush }) => {
          subscribeToPush();
        }).catch(err => console.error('Failed to load push notifications:', err));
      }
      
      if (headerSessionToken) {
        showToast("Signed in using header-session fallback (cookies blocked by browser).", "success");
        return;
      }
      showToast("Signed in.", "success");
    } finally {
      isLoggingIn = false;
    }
  }

  async function logout() {
    await apiPost("/api/auth/logout", {});
    await apiPost("/api/presence", { status: "offline" });
    headerSessionToken = "";
    me = null;
    servers = [];
    channels = [];
    messages = [];
    events = [];
    members = [];
    selectedServerId = "";
    selectedChannelId = "";
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedChannelId) return;
    
    // Stop typing indicator
    await apiPost("/api/typing", { channelId: selectedChannelId, action: "stop" });
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
    
    const res = await apiPost("/api/messages", {
      channelId: selectedChannelId,
      content: newMessage
    });
    if (!res.ok) return;
    newMessage = "";
    await refreshMessages();
  }

  async function handleTyping() {
    if (!selectedChannelId || !newMessage.trim()) return;
    
    await apiPost("/api/typing", { channelId: selectedChannelId, action: "start" });
    
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    
    typingTimeout = setTimeout(async () => {
      await apiPost("/api/typing", { channelId: selectedChannelId, action: "stop" });
      typingTimeout = null;
    }, 3000);
  }

  async function createChannel() {
    if (!newChannel.trim()) return;
    const res = await apiPost("/api/channels", {
      name: newChannel,
      description: newChannelDescription
    });
    if (!res.ok) {
      showToast(await readApiError(res, "Create channel failed"), "error");
      return;
    }
    newChannel = "";
    newChannelDescription = "";
    showToast("Channel created.", "success");
    await refreshChannels();
  }

  async function confirmDeleteChannel(channelId: string, channelName: string) {
    if (!confirm(`Delete #${channelName}? This will permanently remove the channel and all its messages.`)) return;
    const res = await apiPost("/api/channels/delete", { channelId });
    if (!res.ok) {
      showToast(await readApiError(res, "Failed to delete channel"), "error");
      return;
    }
    showToast(`#${channelName} deleted.`, "success");
    if (selectedChannelId === channelId) {
      selectedChannelId = "";
      selectedChannelName = "";
      messages = [];
    }
    await refreshChannels();
  }

  async function selectServer(server: Server) {
    selectedServerId = server.id;
    selectedChannelId = "";
    await refreshChannels();
    await refreshEvents();
    await refreshMembers();
  }

  async function selectChannel(channel: Channel) {
    selectedChannelId = channel.id;
    selectedChannelName = channel.name;
    await refreshMessages();
  }

  async function addReaction(messageId: string, emoji: string) {
    const res = await apiPost("/api/reactions", {
      messageId,
      emoji,
      action: "add"
    });
    if (res.ok) {
      await refreshMessages();
    }
    showEmojiPicker = false;
    selectedMessageForReaction = "";
  }

  async function removeReaction(messageId: string, emoji: string) {
    const res = await apiPost("/api/reactions", {
      messageId,
      emoji,
      action: "remove"
    });
    if (res.ok) {
      await refreshMessages();
    }
  }

  // GIF functions
  async function searchGifs(query: string, forReaction = false) {
    if (forReaction) {
      isLoadingReactionGifs = true;
    } else {
      isLoadingGifs = true;
    }
    try {
      const params = new URLSearchParams({ q: query, limit: "20" });
      const res = await apiGet(`/api/giphy?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (forReaction) {
          reactionGifResults = data.gifs || [];
        } else {
          gifResults = data.gifs || [];
        }
      }
    } finally {
      if (forReaction) {
        isLoadingReactionGifs = false;
      } else {
        isLoadingGifs = false;
      }
    }
  }

  async function loadTrendingGifs(forReaction = false) {
    if (forReaction) {
      isLoadingReactionGifs = true;
    } else {
      isLoadingGifs = true;
    }
    try {
      const res = await apiGet("/api/giphy?limit=20");
      if (res.ok) {
        const data = await res.json();
        if (forReaction) {
          reactionGifResults = data.gifs || [];
        } else {
          gifResults = data.gifs || [];
        }
      }
    } finally {
      if (forReaction) {
        isLoadingReactionGifs = false;
      } else {
        isLoadingGifs = false;
      }
    }
  }

  function handleGifSearch(query: string, forReaction = false) {
    const timeout = forReaction ? reactionGifSearchTimeout : gifSearchTimeout;
    if (timeout) clearTimeout(timeout);
    const newTimeout = setTimeout(() => {
      if (query.trim()) {
        searchGifs(query, forReaction);
      } else {
        loadTrendingGifs(forReaction);
      }
    }, 300);
    if (forReaction) {
      reactionGifSearchTimeout = newTimeout;
    } else {
      gifSearchTimeout = newTimeout;
    }
  }

  function openGifPicker() {
    showGifPicker = true;
    gifSearchQuery = "";
    gifResults = [];
    loadTrendingGifs();
  }

  function closeGifPicker() {
    showGifPicker = false;
    gifSearchQuery = "";
    gifResults = [];
  }

  async function sendGifMessage(gif: GifItem) {
    if (!selectedChannelId) return;
    const gifContent = `[gif:${gif.url}]`;
    const res = await apiPost("/api/messages", {
      channelId: selectedChannelId,
      content: gifContent
    });
    if (res.ok) {
      closeGifPicker();
      await refreshMessages();
    }
  }

  async function addGifReaction(messageId: string, gif: GifItem) {
    const gifEmoji = `gif:${gif.url}`;
    const res = await apiPost("/api/reactions", {
      messageId,
      emoji: gifEmoji,
      action: "add"
    });
    if (res.ok) {
      await refreshMessages();
    }
    showEmojiPicker = false;
    selectedMessageForReaction = "";
    reactionPickerTab = "emoji";
    reactionGifSearch = "";
    reactionGifResults = [];
  }

  const ALLOWED_GIF_HOSTS = ["media.giphy.com", "media0.giphy.com", "media1.giphy.com", "media2.giphy.com", "media3.giphy.com", "media4.giphy.com", "i.giphy.com"];

  function isAllowedGifUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ALLOWED_GIF_HOSTS.includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  function isGifMessage(content: string): { isGif: boolean; url: string } {
    const match = content.match(/^\[gif:(https:\/\/[^\]]+)\]$/);
    if (match && isAllowedGifUrl(match[1])) {
      return { isGif: true, url: match[1] };
    }
    return { isGif: false, url: "" };
  }

  function isGifReaction(emoji: string): { isGif: boolean; url: string } {
    if (emoji.startsWith("gif:")) {
      const url = emoji.slice(4);
      if (isAllowedGifUrl(url)) {
        return { isGif: true, url };
      }
    }
    return { isGif: false, url: "" };
  }

  async function useInvite() {
    if (!inviteCode.trim()) return;
    const res = await apiPost("/api/invites", {
      action: "use",
      code: inviteCode
    });
    if (!res.ok) {
      showToast(await readApiError(res, "Invalid invite"), "error");
      return;
    }
    inviteCode = "";
    showInviteModal = false;
    showToast("Joined server!", "success");
    await refreshServers();
  }

  async function createInvite(serverId: string) {
    const res = await apiPost("/api/invites", {
      serverId,
      maxUses: 0,
      expiresInMs: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    if (!res.ok) {
      showToast(await readApiError(res, "Failed to create invite"), "error");
      return;
    }
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
    if (!res.ok) {
      showToast(await readApiError(res, "Failed to approve user"), "error");
      return;
    }
    showToast(`${username} approved!`, "success");
    await refreshPendingUsers();
  }

  async function rejectPendingUser(username: string) {
    const res = await apiPost("/api/admin/users/reject", { username });
    if (!res.ok) {
      showToast(await readApiError(res, "Failed to reject user"), "error");
      return;
    }
    showToast(`${username} rejected.`, "success");
    await refreshPendingUsers();
  }

  async function createEvent() {
    if (!newEventTitle.trim() || !newEventStartsAt || !newEventEndsAt) return;
    
    const res = await apiPost("/api/events", {
      serverId: selectedServerId,
      title: newEventTitle,
      description: newEventDescription,
      location: newEventLocation,
      startsAt: new Date(newEventStartsAt).getTime(),
      endsAt: new Date(newEventEndsAt).getTime()
    });
    
    if (!res.ok) {
      showToast(await readApiError(res, "Failed to create event"), "error");
      return;
    }
    
    newEventTitle = "";
    newEventDescription = "";
    newEventLocation = "";
    newEventStartsAt = "";
    newEventEndsAt = "";
    showEventCreate = false;
    showToast("Event created!", "success");
    await refreshEvents();
  }

  function formatEventTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function openEmojiPicker(messageId: string) {
    selectedMessageForReaction = messageId;
    showEmojiPicker = true;
  }

  function getReactionIcon(id: string): ReactionDef | undefined {
    return REACTION_ICONS.find(r => r.id === id);
  }

  async function unsendMessage(messageId: string) {
    const csrf = getCookie("band_chat_csrf");
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-csrf-token": csrf
    };
    if (headerSessionToken) {
      headers.authorization = `Bearer ${headerSessionToken}`;
    }
    const deleteRes = await fetch("/api/messages", {
      method: "DELETE",
      credentials: "same-origin",
      headers,
      body: JSON.stringify({ messageId })
    });
    if (!deleteRes.ok) {
      showToast(await readApiError(deleteRes, "Failed to unsend"), "error");
      return;
    }
    showToast("Message unsent.", "success");
    contextMenuMessageId = "";
    await refreshMessages();
  }

  function handleMessagePointerDown(event: PointerEvent, messageId: string, author: string) {
    longPressTimer = setTimeout(() => {
      // Long press detected - show context menu for unsend and other options
      contextMenuMessageId = messageId;
      contextMenuAuthor = author;
      // Position at the center of the screen or where the touch occurred
      contextMenuX = Math.min(event.clientX || window.innerWidth / 2, window.innerWidth - 160);
      contextMenuY = Math.min(event.clientY || window.innerHeight / 2, window.innerHeight - 200);
      longPressTimer = null;
      // Provide haptic feedback on mobile
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500);
  }

  function handleMessagePointerUp() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleMessageContextMenu(event: MouseEvent, messageId: string, author: string) {
    event.preventDefault();
    contextMenuMessageId = messageId;
    contextMenuAuthor = author;
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
  }

  function closeContextMenu() {
    contextMenuMessageId = "";
  }

  function closeEmojiPicker() {
    showEmojiPicker = false;
    reactionPickerTab = "emoji";
    reactionGifSearch = "";
    reactionGifResults = [];
    emojiSearchQuery = "";
  }

  function closeSidebars() {
    showChannelSidebar = false;
    showMemberList = false;
  }

  function toggleMemberList() {
    showMemberList = !showMemberList;
    if (showMemberList) {
      showCalendar = false;
      showChannelSidebar = false;
    }
  }

  function toggleChannelSidebar() {
    showChannelSidebar = !showChannelSidebar;
    if (showChannelSidebar) {
      showMemberList = false;
      showCalendar = false;
    }
  }

  function toggleCalendar() {
    showCalendar = !showCalendar;
    if (showCalendar) {
      showMemberList = false;
      showChannelSidebar = false;
    }
  }

  // Audio file detection
  function isAudioMessage(content: string): { isAudio: boolean; url: string; name: string } {
    const match = content.match(/^(https?:\/\/\S+\.(mp3|wav|ogg|flac|aac|m4a))$/i);
    if (match) return { isAudio: true, url: match[1], name: match[1].split('/').pop() || 'audio' };
    return { isAudio: false, url: '', name: '' };
  }

  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  onMount(async () => {
    // Check for invite code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const invite = urlParams.get("invite");
    if (invite) {
      inviteCode = invite;
      showInviteModal = true;
    }

    // Register service worker for PWA and push notifications
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registered:', registration.scope);

        // Check if already subscribed to push notifications
        if ('PushManager' in window) {
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            console.log('Already subscribed to push notifications');
            pushNotificationsEnabled = true;
          }
        }
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }

    await refreshMe();
    await refreshServers();
    await refreshChannels();
    await refreshMembers();
    await refreshPendingUsers();

    // Set up refresh intervals
    refreshInterval = setInterval(async () => {
      await refreshMessages();
      await refreshTyping();
      await refreshMembers();
    }, 2000);
  });

  onDestroy(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
  });
</script>

<main class="discord-app">

<style>
  /* Ensure headers respect iOS safe area insets */

  .chat-header,
  .sidebar-header,
  .auth-header,
  .calendar-fullpage-header {
    padding-top: env(safe-area-inset-top, 0px);
    position: relative;
  }

  .back-arrow-btn {
    position: absolute;
    left: max(0.5rem, env(safe-area-inset-left, 0px));
    top: calc(8px + env(safe-area-inset-top, 0px));
    z-index: 2;
    background: transparent;
    border: none;
    padding: 0.25rem 0.5rem;
    display: flex;
    align-items: center;
  }

  .calendar-fullpage-header h2 {
    margin-left: 2.5rem;
    margin-right: auto;
    text-align: left;
  }

  /* If you have absolutely positioned back/nav buttons, also add: */
  .back-button, .nav-back {
    top: calc(8px + env(safe-area-inset-top, 0px));
  }
</style>
<style>
  .discord-app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--bg-base-primary, #313338);
  }

  /* Make main chat area fill available space */
  .chat-main {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-base-primary, #313338);
  }
</style>
  {#if !isAuthenticated}
    <section class="auth-shell">
      <article class="auth-card">
        <div class="auth-header">
          <svg class="auth-logo" viewBox="0 0 32 32" width="40" height="40" fill="none">
            <rect width="32" height="32" rx="8" fill="var(--accent)"/>
            <path d="M9 22V10l7 6 7-6v12" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <h1>{authMode === "login" ? "Welcome back" : "Create account"}</h1>
          <p>{authMode === "login" ? "Sign in to your band." : "First account becomes admin."}</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab" class:active={authMode === "login"} on:click={() => authMode = "login"}>Sign in</button>
          <button class="auth-tab" class:active={authMode === "register"} on:click={() => authMode = "register"}>Register</button>
        </div>

        {#if authMode === "login"}
          <div class="auth-fields">
            <label class="field-label">
              <span>Username</span>
              <input class="field" bind:value={loginUsername} placeholder="your-username" autocomplete="username" on:keydown={(e) => e.key === 'Enter' && login()} />
            </label>
            <label class="field-label">
              <span>Password</span>
              <input class="field" bind:value={loginPassword} type="password" placeholder="Enter password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" on:keydown={(e) => e.key === 'Enter' && login()} />
            </label>
            <button class="primary-btn auth-submit" type="button" on:click={login} disabled={isLoggingIn}>
              {isLoggingIn ? "Signing in..." : "Sign in"}
            </button>
          </div>
        {:else}
          <div class="auth-fields">
            <label class="field-label">
              <span>Username</span>
              <input class="field" bind:value={registerUsername} placeholder="Choose a username" autocomplete="username" on:keydown={(e) => e.key === 'Enter' && register()} />
            </label>
            <label class="field-label">
              <span>Password</span>
              <input class="field" bind:value={registerPassword} type="password" placeholder="12+ characters" autocomplete="new-password" on:keydown={(e) => e.key === 'Enter' && register()} />
            </label>
            <button class="primary-btn auth-submit" type="button" on:click={register}>
              Create account
            </button>
          </div>
        {/if}
      </article>
    </section>
  {:else}
    <section class="chat-shell">
      <!-- Mobile overlay backdrop -->
      {#if showChannelSidebar || showMemberList}
        <div
          class="sidebar-overlay"
          role="button"
          tabindex="0"
          on:click={closeSidebars}
          on:keydown={(e) => (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') && closeSidebars()}
        ></div>
      {/if}

      <!-- Channel Sidebar -->
      <aside class="channel-sidebar" class:open={showChannelSidebar}>
        <header class="sidebar-header">
          <h2>{servers.find(s => s.id === selectedServerId)?.name || "Band Chat"}</h2>
          <div class="sidebar-header-actions">
            {#if selectedServerId}
              <button class="icon-btn" on:click={() => createInvite(selectedServerId)} title="Create Invite">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            {/if}
            <button class="icon-btn mobile-close-btn" on:click={() => showChannelSidebar = false} title="Close">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </header>

        {#if me?.role === "admin"}
          <div class="admin-create">
            <p class="section-title">Create channel</p>
            <input class="field" bind:value={newChannel} placeholder="channel-name" />
            <input class="field" bind:value={newChannelDescription} placeholder="description" />
            <button class="primary-btn" on:click={createChannel}>Create</button>
          </div>
        {/if}

        <div class="channels-wrap">
          {#if rehearsalCountdown && nextEvent}
            <div class="rehearsal-countdown">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>Next: <strong>{nextEvent.title}</strong> in <strong>{rehearsalCountdown}</strong></span>
            </div>
          {/if}
          <p class="section-title">Text Channels</p>
          <div class="channel-list">
            {#if channels.length === 0}
              <p class="empty-state">No channels yet.</p>
            {/if}
            {#each channels as channel}
              <div class="channel-link-row">
                <button class="channel-link" class:active={channel.id === selectedChannelId} on:click={() => { selectChannel(channel); showChannelSidebar = false; }}>
                  <span>#{channel.name}</span>
                </button>
                {#if me?.role === "admin"}
                  <button class="channel-delete-btn" on:click={() => confirmDeleteChannel(channel.id, channel.name)} title="Delete channel">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>

        <footer class="user-footer">
          <div class="user-footer-info">
            <span class="presence-dot {myPresence}"></span>
            <div>
              <strong>{me?.username}</strong>
              <p>{me?.role}</p>
            </div>
          </div>
          <div class="footer-actions">
            {#if me?.role === "admin"}
              <button class="icon-btn" class:has-badge={pendingUsers.length > 0} on:click={() => { showAdminPanel = true; refreshPendingUsers(); }} title="Admin Panel">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1zm0 0h6v-1a6 6 0 0 0-9-5.197"/></svg>
                {#if pendingUsers.length > 0}<span class="badge-dot"></span>{/if}
              </button>
            {/if}
            <button class="icon-btn" on:click={toggleCalendar} title="Calendar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
            <button class="icon-btn" on:click={logout} title="Logout"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
          </div>
        </footer>
      </aside>

      <!-- Main Chat Area -->
      <section class="chat-main">
        <header class="chat-header">
          <div class="chat-header-left">
            <button class="icon-btn hamburger-btn" on:click={toggleChannelSidebar} title="Channels">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <h3>
              {selectedChannelName ? `#${selectedChannelName}` : "Select a channel"}
            </h3>
          </div>
          <div class="chat-header-actions">
            <button class="icon-btn" class:active={showMemberList} on:click={toggleMemberList} title="Member List"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
            <button class="icon-btn" on:click={() => showNotificationPrefs = !showNotificationPrefs} title="Notification Preferences" aria-label="Notification Preferences">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 5 15.4a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 16 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 8c.14.31.22.65.22 1v.09A1.65 1.65 0 0 0 21 12c0 .35-.08.69-.22 1z"/>
              </svg>
            </button>
            {#if showNotificationPrefs}
              <div class="notification-prefs-menu">
                <div class="push-toggle-row">
                  <span>Push Notifications</span>
                  <button class="push-toggle-btn" on:click|stopPropagation={togglePushNotifications} aria-label="Toggle push notifications">
                    {pushNotificationsEnabled ? 'On' : 'Off'}
                  </button>
                </div>
                <label><input type="radio" name="notif" value="all" checked={notificationPref === 'all'} on:change={() => setNotificationPref('all')}/> All messages</label>
                <label><input type="radio" name="notif" value="mentions" checked={notificationPref === 'mentions'} on:change={() => setNotificationPref('mentions')}/> Mentions only</label>
                <label><input type="radio" name="notif" value="dms" checked={notificationPref === 'dms'} on:change={() => setNotificationPref('dms')}/> DMs only</label>
                <label><input type="radio" name="notif" value="none" checked={notificationPref === 'none'} on:change={() => setNotificationPref('none')}/> None</label>
              </div>
            {/if}
          </div>
        <style>
          .notification-prefs-menu {
            position: absolute;
            top: 2.5rem;
            right: 0;
            background: var(--bg-surface, #18181B);
            color: var(--text-body, #D4D4D8);
            border: 1px solid var(--border, #333);
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            padding: 0.75rem 1.25rem;
            z-index: 100;
            min-width: 180px;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
          }
          .notification-prefs-menu label {
            display: flex;
            align-items: center;
            gap: 0.5em;
            font-size: 1rem;
            cursor: pointer;
          }
          .notification-prefs-menu input[type="radio"] {
            accent-color: var(--accent, #3B82F6);
          }
          .push-toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 0.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid var(--border, #333);
          }
          .push-toggle-row label {
            font-weight: 600;
            font-size: 0.95rem;
          }
          .push-toggle-btn {
            background: var(--accent, #3B82F6);
            color: white;
            border: none;
            border-radius: 4px;
            padding: 0.25rem 0.75rem;
            font-size: 0.85rem;
            cursor: pointer;
            transition: background 0.2s;
          }
          .push-toggle-btn:hover {
            background: var(--accent-hover, #2563EB);
          }
        </style>
        </header>

        <!-- Reconnecting Overlay -->
        {#if connectionStatus === "reconnecting"}
          <div class="reconnecting-bar" role="status">
            <span class="reconnecting-dot"></span> Reconnecting...
          </div>
        {/if}

        <div class="messages-scroll" bind:this={messageContainer}>
          {#if isLoadingMessages}
            <!-- Skeleton Loading States -->
            {#each Array(5) as _}
              <article class="message-row skeleton">
                <div class="avatar skeleton-avatar"></div>
                <div class="message-content">
                  <div class="skeleton-line skeleton-name"></div>
                  <div class="skeleton-line skeleton-text"></div>
                  <div class="skeleton-line skeleton-text short"></div>
                </div>
              </article>
            {/each}
          {:else if messages.length === 0}
            <p class="empty-state">No messages yet. Start the conversation!</p>
          {:else}
            {#each messages as msg}
              <article
                class="message-row"
                on:contextmenu={(e) => handleMessageContextMenu(e, msg.id, msg.author)}
                on:pointerdown={(e) => handleMessagePointerDown(e, msg.id, msg.author)}
                on:pointerup={handleMessagePointerUp}
                on:pointerleave={handleMessagePointerUp}
              >
                <div class="avatar">{msg.author.slice(0, 1).toUpperCase()}</div>
                <div class="message-content">
                  <div class="message-head">
                    <strong>{msg.author}</strong>
                    <span class="msg-time">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {#if isGifMessage(msg.content).isGif}
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="gif-message" on:contextmenu|preventDefault>
                      <img src={isGifMessage(msg.content).url} alt="GIF" loading="lazy" draggable="false" />
                    </div>
                  {:else if isAudioMessage(msg.content).isAudio}
                    <div class="audio-player">
                      <div class="audio-player-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
                      </div>
                      <div class="audio-player-body">
                        <span class="audio-player-name">{isAudioMessage(msg.content).name}</span>
                        <!-- svelte-ignore a11y-media-has-caption -->
                        <audio controls src={isAudioMessage(msg.content).url} class="audio-element"></audio>
                      </div>
                    </div>
                  {:else}
                    <p class="message-text">{@html parseMarkdown(msg.content)}</p>
                  {/if}

                  <!-- Quick Reactions -->
                  <div class="quick-reactions">
                    {#each REACTION_ICONS.slice(0, 5) as icon}
                      <button class="quick-react-btn" on:click={() => addReaction(msg.id, icon.id)} title={icon.label}>
                        {@html icon.svg}
                      </button>
                    {/each}
                    <button class="quick-react-btn more-react-btn" on:click={() => { selectedMessageForReaction = msg.id; showEmojiPicker = true; }} title="More reactions">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                  </div>

                  {#if msg.reactions && msg.reactions.length > 0}
                    <div class="reactions">
                      {#each msg.reactions as reaction}
                        {@const icon = getReactionIcon(reaction.emoji)}
                        <button 
                          class="reaction-badge"
                          class:own-reaction={reaction.users.includes(me?.username || '')}
                          on:click={() => {
                            if (reaction.users.includes(me?.username || '')) {
                              removeReaction(msg.id, reaction.emoji);
                            } else {
                              addReaction(msg.id, reaction.emoji);
                            }
                          }}
                          title={reaction.users.join(', ')}
                        >
                          <span class="reaction-icon">
                            {#if isGifReaction(reaction.emoji).isGif}
                              <img src={isGifReaction(reaction.emoji).url} alt="GIF" class="gif-reaction-img" />
                            {:else if icon}
                              {@html icon.svg}
                            {:else}
                              {reaction.emoji}
                            {/if}
                          </span>
                          <span class="count">{reaction.count}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              </article>
            {/each}
          {/if}
          
          <!-- Typing Indicator -->
          {#if typingUsers.length > 0}
            <div class="typing-indicator">
              <strong>{typingUsers.join(', ')}</strong> {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </div>
          {/if}
        </div>

        <footer class="composer">
          <div class="composer-input-row">
            <button class="gif-btn" on:click={openGifPicker} disabled={!selectedChannelId} title="Send a GIF">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><text x="12" y="15.5" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor" stroke="none">GIF</text></svg>
            </button>
            <input
              class="field"
              bind:value={newMessage}
              on:input={handleTyping}
              placeholder={selectedChannelId ? `Message #${selectedChannelName || "channel"}` : "Select a channel to chat"}
              disabled={!selectedChannelId}
              on:keydown={(event) => event.key === "Enter" && sendMessage()}
            />
            <button class="primary-btn" on:click={sendMessage} disabled={!selectedChannelId || !newMessage.trim()}>Send</button>
          </div>
        </footer>
      </section>

      <!-- Calendar Full Page -->
      {#if showCalendar}
        <div class="calendar-fullpage">
          <header class="calendar-fullpage-header">
            <button class="icon-btn back-arrow-btn" on:click={() => showCalendar = false} title="Back" aria-label="Back">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <h2>Calendar</h2>
            <button class="icon-btn" on:click={() => showCalendar = false} title="Close" aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </header>
          
          <div class="calendar-fullpage-content">
            <div class="calendar-actions-bar">
              <button class="primary-btn" on:click={() => showEventCreate = true}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Create Event
              </button>
            </div>
            
            <div class="calendar-events-grid">
              <p class="section-title">Upcoming Events</p>
              {#if events.length === 0}
                <div class="calendar-empty">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <p>No events scheduled.</p>
                  <p class="calendar-empty-sub">Create an event to get started</p>
                </div>
              {/if}
              {#each events as event}
                <div class="event-card">
                  <div class="event-header">
                    <strong>{event.title}</strong>
                  </div>
                  <p class="event-time"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> {formatEventTime(event.startsAt)}</p>
                  {#if event.location}
                    <p class="event-location"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> {event.location}</p>
                  {/if}
                  {#if event.description}
                    <p class="event-desc">{event.description}</p>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Member List Sidebar (always in DOM for smooth transition) -->
      <aside class="member-sidebar" class:open={showMemberList}>
        <header class="sidebar-header">
          <h2>Members</h2>
          <button class="icon-btn" on:click={() => showMemberList = false} title="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </header>
        <div class="member-list-content">
          {#each ['online', 'idle', 'dnd', 'offline'] as status}
            {@const statusMembers = members.filter(m => m.presenceStatus === status)}
            {#if statusMembers.length > 0}
              <p class="section-title">{status === 'dnd' ? 'Do Not Disturb' : status.charAt(0).toUpperCase() + status.slice(1)} — {statusMembers.length}</p>
              {#each statusMembers as member}
                <div class="member-item">
                  <div class="member-avatar-wrap">
                    <div class="avatar small">{member.username.slice(0, 1).toUpperCase()}</div>
                    <span class="presence-dot {member.presenceStatus}"></span>
                  </div>
                  <div class="member-info">
                    <span class="member-name" class:admin={member.role === 'admin'}>{member.username}</span>
                    {#if member.role === 'admin'}
                      <span class="member-role-badge">Admin</span>
                    {/if}
                  </div>
                </div>
              {/each}
            {/if}
          {/each}
          {#if members.length === 0}
            <p class="empty-state">No members found.</p>
          {/if}
        </div>
      </aside>
    </section>
  {/if}

  <!-- Modals -->
  {#if showEmojiPicker && selectedMessageForReaction}
    <div class="modal-backdrop bottom-sheet-backdrop" role="button" tabindex="0" on:click={closeEmojiPicker} on:keydown={(e) => e.key === 'Escape' && closeEmojiPicker()}>
      <div class="modal reaction-picker bottom-sheet" role="dialog" tabindex="-1" on:click|stopPropagation={() => {}} on:keydown|stopPropagation={() => {}}>
        <div class="bottom-sheet-handle"></div>
        <div class="reaction-picker-header">
          <h3>Add Reaction</h3>
          <button class="picker-close-btn" title="Close" on:click={closeEmojiPicker}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="reaction-tabs">
          <button class="reaction-tab" class:active={reactionPickerTab === "emoji"} on:click={() => reactionPickerTab = "emoji"}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            Emoji
          </button>
          <button class="reaction-tab" class:active={reactionPickerTab === "gif"} on:click={() => { reactionPickerTab = "gif"; if (reactionGifResults.length === 0) loadTrendingGifs(true); }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><text x="12" y="15.5" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor" stroke="none">GIF</text></svg>
            GIF
          </button>
        </div>

        {#if reactionPickerTab === "emoji"}
          <div class="emoji-search-bar">
            <input class="field" bind:value={emojiSearchQuery} placeholder="Search emoji..." />
          </div>
          <div class="emoji-grid">
            {#each filteredEmojis as icon}
              <button class="emoji-btn" on:click={() => { addReaction(selectedMessageForReaction, icon.id); closeEmojiPicker(); }} title={icon.label}>
                {@html icon.svg}
              </button>
            {/each}
            {#if filteredEmojis.length === 0}
              <p class="empty-state" style="grid-column:1/-1;padding:.5rem">No emoji found.</p>
            {/if}
          </div>
        {:else}
          <div class="gif-search-container">
            <input
              class="field gif-search-input"
              bind:value={reactionGifSearch}
              on:input={() => handleGifSearch(reactionGifSearch, true)}
              placeholder="Search GIFs..."
            />
          </div>
          <div class="gif-grid-container">
            {#if isLoadingReactionGifs}
              <div class="gif-loading">
                <span class="gif-spinner"></span> Loading GIFs...
              </div>
            {:else if reactionGifResults.length === 0}
              <p class="empty-state">No GIFs found. Try a different search.</p>
            {:else}
              <div class="gif-grid">
                {#each reactionGifResults as gif}
                  <button class="gif-item" on:click={() => addGifReaction(selectedMessageForReaction, gif)} title={gif.title}>
                    <img src={gif.preview || gif.url} alt={gif.title} loading="lazy" />
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <div class="giphy-attribution">Powered by GIPHY</div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- GIF Picker Modal -->
  {#if showGifPicker}
    <div class="modal-backdrop" role="button" tabindex="0" on:click={closeGifPicker} on:keydown={(e) => e.key === 'Escape' && closeGifPicker()}>
      <div class="modal gif-picker-modal" role="dialog" tabindex="-1" on:click|stopPropagation={() => {}} on:keydown|stopPropagation={() => {}}>
        <div class="reaction-picker-header">
          <h3>Choose a GIF</h3>
          <button class="picker-close-btn" title="Close" on:click={closeGifPicker}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="gif-search-container">
          <input
            class="field gif-search-input"
            bind:value={gifSearchQuery}
            on:input={() => handleGifSearch(gifSearchQuery)}
            placeholder="Search GIFs..."
          />
        </div>
        <div class="gif-grid-container">
          {#if isLoadingGifs}
            <div class="gif-loading">
              <span class="gif-spinner"></span> Loading GIFs...
            </div>
          {:else if gifResults.length === 0}
            <p class="empty-state gif-empty">No GIFs found. Try a different search.</p>
          {:else}
            <div class="gif-grid">
              {#each gifResults as gif}
                <button class="gif-item" on:click={() => sendGifMessage(gif)} title={gif.title}>
                  <img src={gif.preview || gif.url} alt={gif.title} loading="lazy" />
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <div class="giphy-attribution">Powered by GIPHY</div>
      </div>
    </div>
  {/if}

  <!-- Context Menu (Unsend) -->
  {#if contextMenuMessageId}
    <div class="context-backdrop" role="button" tabindex="0" on:click={closeContextMenu} on:keydown={(e) => e.key === 'Escape' && closeContextMenu()}>
      <div class="context-menu" role="menu" tabindex="-1" style="left:{contextMenuX}px;top:{contextMenuY}px" on:click|stopPropagation={() => {}} on:keydown|stopPropagation={() => {}}>
        <button class="context-item" on:click={() => { selectedMessageForReaction = contextMenuMessageId; showEmojiPicker = true; closeContextMenu(); }}>React</button>
        {#if contextMenuAuthor === me?.username || me?.role === 'admin'}
          <button class="context-item danger" on:click={() => unsendMessage(contextMenuMessageId)}>Unsend Message</button>
        {/if}
        <button class="context-item" on:click={closeContextMenu}>Cancel</button>
      </div>
    </div>
  {/if}

  {#if showInviteModal}
    <div class="modal-backdrop" role="button" tabindex="0" on:click={() => showInviteModal = false} on:keydown={(e) => e.key === 'Escape' && (showInviteModal = false)}>
      <div class="modal" role="dialog" tabindex="-1" on:click|stopPropagation={() => {}} on:keydown|stopPropagation={() => {}}>
        <h3>Join Server</h3>
        <p>Enter an invite code to join a server</p>
        <input class="field" bind:value={inviteCode} placeholder="Invite code" />
        <div class="modal-actions">
          <button class="ghost-btn" on:click={() => showInviteModal = false}>Cancel</button>
          <button class="primary-btn" on:click={useInvite}>Join</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showEventCreate}
    <div class="modal-backdrop" role="button" tabindex="0" on:click={() => showEventCreate = false} on:keydown={(e) => e.key === 'Escape' && (showEventCreate = false)}>
      <div class="modal" role="dialog" tabindex="-1" on:click|stopPropagation={() => {}} on:keydown|stopPropagation={() => {}}>
        <h3>Create Event</h3>
        <input class="field" bind:value={newEventTitle} placeholder="Event title" />
        <textarea class="field" bind:value={newEventDescription} placeholder="Description" rows="3"></textarea>
        <input class="field" bind:value={newEventLocation} placeholder="Location (optional)" />
        <input class="field" type="datetime-local" bind:value={newEventStartsAt} />
        <input class="field" type="datetime-local" bind:value={newEventEndsAt} />
        <div class="modal-actions">
          <button class="ghost-btn" on:click={() => showEventCreate = false}>Cancel</button>
          <button class="primary-btn" on:click={createEvent}>Create</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showAdminPanel}
    <div class="modal-backdrop" role="button" tabindex="0" on:click={() => showAdminPanel = false} on:keydown={(e) => e.key === 'Escape' && (showAdminPanel = false)}>
      <div class="modal admin-panel-modal" role="dialog" tabindex="-1" on:click|stopPropagation={() => {}} on:keydown|stopPropagation={() => {}}>
        <h3>Admin Panel</h3>
        <p>Manage pending account requests</p>
        {#if pendingUsers.length === 0}
          <div class="admin-empty">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
            <p>No pending requests</p>
          </div>
        {:else}
          <div class="pending-users-list">
            {#each pendingUsers as user}
              <div class="pending-user-row">
                <div class="pending-user-info">
                  <span class="pending-user-name">{user.username}</span>
                  <span class="pending-user-date">Registered {new Date(user.createdAt).toLocaleDateString()}</span>
                </div>
                <div class="pending-user-actions">
                  <button class="primary-btn small" on:click={() => approveUser(user.username)}>Approve</button>
                  <button class="ghost-btn small danger-text" on:click={() => rejectPendingUser(user.username)}>Deny</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
        <div class="modal-actions">
          <button class="ghost-btn" on:click={() => showAdminPanel = false}>Close</button>
        </div>
      </div>
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
    background: var(--bg-base-secondary, #2b2d31);
    padding: 0.5rem 0.75rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.06));
  }

  .user-footer strong {
    color: var(--text-normal, #dbdee1);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .user-footer p {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.75rem;
    text-transform: capitalize;
  }

  .footer-actions {
    display: flex;
    gap: 0.25rem;
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
    z-index: 200;
  }

  .context-menu {
    position: fixed;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 0.3rem;
    min-width: 160px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
    z-index: 201;
    /* Prevent context menu from overlapping the notch or home bar */
    margin-top: env(safe-area-inset-top, 0px);
    margin-bottom: env(safe-area-inset-bottom, 0px);
  }

  .context-item {
    display: block;
    width: 100%;
    background: transparent;
    border: none;
    color: var(--text-body);
    text-align: left;
    padding: 0.5rem 0.7rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.875rem;
    font-family: inherit;
    transition: background 100ms ease-in;
  }

  .context-item:hover {
    background: var(--accent);
    color: var(--text-primary);
  }

  .context-item.danger {
    color: var(--error);
  }

  .context-item.danger:hover {
    background: var(--error);
    color: var(--text-primary);
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

  @media (max-width: 980px) {
    .chat-shell,
    .chat-shell:has(.member-sidebar),
    .chat-shell:has(.member-sidebar.open) {
      grid-template-columns: 1fr;
      height: 100%;
    }

    .hamburger-btn {
      display: flex;
    }

    .mobile-close-btn {
      display: flex;
    }

    .channel-sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: 280px;
      z-index: 60;
      transform: translateX(-100%);
      transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1);
      border-right: 1px solid var(--border-subtle);
      padding-top: env(safe-area-inset-top, 0px);
    }

    .channel-sidebar.open {
      transform: translateX(0);
    }

    .member-sidebar {
      position: fixed;
      right: 0;
      top: 0;
      bottom: 0;
      width: 260px !important;
      z-index: 60;
      transform: translateX(100%);
      transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1), width 0s;
      padding-top: env(safe-area-inset-top, 0px);
    }

    .member-sidebar.open {
      transform: translateX(0);
    }

    .sidebar-overlay {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 55;
      background: rgba(0,0,0,0.60);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      animation: fade-in 0.2s ease-out;
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .emoji-grid {
      grid-template-columns: repeat(5, 1fr);
    }
  }
</style>
