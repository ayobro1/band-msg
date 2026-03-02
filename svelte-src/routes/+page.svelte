<script lang="ts">
  import { onMount, onDestroy, afterUpdate, tick } from "svelte";

  type User = { username: string; role: "admin" | "member"; status: "approved" | "pending" };
  type Channel = { id: string; name: string; description: string };
  type Reaction = { emoji: string; count: number; byMe: boolean };
  type Message = {
    id: string;
    author: string;
    content: string;
    createdAt: number;
    deleted?: boolean;
    isMe?: boolean;
    replyToId?: string | null;
    replyToContent?: string | null;
    replyToAuthor?: string | null;
    reactions?: Reaction[];
  };
  type PendingUser = { username: string; status: string };

  const GROUP_THRESHOLD_MS = 7 * 60 * 1000;
  const COMMON_EMOJIS = ["👍","❤️","😂","😮","😢","😡","🔥","👏","🎉","🤔","😍","💯","✅","👀","🙌","😅","💀","🤣","🥳","💪"];

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

  // New feature state
  let replyingTo: Message | null = null;
  let emojiPickerMsgId = "";
  let emojiPickerStyle = "";
  let showGifPicker = false;
  let gifQuery = "";
  let gifs: Array<{ id: string; url: string; preview: string }> = [];
  let gifLoading = false;
  let gifDebounce: ReturnType<typeof setTimeout>;

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

  async function apiDelete(path: string, payload: Record<string, unknown>) {
    const csrf = getCookie("band_chat_csrf");
    return fetch(path, {
      method: "DELETE",
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
    showNotification("Account created. The first user is auto-approved as admin.", "success");
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
    replyingTo = null; emojiPickerMsgId = ""; showGifPicker = false;
  }

  async function sendMessage() {
    const text = newMessage.trim();
    if (!text || !selectedChannelId) return;
    const payload: Record<string, unknown> = { channelId: selectedChannelId, content: text };
    if (replyingTo) {
      payload.replyToId = replyingTo.id;
      payload.replyToContent = replyingTo.deleted ? "" : replyingTo.content.slice(0, 200);
      payload.replyToAuthor = replyingTo.author;
    }
    const res = await apiPost("/api/messages", payload);
    if (!res.ok) return;
    newMessage = ""; replyingTo = null;
    await refreshMessages();
  }

  async function deleteMsg(id: string) {
    await apiDelete("/api/messages", { messageId: id });
    await refreshMessages();
  }

  async function toggleReaction(messageId: string, emoji: string) {
    emojiPickerMsgId = "";
    const csrf = getCookie("band_chat_csrf");
    await fetch("/api/reactions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ messageId, emoji })
    });
    await refreshMessages();
  }

  function openEmojiPicker(msgId: string, e: MouseEvent) {
    e.stopPropagation();
    if (emojiPickerMsgId === msgId) { emojiPickerMsgId = ""; return; }
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const pickerW = 224;
    const pickerH = 152;
    const left = Math.max(4, Math.min(window.innerWidth - pickerW - 4, rect.right - pickerW));
    const top = rect.top - pickerH - 8 < 4 ? rect.bottom + 8 : rect.top - pickerH - 8;
    emojiPickerStyle = `left:${left}px;top:${top}px`;
    emojiPickerMsgId = msgId;
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
    replyingTo = null;
    await refreshMessages();
  }

  async function approveUser(username: string) {
    const res = await apiPost("/api/admin/users/approve", { username });
    if (!res.ok) return;
    await refreshPendingUsers();
    showNotification(`${username} approved.`, "success");
  }

  // GIF search via Tenor v1
  async function loadGifs(query: string) {
    gifLoading = true; gifs = [];
    try {
      // LIVDSRZULELA is Tenor's public demo key. Replace with your own key
      // from https://developers.google.com/tenor/guides/quickstart for production.
      const key = "LIVDSRZULELA";
      const ep = query
        ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=${key}&limit=16&contentfilter=medium&media_filter=minimal`
        : `https://api.tenor.com/v1/trending?key=${key}&limit=16&contentfilter=medium&media_filter=minimal`;
      const res = await fetch(ep);
      if (res.ok) {
        const data = await res.json();
        gifs = (data.results ?? [])
          .map((r: any) => ({
            id: r.id,
            url: r.media?.[0]?.gif?.url ?? "",
            preview: r.media?.[0]?.tinygif?.url ?? r.media?.[0]?.gif?.url ?? ""
          }))
          .filter((g: any) => g.url);
      }
    } catch { gifs = []; }
    gifLoading = false;
  }

  function onGifInput() {
    clearTimeout(gifDebounce);
    gifDebounce = setTimeout(() => loadGifs(gifQuery), 400);
  }

  async function openGifPicker() {
    showGifPicker = !showGifPicker;
    if (showGifPicker && gifs.length === 0) { gifQuery = ""; await loadGifs(""); }
  }

  async function sendGif(url: string) {
    showGifPicker = false;
    if (!url || !selectedChannelId) return;
    const payload: Record<string, unknown> = { channelId: selectedChannelId, content: url };
    if (replyingTo) {
      payload.replyToId = replyingTo.id;
      payload.replyToContent = replyingTo.deleted ? "" : replyingTo.content.slice(0, 200);
      payload.replyToAuthor = replyingTo.author;
    }
    await apiPost("/api/messages", payload);
    replyingTo = null;
    await refreshMessages();
  }

  function isImageUrl(content: string): string | null {
    const s = content.trim();
    if (!s.startsWith("http") || s.includes(" ") || s.includes("\n")) return null;
    try {
      const u = new URL(s);
      if (/\.(gif|jpg|jpeg|png|webp)(\?|$)/i.test(u.pathname)) return s;
      const h = u.hostname;
      if (h === "media.tenor.com" || h === "c.tenor.com" || h.endsWith(".tenor.com")) return s;
      if (h === "i.giphy.com" || (h.startsWith("media") && h.endsWith(".giphy.com"))) return s;
      return null;
    } catch { return null; }
  }

  function initials(name: string): string { return name.slice(0, 2).toUpperCase(); }

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
      const grouped = !!prev && prev.author === msg.author && !prev.deleted && !msg.deleted
        && msg.createdAt - prev.createdAt < GROUP_THRESHOLD_MS;
      const dateSeparator = prev && formatDate(prev.createdAt) !== formatDate(msg.createdAt)
        ? formatDate(msg.createdAt)
        : (!prev ? formatDate(msg.createdAt) : undefined);
      return { ...msg, grouped, dateSeparator };
    });
  }

  $: groupedMessages = groupMessages(messages);

  function closeAllPickers() {
    emojiPickerMsgId = "";
    showGifPicker = false;
  }

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

  onDestroy(() => { clearTimeout(gifDebounce); });
</script>

<!-- ───────── AUTH ───────── -->
{#if !isAuthenticated}
  <div class="auth-screen">
    <div class="auth-card">
      <div class="auth-logo">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <h1 class="auth-title">Band Messaging</h1>
      <p class="auth-subtitle">Sign in to continue</p>
      {#if notification}
        <div class="auth-toast" class:auth-toast-success={notificationType === "success"} role="alert">
          {notification}
        </div>
      {/if}
      <div class="auth-form-group">
        <label class="auth-label" for="login-username">Username</label>
        <input id="login-username" class="auth-input" bind:value={loginUsername}
          placeholder="Your username" autocomplete="username" />
        <label class="auth-label" for="login-password">Password</label>
        <input id="login-password" class="auth-input" type="password" bind:value={loginPassword}
          placeholder="Your password" autocomplete="current-password"
          on:keydown={(e) => { if (e.key === "Enter") { e.preventDefault(); login(); } }} />
        <button class="auth-btn" on:click={login}>Sign in</button>
      </div>
      <div class="auth-sep"><span>New here?</span></div>
      <div class="auth-form-group" id="register-section">
        <label class="auth-label" for="reg-username">Username</label>
        <input id="reg-username" class="auth-input" bind:value={registerUsername}
          placeholder="Choose a username" autocomplete="username" />
        <label class="auth-label" for="reg-password">Password</label>
        <input id="reg-password" class="auth-input" type="password" bind:value={registerPassword}
          placeholder="At least 12 characters" autocomplete="new-password"
          on:keydown={(e) => { if (e.key === "Enter") { e.preventDefault(); register(); } }} />
        <button class="auth-btn auth-btn-secondary" on:click={register}>Create account</button>
        <p class="auth-note">The first account is automatically promoted to admin.</p>
      </div>
    </div>
  </div>

<!-- ───────── APP ───────── -->
{:else}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="app" class:sidebar-open={sidebarOpen} on:click={closeAllPickers}>

    <!-- ── Sidebar ── -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <nav class="sidebar" on:click|stopPropagation={() => {}}>
      <div class="sidebar-header">
        <span class="sidebar-title">Band</span>
        {#if isAdmin}
          <button class="icon-btn" aria-label="New channel" title="New channel"
            on:click|stopPropagation={() => (showCreateChannel = !showCreateChannel)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        {/if}
      </div>

      {#if showCreateChannel && isAdmin}
        <div class="create-panel">
          <p class="create-panel-title">New Channel</p>
          <label class="panel-label" for="ch-name">Name</label>
          <div class="channel-input-wrap">
            <span class="channel-hash">#</span>
            <input id="ch-name" class="panel-input channel-name-input" bind:value={newChannel}
              placeholder="channel-name"
              on:keydown={(e) => { if (e.key === "Enter") { e.preventDefault(); createChannel(); } }} />
          </div>
          <label class="panel-label" for="ch-desc">Description <span class="optional-tag">optional</span></label>
          <input id="ch-desc" class="panel-input" bind:value={newChannelDescription} placeholder="What's this channel about?" />
          <div class="create-panel-actions">
            <button class="panel-btn panel-btn-ghost" on:click={() => (showCreateChannel = false)}>Cancel</button>
            <button class="panel-btn" on:click={createChannel}>Create</button>
          </div>
        </div>
      {/if}

      <div class="channels-scroll">
        {#if isAdmin && pendingUsers.length > 0}
          <p class="section-label">Pending <span class="badge-count">{pendingUsers.length}</span></p>
          {#each pendingUsers as user}
            <div class="pending-row">
              <div class="avatar-mono">{initials(user.username)}</div>
              <span class="pending-name">{user.username}</span>
              <button class="approve-btn" on:click={() => approveUser(user.username)}>Approve</button>
            </div>
          {/each}
        {/if}
        <p class="section-label">Channels</p>
        {#if channels.length === 0}
          <p class="empty-hint">{isAdmin ? "Create the first channel above." : "No channels yet."}</p>
        {:else}
          {#each channels as ch}
            <button class="channel-row" class:channel-row-active={ch.id === selectedChannelId}
              on:click={() => selectChannel(ch)}>
              <span class="channel-hash-label">#</span>
              <span class="channel-name-label">{ch.name}</span>
            </button>
          {/each}
        {/if}
      </div>

      <div class="user-panel">
        <div class="user-panel-avatar">{initials(me?.username ?? "")}</div>
        <div class="user-panel-info">
          <p class="user-panel-name">{me?.username}</p>
          <p class="user-panel-role">{me?.role === "admin" ? "Admin" : "Member"}</p>
        </div>
        <button class="icon-btn" aria-label="Sign out" title="Sign out" on:click={logout}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </nav>

    <!-- ── Main ── -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <main class="main" on:click|stopPropagation={() => {}}>
      <header class="channel-header">
        <button class="hamburger" aria-label="Toggle sidebar" on:click={() => (sidebarOpen = !sidebarOpen)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        {#if selectedChannelName}
          <span class="header-hash">#</span>
          <span class="header-name">{selectedChannelName}</span>
          {#if selectedChannelDescription}
            <span class="header-sep"></span>
            <span class="header-desc">{selectedChannelDescription}</span>
          {/if}
        {:else}
          <span class="header-name header-name-empty">Band Messaging</span>
        {/if}
      </header>

      {#if notification}
        <div class="toast" class:toast-success={notificationType === "success"} role="alert">
          {#if notificationType === "error"}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          {/if}
          {notification}
        </div>
      {/if}

      <!-- Messages area -->
      <div class="messages-area" bind:this={messagesEl}>
        {#if !selectedChannelId}
          <div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" class="empty-icon">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p>Select a channel to start chatting</p>
          </div>
        {:else}
          <div class="welcome">
            <h2 class="welcome-title">#{selectedChannelName}</h2>
            <p class="welcome-sub">{selectedChannelDescription || `The beginning of #${selectedChannelName}.`}</p>
          </div>

          {#if messages.length === 0}
            <p class="no-messages">No messages yet.</p>
          {:else}
            {#each groupedMessages as msg}
              {#if msg.dateSeparator}
                <div class="date-sep">
                  <span class="date-sep-line"></span>
                  <span class="date-sep-label">{msg.dateSeparator}</span>
                  <span class="date-sep-line"></span>
                </div>
              {/if}

              <div class="msg-row" class:msg-grouped={msg.grouped}>
                {#if !msg.grouped}
                  <div class="msg-avatar">{initials(msg.author)}</div>
                {:else}
                  <div class="msg-avatar-gap">
                    <span class="msg-time-ghost">{formatTime(msg.createdAt)}</span>
                  </div>
                {/if}

                <div class="msg-body">
                  {#if !msg.grouped}
                    <div class="msg-meta">
                      <span class="msg-author">{msg.author}</span>
                      <span class="msg-time" title={formatFullDate(msg.createdAt)}>
                        {formatDate(msg.createdAt) !== "Today" ? formatDate(msg.createdAt) + " at " : ""}{formatTime(msg.createdAt)}
                      </span>
                    </div>
                  {/if}

                  <!-- Reply reference -->
                  {#if msg.replyToId && msg.replyToAuthor}
                    <div class="reply-ref">
                      <span class="reply-ref-bar"></span>
                      <span class="reply-ref-author">{msg.replyToAuthor}</span>
                      <span class="reply-ref-text">
                        {msg.replyToContent ? (msg.replyToContent.length > 80 ? msg.replyToContent.slice(0, 80) + "…" : msg.replyToContent) : "Original message"}
                      </span>
                    </div>
                  {/if}

                  <!-- Content -->
                  {#if msg.deleted}
                    <p class="msg-text msg-deleted">This message was deleted.</p>
                  {:else}
                    {@const imgUrl = isImageUrl(msg.content)}
                    {#if imgUrl}
                      <div class="msg-image-wrap">
                        <img class="msg-image" src={imgUrl} alt="" loading="lazy" />
                      </div>
                    {:else}
                      <p class="msg-text">{msg.content}</p>
                    {/if}
                  {/if}

                  <!-- Reactions -->
                  {#if msg.reactions && msg.reactions.length > 0}
                    <div class="reactions">
                      {#each msg.reactions as r}
                        <button
                          class="reaction-pill"
                          class:reaction-by-me={r.byMe}
                          on:click|stopPropagation={() => toggleReaction(msg.id, r.emoji)}
                        >{r.emoji} {r.count}</button>
                      {/each}
                    </div>
                  {/if}
                </div>

                <!-- Action bar (hover / always-touch) -->
                {#if !msg.deleted}
                  <div class="msg-actions" on:click|stopPropagation={() => {}}>
                    <button class="msg-action-btn" title="React" aria-label="Add reaction"
                      on:click={(e) => openEmojiPicker(msg.id, e)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                    </button>
                    <button class="msg-action-btn" title="Reply" aria-label="Reply"
                      on:click|stopPropagation={() => { replyingTo = msg; composerEl?.focus(); }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                    </button>
                    {#if msg.isMe || isAdmin}
                      <button class="msg-action-btn msg-action-delete" title="Delete" aria-label="Delete message"
                        on:click|stopPropagation={() => deleteMsg(msg.id)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        {/if}
      </div>

      <!-- Composer -->
      {#if selectedChannelId}
        <div class="composer-wrap">
          <!-- Reply strip -->
          {#if replyingTo}
            <div class="reply-strip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="reply-strip-icon"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              <span class="reply-strip-label">Replying to <strong>{replyingTo.author}</strong></span>
              <span class="reply-strip-preview">{replyingTo.deleted ? "deleted message" : (replyingTo.content.length > 60 ? replyingTo.content.slice(0, 60) + "…" : replyingTo.content)}</span>
              <button class="reply-strip-close" aria-label="Cancel reply" on:click={() => (replyingTo = null)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          {/if}

          <!-- GIF picker (above composer) -->
          {#if showGifPicker}
            <div class="gif-picker" on:click|stopPropagation={() => {}}>
              <div class="gif-picker-header">
                <input class="gif-search-input" bind:value={gifQuery} placeholder="Search GIFs…"
                  on:input={onGifInput} />
                <button class="icon-btn" aria-label="Close" on:click={() => (showGifPicker = false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              {#if gifLoading}
                <div class="gif-status">Loading…</div>
              {:else if gifs.length === 0}
                <div class="gif-status">No GIFs found.</div>
              {:else}
                <div class="gif-grid">
                  {#each gifs as gif}
                    <button class="gif-item" on:click={() => sendGif(gif.url)} title="Send GIF">
                      <img src={gif.preview} alt="GIF" loading="lazy" />
                    </button>
                  {/each}
                </div>
              {/if}
              <p class="gif-credit">Powered by Tenor</p>
            </div>
          {/if}

          <div class="composer" on:click|stopPropagation={() => {}}>
            <button class="composer-gif-btn" title="GIF" aria-label="GIF picker"
              on:click|stopPropagation={openGifPicker}>
              <span>GIF</span>
            </button>
            <input
              class="composer-input"
              bind:value={newMessage}
              bind:this={composerEl}
              placeholder={replyingTo ? `Reply to ${replyingTo.author}…` : `Message #${selectedChannelName}`}
              on:keydown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />
            <button
              class="composer-send"
              class:composer-send-ready={!!newMessage.trim()}
              on:click={sendMessage}
              disabled={!newMessage.trim()}
              aria-label="Send message"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      {/if}
    </main>

    <!-- Global emoji picker (position:fixed, avoids overflow clipping) -->
    {#if emojiPickerMsgId}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="emoji-picker-backdrop" on:click={() => (emojiPickerMsgId = "")}></div>
      <div class="emoji-picker" style={emojiPickerStyle} on:click|stopPropagation={() => {}}>
        {#each COMMON_EMOJIS as emoji}
          <button class="emoji-btn" on:click={() => toggleReaction(emojiPickerMsgId, emoji)}>{emoji}</button>
        {/each}
      </div>
    {/if}

    <!-- Mobile overlay -->
    {#if sidebarOpen}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="sidebar-overlay" on:click={() => (sidebarOpen = false)}></div>
    {/if}
  </div>
{/if}

<style>
  /* ════════════════════════════════════════
     AUTH
  ════════════════════════════════════════ */
  .auth-screen {
    min-height: 100vh;         /* fallback for browsers without svh support */
    min-height: 100svh;        /* accounts for mobile browser chrome */
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-0);
    padding: 1.5rem;
  }

  .auth-card {
    width: min(400px, 100%);
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .auth-logo {
    width: 48px; height: 48px;
    border-radius: var(--radius-md);
    background: var(--bg-2);
    border: 1px solid var(--separator);
    display: flex; align-items: center; justify-content: center;
    color: var(--text-primary);
    margin: 0 auto 1.75rem;
  }

  .auth-title {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    text-align: center;
    letter-spacing: -0.02em;
  }

  .auth-subtitle {
    margin: 0 0 2rem;
    font-size: 0.875rem;
    color: var(--text-tertiary);
    text-align: center;
  }

  .auth-toast {
    display: flex; align-items: center; gap: 0.5rem;
    background: rgba(255,69,58,.1);
    border: 1px solid rgba(255,69,58,.3);
    color: var(--color-error);
    border-radius: var(--radius-sm);
    padding: 0.65rem 0.875rem;
    font-size: 0.825rem;
    margin-bottom: 1.25rem;
    line-height: 1.4;
  }
  .auth-toast-success {
    background: rgba(48,209,88,.1);
    border-color: rgba(48,209,88,.3);
    color: var(--color-success);
  }

  .auth-form-group { display: flex; flex-direction: column; gap: 0.5rem; }

  .auth-label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-tertiary);
    letter-spacing: 0.005em;
    margin-top: 0.25rem;
  }

  .auth-input {
    width: 100%;
    background: var(--bg-2);
    border: 1px solid var(--separator);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    padding: 0.65rem 0.875rem;
    font-size: 0.9375rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .auth-input::placeholder { color: var(--text-placeholder); }
  .auth-input:focus { border-color: rgba(255,255,255,.4); }

  .auth-btn {
    width: 100%; margin-top: 0.5rem;
    padding: 0.7rem 1rem;
    background: var(--text-primary); color: var(--bg-0);
    border: none; border-radius: var(--radius-sm);
    font-size: 0.9375rem; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s;
    letter-spacing: -0.01em;
  }
  .auth-btn:hover { opacity: 0.88; }
  .auth-btn:active { opacity: 0.76; }
  .auth-btn-secondary {
    background: var(--bg-2); color: var(--text-secondary);
    border: 1px solid var(--separator);
  }
  .auth-btn-secondary:hover { background: var(--bg-3); opacity: 1; }

  .auth-note { margin: 0.25rem 0 0; font-size: 0.75rem; color: var(--text-tertiary); text-align: center; line-height: 1.5; }

  .auth-sep {
    display: flex; align-items: center; gap: 0.75rem;
    margin: 1.75rem 0;
    color: var(--text-tertiary); font-size: 0.78rem; letter-spacing: 0.03em;
  }
  .auth-sep::before, .auth-sep::after { content: ""; flex: 1; height: 1px; background: var(--separator); }

  /* ════════════════════════════════════════
     APP SHELL
  ════════════════════════════════════════ */
  .app {
    display: flex;
    height: 100vh;
    height: 100svh;
    overflow: hidden;
  }

  /* ════════════════════════════════════════
     SIDEBAR
  ════════════════════════════════════════ */
  .sidebar {
    width: 220px; flex-shrink: 0;
    background: var(--bg-1);
    display: flex; flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--separator);
  }

  .sidebar-header {
    height: 52px; padding: 0 1rem;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--separator);
    flex-shrink: 0;
  }

  .sidebar-title { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); letter-spacing: -0.01em; }

  .create-panel {
    background: var(--bg-2); padding: 1rem;
    border-bottom: 1px solid var(--separator);
    display: flex; flex-direction: column; gap: 0.45rem;
    flex-shrink: 0;
  }
  .create-panel-title { margin: 0 0 0.25rem; font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); letter-spacing: -0.005em; }
  .panel-label { font-size: 0.75rem; font-weight: 500; color: var(--text-tertiary); display: flex; align-items: center; gap: 0.3rem; margin-top: 0.15rem; }
  .optional-tag { font-size: 0.68rem; color: var(--text-tertiary); opacity: 0.6; font-weight: 400; }
  .channel-input-wrap { position: relative; display: flex; align-items: center; }
  .channel-hash { position: absolute; left: 0.6rem; color: var(--text-tertiary); font-size: 0.875rem; pointer-events: none; line-height: 1; }
  .channel-name-input { padding-left: 1.4rem; }
  .panel-input {
    width: 100%; background: var(--bg-0);
    border: 1px solid var(--separator); border-radius: 6px;
    color: var(--text-primary); padding: 0.5rem 0.65rem; font-size: 0.8125rem;
    outline: none; transition: border-color 0.15s;
  }
  .panel-input::placeholder { color: var(--text-placeholder); }
  .panel-input:focus { border-color: rgba(255,255,255,.35); }
  .create-panel-actions { display: flex; gap: 0.4rem; justify-content: flex-end; margin-top: 0.15rem; }
  .panel-btn {
    background: var(--text-primary); color: var(--bg-0);
    border: none; border-radius: 6px; padding: 0.42rem 0.75rem;
    font-size: 0.8125rem; font-weight: 600; cursor: pointer; transition: opacity 0.15s;
  }
  .panel-btn:hover { opacity: 0.85; }
  .panel-btn-ghost {
    background: transparent; color: var(--text-tertiary);
    border: 1px solid var(--separator);
  }
  .panel-btn-ghost:hover { opacity: 1; color: var(--text-secondary); background: var(--bg-3); }

  .channels-scroll { flex: 1; overflow-y: auto; padding: 0.75rem 0; }

  .section-label {
    margin: 0; padding: 0.6rem 1rem 0.3rem;
    font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-tertiary);
    display: flex; align-items: center; gap: 0.4rem;
  }

  .badge-count {
    background: var(--color-error); color: #fff;
    font-size: 0.6rem; font-weight: 700; padding: 0.1rem 0.35rem;
    border-radius: 999px; letter-spacing: 0;
  }

  .pending-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0.75rem 0.3rem 1rem; font-size: 0.825rem; }
  .avatar-mono {
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--bg-3); border: 1px solid var(--separator);
    color: var(--text-secondary);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.6rem; font-weight: 700; flex-shrink: 0;
    text-transform: uppercase;
  }
  .pending-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); }
  .approve-btn {
    background: transparent; border: 1px solid var(--separator);
    border-radius: 4px; color: var(--color-success);
    font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.45rem; cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
  }
  .approve-btn:hover { background: rgba(48,209,88,.1); border-color: rgba(48,209,88,.4); }

  .channel-row {
    display: flex; align-items: center; gap: 0.3rem;
    width: calc(100% - 0.75rem); margin: 0 0 0 0.375rem;
    padding: 0.4rem 0.75rem;
    border-radius: var(--radius-sm); border: none; background: none;
    color: var(--text-tertiary); cursor: pointer; text-align: left;
    font-size: 0.875rem; font-weight: 400;
    transition: background 0.1s, color 0.12s;
    white-space: nowrap; overflow: hidden;
  }
  .channel-hash-label { color: var(--text-tertiary); font-size: 0.875rem; flex-shrink: 0; opacity: 0.6; }
  .channel-name-label { overflow: hidden; text-overflow: ellipsis; }
  .channel-row:hover { background: var(--tint); color: var(--text-secondary); }
  .channel-row:hover .channel-hash-label { opacity: 0.8; }
  .channel-row-active { background: var(--tint-strong) !important; color: var(--text-primary) !important; }
  .channel-row-active .channel-hash-label { opacity: 1; color: var(--text-primary); }
  .empty-hint { padding: 0.25rem 1rem; font-size: 0.8rem; color: var(--text-tertiary); margin: 0; }

  .user-panel {
    height: 52px; padding: 0 0.75rem;
    display: flex; align-items: center; gap: 0.6rem;
    border-top: 1px solid var(--separator); flex-shrink: 0;
  }
  .user-panel-avatar {
    width: 30px; height: 30px; border-radius: 50%;
    background: var(--bg-3); border: 1px solid var(--separator);
    color: var(--text-secondary);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.65rem; font-weight: 700; flex-shrink: 0;
    text-transform: uppercase; letter-spacing: 0.02em;
  }
  .user-panel-info { flex: 1; min-width: 0; }
  .user-panel-name { margin: 0; font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; letter-spacing: -0.005em; }
  .user-panel-role { margin: 0; font-size: 0.69rem; color: var(--text-tertiary); line-height: 1.3; }

  /* ════════════════════════════════════════
     MAIN
  ════════════════════════════════════════ */
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-0); min-width: 0; }

  .channel-header {
    height: 52px; padding: 0 1.25rem;
    display: flex; align-items: center; gap: 0.6rem;
    border-bottom: 1px solid var(--separator);
    flex-shrink: 0; overflow: hidden;
  }
  .hamburger {
    display: none; background: none; border: none;
    color: var(--text-tertiary); cursor: pointer;
    padding: 0.3rem; border-radius: 6px; line-height: 0; flex-shrink: 0;
    transition: color 0.1s, background 0.1s;
  }
  .hamburger:hover { color: var(--text-primary); background: var(--tint); }
  .header-hash { font-size: 1rem; color: var(--text-tertiary); font-weight: 400; flex-shrink: 0; opacity: 0.6; }
  .header-name { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; letter-spacing: -0.01em; }
  .header-name-empty { color: var(--text-tertiary); font-weight: 500; }
  .header-sep { width: 1px; height: 16px; background: var(--separator); flex-shrink: 0; }
  .header-desc { font-size: 0.8125rem; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .toast {
    display: flex; align-items: center; gap: 0.5rem;
    background: rgba(255,69,58,.08);
    border-bottom: 1px solid rgba(255,69,58,.2);
    color: var(--color-error);
    padding: 0.5rem 1.25rem; font-size: 0.8125rem; font-weight: 500;
    flex-shrink: 0; line-height: 1.4;
  }
  .toast-success { background: rgba(48,209,88,.08); border-bottom-color: rgba(48,209,88,.2); color: var(--color-success); }

  /* Messages */
  .messages-area { flex: 1; overflow-y: auto; display: flex; flex-direction: column; padding-bottom: 0.5rem; }

  .empty-state {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.75rem; color: var(--text-tertiary); padding: 2rem; text-align: center;
  }
  .empty-icon { opacity: 0.2; }
  .empty-state p { margin: 0; font-size: 0.875rem; }

  .welcome { padding: 3rem 1.5rem 1.5rem; border-bottom: 1px solid var(--separator); margin-bottom: 1rem; }
  .welcome-title { margin: 0 0 0.35rem; font-size: 1.5rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.025em; line-height: 1.2; }
  .welcome-sub { margin: 0; font-size: 0.875rem; color: var(--text-tertiary); line-height: 1.5; }

  .no-messages { padding: 0 1.5rem; font-size: 0.825rem; color: var(--text-tertiary); margin: 0; }

  .date-sep { display: flex; align-items: center; gap: 0.75rem; margin: 1.5rem 1.5rem 0.75rem; }
  .date-sep-line { flex: 1; height: 1px; background: var(--separator); }
  .date-sep-label { font-size: 0.7rem; font-weight: 600; color: var(--text-tertiary); white-space: nowrap; letter-spacing: 0.02em; }

  /* Message row */
  .msg-row {
    display: flex; gap: 0.875rem;
    padding: 0.15rem 1.25rem 0.15rem 1.5rem;
    transition: background 0.06s;
    align-items: flex-start;
    position: relative;
  }
  .msg-row:hover { background: rgba(255,255,255,.025); }
  .msg-grouped { padding-top: 0.04rem; }

  .msg-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: var(--bg-2); border: 1px solid var(--separator);
    color: var(--text-secondary);
    display: flex; align-items: center; justify-content: center;
    font-size: 0.7rem; font-weight: 700; flex-shrink: 0;
    text-transform: uppercase; letter-spacing: 0.02em;
    margin-top: 0.1rem;
  }
  .msg-avatar-gap { width: 36px; flex-shrink: 0; display: flex; align-items: flex-start; justify-content: flex-end; padding-top: 0.28rem; }
  .msg-time-ghost { font-size: 0.62rem; color: transparent; transition: color 0.1s; user-select: none; white-space: nowrap; }
  .msg-row:hover .msg-time-ghost { color: var(--text-tertiary); }

  .msg-body { flex: 1; min-width: 0; }
  .msg-meta { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.1rem; }
  .msg-author { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); letter-spacing: -0.005em; line-height: 1.4; }
  .msg-time { font-size: 0.69rem; color: var(--text-tertiary); line-height: 1.4; }
  .msg-text { margin: 0; font-size: 0.9375rem; color: var(--text-secondary); line-height: 1.5; word-break: break-word; }
  .msg-deleted { font-style: italic; color: var(--text-tertiary) !important; font-size: 0.875rem !important; }

  /* Reply reference inside message */
  .reply-ref {
    display: flex; align-items: center; gap: 0.45rem;
    margin-bottom: 0.25rem;
    font-size: 0.8rem;
    opacity: 0.7;
    cursor: default;
    overflow: hidden;
  }
  .reply-ref-bar { width: 2px; height: 1.1em; background: var(--text-tertiary); border-radius: 1px; flex-shrink: 0; }
  .reply-ref-author { font-weight: 600; color: var(--text-secondary); white-space: nowrap; flex-shrink: 0; }
  .reply-ref-text { color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Reactions */
  .reactions { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.3rem; }
  .reaction-pill {
    display: inline-flex; align-items: center; gap: 0.25rem;
    background: var(--bg-2); border: 1px solid var(--separator);
    border-radius: 999px; padding: 0.15rem 0.5rem;
    font-size: 0.82rem; cursor: pointer; line-height: 1.4;
    transition: background 0.1s, border-color 0.1s;
    color: var(--text-secondary);
  }
  .reaction-pill:hover { background: var(--bg-3); border-color: rgba(255,255,255,.2); }
  .reaction-by-me { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.3); color: var(--text-primary); }

  /* GIF / image in message */
  .msg-image-wrap { margin-top: 0.3rem; }
  .msg-image { max-width: min(320px, 100%); max-height: 280px; border-radius: var(--radius-sm); object-fit: contain; display: block; }

  /* Message action bar */
  .msg-actions {
    display: flex; gap: 0.15rem; align-items: center;
    flex-shrink: 0; padding-top: 0.15rem;
    opacity: 0; transition: opacity 0.12s;
  }
  .msg-row:hover .msg-actions { opacity: 1; }
  /* Touch devices: always show (faint) */
  @media (hover: none) { .msg-actions { opacity: 0.45; } }

  .msg-action-btn {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px;
    background: none; border: none;
    border-radius: 6px; color: var(--text-tertiary);
    cursor: pointer; transition: background 0.1s, color 0.1s;
    padding: 0;
  }
  .msg-action-btn:hover { background: var(--bg-2); color: var(--text-secondary); }
  .msg-action-delete:hover { color: var(--color-error); }

  /* Global emoji picker (position: fixed) */
  .emoji-picker-backdrop {
    position: fixed; inset: 0; z-index: 199;
    background: transparent;
  }
  .emoji-picker {
    position: fixed; z-index: 200;
    background: var(--bg-1);
    border: 1px solid var(--separator);
    border-radius: 12px;
    padding: 0.5rem;
    display: flex; flex-wrap: wrap; gap: 0.1rem;
    width: 224px;
    box-shadow: 0 8px 32px rgba(0,0,0,.5);
  }
  .emoji-btn {
    width: 36px; height: 36px; border: none; background: none;
    border-radius: 8px; font-size: 1.1rem; cursor: pointer;
    transition: background 0.08s;
    display: flex; align-items: center; justify-content: center;
  }
  .emoji-btn:hover { background: var(--bg-3); }

  /* ════════════════════════════════════════
     COMPOSER
  ════════════════════════════════════════ */
  .composer-wrap { padding: 0 1rem 1.25rem; flex-shrink: 0; position: relative; }

  /* Reply strip above composer */
  .reply-strip {
    display: flex; align-items: center; gap: 0.5rem;
    background: var(--bg-2);
    border: 1px solid var(--separator);
    border-bottom: none;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    padding: 0.45rem 0.75rem;
    font-size: 0.8rem;
    overflow: hidden;
  }
  .reply-strip-icon { flex-shrink: 0; color: var(--text-tertiary); }
  .reply-strip-label { flex-shrink: 0; color: var(--text-tertiary); }
  .reply-strip-label strong { color: var(--text-secondary); font-weight: 600; }
  .reply-strip-preview { flex: 1; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .reply-strip-close {
    flex-shrink: 0; background: none; border: none;
    color: var(--text-tertiary); cursor: pointer; padding: 0.15rem;
    border-radius: 4px; line-height: 0; transition: color 0.1s;
  }
  .reply-strip-close:hover { color: var(--text-primary); }

  .composer {
    display: flex; align-items: center;
    background: var(--bg-2); border: 1px solid var(--separator);
    border-radius: var(--radius-md); padding: 0 0.75rem;
    transition: border-color 0.15s;
  }
  /* When reply strip is shown, merge border radii */
  .reply-strip + .gif-picker + .composer,
  .reply-strip + .composer {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }
  .composer:focus-within { border-color: rgba(255,255,255,.3); }

  .composer-gif-btn {
    background: none; border: none; cursor: pointer;
    color: var(--text-tertiary); padding: 0.5rem 0.3rem;
    border-radius: 6px; flex-shrink: 0;
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em;
    transition: color 0.1s, background 0.1s;
  }
  .composer-gif-btn:hover { color: var(--text-primary); background: var(--tint); }

  .composer-input {
    flex: 1; background: none; border: none; outline: none;
    color: var(--text-primary); font-size: 0.9375rem;
    padding: 0.75rem 0.5rem; line-height: 1.4; min-width: 0;
  }
  .composer-input::placeholder { color: var(--text-placeholder); }

  .composer-send {
    background: none; border: none; cursor: pointer;
    padding: 0.5rem; border-radius: 6px; line-height: 0;
    flex-shrink: 0; color: var(--text-tertiary);
    transition: color 0.12s, background 0.12s;
  }
  .composer-send:disabled { cursor: default; opacity: 0.4; }
  .composer-send-ready { color: var(--text-primary) !important; }
  .composer-send-ready:hover { background: var(--tint); }

  /* GIF Picker */
  .gif-picker {
    background: var(--bg-1);
    border: 1px solid var(--separator);
    border-bottom: none;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    display: flex; flex-direction: column;
    max-height: 340px;
    overflow: hidden;
  }
  .gif-picker-header {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--separator);
    flex-shrink: 0;
  }
  .gif-search-input {
    flex: 1; background: var(--bg-2);
    border: 1px solid var(--separator); border-radius: var(--radius-sm);
    color: var(--text-primary); padding: 0.45rem 0.65rem; font-size: 0.875rem;
    outline: none; transition: border-color 0.15s;
  }
  .gif-search-input::placeholder { color: var(--text-placeholder); }
  .gif-search-input:focus { border-color: rgba(255,255,255,.35); }

  .gif-status { padding: 1.5rem; text-align: center; font-size: 0.825rem; color: var(--text-tertiary); }
  .gif-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; overflow-y: auto; padding: 4px; }
  .gif-item {
    background: var(--bg-2); border: none; border-radius: 4px;
    overflow: hidden; cursor: pointer; aspect-ratio: 1; padding: 0;
    transition: opacity 0.1s;
  }
  .gif-item:hover { opacity: 0.85; }
  .gif-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gif-credit { margin: 0; padding: 0.3rem 0.75rem; font-size: 0.68rem; color: var(--text-tertiary); text-align: right; flex-shrink: 0; border-top: 1px solid var(--separator); }

  /* Shared icon button */
  .icon-btn {
    background: none; border: none; color: var(--text-tertiary);
    cursor: pointer; padding: 0.3rem; border-radius: 6px;
    line-height: 0; flex-shrink: 0; transition: color 0.1s, background 0.1s;
  }
  .icon-btn:hover { color: var(--text-primary); background: var(--tint); }

  /* Mobile sidebar */
  .sidebar-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.6); z-index: 9;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  @media (max-width: 660px) {
    .hamburger { display: flex; }

    .sidebar {
      position: fixed; left: 0; top: 0; bottom: 0;
      z-index: 10;
      transform: translateX(-100%);
      transition: transform 0.24s cubic-bezier(0.4,0,0.2,1);
    }
    .app.sidebar-open .sidebar { transform: translateX(0); }
    .app.sidebar-open .sidebar-overlay { display: block; }

    .msg-row { padding: 0.15rem 0.75rem 0.15rem 1rem; }
    .welcome { padding: 2rem 1rem 1rem; }
    .date-sep { margin: 1.25rem 1rem 0.5rem; }
    .composer-wrap { padding: 0 0.75rem 1rem; }
    .gif-grid { grid-template-columns: repeat(3, 1fr); }
    /* On small screens always show actions */
    .msg-actions { opacity: 0.45; }
  }
</style>
