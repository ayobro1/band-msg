<script lang="ts">
  import { onMount, afterUpdate, tick } from "svelte";

  type User = { username: string; role: "admin" | "member"; status: "approved" | "pending" };
  type Channel = { id: string; name: string; description: string };
  type Message = { id: string; author: string; content: string; createdAt: number };
  type PendingUser = { username: string; status: string };

  const GROUP_THRESHOLD_MS = 7 * 60 * 1000; // group consecutive messages within 7 minutes

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
  let showCreateChannel = false;

  let messagesEl: HTMLElement;
  let composerEl: HTMLInputElement;
  let sidebarOpen = false;

  $: isAuthenticated = !!me;
  $: isAdmin = me?.role === "admin";
  $: selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;

  function showNotification(msg: string, type: "error" | "success" = "error") {
    notification = msg;
    notificationType = type;
    setTimeout(() => { notification = ""; }, 5000);
  }

  function getCookie(name: string): string {
    if (typeof document === "undefined") return "";
    const prefix = `${encodeURIComponent(name)}=`;
    const found = document.cookie.split(";").map((p) => p.trim()).find((p) => p.startsWith(prefix));
    return found ? decodeURIComponent(found.slice(prefix.length)) : "";
  }

  async function apiPost(path: string, payload: Record<string, unknown>) {
    const csrf = getCookie("band_chat_csrf");
    return fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify(payload)
    });
  }

  async function refreshMe() {
    const res = await fetch("/api/auth/me");
    if (!res.ok) { me = null; return; }
    me = await res.json();
  }

  async function refreshChannels() {
    if (!me) return;
    const res = await fetch("/api/channels");
    if (!res.ok) return;
    channels = await res.json();
    if (!selectedChannelId && channels.length > 0) await selectChannel(channels[0]);
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
    const res = await apiPost("/api/auth/register", { username: registerUsername, password: registerPassword });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Registration failed" }));
      showNotification(body.error, "error");
      return;
    }
    registerUsername = ""; registerPassword = "";
    showNotification("Account created! The first user is auto-approved as admin.", "success");
  }

  async function login() {
    const res = await apiPost("/api/auth/login", { username: loginUsername, password: loginPassword });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Login failed" }));
      showNotification(body.error, "error");
      return;
    }
    loginPassword = "";
    await refreshMe(); await refreshChannels(); await refreshPendingUsers();
  }

  async function logout() {
    await apiPost("/api/auth/logout", {});
    me = null; channels = []; messages = []; pendingUsers = [];
    selectedChannelId = ""; selectedChannelName = ""; selectedChannelDescription = "";
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedChannelId) return;
    const res = await apiPost("/api/messages", { channelId: selectedChannelId, content: newMessage });
    if (!res.ok) return;
    newMessage = "";
    await refreshMessages();
  }

  async function createChannel() {
    if (!newChannel.trim()) return;
    const res = await apiPost("/api/channels", { name: newChannel, description: newChannelDescription });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Create channel failed" }));
      showNotification(body.error, "error");
      return;
    }
    newChannel = ""; newChannelDescription = ""; showCreateChannel = false;
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
    const palette = ["#5865f2","#eb459e","#ed4245","#fee75c","#57f287","#1abc9c","#e67e22","#9b59b6"];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
    return palette[Math.abs(h) % palette.length];
  }

  function initials(name: string): string {
    return name.slice(0, 2).toUpperCase();
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatFullDate(ts: number): string {
    return new Date(ts).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
  }

  function formatDate(ts: number): string {
    const d = new Date(ts), today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const y = new Date(today); y.setDate(today.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
  }

  function groupMessages(msgs: Message[]): Array<Message & { grouped: boolean; dateSeparator?: string }> {
    return msgs.map((msg, i) => {
      const prev = msgs[i - 1];
      const grouped = !!prev && prev.author === msg.author && msg.createdAt - prev.createdAt < GROUP_THRESHOLD_MS;
      const dateSeparator = prev && formatDate(prev.createdAt) !== formatDate(msg.createdAt) ? formatDate(msg.createdAt) : (!prev ? formatDate(msg.createdAt) : undefined);
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
    await refreshMe(); await refreshChannels(); await refreshPendingUsers();
    setInterval(refreshMessages, 3000);
    setInterval(() => { if (isAdmin) refreshPendingUsers(); }, 15000);
  });
</script>

<!-- ───────────────────── AUTH SCREEN ───────────────────── -->
{#if !isAuthenticated}
  <div class="auth-screen">
    <div class="auth-card">
      <div class="auth-logo">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>

      {#if notification}
        <div class="auth-alert" class:auth-alert-success={notificationType === "success"}>
          {notification}
        </div>
      {/if}

      <div class="auth-tabs-body">
        <!-- Sign In -->
        <div class="auth-section">
          <h2>Welcome back!</h2>
          <p class="auth-sub">We're so excited to see you again!</p>
          <label class="field-label" for="login-username">USERNAME</label>
          <input id="login-username" class="dc-input" bind:value={loginUsername} placeholder="Enter your username" autocomplete="username" />
          <label class="field-label" for="login-password">PASSWORD</label>
          <input id="login-password" class="dc-input" bind:value={loginPassword} type="password" placeholder="Enter your password" autocomplete="current-password"
            on:keydown={(e) => { if (e.key === "Enter") { e.preventDefault(); login(); } }} />
          <button class="dc-btn dc-btn-primary" on:click={login}>Log In</button>
          <p class="auth-fine">
            Need an account? <button class="auth-link" on:click={() => document.getElementById('register-section')?.scrollIntoView({behavior:'smooth'})}>Register</button>
          </p>
        </div>

        <div class="auth-divider"><span>or</span></div>

        <!-- Register -->
        <div class="auth-section" id="register-section">
          <h2>Create an account</h2>
          <p class="auth-sub">The first account automatically becomes admin.</p>
          <label class="field-label" for="reg-username">USERNAME</label>
          <input id="reg-username" class="dc-input" bind:value={registerUsername} placeholder="Choose a username" autocomplete="username" />
          <label class="field-label" for="reg-password">PASSWORD</label>
          <input id="reg-password" class="dc-input" bind:value={registerPassword} type="password" placeholder="At least 12 characters" autocomplete="new-password"
            on:keydown={(e) => { if (e.key === "Enter") { e.preventDefault(); register(); } }} />
          <button class="dc-btn dc-btn-secondary" on:click={register}>Register</button>
        </div>
      </div>
    </div>
  </div>

<!-- ───────────────────── APP ───────────────────── -->
{:else}
  <div class="app" class:sidebar-open={sidebarOpen}>

    <!-- ── SIDEBAR ── -->
    <nav class="sidebar">
      <!-- Server Header -->
      <div class="server-header">
        <span class="server-name">Band Messaging</span>
        <div class="server-header-icons">
          {#if isAdmin}
            <button class="icon-btn" title="New channel" on:click={() => (showCreateChannel = !showCreateChannel)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          {/if}
        </div>
      </div>

      <!-- Create Channel Form (admin) -->
      {#if showCreateChannel && isAdmin}
        <div class="create-channel-popover">
          <p class="create-channel-title">Create Text Channel</p>
          <label class="field-label-sm" for="ch-name">CHANNEL NAME</label>
          <div class="channel-input-wrap">
            <span class="channel-input-hash">#</span>
            <input id="ch-name" class="dc-input dc-input-sm channel-name-input" bind:value={newChannel} placeholder="new-channel"
              on:keydown={(e) => { if (e.key === "Enter") { e.preventDefault(); createChannel(); } }} />
          </div>
          <label class="field-label-sm" for="ch-desc">DESCRIPTION <span class="optional">(optional)</span></label>
          <input id="ch-desc" class="dc-input dc-input-sm" bind:value={newChannelDescription} placeholder="What's this channel about?" />
          <div class="create-channel-actions">
            <button class="dc-btn dc-btn-ghost dc-btn-sm" on:click={() => (showCreateChannel = false)}>Cancel</button>
            <button class="dc-btn dc-btn-primary dc-btn-sm" on:click={createChannel}>Create Channel</button>
          </div>
        </div>
      {/if}

      <!-- Channels -->
      <div class="channels-scroll">
        <!-- Pending Users (admin) -->
        {#if isAdmin && pendingUsers.length > 0}
          <div class="channel-category">
            <span>Pending Approval</span>
            <span class="category-badge">{pendingUsers.length}</span>
          </div>
          {#each pendingUsers as user}
            <div class="pending-row">
              <div class="avatar avatar-xs" style="background:{avatarColor(user.username)}">{initials(user.username)}</div>
              <span class="pending-name">{user.username}</span>
              <button class="dc-btn dc-btn-green dc-btn-xs" on:click={() => approveUser(user.username)}>✓</button>
            </div>
          {/each}
        {/if}

        <!-- Text Channels -->
        <div class="channel-category">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" class="category-arrow"><path d="M8 5l8 7-8 7"/></svg>
          <span>Text Channels</span>
        </div>
        {#if channels.length === 0}
          <p class="no-channels">No channels yet.{isAdmin ? " Create one above." : ""}</p>
        {:else}
          {#each channels as ch}
            <button
              class="channel-row"
              class:channel-row-active={ch.id === selectedChannelId}
              on:click={() => selectChannel(ch)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="channel-icon">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span class="channel-row-name">{ch.name}</span>
            </button>
          {/each}
        {/if}
      </div>

      <!-- User Area -->
      <div class="user-area">
        <div class="user-area-avatar">
          <div class="avatar avatar-sm" style="background:{avatarColor(me?.username ?? '')}">{initials(me?.username ?? '')}</div>
          <div class="status-dot"></div>
        </div>
        <div class="user-area-info">
          <p class="user-area-name">{me?.username}</p>
          <p class="user-area-tag">{me?.role === "admin" ? "Admin" : "Member"}</p>
        </div>
        <button class="icon-btn icon-btn-danger" title="Log out" on:click={logout}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>
    </nav>

    <!-- ── MAIN ── -->
    <div class="main">

      <!-- Channel Header -->
      <header class="channel-header">
        <button class="hamburger" aria-label="Toggle sidebar" on:click={() => (sidebarOpen = !sidebarOpen)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        {#if selectedChannelName}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2.2" stroke-linecap="round" class="header-hash-icon">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="header-channel-name">{selectedChannelName}</span>
          {#if selectedChannelDescription}
            <div class="header-divider"></div>
            <span class="header-channel-desc">{selectedChannelDescription}</span>
          {/if}
        {:else}
          <span class="header-channel-name muted-name">Select a channel</span>
        {/if}
      </header>

      <!-- Toast -->
      {#if notification}
        <div class="toast" class:toast-success={notificationType === "success"} role="alert">
          {#if notificationType === "error"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          {/if}
          {notification}
        </div>
      {/if}

      <!-- Messages -->
      <div class="messages-area" bind:this={messagesEl}>
        {#if !selectedChannelId}
          <div class="empty-state">
            <div class="empty-icon">
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h3>Select a channel to start chatting</h3>
            <p>Pick a channel from the sidebar on the left.</p>
          </div>
        {:else}
          <!-- Channel welcome message at top -->
          <div class="channel-welcome">
            <div class="welcome-icon" style="background:{avatarColor(selectedChannelName)}">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h2>Welcome to #{selectedChannelName}!</h2>
            {#if selectedChannelDescription}
              <p>{selectedChannelDescription}</p>
            {:else}
              <p>This is the beginning of the <strong>#{selectedChannelName}</strong> channel.</p>
            {/if}
          </div>

          {#if messages.length === 0}
            <div class="no-messages">
              <p>Be the first to send a message in <strong>#{selectedChannelName}</strong> 👋</p>
            </div>
          {:else}
            {#each groupedMessages as msg}
              <!-- Date separator -->
              {#if msg.dateSeparator}
                <div class="date-sep">
                  <div class="date-sep-line"></div>
                  <span class="date-sep-label">{msg.dateSeparator}</span>
                  <div class="date-sep-line"></div>
                </div>
              {/if}

              <!-- Message row -->
              <div class="msg-row" class:msg-row-grouped={msg.grouped}>
                {#if !msg.grouped}
                  <div class="msg-avatar avatar" style="background:{avatarColor(msg.author)}">{initials(msg.author)}</div>
                {:else}
                  <div class="msg-avatar-gap">
                    <span class="msg-hover-time">{formatTime(msg.createdAt)}</span>
                  </div>
                {/if}
                <div class="msg-content">
                  {#if !msg.grouped}
                    <div class="msg-header">
                      <span class="msg-author" style="color:{avatarColor(msg.author)}">{msg.author}</span>
                      <span class="msg-timestamp" title={formatFullDate(msg.createdAt)}>
                        {formatDate(msg.createdAt) !== "Today" ? formatDate(msg.createdAt) + " at " : ""}{formatTime(msg.createdAt)}
                      </span>
                    </div>
                  {/if}
                  <p class="msg-text">{msg.content}</p>
                </div>
              </div>
            {/each}
          {/if}
        {/if}
      </div>

      <!-- Composer -->
      {#if selectedChannelId}
        <div class="composer-wrap">
          <div class="composer">
            <button class="composer-icon-btn" title="Attach file" disabled>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </button>
            <input
              class="composer-input"
              bind:value={newMessage}
              bind:this={composerEl}
              placeholder="Message #{selectedChannelName}"
              on:keydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />
            <button
              class="composer-send"
              class:composer-send-active={!!newMessage.trim()}
              on:click={sendMessage}
              disabled={!newMessage.trim()}
              title="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- Mobile overlay -->
    {#if sidebarOpen}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="sidebar-overlay" on:click={() => (sidebarOpen = false)}></div>
    {/if}
  </div>
{/if}

<style>
  /* ── AUTH ────────────────────────────────────────────── */
  .auth-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #313338;
    padding: 1rem;
  }

  .auth-card {
    background: #2b2d31;
    border-radius: 4px;
    padding: 2rem 2rem 1.5rem;
    width: min(480px, 100%);
    box-shadow: 0 2px 10px 0 rgba(0,0,0,.2), 0 0 0 1px rgba(255,255,255,.04);
  }

  .auth-logo {
    width: 72px; height: 72px;
    border-radius: 50%;
    background: var(--accent);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 1.25rem;
    box-shadow: 0 8px 24px rgba(88,101,242,.4);
  }

  .auth-alert {
    background: rgba(242,63,67,.15);
    border: 1px solid rgba(242,63,67,.4);
    color: #f23f43;
    border-radius: 4px;
    padding: 0.7rem 1rem;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }
  .auth-alert-success {
    background: rgba(35,165,90,.15);
    border-color: rgba(35,165,90,.4);
    color: #23a55a;
  }

  .auth-tabs-body {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .auth-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .auth-section h2 {
    margin: 0 0 0.15rem;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-1);
    text-align: center;
  }

  .auth-sub {
    margin: 0 0 1rem;
    color: var(--text-3);
    font-size: 0.9rem;
    text-align: center;
  }

  .auth-fine {
    margin: 0.5rem 0 0;
    font-size: 0.82rem;
    color: var(--text-3);
    text-align: center;
  }

  .auth-link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    padding: 0;
    font-size: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .auth-link:hover { color: #7289da; }

  .auth-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1.25rem 0;
    color: var(--text-muted);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .auth-divider::before,
  .auth-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: rgba(255,255,255,0.08);
  }

  /* ── APP LAYOUT ────────────────────────────────────────────── */
  .app {
    display: flex;
    height: 100vh;
    height: 100svh;
    overflow: hidden;
  }

  /* ── SIDEBAR ────────────────────────────────────────────── */
  .sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--sidebar-bg);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .server-header {
    height: 48px;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(0,0,0,.2);
    box-shadow: 0 1px 0 rgba(4,4,5,.2), 0 1.5px 0 rgba(6,6,7,.05), 0 2px 0 rgba(4,4,5,.05);
    flex-shrink: 0;
  }

  .server-name {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .create-channel-popover {
    background: var(--sidebar-channel-bg);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border-bottom: 1px solid rgba(0,0,0,.2);
  }

  .create-channel-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-1);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .channel-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .channel-input-hash {
    position: absolute;
    left: 0.6rem;
    color: var(--text-3);
    font-weight: 600;
    pointer-events: none;
  }

  .channel-name-input { padding-left: 1.5rem; }

  .create-channel-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.25rem;
  }

  .channels-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0 0.5rem;
  }

  .channel-category {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 1rem 0.5rem 0.25rem 1rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--text-3);
    cursor: default;
    user-select: none;
  }

  .category-arrow {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .category-badge {
    margin-left: auto;
    background: var(--red);
    color: white;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
  }

  .channel-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.35rem 0.5rem 0.35rem 1rem;
    margin: 0 0.5rem;
    width: calc(100% - 1rem);
    border-radius: 4px;
    border: none;
    background: none;
    color: var(--text-3);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s, color 0.1s;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .channel-icon {
    flex-shrink: 0;
    opacity: 0.7;
  }

  .channel-row-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .channel-row:hover {
    background: rgba(255,255,255,.06);
    color: var(--text-2);
  }
  .channel-row:hover .channel-icon { opacity: 1; }

  .channel-row-active {
    background: rgba(255,255,255,.1) !important;
    color: var(--text-1) !important;
  }
  .channel-row-active .channel-icon { opacity: 1; }

  .no-channels {
    padding: 0.25rem 1rem;
    font-size: 0.82rem;
    color: var(--text-muted);
    margin: 0;
  }

  .pending-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.5rem 0.3rem 1rem;
    font-size: 0.85rem;
    color: var(--text-2);
  }

  .pending-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── USER AREA ────────────────────────────────────────────── */
  .user-area {
    height: 52px;
    background: #232428;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.5rem;
    flex-shrink: 0;
  }

  .user-area-avatar {
    position: relative;
    flex-shrink: 0;
  }

  .status-dot {
    position: absolute;
    bottom: -1px; right: -1px;
    width: 10px; height: 10px;
    border-radius: 50%;
    background: var(--green);
    border: 2px solid #232428;
  }

  .user-area-info {
    flex: 1;
    min-width: 0;
  }

  .user-area-name {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

  .user-area-tag {
    margin: 0;
    font-size: 0.72rem;
    color: var(--text-3);
    line-height: 1.2;
  }

  /* ── MAIN ────────────────────────────────────────────── */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--main-bg);
    min-width: 0;
  }

  /* ── CHANNEL HEADER ────────────────────────────────────────────── */
  .channel-header {
    height: 48px;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    border-bottom: 1px solid rgba(0,0,0,.2);
    box-shadow: 0 1px 0 rgba(4,4,5,.2), 0 1.5px 0 rgba(6,6,7,.05), 0 2px 0 rgba(4,4,5,.05);
    flex-shrink: 0;
    background: var(--main-bg);
    overflow: hidden;
  }

  .hamburger {
    display: none;
    background: none;
    border: none;
    color: var(--text-3);
    cursor: pointer;
    padding: 0.3rem;
    border-radius: var(--radius);
    line-height: 0;
    flex-shrink: 0;
  }
  .hamburger:hover { color: var(--text-1); background: rgba(255,255,255,.06); }

  .header-hash-icon { flex-shrink: 0; }

  .header-channel-name {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .muted-name { color: var(--text-3); font-weight: 500; }

  .header-divider {
    width: 1px;
    height: 20px;
    background: rgba(255,255,255,.12);
    flex-shrink: 0;
  }

  .header-channel-desc {
    font-size: 0.875rem;
    color: var(--text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── TOAST ────────────────────────────────────────────── */
  .toast {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(242,63,67,.15);
    border-top: 2px solid #f23f43;
    color: #f23f43;
    padding: 0.55rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    flex-shrink: 0;
  }
  .toast-success {
    background: rgba(35,165,90,.15);
    border-top-color: #23a55a;
    color: #23a55a;
  }

  /* ── MESSAGES ────────────────────────────────────────────── */
  .messages-area {
    flex: 1;
    overflow-y: auto;
    padding: 0 0 1rem;
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--text-3);
    padding: 2rem;
    text-align: center;
  }

  .empty-icon { opacity: 0.25; }

  .empty-state h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text-2);
  }
  .empty-state p { margin: 0; font-size: 0.9rem; }

  .channel-welcome {
    padding: 4rem 1rem 1.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 1rem;
  }

  .welcome-icon {
    width: 68px; height: 68px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 1rem;
  }

  .channel-welcome h2 {
    margin: 0 0 0.3rem;
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--text-1);
    line-height: 1.2;
  }

  .channel-welcome p {
    margin: 0;
    color: var(--text-3);
    font-size: 0.9rem;
  }

  .no-messages {
    padding: 0 1rem;
    color: var(--text-3);
    font-size: 0.875rem;
  }
  .no-messages p { margin: 0; }

  /* Date separator */
  .date-sep {
    display: flex;
    align-items: center;
    margin: 1.5rem 1rem 0.75rem;
    gap: 0.5rem;
  }
  .date-sep-line { flex: 1; height: 1px; background: rgba(255,255,255,.08); }
  .date-sep-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-3);
    white-space: nowrap;
  }

  /* Message rows */
  .msg-row {
    display: flex;
    gap: 1rem;
    padding: 0.125rem 1rem 0.125rem 1rem;
    transition: background 0.05s;
    position: relative;
  }
  .msg-row:hover { background: var(--msg-hover); }

  .msg-row-grouped { padding-top: 0.05rem; }

  .msg-avatar {
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .msg-avatar-gap {
    width: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding-top: 0.3rem;
  }

  .msg-hover-time {
    font-size: 0.65rem;
    color: transparent;
    transition: color 0.1s;
    user-select: none;
    white-space: nowrap;
    line-height: 1;
  }
  .msg-row:hover .msg-hover-time { color: var(--text-muted); }

  .msg-content { flex: 1; min-width: 0; }

  .msg-header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.15rem;
  }

  .msg-author {
    font-size: 0.9375rem;
    font-weight: 500;
    line-height: 1.375;
    cursor: pointer;
  }
  .msg-author:hover { text-decoration: underline; }

  .msg-timestamp {
    font-size: 0.72rem;
    color: var(--text-muted);
    line-height: 1.375;
  }

  .msg-text {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--text-2);
    line-height: 1.375;
    word-break: break-word;
  }

  /* ── COMPOSER ────────────────────────────────────────────── */
  .composer-wrap {
    padding: 0 1rem 1.5rem;
    flex-shrink: 0;
  }

  .composer {
    background: var(--input-bg);
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0 0.75rem;
  }

  .composer-icon-btn {
    background: none;
    border: none;
    color: var(--text-3);
    cursor: pointer;
    padding: 0.7rem 0.35rem;
    border-radius: 4px;
    line-height: 0;
    flex-shrink: 0;
    transition: color 0.1s;
  }
  .composer-icon-btn:hover:not(:disabled) { color: var(--text-2); }
  .composer-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .composer-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--text-1);
    font-size: 0.9375rem;
    padding: 0.7rem 0.5rem;
    line-height: 1.375;
    min-width: 0;
  }
  .composer-input::placeholder { color: var(--text-muted); }

  .composer-send {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.7rem 0.35rem;
    border-radius: 4px;
    line-height: 0;
    flex-shrink: 0;
    color: var(--text-muted);
    transition: color 0.1s;
  }
  .composer-send:disabled { cursor: not-allowed; }
  .composer-send-active { color: var(--accent) !important; }
  .composer-send-active:hover { color: var(--accent-hover) !important; }

  /* ── AVATARS ────────────────────────────────────────────── */
  .avatar {
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: white;
    flex-shrink: 0;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.02em;
  }
  .avatar-sm { width: 32px; height: 32px; }
  .avatar-xs { width: 24px; height: 24px; font-size: 0.62rem; }
  .msg-avatar.avatar { width: 40px; height: 40px; font-size: 0.8rem; }

  /* ── SHARED COMPONENTS ────────────────────────────────────────────── */
  .field-label {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--text-3);
    margin: 0.5rem 0 0.3rem;
  }

  .field-label-sm {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--text-3);
    margin-bottom: 0.25rem;
    display: block;
  }

  .optional {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text-muted);
    font-size: 0.68rem;
  }

  .dc-input {
    width: 100%;
    background: #1e1f22;
    border: none;
    outline: none;
    border-radius: 3px;
    color: var(--text-1);
    padding: 0.6rem 0.75rem;
    font-size: 0.9375rem;
    transition: box-shadow 0.15s;
  }
  .dc-input::placeholder { color: var(--text-muted); }
  .dc-input:focus { box-shadow: 0 0 0 2px var(--accent); }

  .dc-input-sm {
    padding: 0.42rem 0.6rem;
    font-size: 0.85rem;
  }

  .dc-btn {
    border: none;
    border-radius: 3px;
    font-weight: 500;
    cursor: pointer;
    padding: 0.7rem 1rem;
    font-size: 0.9375rem;
    transition: background 0.1s, transform 0.1s;
    width: 100%;
    text-align: center;
    line-height: 1;
  }
  .dc-btn:active { transform: scale(0.98); }
  .dc-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .dc-btn-primary { background: var(--accent); color: white; }
  .dc-btn-primary:hover:not(:disabled) { background: var(--accent-hover); }

  .dc-btn-secondary { background: #4e5058; color: white; }
  .dc-btn-secondary:hover:not(:disabled) { background: #5c6069; }

  .dc-btn-ghost {
    background: transparent;
    color: var(--text-2);
    border: 1px solid rgba(255,255,255,.1);
    width: auto;
  }
  .dc-btn-ghost:hover:not(:disabled) { text-decoration: underline; }

  .dc-btn-green { background: var(--green); color: white; width: auto; }
  .dc-btn-green:hover:not(:disabled) { filter: brightness(1.1); }

  .dc-btn-sm { padding: 0.42rem 0.75rem; font-size: 0.85rem; }
  .dc-btn-xs { padding: 0.2rem 0.5rem; font-size: 0.75rem; }

  .icon-btn {
    background: none;
    border: none;
    color: var(--text-3);
    cursor: pointer;
    padding: 0.3rem;
    border-radius: 4px;
    line-height: 0;
    flex-shrink: 0;
    transition: color 0.1s;
  }
  .icon-btn:hover { color: var(--text-1); }
  .icon-btn-danger:hover { color: var(--red); }

  /* ── MOBILE SIDEBAR ────────────────────────────────────────────── */
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.7);
    z-index: 9;
  }

  @media (max-width: 660px) {
    .hamburger { display: flex; }

    .sidebar {
      position: fixed;
      left: 0; top: 0; bottom: 0;
      z-index: 10;
      transform: translateX(-100%);
      transition: transform 0.22s cubic-bezier(.4,0,.2,1);
    }

    .app.sidebar-open .sidebar { transform: translateX(0); }
    .app.sidebar-open .sidebar-overlay { display: block; }

    .channel-header { gap: 0.5rem; }
    .composer-wrap { padding: 0 0.75rem 1rem; }
    .messages-area { padding: 0 0 0.5rem; }
    .channel-welcome { padding: 2rem 0.75rem 1rem; }
    .date-sep { margin: 1rem 0.75rem 0.5rem; }
    .msg-row { padding: 0.125rem 0.75rem; }
  }
</style>
