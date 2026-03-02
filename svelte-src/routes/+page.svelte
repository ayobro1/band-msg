<script lang="ts">
  import { onMount, afterUpdate, tick } from "svelte";

  type User = { username: string; role: "admin" | "member"; status: "approved" | "pending" };
  type Channel = { id: string; name: string; description: string };
  type Message = { id: string; author: string; content: string; createdAt: number };
  type PendingUser = { username: string; status: string };

  let me: User | null = null;
  let channels: Channel[] = [];
  let messages: Message[] = [];
  let pendingUsers: PendingUser[] = [];
  let selectedChannelId = "";
  let selectedChannelName = "";
  let selectedChannelDescription = "";

  let registerUsername = "";
  let registerPassword = "";
  let loginUsername = "";
  let loginPassword = "";
  let newMessage = "";
  let newChannel = "";
  let newChannelDescription = "";
  let notification = "";
  let notificationType: "error" | "success" = "error";

  let messagesEl: HTMLElement;
  let composerEl: HTMLInputElement;
  let sidebarOpen = false;

  $: isAuthenticated = !!me;
  $: isAdmin = me?.role === "admin";
  $: selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;

  function showNotification(msg: string, type: "error" | "success" = "error") {
    notification = msg;
    notificationType = type;
    setTimeout(() => {
      notification = "";
    }, 5000);
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
    return fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf
      },
      body: JSON.stringify(payload)
    });
  }

  async function refreshMe() {
    const res = await fetch("/api/auth/me");
    if (!res.ok) {
      me = null;
      return;
    }
    me = await res.json();
  }

  async function refreshChannels() {
    if (!me) return;
    const res = await fetch("/api/channels");
    if (!res.ok) return;
    channels = await res.json();
    if (!selectedChannelId && channels.length > 0) {
      await selectChannel(channels[0]);
    }
  }

  async function refreshMessages() {
    if (!selectedChannelId) return;
    const res = await fetch(`/api/messages?channelId=${encodeURIComponent(selectedChannelId)}`);
    if (!res.ok) return;
    messages = await res.json();
  }

  async function refreshPendingUsers() {
    if (!isAdmin) return;
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const all: PendingUser[] = await res.json();
    pendingUsers = all.filter((u) => u.status === "pending");
  }

  async function register() {
    notification = "";
    const res = await apiPost("/api/auth/register", {
      username: registerUsername,
      password: registerPassword
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Registration failed" }));
      showNotification(body.error, "error");
      return;
    }

    registerUsername = "";
    registerPassword = "";
    showNotification("Account created! The first user is auto-approved as admin.", "success");
  }

  async function login() {
    notification = "";
    const res = await apiPost("/api/auth/login", {
      username: loginUsername,
      password: loginPassword
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Login failed" }));
      showNotification(body.error, "error");
      return;
    }

    loginPassword = "";
    await refreshMe();
    await refreshChannels();
    await refreshPendingUsers();
  }

  async function logout() {
    await apiPost("/api/auth/logout", {});
    me = null;
    channels = [];
    messages = [];
    pendingUsers = [];
    selectedChannelId = "";
    selectedChannelName = "";
    selectedChannelDescription = "";
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedChannelId) return;
    const res = await apiPost("/api/messages", {
      channelId: selectedChannelId,
      content: newMessage
    });
    if (!res.ok) return;
    newMessage = "";
    await refreshMessages();
  }

  async function createChannel() {
    if (!newChannel.trim()) return;
    const res = await apiPost("/api/channels", {
      name: newChannel,
      description: newChannelDescription
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Create channel failed" }));
      showNotification(body.error, "error");
      return;
    }
    newChannel = "";
    newChannelDescription = "";
    await refreshChannels();
  }

  async function selectChannel(channel: Channel) {
    selectedChannelId = channel.id;
    selectedChannelName = channel.name;
    selectedChannelDescription = channel.description ?? "";
    sidebarOpen = false;
    await refreshMessages();
  }

  async function approveUser(username: string) {
    const res = await apiPost("/api/admin/users/approve", { username });
    if (!res.ok) return;
    await refreshPendingUsers();
    showNotification(`${username} approved.`, "success");
  }

  function avatarColor(name: string): string {
    const palette = [
      "#7c3aed", "#2563eb", "#0891b2", "#059669",
      "#d97706", "#dc2626", "#db2777", "#7c3aed"
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
    return palette[Math.abs(hash) % palette.length];
  }

  function initials(name: string): string {
    return name.slice(0, 2).toUpperCase();
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatDate(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  /** Group messages: consecutive messages from the same author are collapsed */
  function groupMessages(msgs: Message[]): Array<Message & { grouped: boolean; dateSeparator?: string }> {
    return msgs.map((msg, i) => {
      const prev = msgs[i - 1];
      const grouped =
        !!prev &&
        prev.author === msg.author &&
        msg.createdAt - prev.createdAt < 5 * 60 * 1000;
      const prevDate = prev ? formatDate(prev.createdAt) : null;
      const curDate = formatDate(msg.createdAt);
      const dateSeparator = prevDate !== curDate ? curDate : undefined;
      return { ...msg, grouped, dateSeparator };
    });
  }

  $: groupedMessages = groupMessages(messages);

  let prevMessageCount = 0;
  afterUpdate(async () => {
    if (messages.length !== prevMessageCount && messagesEl) {
      prevMessageCount = messages.length;
      await tick();
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  });

  onMount(async () => {
    await refreshMe();
    await refreshChannels();
    await refreshPendingUsers();
    setInterval(() => {
      refreshMessages();
    }, 3000);
    setInterval(() => {
      if (isAdmin) refreshPendingUsers();
    }, 15000);
  });
</script>

<!-- ─── App Shell ─────────────────────────────────────── -->
<div class="app-shell">
  <!-- Top Bar -->
  <header class="topbar glass">
    <div class="topbar-left">
      <button
        class="hamburger"
        aria-label="Toggle sidebar"
        on:click={() => (sidebarOpen = !sidebarOpen)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div class="brand">
        <div class="brand-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <p class="brand-label">Band Messaging</p>
          {#if isAuthenticated && selectedChannelName}
            <p class="brand-channel">#{selectedChannelName}</p>
          {:else}
            <p class="brand-channel">Real-time team chat</p>
          {/if}
        </div>
      </div>
    </div>

    {#if isAuthenticated}
      <div class="user-chip">
        <div class="avatar-sm" style="background:{avatarColor(me?.username ?? '')}">
          {initials(me?.username ?? "")}
        </div>
        <div class="chip-info">
          <p class="chip-user">{me?.username}</p>
          <p class="chip-role">{me?.role}</p>
        </div>
        <button class="btn btn-ghost btn-sm" on:click={logout}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
          </svg>
          <span class="sign-out-label">Sign out</span>
        </button>
      </div>
    {/if}
  </header>

  <!-- Notification Banner -->
  {#if notification}
    <div class="notification" class:notification-success={notificationType === "success"} role="alert">
      {#if notificationType === "error"}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      {/if}
      {notification}
    </div>
  {/if}

  <!-- Unauthenticated: Auth Forms -->
  {#if !isAuthenticated}
    <div class="auth-wrap">
      <div class="auth-hero">
        <div class="auth-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <h1>Band Messaging</h1>
        <p>Secure team chat for your crew. Real-time, channel-based, and simple.</p>
      </div>

      <div class="auth-grid">
        <article class="glass form-card">
          <div class="form-card-header">
            <div class="form-card-icon blue">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>
              </svg>
            </div>
            <div>
              <h2>Sign in</h2>
              <p class="muted">Jump back into your channels</p>
            </div>
          </div>
          <input class="input" bind:value={loginUsername} placeholder="Username" autocomplete="username" />
          <input class="input" bind:value={loginPassword} type="password" placeholder="Password" autocomplete="current-password"
            on:keydown={(e) => { if (e.key === "Enter") { e.preventDefault(); login(); } }} />
          <button class="btn btn-primary" on:click={login}>Sign in</button>
        </article>

        <article class="glass form-card">
          <div class="form-card-header">
            <div class="form-card-icon violet">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
            </div>
            <div>
              <h2>Create account</h2>
              <p class="muted">First account becomes admin</p>
            </div>
          </div>
          <input class="input" bind:value={registerUsername} placeholder="Username" autocomplete="username" />
          <input class="input" bind:value={registerPassword} type="password" placeholder="Password (12+ chars)" autocomplete="new-password"
            on:keydown={(e) => { if (e.key === "Enter") { e.preventDefault(); register(); } }} />
          <button class="btn btn-primary" on:click={register}>Create account</button>
        </article>
      </div>
    </div>

  <!-- Authenticated: Chat Layout -->
  {:else}
    <div class="chat-layout" class:sidebar-open={sidebarOpen}>

      <!-- Sidebar Overlay (mobile) -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      {#if sidebarOpen}
        <div class="sidebar-overlay" on:click={() => (sidebarOpen = false)}></div>
      {/if}

      <!-- Sidebar -->
      <aside class="sidebar glass">

        <!-- Admin: Pending Users -->
        {#if isAdmin && pendingUsers.length > 0}
          <section class="sidebar-section">
            <div class="section-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Pending approval
              <span class="badge">{pendingUsers.length}</span>
            </div>
            <div class="pending-list">
              {#each pendingUsers as user}
                <div class="pending-item">
                  <div class="avatar-xs" style="background:{avatarColor(user.username)}">{initials(user.username)}</div>
                  <span>{user.username}</span>
                  <button class="btn btn-xs btn-success" on:click={() => approveUser(user.username)}>Approve</button>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Admin: Create Channel -->
        {#if isAdmin}
          <section class="sidebar-section">
            <div class="section-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New channel
            </div>
            <div class="create-channel-form">
              <input class="input input-sm" bind:value={newChannel} placeholder="channel-name" />
              <input class="input input-sm" bind:value={newChannelDescription} placeholder="Description (optional)" />
              <button class="btn btn-sm btn-primary" on:click={createChannel}>Create</button>
            </div>
          </section>
        {/if}

        <!-- Channels List -->
        <section class="sidebar-section channels-section">
          <div class="section-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Channels
          </div>
          {#if channels.length === 0}
            <p class="empty-hint">No channels yet.{isAdmin ? " Create one above." : ""}</p>
          {:else}
            <div class="channel-list">
              {#each channels as channel}
                <button
                  class="channel-item"
                  class:active={channel.id === selectedChannelId}
                  on:click={() => selectChannel(channel)}
                >
                  <div class="channel-item-inner">
                    <span class="channel-hash">#</span>
                    <div class="channel-text">
                      <span class="channel-name">{channel.name}</span>
                      {#if channel.description}
                        <span class="channel-desc">{channel.description}</span>
                      {/if}
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      </aside>

      <!-- Main Panel -->
      <main class="messages-panel glass">

        <!-- Messages Header -->
        <header class="messages-header">
          <div class="messages-header-left">
            <span class="header-hash">#</span>
            <div>
              <h2>{selectedChannelName || "Select a channel"}</h2>
              {#if selectedChannel?.description}
                <p class="muted header-desc">{selectedChannel.description}</p>
              {/if}
            </div>
          </div>
          <div class="messages-header-right">
            <span class="msg-count">{messages.length} message{messages.length === 1 ? "" : "s"}</span>
          </div>
        </header>

        <!-- Messages List -->
        <div class="messages-list" bind:this={messagesEl}>
          {#if !selectedChannelId}
            <div class="empty-state">
              <div class="empty-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <p>Select a channel to start chatting</p>
            </div>
          {:else if messages.length === 0}
            <div class="empty-state">
              <div class="empty-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <p>No messages yet — say hello 👋</p>
            </div>
          {:else}
            {#each groupedMessages as msg}
              {#if msg.dateSeparator}
                <div class="date-separator">
                  <span>{msg.dateSeparator}</span>
                </div>
              {/if}
              <article class="message-item" class:message-grouped={msg.grouped}>
                {#if !msg.grouped}
                  <div class="avatar" style="background:{avatarColor(msg.author)}">{initials(msg.author)}</div>
                {:else}
                  <div class="avatar-placeholder">
                    <span class="grouped-time">{formatTime(msg.createdAt)}</span>
                  </div>
                {/if}
                <div class="message-body">
                  {#if !msg.grouped}
                    <div class="message-meta">
                      <strong class="message-author" style="color:{avatarColor(msg.author)}">{msg.author}</strong>
                      <span class="message-time">{formatTime(msg.createdAt)}</span>
                    </div>
                  {/if}
                  <p class="message-content">{msg.content}</p>
                </div>
              </article>
            {/each}
          {/if}
        </div>

        <!-- Composer -->
        <footer class="composer">
          <input
            class="input composer-input"
            bind:value={newMessage}
            bind:this={composerEl}
            placeholder={selectedChannelId ? `Message #${selectedChannelName}` : "Select a channel to chat"}
            disabled={!selectedChannelId}
            on:keydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          />
          <button
            class="btn btn-send"
            on:click={sendMessage}
            disabled={!selectedChannelId || !newMessage.trim()}
            aria-label="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </footer>
      </main>

    </div>
  {/if}
</div>

<style>
  /* ── Layout ──────────────────────────────────────── */
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100svh; /* accounts for mobile browser chrome */
    overflow: hidden;
  }

  .glass {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  /* ── Top Bar ──────────────────────────────────────── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    height: 58px;
    flex-shrink: 0;
    border-radius: 0;
    border-top: 0;
    border-left: 0;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0; /* hamburger and brand container never get clipped */
    min-width: 0;
  }

  .hamburger {
    display: none;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.4rem;
    border-radius: var(--radius-sm);
    line-height: 0;
  }

  .hamburger:hover {
    color: var(--text-primary);
    background: rgba(148, 163, 184, 0.1);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .brand-icon {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 0 16px rgba(59, 130, 246, 0.35);
  }

  .brand-label {
    margin: 0;
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--text-primary);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .brand-channel {
    margin: 0;
    font-size: 0.74rem;
    color: var(--text-muted);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-chip {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: rgba(15, 23, 42, 0.55);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.3rem 0.5rem 0.3rem 0.4rem;
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
  }

  .chip-info {
    display: none;
  }

  .chip-user {
    margin: 0;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .chip-role {
    margin: 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #60a5fa;
    line-height: 1.2;
  }

  /* ── Notification ──────────────────────────────────────── */
  .notification {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(127, 29, 29, 0.65);
    border: 1px solid rgba(252, 165, 165, 0.3);
    color: #fca5a5;
    padding: 0.65rem 1rem;
    font-size: 0.88rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .notification-success {
    background: rgba(5, 78, 45, 0.65);
    border-color: rgba(74, 222, 128, 0.3);
    color: #86efac;
  }

  /* ── Auth ──────────────────────────────────────── */
  .auth-wrap {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    gap: 2rem;
  }

  .auth-hero {
    text-align: center;
    max-width: 400px;
  }

  .auth-logo {
    width: 72px;
    height: 72px;
    border-radius: 20px;
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.2rem;
    box-shadow: 0 0 40px rgba(59, 130, 246, 0.4);
  }

  .auth-hero h1 {
    margin: 0 0 0.5rem;
    font-size: 2rem;
    font-weight: 800;
    background: linear-gradient(135deg, #f1f5f9, #93c5fd);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .auth-hero p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.95rem;
  }

  .auth-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 320px));
    gap: 1rem;
    width: 100%;
    max-width: 680px;
  }

  .form-card {
    padding: 1.4rem;
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    box-shadow: var(--shadow-lg);
  }

  .form-card-header {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .form-card-icon {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .form-card-icon.blue { background: linear-gradient(135deg, #1d4ed8, #3b82f6); }
  .form-card-icon.violet { background: linear-gradient(135deg, #6d28d9, #8b5cf6); }

  .form-card h2 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--text-primary);
    font-weight: 700;
  }

  /* ── Chat Layout ──────────────────────────────────────── */
  .chat-layout {
    flex: 1;
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    overflow: hidden;
    position: relative;
  }

  /* ── Sidebar ──────────────────────────────────────── */
  .sidebar {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    border-radius: 0;
    border-top: 0;
    border-left: 0;
    border-bottom: 0;
    border-right: 1px solid var(--border);
  }

  .sidebar-section {
    padding: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .channels-section {
    flex: 1;
    border-bottom: 0;
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 0.65rem;
  }

  .badge {
    margin-left: auto;
    background: #dc2626;
    color: white;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
  }

  .create-channel-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .pending-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .pending-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-primary);
  }

  .pending-item span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .channel-list {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .channel-item {
    width: 100%;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0;
    text-align: left;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }

  .channel-item-inner {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.55rem 0.7rem;
  }

  .channel-hash {
    font-size: 1.05rem;
    color: var(--text-muted);
    line-height: 1.3;
    flex-shrink: 0;
    font-weight: 600;
  }

  .channel-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    min-width: 0;
  }

  .channel-name {
    font-size: 0.88rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .channel-desc {
    font-size: 0.74rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .channel-item:hover {
    background: rgba(148, 163, 184, 0.07);
    color: var(--text-primary);
    border-color: var(--border);
  }

  .channel-item.active {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.4);
    color: #93c5fd;
  }

  .channel-item.active .channel-hash {
    color: #60a5fa;
  }

  .empty-hint {
    font-size: 0.82rem;
    color: var(--text-muted);
    margin: 0;
  }

  /* ── Messages Panel ──────────────────────────────────────── */
  .messages-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 0;
    border: 0;
    border-left: 0;
  }

  .messages-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1.2rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    gap: 1rem;
    min-height: 58px;
  }

  .messages-header-left {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }

  .header-hash {
    font-size: 1.4rem;
    color: var(--text-muted);
    font-weight: 600;
    line-height: 1;
    flex-shrink: 0;
  }

  .messages-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .header-desc {
    font-size: 0.78rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .messages-header-right {
    flex-shrink: 0;
  }

  .msg-count {
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .messages-list {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0;
    scroll-behavior: smooth;
  }

  /* Date separator */
  .date-separator {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin: 1rem 0 0.6rem;
  }

  .date-separator::before,
  .date-separator::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .date-separator span {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    white-space: nowrap;
  }

  /* Message row */
  .message-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.22rem 0.3rem;
    border-radius: var(--radius-sm);
    transition: background 0.1s;
  }

  .message-item:hover {
    background: rgba(148, 163, 184, 0.04);
  }

  .message-item.message-grouped {
    padding-top: 0.05rem;
  }

  .avatar,
  .avatar-sm,
  .avatar-xs {
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: white;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .avatar {
    width: 36px;
    height: 36px;
    font-size: 0.75rem;
  }

  .avatar-sm {
    width: 30px;
    height: 30px;
    font-size: 0.67rem;
  }

  .avatar-xs {
    width: 24px;
    height: 24px;
    font-size: 0.6rem;
  }

  .avatar-placeholder {
    width: 36px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 2px;
  }

  .grouped-time {
    font-size: 0.62rem;
    color: transparent;
    transition: color 0.15s;
    white-space: nowrap;
  }

  .message-item:hover .grouped-time {
    color: var(--text-muted);
  }

  .message-body {
    flex: 1;
    min-width: 0;
  }

  .message-meta {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.18rem;
  }

  .message-author {
    font-size: 0.9rem;
    font-weight: 700;
  }

  .message-time {
    font-size: 0.68rem;
    color: var(--text-muted);
  }

  .message-content {
    margin: 0;
    color: #d1d5db;
    font-size: 0.9rem;
    line-height: 1.55;
    word-break: break-word;
  }

  /* Empty state */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--text-muted);
    padding: 2rem;
  }

  .empty-icon {
    opacity: 0.3;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.92rem;
  }

  /* ── Composer ──────────────────────────────────────── */
  .composer {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.85rem 1.2rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .composer-input {
    flex: 1;
  }

  /* ── Inputs ──────────────────────────────────────── */
  .input {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-input);
    color: var(--text-primary);
    padding: 0.65rem 0.85rem;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .input::placeholder { color: var(--text-muted); }

  .input:focus {
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  .input:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .input-sm {
    padding: 0.45rem 0.7rem;
    font-size: 0.85rem;
    border-radius: var(--radius-sm);
  }

  /* ── Buttons ──────────────────────────────────────── */
  .btn {
    border: none;
    border-radius: var(--radius-md);
    font-weight: 600;
    cursor: pointer;
    padding: 0.62rem 1rem;
    transition: filter 0.15s, transform 0.1s;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }

  .btn:active { transform: scale(0.97); }

  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
    transform: none;
    filter: none;
  }

  .btn-primary {
    background: linear-gradient(135deg, #2563eb, #4f46e5);
    color: #eff6ff;
    box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
  }

  .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }

  .btn-ghost {
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 0.82rem;
  }

  .btn-ghost:hover:not(:disabled) {
    color: var(--text-primary);
    border-color: rgba(148, 163, 184, 0.35);
    background: rgba(51, 65, 85, 0.8);
  }

  .btn-sm {
    padding: 0.42rem 0.75rem;
    font-size: 0.82rem;
    border-radius: var(--radius-sm);
  }

  .btn-xs {
    padding: 0.25rem 0.55rem;
    font-size: 0.74rem;
    border-radius: 6px;
  }

  .btn-success {
    background: rgba(5, 78, 45, 0.7);
    border: 1px solid rgba(74, 222, 128, 0.3);
    color: #86efac;
  }

  .btn-success:hover:not(:disabled) {
    background: rgba(5, 100, 55, 0.8);
  }

  .btn-send {
    background: linear-gradient(135deg, #2563eb, #4f46e5);
    color: white;
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: var(--radius-md);
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
  }

  .btn-send:hover:not(:disabled) { filter: brightness(1.1); }

  /* ── Misc ──────────────────────────────────────── */
  .muted {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  /* Scrollbar styling */
  .messages-list::-webkit-scrollbar,
  .sidebar::-webkit-scrollbar,
  .channel-list::-webkit-scrollbar {
    width: 4px;
  }
  .messages-list::-webkit-scrollbar-track,
  .sidebar::-webkit-scrollbar-track,
  .channel-list::-webkit-scrollbar-track {
    background: transparent;
  }
  .messages-list::-webkit-scrollbar-thumb,
  .sidebar::-webkit-scrollbar-thumb,
  .channel-list::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.2);
    border-radius: 999px;
  }

  /* ── Sidebar overlay (mobile) ──────────────────────────────────────── */
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 9;
  }

  /* ── Responsive ──────────────────────────────────────── */
  @media (min-width: 700px) {
    .chip-info { display: block; }
  }

  @media (max-width: 699px) {
    .hamburger { display: flex; }

    /* Hide "Sign out" label on narrow screens — icon alone is clear enough */
    .sign-out-label { display: none; }

    .auth-grid {
      grid-template-columns: 1fr;
      max-width: 380px;
    }

    .chat-layout {
      grid-template-columns: 1fr;
    }

    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: 280px;
      z-index: 10;
      transform: translateX(-100%);
      transition: transform 0.24s ease;
    }

    .chat-layout.sidebar-open .sidebar {
      transform: translateX(0);
    }

    .chat-layout.sidebar-open .sidebar-overlay {
      display: block;
    }
  }
</style>
