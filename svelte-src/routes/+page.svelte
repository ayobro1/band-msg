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
  let selectedMessageForReaction = "";
  let messageContainer: HTMLElement | null = null;

  // Emoji search
  let emojiSearchQuery = "";

  // Band Tools state
  type SetlistItem = { id: string; title: string; key: string; duration: string };
  type EquipmentItem = { id: string; name: string; checkedBy: string | null };
  let showBandTools = false;
  let bandToolsView: "setlist" | "equipment" = "setlist";
  let setlist: SetlistItem[] = [
    { id: "1", title: "Highway to Hell", key: "A", duration: "3:28" },
    { id: "2", title: "Enter Sandman", key: "Em", duration: "5:31" },
    { id: "3", title: "Wonderwall", key: "F#m", duration: "4:18" },
    { id: "4", title: "Black Dog", key: "A", duration: "4:55" },
    { id: "5", title: "Don't Stop Me Now", key: "F", duration: "3:29" },
  ];
  let equipmentList: EquipmentItem[] = [
    { id: "1", name: "Amps", checkedBy: null },
    { id: "2", name: "Drum Rug", checkedBy: null },
    { id: "3", name: "Cables", checkedBy: null },
    { id: "4", name: "DI Boxes", checkedBy: null },
    { id: "5", name: "Mic Stands", checkedBy: null },
    { id: "6", name: "Drum Kit", checkedBy: null },
    { id: "7", name: "PA System", checkedBy: null },
  ];
  let newSetlistTitle = "";
  let newSetlistKey = "";
  let newSetlistDuration = "";
  let dragOverId = "";
  let dragSourceId = "";

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

  function handleMessagePointerDown(event: PointerEvent, messageId: string) {
    longPressTimer = setTimeout(() => {
      selectedMessageForReaction = messageId;
      showEmojiPicker = true;
      longPressTimer = null;
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
    if (showChannelSidebar) showMemberList = false;
  }

  // Audio file detection
  function isAudioMessage(content: string): { isAudio: boolean; url: string; name: string } {
    const match = content.match(/^(https?:\/\/\S+\.(mp3|wav|ogg|flac|aac|m4a))$/i);
    if (match) return { isAudio: true, url: match[1], name: match[1].split('/').pop() || 'audio' };
    return { isAudio: false, url: '', name: '' };
  }

  // Setlist drag-and-drop
  function onDragStart(id: string) {
    dragSourceId = id;
  }
  function onDragOver(e: DragEvent, id: string) {
    e.preventDefault();
    dragOverId = id;
  }
  function onDrop(targetId: string) {
    if (!dragSourceId || dragSourceId === targetId) { dragOverId = ""; return; }
    const srcIdx = setlist.findIndex(s => s.id === dragSourceId);
    const tgtIdx = setlist.findIndex(s => s.id === targetId);
    const updated = [...setlist];
    const [item] = updated.splice(srcIdx, 1);
    updated.splice(tgtIdx, 0, item);
    setlist = updated;
    dragSourceId = "";
    dragOverId = "";
  }
  function addSetlistItem() {
    if (!newSetlistTitle.trim()) return;
    setlist = [...setlist, {
      id: String(Date.now()),
      title: newSetlistTitle.trim(),
      key: newSetlistKey.trim() || "?",
      duration: newSetlistDuration.trim() || "0:00"
    }];
    newSetlistTitle = "";
    newSetlistKey = "";
    newSetlistDuration = "";
  }
  function removeSetlistItem(id: string) {
    setlist = setlist.filter(s => s.id !== id);
  }
  function toggleEquipment(id: string) {
    equipmentList = equipmentList.map(item => {
      if (item.id !== id) return item;
      return { ...item, checkedBy: item.checkedBy ? null : (me?.username ?? "unknown") };
    });
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
    
    await refreshMe();
    await refreshServers();
    await refreshChannels();
    await refreshMembers();
    
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

      <!-- Server Rail -->
      <aside class="server-rail">
        {#each servers as server}
          <button 
            class="server-pill" 
            class:active={server.id === selectedServerId}
            on:click={() => selectServer(server)}
            title={server.name}
          >
            {server.name.slice(0, 2).toUpperCase()}
          </button>
        {/each}
        <button class="server-pill add-server" on:click={() => showInviteModal = true} title="Join Server"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
      </aside>

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
              <button class="channel-link" class:active={channel.id === selectedChannelId && !showBandTools} on:click={() => { selectChannel(channel); showBandTools = false; showChannelSidebar = false; }}>
                <span>#{channel.name}</span>
              </button>
            {/each}
          </div>
          <p class="section-title" style="margin-top:1rem">Band Tools</p>
          <div class="channel-list">
            <button class="channel-link" class:active={showBandTools && bandToolsView === 'setlist'} on:click={() => { showBandTools = true; bandToolsView = 'setlist'; showChannelSidebar = false; }}>
              <span>🎵 Setlist</span>
            </button>
            <button class="channel-link" class:active={showBandTools && bandToolsView === 'equipment'} on:click={() => { showBandTools = true; bandToolsView = 'equipment'; showChannelSidebar = false; }}>
              <span>🎸 Equipment</span>
            </button>
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
            <button class="icon-btn" on:click={() => { showCalendar = !showCalendar; if (showCalendar) showMemberList = false; }} title="Calendar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
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
              {#if showBandTools}
                {bandToolsView === 'setlist' ? '🎵 Setlist' : '🎸 Equipment Checklist'}
              {:else}
                {selectedChannelName ? `#${selectedChannelName}` : "Select a channel"}
              {/if}
            </h3>
          </div>
          <div class="chat-header-actions">
            <button class="icon-btn" class:active={showMemberList} on:click={toggleMemberList} title="Member List"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
          </div>
        </header>

        <!-- Reconnecting Overlay -->
        {#if connectionStatus === "reconnecting"}
          <div class="reconnecting-bar" role="status">
            <span class="reconnecting-dot"></span> Reconnecting...
          </div>
        {/if}

        <!-- Band Tools View -->
        {#if showBandTools}
          <div class="band-tools-view">
            {#if bandToolsView === 'setlist'}
              <div class="band-tools-content">
                <p class="section-title" style="margin-bottom:1rem">Song Order — drag to reorder</p>
                <ul class="setlist-list">
                  {#each setlist as song, i (song.id)}
                    <li
                      class="setlist-item"
                      class:drag-over={dragOverId === song.id}
                      draggable="true"
                      on:dragstart={() => onDragStart(song.id)}
                      on:dragover={(e) => onDragOver(e, song.id)}
                      on:drop={() => onDrop(song.id)}
                      on:dragend={() => { dragOverId = ""; dragSourceId = ""; }}
                    >
                      <span class="setlist-num">{i + 1}</span>
                      <svg class="drag-handle" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
                      <span class="setlist-title">{song.title}</span>
                      <span class="setlist-badge key">{song.key}</span>
                      <span class="setlist-badge duration">{song.duration}</span>
                      <button class="icon-btn setlist-remove" on:click={() => removeSetlistItem(song.id)} title="Remove">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </li>
                  {/each}
                </ul>
                <div class="setlist-add-form">
                  <input class="field" bind:value={newSetlistTitle} placeholder="Song title" on:keydown={(e) => e.key === 'Enter' && addSetlistItem()} />
                  <input class="field setlist-short" bind:value={newSetlistKey} placeholder="Key (e.g. Am)" />
                  <input class="field setlist-short" bind:value={newSetlistDuration} placeholder="0:00" />
                  <button class="primary-btn" on:click={addSetlistItem}>Add</button>
                </div>
              </div>
            {:else}
              <div class="band-tools-content">
                <p class="section-title" style="margin-bottom:1rem">Equipment Checklist</p>
                <ul class="equipment-list">
                  {#each equipmentList as item (item.id)}
                    <li class="equipment-item" class:checked={!!item.checkedBy}>
                      <label class="equipment-label">
                        <input
                          type="checkbox"
                          checked={!!item.checkedBy}
                          on:change={() => toggleEquipment(item.id)}
                        />
                        <span class="equipment-name">{item.name}</span>
                      </label>
                      {#if item.checkedBy}
                        <span class="equipment-checker">✓ {item.checkedBy}</span>
                      {:else}
                        <span class="equipment-unchecked">—</span>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {:else}
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
                on:pointerdown={(e) => handleMessagePointerDown(e, msg.id)}
                on:pointerup={handleMessagePointerUp}
                on:pointerleave={handleMessagePointerUp}
                on:contextmenu={(e) => handleMessageContextMenu(e, msg.id, msg.author)}
              >
                <div class="avatar">{msg.author.slice(0, 1).toUpperCase()}</div>
                <div class="message-content">
                  <div class="message-head">
                    <strong>{msg.author}</strong>
                    <span class="msg-time">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {#if isGifMessage(msg.content).isGif}
                    <div class="gif-message">
                      <img src={isGifMessage(msg.content).url} alt="GIF" loading="lazy" />
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
        {/if}

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

      <!-- Calendar Sidebar -->
      {#if showCalendar}
        <aside class="calendar-sidebar">
          <header class="sidebar-header">
            <h2>Calendar</h2>
            <button class="icon-btn" on:click={() => showCalendar = false} title="Close"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </header>
          
          <div class="calendar-content">
            <button class="primary-btn" on:click={() => showEventCreate = true}>Create Event</button>
            
            <div class="events-list">
              <p class="section-title">Upcoming Events</p>
              {#if events.length === 0}
                <p class="empty-state">No events scheduled.</p>
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
        </aside>
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
      <div class="modal reaction-picker bottom-sheet" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
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
      <div class="modal gif-picker-modal" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
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
      <div class="context-menu" role="menu" tabindex="-1" style="left:{contextMenuX}px;top:{contextMenuY}px" on:click|stopPropagation on:keydown|stopPropagation>
        {#if contextMenuAuthor === me?.username || me?.role === 'admin'}
          <button class="context-item danger" on:click={() => unsendMessage(contextMenuMessageId)}>Unsend Message</button>
        {/if}
        <button class="context-item" on:click={() => { openEmojiPicker(contextMenuMessageId); closeContextMenu(); }}>Add Reaction</button>
      </div>
    </div>
  {/if}

  {#if showInviteModal}
    <div class="modal-backdrop" role="button" tabindex="0" on:click={() => showInviteModal = false} on:keydown={(e) => e.key === 'Escape' && (showInviteModal = false)}>
      <div class="modal" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
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
      <div class="modal" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
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

  {#if toastMessage}
    <section class="toast" class:error={toastType === "error"} class:success={toastType === "success"} role="status">
      {toastMessage}
    </section>
  {/if}
</main>

<style>
  /* ===== BASE ===== */
  .discord-app {
    width: 100%;
    height: 100vh;
    height: 100dvh;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
    background: var(--bg-root);
    color: var(--text-body);
    font-size: 0.875rem;
    overflow: hidden;
  }

  /* ===== TOAST ===== */
  .toast {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
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
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
    overflow-y: auto;
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
    height: 100%;
    display: grid;
    grid-template-columns: 64px 260px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
    overflow: hidden;
    position: relative;
  }

  .chat-shell:has(.calendar-sidebar) {
    grid-template-columns: 64px 260px minmax(0, 1fr) 320px;
  }

  .chat-shell:has(.member-sidebar.open):not(:has(.calendar-sidebar)) {
    grid-template-columns: 64px 260px minmax(0, 1fr) 240px;
  }

  .chat-shell:has(.calendar-sidebar):has(.member-sidebar.open) {
    grid-template-columns: 64px 260px minmax(0, 1fr) 240px;
  }

  .sidebar-overlay {
    display: none;
  }

  /* ===== SERVER RAIL ===== */
  .server-rail {
    background: var(--bg-root);
    padding: 0.75rem 0;
    display: grid;
    align-content: start;
    justify-content: center;
    gap: 0.5rem;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .server-pill {
    width: 42px;
    height: 42px;
    border-radius: var(--radius-lg);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 0.75rem;
    letter-spacing: 0.02em;
    cursor: pointer;
    border: none;
    transition: border-radius 150ms ease-out, background 150ms ease-out, color 150ms ease-out;
    position: relative;
  }

  .server-pill:hover {
    border-radius: 12px;
    background: var(--accent);
    color: var(--text-primary);
  }

  .server-pill.active {
    border-radius: 12px;
    background: var(--accent);
    color: var(--text-primary);
  }

  .server-pill.active::before {
    content: '';
    position: absolute;
    left: -11px;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 20px;
    background: var(--text-primary);
    border-radius: 0 2px 2px 0;
  }

  .server-pill.add-server {
    background: transparent;
    border: 1.5px dashed var(--border-hover);
    color: var(--text-muted);
    font-size: 1rem;
  }

  .server-pill.add-server:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-subtle);
  }

  /* ===== CHANNEL SIDEBAR ===== */
  .channel-sidebar {
    background: var(--bg-surface);
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    border-right: 1px solid var(--border-subtle);
    min-height: 0;
  }

  .sidebar-header {
    padding: 0.875rem 1rem;
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
    min-height: 0;
    padding: 0.75rem;
    display: grid;
    gap: 0.5rem;
    overflow-y: auto;
    align-content: start;
  }

  .channel-list {
    overflow-y: auto;
    overflow-x: hidden;
    display: grid;
    gap: 2px;
    align-content: start;
  }

  .channel-link {
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    text-align: left;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-weight: 500;
    font-size: 0.875rem;
    transition: background 150ms ease-out, color 150ms ease-out;
    border-left: 2px solid transparent;
  }

  .channel-link:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .channel-link.active {
    background: var(--accent-subtle);
    color: var(--text-primary);
    border-left-color: var(--accent);
  }

  .user-footer {
    background: var(--bg-inset);
    padding: 0.625rem 0.75rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    border-top: 1px solid var(--border-subtle);
  }

  .user-footer strong {
    color: var(--text-primary);
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
    height: 100%;
    background: var(--bg-root);
    display: grid;
    grid-template-rows: auto 1fr auto;
    min-height: 0;
    position: relative;
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
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1rem;
    display: grid;
    gap: 1rem;
    align-content: start;
    scroll-behavior: smooth;
    min-height: 0;
  }

  .message-row {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.375rem 0.5rem;
    border-radius: var(--radius-sm);
    transition: background 150ms ease-out;
    user-select: none;
    -webkit-user-select: none;
  }

  .message-row:hover {
    background: rgba(255, 255, 255, 0.015);
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: var(--text-primary);
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 0.8125rem;
    flex-shrink: 0;
  }

  .message-content {
    min-width: 0;
  }

  .message-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .message-head strong {
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .message-head .msg-time {
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 400;
    opacity: 0.6;
    transition: opacity 150ms ease-out;
  }

  .message-row:hover .msg-time {
    opacity: 1;
  }

  .message-content :global(p.message-text) {
    margin: 0.2rem 0 0;
    color: var(--text-body);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.6;
  }

  /* Markdown */
  .message-content :global(code) {
    background: var(--bg-inset);
    border: 1px solid var(--border);
    padding: 0.125rem 0.3rem;
    border-radius: 4px;
    font-family: "SF Mono", ui-monospace, "Cascadia Code", "Fira Code", monospace;
    font-size: 0.85em;
  }

  .message-content :global(pre) {
    background: var(--bg-inset);
    border: 1px solid var(--border);
    padding: 0.75rem;
    border-radius: var(--radius-md);
    overflow-x: auto;
  }

  .message-content :global(pre code) {
    background: none;
    border: none;
    padding: 0;
  }

  .message-content :global(a) {
    color: var(--accent-text);
    text-decoration: none;
  }

  .message-content :global(a:hover) {
    text-decoration: underline;
  }

  .message-content :global(.mention) {
    background: var(--accent-subtle);
    color: var(--accent-text);
    padding: 0 0.2rem;
    border-radius: 3px;
  }

  .message-content :global(.channel-ref) {
    background: var(--accent-subtle);
    color: var(--accent-text);
    padding: 0 0.2rem;
    border-radius: 3px;
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

  /* ===== CALENDAR SIDEBAR ===== */
  .calendar-sidebar {
    background: var(--bg-surface);
    border-left: 1px solid var(--border-subtle);
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
  }

  .calendar-content {
    padding: 1rem;
    overflow: auto;
    display: grid;
    gap: 1rem;
    align-content: start;
  }

  .events-list {
    display: grid;
    gap: 0.5rem;
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
  }

  .member-sidebar.open {
    width: 240px;
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

  /* ===== BAND TOOLS ===== */
  .band-tools-view {
    overflow-y: auto;
    padding: 1.25rem;
    min-height: 0;
  }

  .band-tools-content {
    max-width: 640px;
  }

  /* Setlist */
  .setlist-list {
    list-style: none;
    margin: 0 0 1rem;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }

  .setlist-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 0.625rem 0.75rem;
    cursor: grab;
    transition: background 150ms ease-out, box-shadow 150ms ease-out;
  }

  .setlist-item:active { cursor: grabbing; }

  .setlist-item.drag-over {
    box-shadow: 0 0 0 2px var(--accent);
    background: var(--accent-subtle);
  }

  .setlist-num {
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 700;
    min-width: 1.4rem;
    text-align: right;
  }

  .drag-handle {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .setlist-title {
    flex: 1;
    font-weight: 500;
    color: var(--text-body);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .setlist-badge {
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.15rem 0.4rem;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .setlist-badge.key {
    background: var(--accent-subtle);
    color: var(--accent-text);
  }

  .setlist-badge.duration {
    background: var(--bg-inset);
    color: var(--text-muted);
  }

  .setlist-remove {
    padding: 0.25rem;
    opacity: 0.4;
    transition: opacity 150ms ease-out;
  }

  .setlist-remove:hover {
    opacity: 1;
    color: var(--error);
  }

  .setlist-add-form {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .setlist-add-form .field {
    flex: 1;
    min-width: 120px;
  }

  .setlist-short {
    flex: 0 0 80px !important;
    min-width: 0 !important;
  }

  /* Equipment */
  .equipment-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.3rem;
  }

  .equipment-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 0.65rem 0.9rem;
    transition: background 150ms ease-out, border-color 150ms ease-out;
  }

  .equipment-item.checked {
    background: var(--success-subtle);
    border-color: var(--success);
  }

  .equipment-label {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    cursor: pointer;
    flex: 1;
  }

  .equipment-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--accent);
  }

  .equipment-name {
    font-weight: 500;
    color: var(--text-body);
  }

  .equipment-checker {
    font-size: 0.8125rem;
    color: var(--success);
    font-weight: 600;
    flex-shrink: 0;
    margin-left: 0.5rem;
  }

  .equipment-unchecked {
    font-size: 0.8125rem;
    color: var(--text-muted);
    flex-shrink: 0;
    margin-left: 0.5rem;
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
    .chat-shell:has(.calendar-sidebar),
    .chat-shell:has(.member-sidebar),
    .chat-shell:has(.member-sidebar.open),
    .chat-shell:has(.calendar-sidebar):has(.member-sidebar),
    .chat-shell:has(.calendar-sidebar):has(.member-sidebar.open) {
      grid-template-columns: 64px 260px minmax(0, 1fr);
    }

    .calendar-sidebar {
      position: fixed;
      right: 0;
      top: 0;
      bottom: 0;
      z-index: 50;
      box-shadow: -4px 0 16px rgba(0,0,0,0.4);
      width: 320px;
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
    }

    .member-sidebar.open {
      transform: translateX(0);
    }
  }

  @media (max-width: 980px) {
    .chat-shell,
    .chat-shell:has(.calendar-sidebar),
    .chat-shell:has(.member-sidebar),
    .chat-shell:has(.member-sidebar.open),
    .chat-shell:has(.calendar-sidebar):has(.member-sidebar),
    .chat-shell:has(.calendar-sidebar):has(.member-sidebar.open) {
      grid-template-columns: 1fr;
      height: 100%;
    }

    .server-rail {
      display: none;
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
