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
  let newServerName = "";
  let newServerDescription = "";
  let inviteCode = "";
  let isLoggingIn = false;
  let headerSessionToken = "";
  let toastMessage = "";
  let toastType: "error" | "success" = "error";
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;
  let typingTimeout: ReturnType<typeof setTimeout> | null = null;
  let showEmojiPicker = false;
  let showCalendar = false;
  let showServerCreate = false;
  let showInviteModal = false;
  let showEventCreate = false;
  let showMemberList = false;
  let selectedMessageForReaction = "";
  let reactionPickerX = 0;
  let reactionPickerY = 0;
  let messageContainer: HTMLElement | null = null;

  // Mobile sidebar state
  let showMobileSidebar = false;

  // Band features state
  let activeBandPanel: "none" | "setlist" | "equipment" = "none";
  type SetlistItem = { id: string; title: string; artist: string; duration: string; order: number };
  type EquipmentItem = { id: string; label: string; assignee: string; checked: boolean };
  let setlistItems: SetlistItem[] = [];
  let equipmentItems: EquipmentItem[] = [];
  let newSetlistTitle = "";
  let newSetlistArtist = "";
  let newSetlistDuration = "";
  let newEquipmentLabel = "";
  let newEquipmentAssignee = "";
  let pinnedMessages: string[] = [];
  let showPins = false;

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

  // Message grouping: group consecutive messages from same user within 5 min
  function isGroupedMessage(index: number): boolean {
    if (index === 0) return false;
    const prev = messages[index - 1];
    const curr = messages[index];
    return prev.author === curr.author && curr.createdAt - prev.createdAt < 5 * 60 * 1000;
  }

  // Audio detection for audio file URLs
  function isAudioUrl(content: string): { isAudio: boolean; url: string } {
    const match = content.match(/^(https?:\/\/\S+\.(mp3|wav|ogg|flac|aac|m4a))(\?[^\s]*)?$/i);
    if (match) {
      try {
        const parsed = new URL(match[0]);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
          return { isAudio: true, url: parsed.href };
        }
      } catch { /* ignore invalid URLs */ }
    }
    return { isAudio: false, url: "" };
  }

  // Band tools persistence (localStorage)
  function loadBandData() {
    if (typeof localStorage === "undefined") return;
    try {
      const sl = localStorage.getItem("band_setlist");
      if (sl) setlistItems = JSON.parse(sl);
      const eq = localStorage.getItem("band_equipment");
      if (eq) equipmentItems = JSON.parse(eq);
      const pins = localStorage.getItem(`band_pins_${encodeURIComponent(selectedChannelId)}`);
      if (pins) pinnedMessages = JSON.parse(pins);
    } catch { /* ignore */ }
  }

  function saveBandData() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem("band_setlist", JSON.stringify(setlistItems));
      localStorage.setItem("band_equipment", JSON.stringify(equipmentItems));
      localStorage.setItem(`band_pins_${encodeURIComponent(selectedChannelId)}`, JSON.stringify(pinnedMessages));
    } catch { /* ignore */ }
  }

  function addSetlistItem() {
    if (!newSetlistTitle.trim()) return;
    setlistItems = [...setlistItems, {
      id: crypto.randomUUID(),
      title: newSetlistTitle.trim(),
      artist: newSetlistArtist.trim(),
      duration: newSetlistDuration.trim(),
      order: setlistItems.length + 1
    }];
    newSetlistTitle = "";
    newSetlistArtist = "";
    newSetlistDuration = "";
    saveBandData();
  }

  function removeSetlistItem(id: string) {
    setlistItems = setlistItems.filter(i => i.id !== id).map((i, idx) => ({ ...i, order: idx + 1 }));
    saveBandData();
  }

  function moveSetlistItem(id: string, dir: -1 | 1) {
    const idx = setlistItems.findIndex(i => i.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= setlistItems.length) return;
    const arr = [...setlistItems];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setlistItems = arr.map((i, n) => ({ ...i, order: n + 1 }));
    saveBandData();
  }

  function addEquipmentItem() {
    if (!newEquipmentLabel.trim()) return;
    equipmentItems = [...equipmentItems, {
      id: crypto.randomUUID(),
      label: newEquipmentLabel.trim(),
      assignee: newEquipmentAssignee.trim(),
      checked: false
    }];
    newEquipmentLabel = "";
    newEquipmentAssignee = "";
    saveBandData();
  }

  function toggleEquipmentItem(id: string) {
    equipmentItems = equipmentItems.map(i => i.id === id ? { ...i, checked: !i.checked } : i);
    saveBandData();
  }

  function removeEquipmentItem(id: string) {
    equipmentItems = equipmentItems.filter(i => i.id !== id);
    saveBandData();
  }

  function togglePin(messageId: string) {
    if (pinnedMessages.includes(messageId)) {
      pinnedMessages = pinnedMessages.filter(id => id !== messageId);
    } else {
      pinnedMessages = [...pinnedMessages, messageId];
    }
    saveBandData();
  }

  $: pinnedMessageObjects = messages.filter(m => pinnedMessages.includes(m.id));

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

  async function createServer() {
    if (!newServerName.trim()) return;
    const res = await apiPost("/api/servers", {
      name: newServerName,
      description: newServerDescription
    });
    if (!res.ok) {
      showToast(await readApiError(res, "Create server failed"), "error");
      return;
    }
    newServerName = "";
    newServerDescription = "";
    showServerCreate = false;
    showToast("Server created.", "success");
    await refreshServers();
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
    showMobileSidebar = false;
    loadBandData();
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

  function openEmojiPicker(messageId: string, event?: MouseEvent | PointerEvent) {
    selectedMessageForReaction = messageId;
    showEmojiPicker = true;
    if (event) {
      const rect = (event.currentTarget as HTMLElement)?.getBoundingClientRect?.();
      if (rect) {
        // Position picker above/below the button
        const pickerWidth = 360;
        const pickerHeight = 400;
        let x = rect.left;
        let y = rect.bottom + 8;
        if (x + pickerWidth > window.innerWidth) x = window.innerWidth - pickerWidth - 8;
        if (y + pickerHeight > window.innerHeight) y = rect.top - pickerHeight - 8;
        reactionPickerX = Math.max(8, x);
        reactionPickerY = Math.max(8, y);
      } else {
        reactionPickerX = event.clientX;
        reactionPickerY = event.clientY;
      }
    } else {
      // Default: center of screen
      reactionPickerX = -1;
      reactionPickerY = -1;
    }
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
      openEmojiPicker(messageId, event);
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
    loadBandData();
    
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
        <h1>Welcome back</h1>
        <p>Sign in to continue chatting.</p>
        <input class="field" bind:value={loginUsername} placeholder="Username" autocomplete="username" />
        <input
          class="field"
          bind:value={loginPassword}
          type="password"
          placeholder="Password"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
        />
        <button class="primary-btn" type="button" on:click={login} disabled={isLoggingIn}>
          {isLoggingIn ? "Signing in..." : "Log In"}
        </button>
      </article>

      <article class="auth-card">
        <h2>Create account</h2>
        <p>First account becomes admin.</p>
        <input class="field" bind:value={registerUsername} placeholder="Username" autocomplete="username" />
        <input class="field" bind:value={registerPassword} type="password" placeholder="Password (12+ chars)" autocomplete="new-password" />
        <button class="primary-btn" type="button" on:click={register}>Register</button>
      </article>
    </section>
  {:else}
    <!-- Mobile sidebar overlay -->
    {#if showMobileSidebar}
      <div class="mobile-overlay" role="button" tabindex="0" on:click={() => showMobileSidebar = false} on:keydown={(e) => e.key === 'Escape' && (showMobileSidebar = false)}></div>
    {/if}

    <section class="chat-shell" class:mobile-sidebar-open={showMobileSidebar}>
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
      <aside class="channel-sidebar">
        <header class="sidebar-header">
          <h2>{servers.find(s => s.id === selectedServerId)?.name || "Band Chat"}</h2>
          {#if selectedServerId}
            <button class="icon-btn" on:click={() => createInvite(selectedServerId)} title="Create Invite">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          {/if}
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
          <p class="section-title">Text Channels</p>
          <div class="channel-list">
            {#if channels.length === 0}
              <p class="empty-state">No channels yet.</p>
            {/if}
            {#each channels as channel}
              <button class="channel-link" class:active={channel.id === selectedChannelId} on:click={() => selectChannel(channel)}>
                <svg class="channel-hash" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
                <span>{channel.name}</span>
              </button>
            {/each}
          </div>

          <!-- Band Tools Section -->
          <p class="section-title band-tools-title">Band Tools</p>
          <div class="channel-list">
            <button class="channel-link" class:active={activeBandPanel === 'setlist'} on:click={() => activeBandPanel = activeBandPanel === 'setlist' ? 'none' : 'setlist'}>
              <svg class="channel-hash" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              <span>setlist</span>
            </button>
            <button class="channel-link" class:active={activeBandPanel === 'equipment'} on:click={() => activeBandPanel = activeBandPanel === 'equipment' ? 'none' : 'equipment'}>
              <svg class="channel-hash" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span>equipment-check</span>
            </button>
            {#if selectedChannelId && pinnedMessages.length > 0}
              <button class="channel-link" class:active={showPins} on:click={() => showPins = !showPins}>
                <svg class="channel-hash" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>pinned ({pinnedMessages.length})</span>
              </button>
            {/if}
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
            <!-- Mobile hamburger -->
            <button class="icon-btn hamburger-btn" on:click={() => showMobileSidebar = !showMobileSidebar} title="Menu">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <h3>{selectedChannelName ? `#${selectedChannelName}` : "Select a channel"}</h3>
          </div>
          <div class="chat-header-actions">
            {#if selectedChannelId}
              <button class="icon-btn" class:active={showPins} on:click={() => showPins = !showPins} title="Pinned Messages">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </button>
            {/if}
            <button class="icon-btn" class:active={showMemberList} on:click={() => { showMemberList = !showMemberList; if (showMemberList) showCalendar = false; }} title="Member List"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
          </div>
        </header>

        <!-- Reconnecting Overlay -->
        {#if connectionStatus === "reconnecting"}
          <div class="reconnecting-bar" role="status">
            <span class="reconnecting-dot"></span> Reconnecting...
          </div>
        {/if}

        <!-- Pinned Messages Panel -->
        {#if showPins && pinnedMessageObjects.length > 0}
          <div class="pins-panel">
            <p class="section-title pins-title">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Pinned Messages
            </p>
            {#each pinnedMessageObjects as pinned}
              <div class="pin-item">
                <strong>{pinned.author}</strong>
                <span>{pinned.content.slice(0, 120)}{pinned.content.length > 120 ? '…' : ''}</span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Band Panel: Setlist -->
        {#if activeBandPanel === 'setlist'}
          <div class="band-panel">
            <div class="band-panel-header">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              <strong>Setlist</strong>
              <button class="icon-btn panel-close-btn" on:click={() => activeBandPanel = 'none'} title="Close">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="band-panel-body">
              <ol class="setlist-list">
                {#each setlistItems as item, i}
                  <li class="setlist-item">
                    <span class="setlist-num">{item.order}</span>
                    <div class="setlist-info">
                      <strong>{item.title}</strong>
                      {#if item.artist}<span class="setlist-artist">{item.artist}</span>{/if}
                      {#if item.duration}<span class="setlist-dur">{item.duration}</span>{/if}
                    </div>
                    <div class="setlist-actions">
                      <button class="icon-btn" on:click={() => moveSetlistItem(item.id, -1)} disabled={i === 0} title="Move up">↑</button>
                      <button class="icon-btn" on:click={() => moveSetlistItem(item.id, 1)} disabled={i === setlistItems.length - 1} title="Move down">↓</button>
                      <button class="icon-btn danger-icon" on:click={() => removeSetlistItem(item.id)} title="Remove">×</button>
                    </div>
                  </li>
                {/each}
                {#if setlistItems.length === 0}
                  <p class="empty-state">No songs yet. Add your first song below.</p>
                {/if}
              </ol>
              <div class="band-add-form">
                <input class="field field-sm" bind:value={newSetlistTitle} placeholder="Song title *" />
                <input class="field field-sm" bind:value={newSetlistArtist} placeholder="Artist (optional)" />
                <input class="field field-sm" bind:value={newSetlistDuration} placeholder="Duration e.g. 3:45" />
                <button class="primary-btn btn-sm" on:click={addSetlistItem}>Add Song</button>
              </div>
            </div>
          </div>
        {/if}

        <!-- Band Panel: Equipment Check -->
        {#if activeBandPanel === 'equipment'}
          <div class="band-panel">
            <div class="band-panel-header">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <strong>Equipment Check</strong>
              <button class="icon-btn panel-close-btn" on:click={() => activeBandPanel = 'none'} title="Close">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="band-panel-body">
              <ul class="equipment-list">
                {#each equipmentItems as item}
                  <li class="equipment-item" class:checked={item.checked}>
                    <button class="check-box" class:checked={item.checked} on:click={() => toggleEquipmentItem(item.id)}>
                      {#if item.checked}<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>{/if}
                    </button>
                    <div class="equipment-info">
                      <span class="equipment-label">{item.label}</span>
                      {#if item.assignee}<span class="equipment-assignee">→ {item.assignee}</span>{/if}
                    </div>
                    <button class="icon-btn danger-icon" on:click={() => removeEquipmentItem(item.id)} title="Remove">×</button>
                  </li>
                {/each}
                {#if equipmentItems.length === 0}
                  <p class="empty-state">No items yet. Add equipment below.</p>
                {/if}
              </ul>
              <div class="band-add-form">
                <input class="field field-sm" bind:value={newEquipmentLabel} placeholder="Item (e.g. PA system) *" />
                <input class="field field-sm" bind:value={newEquipmentAssignee} placeholder="Who brings it?" />
                <button class="primary-btn btn-sm" on:click={addEquipmentItem}>Add Item</button>
              </div>
            </div>
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
            {#each messages as msg, msgIdx}
              {@const grouped = isGroupedMessage(msgIdx)}
              <article
                class="message-row"
                class:grouped
                on:pointerdown={(e) => handleMessagePointerDown(e, msg.id)}
                on:pointerup={handleMessagePointerUp}
                on:pointerleave={handleMessagePointerUp}
                on:contextmenu={(e) => handleMessageContextMenu(e, msg.id, msg.author)}
              >
                {#if grouped}
                  <div class="avatar-placeholder">
                    <span class="grouped-time">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                {:else}
                  <div class="avatar">{msg.author.slice(0, 1).toUpperCase()}</div>
                {/if}
                <div class="message-content">
                  {#if !grouped}
                    <div class="message-head">
                      <strong>{msg.author}</strong>
                      <span class="msg-time">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  {/if}
                  {#if isGifMessage(msg.content).isGif}
                    <div class="gif-message">
                      <img src={isGifMessage(msg.content).url} alt="GIF" loading="lazy" />
                    </div>
                  {:else if isAudioUrl(msg.content).isAudio}
                    <div class="audio-message">
                      <div class="audio-label">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        Audio file
                      </div>
                      <audio controls src={isAudioUrl(msg.content).url} preload="metadata" class="audio-player"></audio>
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
                      <button class="reaction-add-btn" on:click={(e) => openEmojiPicker(msg.id, e)} title="Add Reaction">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                      </button>
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
          <div class="composer-wrap">
            <button class="composer-plus-btn" on:click={openGifPicker} disabled={!selectedChannelId} title="Send a GIF">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <input
              class="composer-field"
              bind:value={newMessage}
              on:input={handleTyping}
              placeholder={selectedChannelId ? `Message #${selectedChannelName || "channel"}` : "Select a channel to chat"}
              disabled={!selectedChannelId}
              on:keydown={(event) => event.key === "Enter" && sendMessage()}
            />
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

      <!-- Member List Sidebar -->
      {#if showMemberList}
        <aside class="member-sidebar">
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
      {/if}
    </section>
  {/if}

  <!-- Modals -->
  {#if showEmojiPicker && selectedMessageForReaction}
    <div class="reaction-backdrop" role="button" tabindex="0" on:click={() => { showEmojiPicker = false; reactionPickerTab = "emoji"; reactionGifSearch = ""; reactionGifResults = []; }} on:keydown={(e) => e.key === 'Escape' && (showEmojiPicker = false)}>
      <div
        class="reaction-picker-popup"
        role="dialog"
        tabindex="-1"
        style={reactionPickerX >= 0 ? `left:${reactionPickerX}px;top:${reactionPickerY}px` : ''}
        class:centered={reactionPickerX < 0}
        on:click|stopPropagation
        on:keydown|stopPropagation
      >
        <div class="reaction-picker-header">
          <h3>Add Reaction</h3>
          <button class="picker-close-btn" title="Close" on:click={() => { showEmojiPicker = false; reactionPickerTab = "emoji"; reactionGifSearch = ""; reactionGifResults = []; }}>
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
          <div class="emoji-grid">
            {#each REACTION_ICONS as icon}
              <button class="emoji-btn" on:click={() => addReaction(selectedMessageForReaction, icon.id)} title={icon.label}>
                {@html icon.svg}
              </button>
            {/each}
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
        <button class="context-item" on:click={() => { togglePin(contextMenuMessageId); closeContextMenu(); }}>
          {pinnedMessages.includes(contextMenuMessageId) ? 'Unpin Message' : 'Pin Message'}
        </button>
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
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .discord-app {
    min-height: 100vh;
    padding: 1rem;
    display: grid;
    gap: 0.85rem;
    background: #313338;
    color: #f2f3f5;
  }

  /* Toast */
  .toast {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 30;
    min-width: min(360px, calc(100vw - 2rem));
    max-width: 420px;
    padding: 0.7rem 0.85rem;
    border-radius: 8px;
    color: #fff;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
    font-weight: 600;
  }

  .toast.error {
    background: #da373c;
  }

  .toast.success {
    background: #2d7d46;
  }

  /* Auth */
  .auth-shell {
    width: min(860px, 100%);
    margin: auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .auth-card {
    background: #2b2d31;
    border: 1px solid #232428;
    border-radius: 10px;
    padding: 1rem;
    display: grid;
    gap: 0.7rem;
  }

  .auth-card h1,
  .auth-card h2,
  .chat-header h3,
  .sidebar-header h2 {
    margin: 0;
    color: #f2f3f5;
  }

  .auth-card p {
    margin: 0;
    color: #b5bac1;
  }

  /* Main Chat Shell */
  .chat-shell {
    min-height: calc(100vh - 2rem);
    display: grid;
    grid-template-columns: 72px 280px minmax(0, 1fr);
    gap: 0;
    border-radius: 10px;
    overflow: hidden;
  }

  .chat-shell:has(.calendar-sidebar) {
    grid-template-columns: 72px 280px minmax(0, 1fr) 320px;
  }

  .chat-shell:has(.member-sidebar) {
    grid-template-columns: 72px 280px minmax(0, 1fr) 240px;
  }

  .chat-shell:has(.calendar-sidebar):has(.member-sidebar) {
    grid-template-columns: 72px 280px minmax(0, 1fr) 240px;
  }

  /* Server Rail */
  .server-rail {
    background: #1e1f22;
    padding: 0.75rem 0;
    display: grid;
    align-content: start;
    justify-content: center;
    gap: 0.5rem;
  }

  .server-pill {
    width: 48px;
    height: 48px;
    border-radius: 16px;
    background: #313338;
    color: #fff;
    display: grid;
    place-items: center;
    font-weight: 800;
    letter-spacing: 0.04em;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .server-pill:hover {
    border-radius: 12px;
    background: #5865f2;
  }

  .server-pill.active {
    border-radius: 12px;
    background: #5865f2;
  }

  .server-pill.add-server {
    background: #2b2d31;
    font-size: 1.5rem;
  }

  /* Channel Sidebar */
  .channel-sidebar {
    background: #2b2d31;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    border-right: 1px solid #232428;
    min-height: 0;
  }

  .sidebar-header {
    padding: 0.9rem 1rem;
    border-bottom: 1px solid #232428;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .admin-create {
    padding: 0.75rem 0.8rem;
    display: grid;
    gap: 0.5rem;
    border-bottom: 1px solid #232428;
  }

  .section-title {
    margin: 0;
    color: #949ba4;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .channels-wrap {
    min-height: 0;
    padding: 0.75rem;
    display: grid;
    grid-template-rows: auto auto auto auto auto 1fr;
    gap: 0.45rem;
    overflow-y: auto;
  }

  .channel-list {
    overflow-y: auto;
    overflow-x: hidden;
    display: grid;
    gap: 0.2rem;
    align-content: start;
  }

  .channel-link {
    border: 0;
    background: transparent;
    color: #949ba4;
    text-align: left;
    padding: 0.45rem 0.55rem;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .channel-hash {
    flex-shrink: 0;
    opacity: 0.7;
  }

  .channel-link:hover,
  .channel-link.active {
    background: #404249;
    color: #dbdee1;
  }

  .user-footer {
    background: #232428;
    padding: 0.65rem 0.75rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .user-footer strong {
    color: #f2f3f5;
    font-size: 0.9rem;
  }

  .user-footer p {
    margin: 0;
    color: #949ba4;
    font-size: 0.75rem;
    text-transform: capitalize;
  }

  .footer-actions {
    display: flex;
    gap: 0.25rem;
  }

  /* Main Chat Area */
  .chat-main {
    background: #313338;
    display: grid;
    grid-template-rows: auto auto auto auto auto 1fr auto;
    min-height: 0;
  }

  .chat-header {
    padding: 0.9rem 1rem;
    border-bottom: 1px solid #232428;
    background: #313338;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .chat-header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hamburger-btn {
    display: none;
  }

  .chat-header-actions {
    display: flex;
    gap: 0.25rem;
  }

  .chat-header-actions .icon-btn.active,
  .icon-btn.active {
    background: #404249;
    color: #dbdee1;
  }

  /* Reconnecting Overlay */
  .reconnecting-bar {
    background: #faa61a;
    color: #000;
    text-align: center;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .reconnecting-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #000;
    animation: reconnect-pulse 1.2s ease-in-out infinite;
  }

  @keyframes reconnect-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  /* Skeleton Loading States */
  .message-row.skeleton {
    pointer-events: none;
  }

  .skeleton-avatar {
    background: #404249 !important;
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  .skeleton-line {
    height: 0.85rem;
    border-radius: 4px;
    background: #404249;
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
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
  }

  /* Presence Dots */
  .presence-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid #232428;
    flex-shrink: 0;
  }

  .presence-dot.online {
    background: #23a55a;
  }

  .presence-dot.idle {
    background: #f0b232;
  }

  .presence-dot.dnd {
    background: #f23f43;
  }

  .presence-dot.offline {
    background: #80848e;
  }

  /* User Footer with Presence */
  .user-footer-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .messages-scroll {
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1rem;
    display: grid;
    gap: 0.1rem;
    align-content: start;
    scroll-behavior: smooth;
  }

  .message-row {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 6px;
    transition: background 0.12s;
    user-select: none;
    -webkit-user-select: none;
  }

  .message-row:not(.grouped) {
    margin-top: 0.75rem;
  }

  .message-row.grouped {
    padding-top: 0.05rem;
    padding-bottom: 0.05rem;
  }

  .message-row:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .message-row:hover .msg-time,
  .message-row:hover .grouped-time {
    opacity: 1;
  }

  .avatar-placeholder {
    width: 40px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .grouped-time {
    color: #949ba4;
    font-size: 0.62rem;
    opacity: 0;
    transition: opacity 0.15s;
    white-space: nowrap;
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    background: #5865f2;
    color: #fff;
    display: grid;
    place-items: center;
    font-weight: 700;
    flex-shrink: 0;
  }

  .message-content {
    min-width: 0;
  }

  .message-head {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
  }

  .message-head strong {
    color: #f2f3f5;
    font-size: 0.95rem;
  }

  .message-head .msg-time {
    color: #949ba4;
    font-size: 0.72rem;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .message-content :global(p.message-text) {
    margin: 0.1rem 0 0;
    color: #dbdee1;
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Markdown Styling */
  .message-content :global(code) {
    background: #1e1f22;
    padding: 0.15rem 0.3rem;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 0.9em;
  }

  .message-content :global(pre) {
    background: #1e1f22;
    padding: 0.5rem;
    border-radius: 6px;
    overflow-x: auto;
  }

  .message-content :global(pre code) {
    background: none;
    padding: 0;
  }

  .message-content :global(a) {
    color: #00a8fc;
    text-decoration: none;
  }

  .message-content :global(a:hover) {
    text-decoration: underline;
  }

  .message-content :global(.mention) {
    background: rgba(88, 101, 242, 0.3);
    color: #c9d1ff;
    padding: 0 0.2rem;
    border-radius: 3px;
  }

  .message-content :global(.channel-ref) {
    background: rgba(88, 101, 242, 0.3);
    color: #c9d1ff;
    padding: 0 0.2rem;
    border-radius: 3px;
  }

  /* Reactions */
  .reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.5rem;
  }

  .reaction-badge {
    background: #2b2d31;
    border: 1.5px solid #3a3c42;
    border-radius: 20px;
    padding: 0.2rem 0.55rem;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    cursor: pointer;
    transition: all 0.18s ease;
    font-family: inherit;
  }

  .reaction-badge:hover {
    background: #404249;
    border-color: #5865f2;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(88, 101, 242, 0.15);
  }

  .reaction-badge.own-reaction {
    background: rgba(88, 101, 242, 0.18);
    border-color: #5865f2;
  }

  .reaction-badge .reaction-icon {
    display: flex;
    align-items: center;
    width: 18px;
    height: 18px;
    color: #b5bac1;
  }

  .reaction-badge .reaction-icon :global(svg) {
    width: 18px;
    height: 18px;
  }

  .reaction-badge.own-reaction .reaction-icon {
    color: #8b9cf7;
  }

  .reaction-badge .count {
    font-size: 0.78rem;
    color: #b5bac1;
    font-weight: 600;
  }

  .reaction-badge.own-reaction .count {
    color: #a8b3f5;
  }

  .reaction-add-btn {
    background: #2b2d31;
    border: 1.5px dashed #3a3c42;
    border-radius: 20px;
    padding: 0.2rem 0.55rem;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: #949ba4;
    opacity: 0;
    transition: all 0.18s ease;
  }

  .reactions:hover .reaction-add-btn,
  .reaction-add-btn:focus {
    opacity: 1;
  }

  .reaction-add-btn:hover {
    background: #404249;
    border-color: #5865f2;
    color: #dbdee1;
  }

  /* Context Menu */
  .context-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
  }

  .context-menu {
    position: fixed;
    background: #1e1f22;
    border: 1px solid #2b2d31;
    border-radius: 6px;
    padding: 0.3rem;
    min-width: 160px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 201;
  }

  .context-item {
    display: block;
    width: 100%;
    background: transparent;
    border: none;
    color: #dbdee1;
    text-align: left;
    padding: 0.5rem 0.7rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    font-family: inherit;
  }

  .context-item:hover {
    background: #5865f2;
    color: #fff;
  }

  .context-item.danger {
    color: #f23f43;
  }

  .context-item.danger:hover {
    background: #f23f43;
    color: #fff;
  }

  /* Typing Indicator */
  .typing-indicator {
    color: #949ba4;
    font-size: 0.85rem;
    font-style: italic;
    padding: 0 0.5rem;

  }

  .typing-indicator strong {
    color: #dbdee1;
    font-weight: 600;
  }

  /* Composer */
  .composer {
    padding: 0 1rem 1rem;
  }

  .composer-wrap {
    display: flex;
    align-items: center;
    background: #383a40;
    border-radius: 12px;
    padding: 0 0.5rem 0 0;
    gap: 0;
  }

  .composer-plus-btn {
    background: transparent;
    border: none;
    color: #b5bac1;
    padding: 0.7rem 0.75rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .composer-plus-btn:hover {
    color: #dbdee1;
    background: rgba(255,255,255,0.06);
  }

  .composer-plus-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .composer-field {
    flex: 1;
    background: transparent;
    border: none;
    color: #f2f3f5;
    padding: 0.75rem 0.5rem;
    outline: none;
    font-family: inherit;
    font-size: 0.95rem;
  }

  .composer-field::placeholder {
    color: #6d6f78;
  }

  .composer-field:disabled {
    opacity: 0.5;
  }

  /* Form Elements */
  .field,
  textarea.field {
    width: 100%;
    border: 1px solid #1e1f22;
    background: #1e1f22;
    color: #f2f3f5;
    border-radius: 8px;
    padding: 0.62rem 0.72rem;
    outline: none;
    font-family: inherit;
    resize: vertical;
  }

  .field:focus,
  textarea.field:focus {
    border-color: #5865f2;
  }

  .field::placeholder {
    color: #949ba4;
  }

  .field:disabled {
    opacity: 0.65;
  }

  /* Buttons */
  .primary-btn,
  .ghost-btn,
  .icon-btn {
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    padding: 0.62rem 0.86rem;
    font-family: inherit;
  }

  .primary-btn {
    background: #5865f2;
    color: #fff;
  }

  .primary-btn:hover {
    background: #4f5bda;
  }

  .primary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .ghost-btn {
    background: #404249;
    color: #dbdee1;
  }

  .ghost-btn:hover {
    background: #4e5058;
  }

  .icon-btn {
    background: transparent;
    padding: 0.4rem;
    color: #949ba4;
    font-size: 1rem;
  }

  .icon-btn:hover {
    background: #404249;
    color: #dbdee1;
  }

  /* Calendar Sidebar */
  .calendar-sidebar {
    background: #2b2d31;
    border-left: 1px solid #232428;
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
    background: #313338;
    border: 1px solid #232428;
    border-radius: 8px;
    padding: 0.75rem;
  }

  .event-header strong {
    color: #f2f3f5;
    font-size: 0.95rem;
  }

  .event-time,
  .event-location,
  .event-desc {
    margin: 0.3rem 0 0;
    font-size: 0.85rem;
    color: #b5bac1;
  }

  /* Member List Sidebar */
  .member-sidebar {
    background: #2b2d31;
    border-left: 1px solid #232428;
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 0;
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
    border-radius: 6px;
    cursor: default;
  }

  .member-item:hover {
    background: #35373c;
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
    font-size: 0.8rem;
  }

  .member-info {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .member-name {
    color: #949ba4;
    font-size: 0.9rem;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .member-name.admin {
    color: #f47fff;
  }

  .member-role-badge {
    font-size: 0.65rem;
    background: rgba(244, 127, 255, 0.15);
    color: #f47fff;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    font-weight: 600;
    flex-shrink: 0;
  }

  /* Modals */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  .modal {
    background: #2b2d31;
    border-radius: 12px;
    padding: 1.5rem;
    min-width: min(420px, 90vw);
    max-width: 600px;
    display: grid;
    gap: 0.85rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .modal h3 {
    margin: 0;
    color: #f2f3f5;
  }

  .modal p {
    margin: 0;
    color: #b5bac1;
    font-size: 0.9rem;
  }

  .modal-actions {
    display: flex;
    gap: 0.6rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  /* Reaction Picker Popup (positioned near button) */
  .reaction-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
  }

  .reaction-picker-popup {
    position: fixed;
    background: #2b2d31;
    border-radius: 12px;
    padding: 1rem;
    width: 360px;
    max-width: 90vw;
    max-height: 480px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
    border: 1px solid #232428;
    z-index: 101;
  }

  .reaction-picker-popup.centered {
    position: fixed;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%);
  }

  /* GIF picker modal keeps centered style */
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
    margin-bottom: 0.5rem;
  }

  .reaction-picker-header h3 {
    margin: 0;
    color: #f2f3f5;
    font-size: 1rem;
  }

  .picker-close-btn {
    background: transparent;
    border: none;
    color: #949ba4;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: color 0.15s;
  }

  .picker-close-btn:hover {
    color: #f2f3f5;
  }

  .reaction-tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
    background: #1e1f22;
    border-radius: 8px;
    padding: 0.2rem;
  }

  .reaction-tab {
    flex: 1;
    background: transparent;
    border: none;
    color: #949ba4;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    transition: all 0.15s;
  }

  .reaction-tab:hover {
    color: #dbdee1;
  }

  .reaction-tab.active {
    background: #5865f2;
    color: #fff;
  }

  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.4rem;
  }

  .emoji-btn {
    background: #1e1f22;
    border: 1px solid transparent;
    border-radius: 10px;
    padding: 0.65rem;
    cursor: pointer;
    transition: all 0.15s;
    color: #b5bac1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .emoji-btn :global(svg) {
    width: 26px;
    height: 26px;
  }

  .emoji-btn:hover {
    background: #5865f2;
    transform: scale(1.12);
    color: #fff;
    border-color: #5865f2;
    box-shadow: 0 4px 12px rgba(88, 101, 242, 0.3);
  }

  /* GIF Picker */
  .gif-search-container {
    margin-bottom: 0.5rem;
  }

  .gif-search-input {
    font-size: 0.9rem;
  }

  .gif-grid-container {
    flex: 1;
    overflow-y: auto;
    min-height: 200px;
    max-height: 400px;
    border-radius: 8px;
  }

  .gif-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.4rem;
  }

  .gif-item {
    background: #1e1f22;
    border: 2px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    padding: 0;
    transition: all 0.15s;
    aspect-ratio: auto;
  }

  .gif-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 6px;
  }

  .gif-item:hover {
    border-color: #5865f2;
    transform: scale(1.03);
    box-shadow: 0 4px 12px rgba(88, 101, 242, 0.25);
  }

  .gif-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: #949ba4;
    font-size: 0.9rem;
  }

  .gif-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid #404249;
    border-top-color: #5865f2;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .giphy-attribution {
    text-align: center;
    font-size: 0.72rem;
    color: #6d6f78;
    padding-top: 0.5rem;
    letter-spacing: 0.02em;
  }

  /* GIF Messages */
  .gif-message {
    margin-top: 0.25rem;
    max-width: 320px;
    border-radius: 8px;
    overflow: hidden;
  }

  .gif-message img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 8px;
  }

  .gif-reaction-img {
    width: 20px;
    height: 20px;
    object-fit: cover;
    border-radius: 3px;
  }

  .gif-empty {
    padding: 1rem;
  }

  /* Utility */
  .empty-state {
    color: #949ba4;
    margin: 0;
    font-size: 0.88rem;
  }

  /* Mobile overlay */
  .mobile-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 40;
  }

  /* Pins panel */
  .pins-panel {
    background: #2b2d31;
    border-bottom: 1px solid #232428;
    padding: 0.6rem 1rem;
    max-height: 160px;
    overflow-y: auto;
  }

  .pins-title {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 0.4rem;
  }

  .pin-item {
    background: #313338;
    border-left: 3px solid #5865f2;
    border-radius: 0 6px 6px 0;
    padding: 0.4rem 0.6rem;
    margin-bottom: 0.3rem;
    font-size: 0.85rem;
    color: #b5bac1;
  }

  .pin-item strong {
    color: #f2f3f5;
    margin-right: 0.4rem;
    font-size: 0.82rem;
  }

  /* Band Tools Panel */
  .band-tools-title {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #232428;
  }

  .band-panel {
    background: #2b2d31;
    border-bottom: 1px solid #232428;
    max-height: 360px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .band-panel-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.65rem 1rem;
    border-bottom: 1px solid #232428;
    color: #b5bac1;
    font-size: 0.85rem;
  }

  .band-panel-header strong {
    flex: 1;
    color: #f2f3f5;
  }

  .panel-close-btn {
    background: transparent;
    border: none;
    color: #949ba4;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    font-family: inherit;
  }

  .panel-close-btn:hover {
    color: #f2f3f5;
  }

  .band-panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Setlist */
  .setlist-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .setlist-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #313338;
    border-radius: 6px;
    padding: 0.45rem 0.6rem;
  }

  .setlist-num {
    color: #949ba4;
    font-size: 0.78rem;
    font-weight: 700;
    min-width: 18px;
    text-align: center;
  }

  .setlist-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .setlist-info strong {
    color: #f2f3f5;
    font-size: 0.88rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .setlist-artist {
    color: #b5bac1;
    font-size: 0.77rem;
  }

  .setlist-dur {
    color: #5865f2;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .setlist-actions {
    display: flex;
    gap: 0.15rem;
  }

  /* Equipment Check */
  .equipment-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .equipment-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #313338;
    border-radius: 6px;
    padding: 0.45rem 0.6rem;
    transition: opacity 0.2s;
  }

  .equipment-item.checked {
    opacity: 0.6;
  }

  .equipment-item.checked .equipment-label {
    text-decoration: line-through;
    color: #6d6f78;
  }

  .check-box {
    width: 20px;
    height: 20px;
    border: 2px solid #3a3c42;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s;
    padding: 0;
  }

  .check-box.checked {
    background: #5865f2;
    border-color: #5865f2;
    color: #fff;
  }

  .check-box:hover {
    border-color: #5865f2;
  }

  .equipment-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .equipment-label {
    color: #dbdee1;
    font-size: 0.88rem;
  }

  .equipment-assignee {
    color: #949ba4;
    font-size: 0.77rem;
  }

  .danger-icon {
    color: #6d6f78;
    font-size: 1.1rem;
    line-height: 1;
    padding: 0.15rem 0.3rem;
  }

  .danger-icon:hover {
    color: #f23f43;
    background: transparent;
  }

  /* Band Add Form */
  .band-add-form {
    display: grid;
    gap: 0.35rem;
    padding-top: 0.5rem;
    border-top: 1px solid #232428;
  }

  .field-sm {
    padding: 0.45rem 0.6rem;
    font-size: 0.85rem;
  }

  .btn-sm {
    padding: 0.45rem 0.7rem;
    font-size: 0.85rem;
  }

  /* Audio Player */
  .audio-message {
    margin-top: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .audio-label {
    color: #949ba4;
    font-size: 0.78rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .audio-player {
    width: 100%;
    max-width: 320px;
    height: 36px;
    border-radius: 8px;
  }

  audio::-webkit-media-controls-panel {
    background: #2b2d31;
  }

  /* Responsive */
  @media (max-width: 1200px) {
    .chat-shell,
    .chat-shell:has(.calendar-sidebar),
    .chat-shell:has(.member-sidebar),
    .chat-shell:has(.calendar-sidebar):has(.member-sidebar) {
      grid-template-columns: 72px 280px minmax(0, 1fr);
    }

    .calendar-sidebar,
    .member-sidebar {
      position: fixed;
      right: 0;
      top: 0;
      bottom: 0;
      z-index: 50;
      box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3);
    }

    .calendar-sidebar {
      width: 320px;
    }

    .member-sidebar {
      width: 240px;
    }
  }

  @media (max-width: 768px) {
    .hamburger-btn {
      display: flex;
    }

    .mobile-overlay {
      display: block;
    }

    .chat-shell {
      grid-template-columns: 1fr !important;
      position: relative;
    }

    .server-rail,
    .channel-sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      z-index: 45;
      transform: translateX(-100%);
      transition: transform 0.28s ease;
    }

    .server-rail {
      width: 72px;
    }

    .channel-sidebar {
      left: 72px;
      width: 260px;
      transform: translateX(calc(-100% - 72px));
    }

    .mobile-sidebar-open .server-rail,
    .mobile-sidebar-open .channel-sidebar {
      transform: translateX(0);
    }

    .auth-shell {
      grid-template-columns: 1fr;
    }

    .messages-scroll {
      min-height: 50vh;
    }
  }

  @media (max-width: 980px) {
    .auth-shell {
      grid-template-columns: 1fr;
    }

    .chat-shell,
    .chat-shell:has(.calendar-sidebar),
    .chat-shell:has(.member-sidebar),
    .chat-shell:has(.calendar-sidebar):has(.member-sidebar) {
      grid-template-columns: 1fr;
      min-height: auto;
    }

    .server-rail {
      display: none;
    }

    .channel-sidebar {
      border-right: 0;
      border-bottom: 1px solid #232428;
    }

    .messages-scroll {
      min-height: 42vh;
    }

    .emoji-grid {
      grid-template-columns: repeat(5, 1fr);
    }
  }
</style>
