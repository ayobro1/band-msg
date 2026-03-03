<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { parseMarkdown, QUICK_EMOJIS } from "$lib/markdown";

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
  let messageContainer: HTMLElement | null = null;
  let isLoadingMessages = false;
  let connectionStatus: "connected" | "reconnecting" = "connected";
  let failedPollCount = 0;

  // New event form
  let newEventTitle = "";
  let newEventDescription = "";
  let newEventLocation = "";
  let newEventStartsAt = "";
  let newEventEndsAt = "";

  $: isAuthenticated = !!me;
  $: myPresence = members.find(m => m.username === me?.username)?.presenceStatus || 'online';

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
      
      // Sticky scroll: only auto-scroll if user is near the bottom
      const shouldScroll = isUserNearBottom();
      messages = msgs;
      if (shouldScroll || isInitialLoad) {
        scrollToBottom();
      }
      
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
    <section class="chat-shell">
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
        <button class="server-pill add-server" on:click={() => showServerCreate = true} title="Create Server">+</button>
        <button class="server-pill add-server" on:click={() => showInviteModal = true} title="Join Server">🔗</button>
      </aside>

      <!-- Channel Sidebar -->
      <aside class="channel-sidebar">
        <header class="sidebar-header">
          <h2>{servers.find(s => s.id === selectedServerId)?.name || "Band Chat"}</h2>
          {#if selectedServerId}
            <button class="icon-btn" on:click={() => createInvite(selectedServerId)} title="Create Invite">
              ➕
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
                <span>#{channel.name}</span>
              </button>
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
            <button class="icon-btn" on:click={() => { showCalendar = !showCalendar; if (showCalendar) showMemberList = false; }} title="Calendar">📅</button>
            <button class="icon-btn" on:click={logout} title="Logout">🚪</button>
          </div>
        </footer>
      </aside>

      <!-- Main Chat Area -->
      <section class="chat-main">
        <header class="chat-header">
          <h3>{selectedChannelName ? `#${selectedChannelName}` : "Select a channel"}</h3>
          <div class="chat-header-actions">
            <button class="icon-btn" class:active={showMemberList} on:click={() => { showMemberList = !showMemberList; if (showMemberList) showCalendar = false; }} title="Member List">👥</button>
          </div>
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
              <article class="message-row">
                <div class="avatar">{msg.author.slice(0, 1).toUpperCase()}</div>
                <div class="message-content">
                  <div class="message-head">
                    <strong>{msg.author}</strong>
                    <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p class="message-text">{@html parseMarkdown(msg.content)}</p>
                  
                  <!-- Reactions -->
                  {#if msg.reactions && msg.reactions.length > 0}
                    <div class="reactions">
                      {#each msg.reactions as reaction}
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
                          <span class="emoji">{reaction.emoji}</span>
                          <span class="count">{reaction.count}</span>
                        </button>
                      {/each}
                      <button class="reaction-add" on:click={() => openEmojiPicker(msg.id)}>➕</button>
                    </div>
                  {:else}
                    <button class="reaction-add-first" on:click={() => openEmojiPicker(msg.id)}>Add Reaction</button>
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
          <input
            class="field"
            bind:value={newMessage}
            on:input={handleTyping}
            placeholder={selectedChannelId ? `Message #${selectedChannelName || "channel"}` : "Select a channel to chat"}
            disabled={!selectedChannelId}
            on:keydown={(event) => event.key === "Enter" && sendMessage()}
          />
          <button class="primary-btn" on:click={sendMessage} disabled={!selectedChannelId || !newMessage.trim()}>Send</button>
        </footer>
      </section>

      <!-- Calendar Sidebar -->
      {#if showCalendar}
        <aside class="calendar-sidebar">
          <header class="sidebar-header">
            <h2>Calendar</h2>
            <button class="icon-btn" on:click={() => showCalendar = false}>✕</button>
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
                  <p class="event-time">📅 {formatEventTime(event.startsAt)}</p>
                  {#if event.location}
                    <p class="event-location">📍 {event.location}</p>
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
            <button class="icon-btn" on:click={() => showMemberList = false}>✕</button>
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
    <div class="modal-backdrop" role="button" tabindex="0" on:click={() => showEmojiPicker = false} on:keydown={(e) => e.key === 'Escape' && (showEmojiPicker = false)}>
      <div class="modal emoji-picker" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
        <h3>Pick an emoji</h3>
        <div class="emoji-grid">
          {#each QUICK_EMOJIS as emoji}
            <button class="emoji-btn" on:click={() => addReaction(selectedMessageForReaction, emoji)}>
              {emoji}
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  {#if showServerCreate}
    <div class="modal-backdrop" role="button" tabindex="0" on:click={() => showServerCreate = false} on:keydown={(e) => e.key === 'Escape' && (showServerCreate = false)}>
      <div class="modal" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
        <h3>Create Server</h3>
        <input class="field" bind:value={newServerName} placeholder="Server name" />
        <input class="field" bind:value={newServerDescription} placeholder="Description (optional)" />
        <div class="modal-actions">
          <button class="ghost-btn" on:click={() => showServerCreate = false}>Cancel</button>
          <button class="primary-btn" on:click={createServer}>Create</button>
        </div>
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
    grid-template-rows: auto 1fr;
    gap: 0.45rem;
  }

  .channel-list {
    overflow: auto;
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
    grid-template-rows: auto 1fr auto;
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

  .chat-header-actions {
    display: flex;
    gap: 0.25rem;
  }

  .chat-header-actions .icon-btn.active {
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
    overflow: auto;
    padding: 1rem;
    display: grid;
    gap: 0.8rem;
    align-content: start;
    scroll-behavior: smooth;
  }

  .message-row {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 0.75rem;
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

  .message-head span {
    color: #949ba4;
    font-size: 0.72rem;
  }

  .message-content :global(p.message-text) {
    margin: 0.15rem 0 0;
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
    gap: 0.3rem;
    margin-top: 0.4rem;
  }

  .reaction-badge {
    background: #2b2d31;
    border: 1px solid #1e1f22;
    border-radius: 8px;
    padding: 0.2rem 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .reaction-badge:hover {
    background: #404249;
    border-color: #949ba4;
  }

  .reaction-badge.own-reaction {
    background: rgba(88, 101, 242, 0.15);
    border-color: #5865f2;
  }

  .reaction-badge .emoji {
    font-size: 1rem;
  }

  .reaction-badge .count {
    font-size: 0.75rem;
    color: #b5bac1;
  }

  .reaction-add,
  .reaction-add-first {
    background: transparent;
    border: 1px solid #1e1f22;
    border-radius: 8px;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-size: 0.75rem;
    color: #949ba4;
    transition: all 0.15s;
  }

  .reaction-add-first {
    margin-top: 0.4rem;
  }

  .reaction-add:hover,
  .reaction-add-first:hover {
    background: #404249;
    color: #dbdee1;
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
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.6rem;
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

  /* Emoji Picker */
  .emoji-picker {
    min-width: min(360px, 90vw);
  }

  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 0.4rem;
  }

  .emoji-btn {
    background: transparent;
    border: 1px solid #232428;
    border-radius: 8px;
    padding: 0.6rem;
    font-size: 1.5rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .emoji-btn:hover {
    background: #404249;
    transform: scale(1.1);
  }

  /* Utility */
  .empty-state {
    color: #949ba4;
    margin: 0;
    font-size: 0.88rem;
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
      grid-template-columns: repeat(6, 1fr);
    }
  }
</style>
