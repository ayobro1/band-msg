<script lang="ts">
  import { onMount, onDestroy, afterUpdate, tick } from "svelte";
  import { env } from "$env/dynamic/public";

  /* ── Types ── */
  type User   = { username: string; role: "admin" | "member"; status: string };
  type Channel = { id: string; name: string; description: string };
  type Reaction = { emoji: string; count: number; byMe: boolean };
  type Message = {
    id: string; author: string; content: string; createdAt: number;
    deleted?: boolean; editedAt?: number | null; isMe?: boolean;
    replyToId?: string | null; replyToContent?: string | null; replyToAuthor?: string | null;
    reactions?: Reaction[];
  };
  type Member = { username: string; role: "admin" | "member" };
  type PendingUser = { username: string; status: string };

  /* ── Constants ── */
  const GROUP_MS = 7 * 60 * 1000;
  const EMOJIS = ["👍","❤️","😂","😮","😢","😡","🔥","👏","🎉","🤔","😍","💯","✅","👀","🙌","😅","💀","🤣","🥳","💪"];

  /* ── State ── */
  let me: User | null = null;
  let channels: Channel[] = [];
  let messages: Message[] = [];
  let pendingUsers: PendingUser[] = [];
  let members: Member[] = [];

  let selectedChannelId = "";
  let selectedChannelName = "";
  let selectedChannelDescription = "";

  let regUsername = "", regPassword = "";
  let loginUsername = "", loginPassword = "";
  let newMessage = "";
  let newChannel = "", newChannelDesc = "";

  let notification = "", notifType: "error" | "success" = "error";
  let showCreateChannel = false;
  let sidebarOpen = false;
  let showMemberList = true;

  let replyingTo: Message | null = null;
  let emojiPickerMsgId = "";
  let emojiPickerStyle = "";
  let showGifPicker = false;
  let gifQuery = "";
  let gifs: { id: string; url: string; preview: string }[] = [];
  let gifLoading = false;
  let gifDebounce: ReturnType<typeof setTimeout>;

  let editingMsgId = "";
  let editContent = "";
  let editEl: HTMLTextAreaElement;

  let messagesEl: HTMLElement;
  let composerEl: HTMLInputElement;

  /* ── Derived ── */
  $: isAuthenticated = !!me;
  $: isAdmin = me?.role === "admin";
  $: groupedMessages = groupMessages(messages);

  /* ── Notifications ── */
  function notify(msg: string, type: "error" | "success" = "error") {
    notification = msg; notifType = type;
    setTimeout(() => { notification = ""; }, 4000);
  }

  /* ── HTTP helpers ── */
  function csrf(): string {
    if (typeof document === "undefined") return "";
    const p = `${encodeURIComponent("band_chat_csrf")}=`;
    const c = document.cookie.split(";").map(s => s.trim()).find(s => s.startsWith(p));
    return c ? decodeURIComponent(c.slice(p.length)) : "";
  }
  const post = (path: string, body: unknown) =>
    fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify(body) });
  const del = (path: string, body: unknown) =>
    fetch(path, { method: "DELETE", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify(body) });
  const patch = (path: string, body: unknown) =>
    fetch(path, { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify(body) });

  /* ── API calls ── */
  async function refreshMe() {
    const r = await fetch("/api/auth/me");
    me = r.ok ? await r.json() : null;
  }
  async function refreshChannels() {
    if (!me) return;
    const r = await fetch("/api/channels");
    if (!r.ok) return;
    channels = await r.json();
    if (!selectedChannelId && channels.length) await selectChannel(channels[0]);
  }
  async function refreshMessages() {
    if (!selectedChannelId) return;
    const r = await fetch(`/api/messages?channelId=${encodeURIComponent(selectedChannelId)}`);
    if (r.ok) messages = await r.json();
  }
  async function refreshPending() {
    if (!isAdmin) return;
    const r = await fetch("/api/admin/users");
    if (!r.ok) return;
    const all: PendingUser[] = await r.json();
    pendingUsers = all.filter(u => u.status === "pending");
  }
  async function refreshMembers() {
    if (!me) return;
    const r = await fetch("/api/members");
    if (r.ok) members = await r.json();
  }

  async function register() {
    const r = await post("/api/auth/register", { username: regUsername, password: regPassword });
    if (!r.ok) { notify((await r.json().catch(() => ({ error: "Registration failed" }))).error); return; }
    regUsername = ""; regPassword = "";
    notify("Account created. First user is auto-approved as admin.", "success");
  }
  async function login() {
    const r = await post("/api/auth/login", { username: loginUsername, password: loginPassword });
    if (!r.ok) { notify((await r.json().catch(() => ({ error: "Login failed" }))).error); return; }
    loginPassword = "";
    await refreshMe(); await refreshChannels(); await refreshPending(); await refreshMembers();
  }
  async function logout() {
    await post("/api/auth/logout", {});
    me = null; channels = []; messages = []; pendingUsers = []; members = [];
    selectedChannelId = ""; selectedChannelName = ""; selectedChannelDescription = "";
    replyingTo = null; emojiPickerMsgId = ""; showGifPicker = false;
    cancelEdit();
  }

  async function sendMessage() {
    const text = newMessage.trim();
    if (!text || !selectedChannelId) return;
    const payload: Record<string, unknown> = { channelId: selectedChannelId, content: text };
    if (replyingTo) {
      payload.replyToId      = replyingTo.id;
      payload.replyToContent = replyingTo.deleted ? "" : replyingTo.content.slice(0, 200);
      payload.replyToAuthor  = replyingTo.author;
    }
    const r = await post("/api/messages", payload);
    if (!r.ok) return;
    newMessage = ""; replyingTo = null;
    await refreshMessages();
  }

  async function deleteMsg(id: string) {
    await del("/api/messages", { messageId: id });
    if (editingMsgId === id) cancelEdit();
    await refreshMessages();
  }

  function startEdit(msg: Message) {
    editingMsgId = msg.id;
    editContent = msg.content;
    emojiPickerMsgId = "";
    tick().then(() => editEl?.focus());
  }
  function cancelEdit() { editingMsgId = ""; editContent = ""; }
  async function saveEdit() {
    const text = editContent.trim();
    if (!text || !editingMsgId) { cancelEdit(); return; }
    const r = await patch("/api/messages", { messageId: editingMsgId, content: text });
    if (!r.ok) { notify((await r.json().catch(() => ({ error: "Edit failed" }))).error); return; }
    cancelEdit();
    await refreshMessages();
  }

  async function toggleReaction(messageId: string, emoji: string) {
    emojiPickerMsgId = "";
    await fetch("/api/reactions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrf() },
      body: JSON.stringify({ messageId, emoji })
    });
    await refreshMessages();
  }

  function openEmojiPicker(msgId: string, e: MouseEvent) {
    e.stopPropagation();
    if (emojiPickerMsgId === msgId) { emojiPickerMsgId = ""; return; }
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const W = 228, H = 156;
    const left = Math.max(4, Math.min(window.innerWidth - W - 4, rect.right - W));
    const top  = rect.top - H - 8 < 8 ? rect.bottom + 8 : rect.top - H - 8;
    emojiPickerStyle = `left:${left}px;top:${top}px`;
    emojiPickerMsgId = msgId;
  }

  async function createChannel() {
    if (!newChannel.trim()) return;
    const r = await post("/api/channels", { name: newChannel, description: newChannelDesc });
    if (!r.ok) { notify((await r.json().catch(() => ({ error: "Failed" }))).error); return; }
    newChannel = ""; newChannelDesc = ""; showCreateChannel = false;
    await refreshChannels();
  }
  async function selectChannel(ch: Channel) {
    selectedChannelId = ch.id; selectedChannelName = ch.name;
    selectedChannelDescription = ch.description ?? "";
    sidebarOpen = false; replyingTo = null; cancelEdit();
    await refreshMessages();
  }
  async function approveUser(username: string) {
    const r = await post("/api/admin/users/approve", { username });
    if (!r.ok) return;
    await refreshPending();
    notify(`${username} approved.`, "success");
  }

  /* ── GIF ── */
  async function loadGifs(q: string) {
    gifLoading = true; gifs = [];
    try {
      const key = env.PUBLIC_TENOR_KEY || "LIVDSRZULELA";
      const ep = q
        ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=${key}&limit=16&contentfilter=medium&media_filter=minimal`
        : `https://api.tenor.com/v1/trending?key=${key}&limit=16&contentfilter=medium&media_filter=minimal`;
      const r = await fetch(ep);
      if (r.ok) {
        const d = await r.json();
        gifs = (d.results ?? []).map((x: any) => ({
          id: x.id,
          url: x.media?.[0]?.gif?.url ?? "",
          preview: x.media?.[0]?.tinygif?.url ?? x.media?.[0]?.gif?.url ?? ""
        })).filter((g: any) => g.url);
      }
    } catch { gifs = []; }
    gifLoading = false;
  }
  function onGifInput() { clearTimeout(gifDebounce); gifDebounce = setTimeout(() => loadGifs(gifQuery), 400); }
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
    await post("/api/messages", payload);
    replyingTo = null; await refreshMessages();
  }

  /* ── Helpers ── */
  function isImageUrl(s: string): string | null {
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

  function escapeHtml(s: string): string {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
            .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function renderMarkdown(raw: string): string {
    let s = escapeHtml(raw);
    // code spans first (protect their content from further parsing)
    s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    // bold before italic to avoid consuming the double-asterisk as two single-asterisk italics
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    // italic: must not be adjacent to another asterisk (avoid matching inside **)
    s = s.replace(/(?<!\*)\*(?!\*)([^*\n]+)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    s = s.replace(/@([a-zA-Z0-9_-]+)/g, '<span class="mention">@$1</span>');
    return s;
  }

  const initials = (n: string) => n.slice(0, 2).toUpperCase();
  const AC = ["#5865f2","#eb459e","#fee75c","#ed4245","#57f287","#00b0f4","#ff7b54","#a8dadc"];
  function avatarColor(n: string): string {
    let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return AC[h % AC.length];
  }

  function fmtTime(ts: number) { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  function fmtDate(ts: number): string {
    const d = new Date(ts), t = new Date();
    if (d.toDateString() === t.toDateString()) return "Today";
    const y = new Date(t); y.setDate(t.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
  }
  function fmtFull(ts: number) { return new Date(ts).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }); }

  function groupMessages(msgs: Message[]) {
    return msgs.map((m, i) => {
      const prev = msgs[i - 1];
      const grouped = !!prev && prev.author === m.author && !prev.deleted && !m.deleted && m.createdAt - prev.createdAt < GROUP_MS;
      const dateSep = prev && fmtDate(prev.createdAt) !== fmtDate(m.createdAt)
        ? fmtDate(m.createdAt) : (!prev ? fmtDate(m.createdAt) : undefined);
      return { ...m, grouped, dateSep };
    });
  }

  function closeAll() { emojiPickerMsgId = ""; showGifPicker = false; }

  function onComposerKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === "Escape") { replyingTo = null; showGifPicker = false; }
    if (e.key === "ArrowUp" && !newMessage) {
      const mine = [...messages].reverse().find(m => m.isMe && !m.deleted);
      if (mine) { startEdit(mine); e.preventDefault(); }
    }
  }
  function onEditKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }

  let prevCount = 0;
  afterUpdate(async () => {
    if (messages.length !== prevCount && messagesEl) {
      prevCount = messages.length;
      await tick();
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  });

  onMount(async () => {
    await refreshMe(); await refreshChannels(); await refreshPending(); await refreshMembers();
    setInterval(refreshMessages, 3000);
    setInterval(() => { if (isAdmin) refreshPending(); }, 15000);
    setInterval(refreshMembers, 30000);
  });
  onDestroy(() => clearTimeout(gifDebounce));
</script>

<!-- ═══════════ AUTH ═══════════ -->
{#if !isAuthenticated}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="auth-wrap" on:click={closeAll}>
    <div class="auth-card">
      <div class="auth-logo">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <h1 class="auth-title">Welcome back!</h1>
      <p class="auth-sub">Sign in to Band Chat</p>

      {#if notification}
        <div class="auth-toast" class:auth-toast-ok={notifType === "success"}>{notification}</div>
      {/if}

      <div class="auth-fields">
        <label class="auth-label" for="lu">USERNAME</label>
        <input id="lu" class="auth-input" bind:value={loginUsername} placeholder="Enter your username" autocomplete="username" />
        <label class="auth-label" for="lp">PASSWORD</label>
        <input id="lp" class="auth-input" type="password" bind:value={loginPassword} placeholder="Enter your password"
          autocomplete="current-password"
          on:keydown={e => { if (e.key === "Enter") { e.preventDefault(); login(); }}} />
        <button class="auth-btn" on:click={login}>Log In</button>
      </div>

      <div class="auth-sep"><span>Need an account?</span></div>

      <div class="auth-fields">
        <label class="auth-label" for="ru">USERNAME</label>
        <input id="ru" class="auth-input" bind:value={regUsername} placeholder="Choose a username" autocomplete="username" />
        <label class="auth-label" for="rp">PASSWORD</label>
        <input id="rp" class="auth-input" type="password" bind:value={regPassword} placeholder="At least 12 characters"
          autocomplete="new-password"
          on:keydown={e => { if (e.key === "Enter") { e.preventDefault(); register(); }}} />
        <button class="auth-btn auth-btn-ghost" on:click={register}>Register</button>
        <p class="auth-hint">The first account is automatically made admin.</p>
      </div>
    </div>
  </div>

<!-- ═══════════ APP ═══════════ -->
{:else}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="app" class:sidebar-open={sidebarOpen} class:members-hidden={!showMemberList} on:click={closeAll}>

    <!-- ── SIDEBAR ── -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <nav class="sidebar" on:click|stopPropagation={() => {}}>
      <div class="sidebar-header">
        <span class="sidebar-name">Band Chat</span>
        {#if isAdmin}
          <button class="icon-btn" title="New channel"
            on:click|stopPropagation={() => (showCreateChannel = !showCreateChannel)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        {/if}
      </div>

      {#if showCreateChannel && isAdmin}
        <div class="create-panel" on:click|stopPropagation={() => {}}>
          <p class="cp-title">Create Channel</p>
          <label class="cp-label" for="ch-name">CHANNEL NAME</label>
          <div class="ch-input-wrap">
            <span class="ch-hash">#</span>
            <input id="ch-name" class="cp-input ch-padded" bind:value={newChannel} placeholder="new-channel"
              on:keydown={e => { if (e.key === "Enter") { e.preventDefault(); createChannel(); }}} />
          </div>
          <label class="cp-label" for="ch-desc">CHANNEL TOPIC <span class="cp-opt">— optional</span></label>
          <input id="ch-desc" class="cp-input" bind:value={newChannelDesc} placeholder="What's this channel about?" />
          <div class="cp-actions">
            <button class="cp-btn cp-ghost" on:click={() => (showCreateChannel = false)}>Cancel</button>
            <button class="cp-btn" on:click={createChannel}>Create Channel</button>
          </div>
        </div>
      {/if}

      <div class="channels-scroll">
        {#if isAdmin && pendingUsers.length > 0}
          <div class="section-row">
            <span class="section-label">Pending Approvals</span>
            <span class="badge">{pendingUsers.length}</span>
          </div>
          {#each pendingUsers as u}
            <div class="pending-row">
              <div class="avatar sz24" style="background:{avatarColor(u.username)}">{initials(u.username)}</div>
              <span class="pending-name">{u.username}</span>
              <button class="approve-btn" on:click={() => approveUser(u.username)}>✓</button>
            </div>
          {/each}
        {/if}

        <p class="section-label" style="padding-top:16px">TEXT CHANNELS</p>
        {#if channels.length === 0}
          <p class="empty-hint">{isAdmin ? "Create your first channel ↑" : "No channels yet."}</p>
        {:else}
          {#each channels as ch}
            <button class="ch-row" class:ch-active={ch.id === selectedChannelId} on:click={() => selectChannel(ch)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="ch-icon"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><path d="M10 3L6 21"/><path d="M18 3l-4 18"/></svg>
              <span class="ch-name">{ch.name}</span>
            </button>
          {/each}
        {/if}
      </div>

      <div class="user-panel">
        <div class="avatar sz32" style="background:{avatarColor(me?.username ?? '')}">{initials(me?.username ?? "")}</div>
        <div class="user-info">
          <p class="user-name">{me?.username}</p>
          <p class="user-tag">{me?.role === "admin" ? "Admin" : "Member"}</p>
        </div>
        <div class="user-actions">
          <button class="icon-btn" title="Sign out" on:click={logout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </nav>

    <!-- ── MAIN ── -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <main class="main" on:click|stopPropagation={() => {}}>

      <!-- Channel header -->
      <header class="ch-header">
        <button class="hamburger" aria-label="Toggle menu" on:click={() => (sidebarOpen = !sidebarOpen)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        {#if selectedChannelName}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="header-hash"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><path d="M10 3L6 21"/><path d="M18 3l-4 18"/></svg>
          <span class="header-name">{selectedChannelName}</span>
          {#if selectedChannelDescription}
            <span class="header-pipe"></span>
            <span class="header-desc">{selectedChannelDescription}</span>
          {/if}
        {:else}
          <span class="header-name" style="color:var(--t3)">Band Chat</span>
        {/if}

        <div class="header-actions">
          <button class="icon-btn" title="{showMemberList ? 'Hide' : 'Show'} members"
            on:click|stopPropagation={() => (showMemberList = !showMemberList)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </button>
        </div>
      </header>

      <!-- Toast -->
      {#if notification}
        <div class="toast" class:toast-ok={notifType === "success"} role="alert">
          {#if notifType === "error"}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          {/if}
          {notification}
        </div>
      {/if}

      <!-- Messages -->
      <div class="messages-area" bind:this={messagesEl}>
        {#if !selectedChannelId}
          <div class="empty-state">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" style="opacity:.2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <p>Select a channel to start chatting</p>
          </div>
        {:else}
          <!-- Welcome banner -->
          <div class="welcome">
            <div class="welcome-icon" style="background:{avatarColor(selectedChannelName)}">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><path d="M10 3L6 21"/><path d="M18 3l-4 18"/></svg>
            </div>
            <h2 class="welcome-title">Welcome to #{selectedChannelName}!</h2>
            <p class="welcome-sub">{selectedChannelDescription || `This is the beginning of #${selectedChannelName}.`}</p>
          </div>

          {#if messages.length === 0}
            <p class="no-msgs">No messages yet. Be the first!</p>
          {:else}
            {#each groupedMessages as msg}
              {#if msg.dateSep}
                <div class="date-sep">
                  <span class="date-line"></span>
                  <span class="date-label">{msg.dateSep}</span>
                  <span class="date-line"></span>
                </div>
              {/if}

              <div class="msg-row" class:msg-grouped={msg.grouped} class:msg-editing={editingMsgId === msg.id}>
                {#if !msg.grouped}
                  <div class="msg-avatar avatar sz40" style="background:{avatarColor(msg.author)}">{initials(msg.author)}</div>
                {:else}
                  <div class="msg-avatar-gap">
                    <span class="msg-ts-hover">{fmtTime(msg.createdAt)}</span>
                  </div>
                {/if}

                <div class="msg-body">
                  {#if !msg.grouped}
                    <div class="msg-meta">
                      <span class="msg-author">{msg.author}</span>
                      <span class="msg-ts" title={fmtFull(msg.createdAt)}>
                        {fmtDate(msg.createdAt) !== "Today" ? fmtDate(msg.createdAt) + " at " : ""}{fmtTime(msg.createdAt)}
                      </span>
                    </div>
                  {/if}

                  {#if msg.replyToId && msg.replyToAuthor}
                    <div class="reply-ref">
                      <div class="reply-curve"></div>
                      <div class="avatar sz16" style="background:{avatarColor(msg.replyToAuthor)}">{initials(msg.replyToAuthor)}</div>
                      <span class="reply-author">{msg.replyToAuthor}</span>
                      <span class="reply-text">{msg.replyToContent ? (msg.replyToContent.length > 80 ? msg.replyToContent.slice(0,80)+"…" : msg.replyToContent) : "Original message"}</span>
                    </div>
                  {/if}

                  {#if editingMsgId === msg.id}
                    <div class="edit-box">
                      <textarea class="edit-input" bind:value={editContent} bind:this={editEl}
                        rows="1" on:keydown={onEditKeydown}></textarea>
                      <div class="edit-hint">
                        <span>Esc to <button class="edit-link" on:click={cancelEdit}>cancel</button></span>
                        <span>· Enter to <button class="edit-link" on:click={saveEdit}>save</button></span>
                      </div>
                    </div>
                  {:else if msg.deleted}
                    <p class="msg-text msg-deleted"><em>Message deleted.</em></p>
                  {:else}
                    {@const imgUrl = isImageUrl(msg.content)}
                    {#if imgUrl}
                      <div class="msg-img-wrap"><img class="msg-img" src={imgUrl} alt="" loading="lazy"/></div>
                    {:else}
                      <p class="msg-text">{@html renderMarkdown(msg.content)}</p>
                    {/if}
                    {#if msg.editedAt}
                      <span class="edited-tag">(edited)</span>
                    {/if}
                  {/if}

                  {#if msg.reactions && msg.reactions.length > 0}
                    <div class="reactions">
                      {#each msg.reactions as r}
                        <button class="rxn" class:rxn-mine={r.byMe}
                          on:click|stopPropagation={() => toggleReaction(msg.id, r.emoji)}>
                          {r.emoji} {r.count}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>

                {#if !msg.deleted && editingMsgId !== msg.id}
                  <div class="msg-actions" on:click|stopPropagation={() => {}}>
                    <button class="act-btn" title="Add reaction" on:click={e => openEmojiPicker(msg.id, e)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                    </button>
                    <button class="act-btn" title="Reply" on:click|stopPropagation={() => { replyingTo = msg; composerEl?.focus(); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                    </button>
                    {#if msg.isMe}
                      <button class="act-btn" title="Edit" on:click|stopPropagation={() => startEdit(msg)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    {/if}
                    {#if msg.isMe || isAdmin}
                      <button class="act-btn act-delete" title="Delete" on:click|stopPropagation={() => deleteMsg(msg.id)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
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
        <div class="composer-wrap" on:click|stopPropagation={() => {}}>
          {#if replyingTo}
            <div class="reply-strip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              <span class="rs-label">Replying to <strong>{replyingTo.author}</strong></span>
              <span class="rs-preview">{replyingTo.deleted ? "deleted message" : (replyingTo.content.length > 60 ? replyingTo.content.slice(0,60)+"…" : replyingTo.content)}</span>
              <button class="icon-btn" aria-label="Cancel reply" on:click={() => (replyingTo = null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          {/if}

          {#if showGifPicker}
            <div class="gif-picker" on:click|stopPropagation={() => {}}>
              <div class="gif-header">
                <input class="gif-search" bind:value={gifQuery} placeholder="Search GIFs…" on:input={onGifInput} />
                <button class="icon-btn" aria-label="Close GIF picker" on:click={() => (showGifPicker = false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              {#if gifLoading}
                <div class="gif-status">Loading…</div>
              {:else if gifs.length === 0}
                <div class="gif-status">No GIFs found.</div>
              {:else}
                <div class="gif-grid">
                  {#each gifs as g}
                    <button class="gif-item" on:click={() => sendGif(g.url)}>
                      <img src={g.preview} alt="" loading="lazy"/>
                    </button>
                  {/each}
                </div>
              {/if}
              <p class="gif-credit">Powered by Tenor</p>
            </div>
          {/if}

          <div class="composer" class:has-reply={!!replyingTo}>
            <button class="composer-icon-btn" title="GIF" on:click|stopPropagation={openGifPicker}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h3"/><path d="M14 10v4"/><path d="M8 10v4"/><path d="M8 12h2"/></svg>
            </button>
            <input class="composer-input" bind:value={newMessage} bind:this={composerEl}
              placeholder={replyingTo ? `Reply to ${replyingTo.author}…` : `Message #${selectedChannelName}`}
              on:keydown={onComposerKeydown} />
            <button class="composer-send" class:ready={!!newMessage.trim()} disabled={!newMessage.trim()} on:click={sendMessage} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      {/if}
    </main>

    <!-- ── MEMBER LIST ── -->
    <aside class="member-panel" class:hidden={!showMemberList}>
      <p class="member-header">Members — {members.length}</p>
      <div class="member-scroll">
        {#if members.filter(m => m.role === "admin").length > 0}
          <p class="member-section">ADMIN</p>
          {#each members.filter(m => m.role === "admin") as m}
            <div class="member-row">
              <div class="avatar sz32" style="background:{avatarColor(m.username)}">{initials(m.username)}</div>
              <span class="member-name">{m.username}</span>
            </div>
          {/each}
        {/if}
        {#if members.filter(m => m.role === "member").length > 0}
          <p class="member-section">MEMBERS</p>
          {#each members.filter(m => m.role === "member") as m}
            <div class="member-row">
              <div class="avatar sz32" style="background:{avatarColor(m.username)}">{initials(m.username)}</div>
              <span class="member-name">{m.username}</span>
            </div>
          {/each}
        {/if}
        {#if members.length === 0}
          <p class="member-empty">No members yet.</p>
        {/if}
      </div>
    </aside>

    <!-- Emoji picker (fixed) -->
    {#if emojiPickerMsgId}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="ep-backdrop" on:click={() => (emojiPickerMsgId = "")}></div>
      <div class="ep" style={emojiPickerStyle} on:click|stopPropagation={() => {}}>
        {#each EMOJIS as e}
          <button class="ep-btn" on:click={() => toggleReaction(emojiPickerMsgId, e)}>{e}</button>
        {/each}
      </div>
    {/if}

    <!-- Mobile sidebar overlay -->
    {#if sidebarOpen}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="overlay" on:click={() => (sidebarOpen = false)}></div>
    {/if}
  </div>
{/if}

<style>
  /* ══════════════════════════════════════
     AUTH
  ══════════════════════════════════════ */
  .auth-wrap {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1e1f22;
    padding: 16px;
  }
  .auth-card {
    width: min(480px, 100%);
    background: #313338;
    border-radius: var(--r-lg);
    padding: 32px;
    box-shadow: 0 2px 10px 0 rgba(0,0,0,.2);
  }
  .auth-logo {
    width: 80px; height: 80px;
    border-radius: 50%;
    background: var(--accent);
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    margin: 0 auto 24px;
  }
  .auth-title { margin: 0 0 8px; font-size: 24px; font-weight: 700; color: var(--t0); text-align: center; }
  .auth-sub   { margin: 0 0 20px; font-size: 16px; color: var(--t3); text-align: center; }
  .auth-toast {
    padding: 10px 14px; border-radius: var(--r-sm);
    background: rgba(242,63,67,.1); border: 1px solid rgba(242,63,67,.3);
    color: var(--err); font-size: 14px; margin-bottom: 16px;
  }
  .auth-toast-ok { background: rgba(35,165,89,.1); border-color: rgba(35,165,89,.3); color: var(--ok); }
  .auth-fields { display: flex; flex-direction: column; gap: 8px; }
  .auth-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .7px; color: var(--t2); margin-top: 12px;
  }
  .auth-input {
    width: 100%; background: #1e1f22; border: 1px solid rgba(0,0,0,.3);
    border-radius: var(--r-sm); color: var(--t0);
    padding: 10px 12px; font-size: 16px; outline: none;
    transition: border-color .15s;
  }
  .auth-input::placeholder { color: var(--t4); }
  .auth-input:focus { border-color: var(--accent); }
  .auth-btn {
    width: 100%; margin-top: 20px; padding: 11px 0;
    background: var(--accent); color: #fff; border: none;
    border-radius: var(--r-sm); font-size: 16px; font-weight: 500;
    cursor: pointer; transition: background .15s;
  }
  .auth-btn:hover { background: var(--accent-dim); }
  .auth-btn-ghost { background: var(--bg-3); color: var(--t1); margin-top: 12px; }
  .auth-btn-ghost:hover { background: #555; }
  .auth-hint { margin: 8px 0 0; font-size: 12px; color: var(--t3); text-align: center; }
  .auth-sep {
    display: flex; align-items: center; gap: 12px;
    margin: 24px 0 16px;
    color: var(--t3); font-size: 12px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .4px;
  }
  .auth-sep::before, .auth-sep::after { content: ""; flex: 1; height: 1px; background: rgba(79,84,92,.32); }

  /* ══════════════════════════════════════
     APP SHELL
  ══════════════════════════════════════ */
  .app {
    display: flex;
    height: 100vh; height: 100dvh;
    overflow: hidden;
  }

  /* ══════════════════════════════════════
     SIDEBAR
  ══════════════════════════════════════ */
  .sidebar {
    width: var(--sidebar-w);
    background: var(--bg-1);
    display: flex; flex-direction: column;
    flex-shrink: 0; overflow: hidden;
  }
  .sidebar-header {
    height: var(--header-h); padding: 0 16px;
    display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 1px 0 rgba(4,4,5,.2);
    flex-shrink: 0;
  }
  .sidebar-name { font-size: 15px; font-weight: 700; color: var(--t0); }

  /* Create channel panel */
  .create-panel {
    background: var(--bg-1); padding: 12px;
    box-shadow: 0 1px 0 rgba(4,4,5,.2); flex-shrink: 0;
    display: flex; flex-direction: column; gap: 6px;
  }
  .cp-title  { margin: 0 0 4px; font-size: 12px; font-weight: 700; color: var(--t0); }
  .cp-label  { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: var(--t2); }
  .cp-opt    { font-weight: 400; text-transform: none; letter-spacing: 0; opacity: .7; }
  .ch-input-wrap { position: relative; display: flex; align-items: center; }
  .ch-hash   { position: absolute; left: 10px; color: var(--t3); font-size: 14px; pointer-events: none; }
  .ch-padded { padding-left: 28px !important; }
  .cp-input  {
    width: 100%; background: var(--bg-0); border: none;
    border-radius: var(--r-sm); color: var(--t0);
    padding: 8px 10px; font-size: 14px; outline: none;
  }
  .cp-input::placeholder { color: var(--t4); }
  .cp-input:focus { outline: 2px solid var(--accent); outline-offset: -2px; }
  .cp-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
  .cp-btn {
    padding: 6px 14px; background: var(--accent); color: #fff;
    border: none; border-radius: var(--r-sm); font-size: 14px; font-weight: 500;
    cursor: pointer; transition: background .15s;
  }
  .cp-btn:hover { background: var(--accent-dim); }
  .cp-ghost { background: transparent; color: var(--t2); border: none; }
  .cp-ghost:hover { text-decoration: underline; }

  .channels-scroll { flex: 1; overflow-y: auto; padding: 8px 0; }

  .section-row {
    display: flex; align-items: center; gap: 6px;
    padding: 16px 8px 4px 16px;
  }
  .section-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .7px; color: var(--t3); margin: 0; padding: 16px 8px 4px 16px;
    flex: 1;
  }
  .badge {
    background: var(--err); color: #fff;
    font-size: 10px; font-weight: 700; padding: 1px 5px;
    border-radius: 999px;
  }
  .pending-row {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 8px 4px 16px; margin: 1px 8px;
    border-radius: var(--r-sm);
  }
  .pending-name { flex: 1; font-size: 14px; color: var(--t2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .approve-btn {
    background: transparent; border: 1px solid var(--ok);
    border-radius: var(--r-xs); color: var(--ok);
    font-size: 12px; font-weight: 700; padding: 2px 8px; cursor: pointer;
    transition: background .1s;
  }
  .approve-btn:hover { background: var(--ok); color: #fff; }

  .ch-row {
    display: flex; align-items: center; gap: 6px;
    margin: 1px 8px; padding: 6px 8px;
    border-radius: var(--r-sm); border: none; background: none;
    color: var(--t3); cursor: pointer; text-align: left;
    font-size: 16px; font-weight: 500; line-height: 1.375;
    transition: background .1s, color .1s;
    white-space: nowrap; overflow: hidden; width: calc(100% - 16px);
  }
  .ch-row:hover { background: rgba(79,84,92,.16); color: var(--t1); }
  .ch-active   { background: rgba(79,84,92,.32) !important; color: var(--t0) !important; }
  .ch-icon { flex-shrink: 0; }
  .ch-name { overflow: hidden; text-overflow: ellipsis; }
  .empty-hint { padding: 4px 16px; font-size: 14px; color: var(--t3); margin: 0; }

  /* User panel */
  .user-panel {
    height: var(--panel-h); padding: 0 8px;
    background: var(--bg-dark);
    display: flex; align-items: center; gap: 8px;
    flex-shrink: 0;
  }
  .user-info { flex: 1; min-width: 0; }
  .user-name { margin: 0; font-size: 14px; font-weight: 600; color: var(--t0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.25; }
  .user-tag  { margin: 0; font-size: 11px; color: var(--t3); line-height: 1.25; }
  .user-actions { display: flex; gap: 2px; }

  /* ══════════════════════════════════════
     MAIN
  ══════════════════════════════════════ */
  .main {
    flex: 1; display: flex; flex-direction: column;
    overflow: hidden; background: var(--bg-0); min-width: 0;
  }

  .ch-header {
    height: var(--header-h); padding: 0 16px;
    display: flex; align-items: center; gap: 8px;
    box-shadow: 0 1px 0 rgba(4,4,5,.2);
    background: var(--bg-0); flex-shrink: 0; overflow: hidden;
  }
  .hamburger {
    display: none; background: none; border: none;
    color: var(--t3); cursor: pointer;
    padding: 4px; border-radius: var(--r-sm); line-height: 0; flex-shrink: 0;
  }
  .hamburger:hover { color: var(--t0); }
  .header-hash { flex-shrink: 0; color: var(--t3); }
  .header-name { font-size: 16px; font-weight: 700; color: var(--t0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
  .header-pipe { width: 1px; height: 24px; background: rgba(79,84,92,.48); flex-shrink: 0; }
  .header-desc { font-size: 14px; color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .header-actions { margin-left: auto; display: flex; gap: 4px; flex-shrink: 0; }

  .toast {
    display: flex; align-items: center; gap: 8px;
    background: rgba(242,63,67,.08); border-bottom: 1px solid rgba(242,63,67,.2);
    color: var(--err); padding: 8px 16px; font-size: 14px; font-weight: 500;
    flex-shrink: 0; line-height: 1.4;
  }
  .toast-ok { background: rgba(35,165,89,.08); border-bottom-color: rgba(35,165,89,.2); color: var(--ok); }

  /* ── Messages ── */
  .messages-area {
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column;
    padding-bottom: 8px;
  }
  .empty-state {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 12px; color: var(--t3); text-align: center; padding: 32px;
  }
  .empty-state p { margin: 0; font-size: 16px; }

  .welcome { padding: 64px 16px 24px; }
  .welcome-icon {
    width: 68px; height: 68px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #fff; margin-bottom: 16px;
  }
  .welcome-title { margin: 0 0 8px; font-size: 32px; font-weight: 700; color: var(--t0); line-height: 1.1; }
  .welcome-sub   { margin: 0; font-size: 16px; color: var(--t3); }

  .no-msgs { padding: 0 16px; font-size: 14px; color: var(--t3); margin: 0; }

  .date-sep { display: flex; align-items: center; gap: 8px; margin: 24px 16px 8px; }
  .date-line  { flex: 1; height: 1px; background: rgba(79,84,92,.3); }
  .date-label { font-size: 12px; font-weight: 600; color: var(--t3); white-space: nowrap; }

  /* Message row */
  .msg-row {
    position: relative;
    display: grid;
    grid-template-columns: 40px 1fr auto;
    gap: 0 16px;
    padding: 2px 48px 2px 16px;
    transition: background .05s;
    align-items: flex-start;
  }
  .msg-row:not(.msg-grouped) { padding-top: 17px; }
  .msg-row:hover { background: rgba(2,2,5,.06); }
  .msg-editing { background: rgba(250,168,26,.05) !important; }

  /* Avatar in msg rows */
  .msg-avatar { grid-column: 1; grid-row: 1; margin-top: 1px; }
  .msg-avatar-gap {
    grid-column: 1; grid-row: 1;
    display: flex; align-items: flex-start; justify-content: flex-end;
    padding-top: 4px;
  }
  .msg-ts-hover {
    font-size: 11px; color: transparent; transition: color .1s;
    user-select: none; white-space: nowrap; line-height: 1.375;
  }
  .msg-row:hover .msg-ts-hover { color: var(--t3); }

  .msg-body { grid-column: 2; grid-row: 1; min-width: 0; }
  .msg-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
  .msg-author { font-size: 16px; font-weight: 500; color: var(--t0); line-height: 1.375; }
  .msg-ts     { font-size: 12px; color: var(--t3); line-height: 1.375; }
  .msg-text   { margin: 0; font-size: 16px; color: var(--t1); line-height: 1.375; word-break: break-word; }
  .msg-deleted { font-style: normal; color: var(--t3) !important; font-size: 14px !important; padding: 4px 10px; background: rgba(2,2,5,.06); border-radius: var(--r-sm); display: inline-block; }
  .edited-tag { font-size: 11px; color: var(--t3); margin-left: 4px; }

  /* Message text formatting */
  :global(.msg-text strong) { color: var(--t0); }
  :global(.msg-text em)     { color: var(--t1); }
  :global(.msg-text del)    { color: var(--t3); }
  :global(.msg-text code)   {
    font-family: "Consolas", "Menlo", monospace;
    font-size: 0.85em;
    background: rgba(2,2,5,.25);
    border: 1px solid rgba(2,2,5,.25);
    border-radius: 3px;
    padding: 0 4px;
    color: var(--t0);
  }
  :global(.mention) {
    color: #dee0fc;
    background: rgba(88,101,242,.2);
    border-radius: 3px;
    padding: 0 2px;
    cursor: pointer;
  }

  /* Reply reference */
  .reply-ref {
    display: flex; align-items: center; gap: 6px;
    margin-bottom: 4px; font-size: 14px; overflow: hidden;
    cursor: pointer; opacity: .85;
  }
  .reply-ref:hover { opacity: 1; }
  .reply-curve {
    width: 24px; height: 12px;
    border-top: 2px solid rgba(79,84,92,.5);
    border-left: 2px solid rgba(79,84,92,.5);
    border-radius: 6px 0 0 0;
    flex-shrink: 0; align-self: flex-end; margin-bottom: -2px;
  }
  .reply-author { font-weight: 600; color: var(--t1); white-space: nowrap; flex-shrink: 0; }
  .reply-text   { color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Reactions */
  .reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .rxn {
    display: inline-flex; align-items: center; gap: 4px;
    background: rgba(79,84,92,.16); border: 1px solid transparent;
    border-radius: var(--r-sm); padding: 2px 8px;
    font-size: 14px; cursor: pointer; color: var(--t2); transition: background .1s;
  }
  .rxn:hover { background: rgba(79,84,92,.3); border-color: rgba(79,84,92,.5); }
  .rxn-mine  { background: rgba(88,101,242,.15) !important; border-color: rgba(88,101,242,.4) !important; color: #dee0fc !important; }

  /* Image in message */
  .msg-img-wrap { margin-top: 4px; }
  .msg-img { max-width: min(400px, 100%); max-height: 300px; border-radius: var(--r-sm); display: block; object-fit: contain; }

  /* Edit box */
  .edit-box { margin-top: 2px; }
  .edit-input {
    width: 100%; background: var(--bg-2); border: none;
    border-radius: var(--r-md); color: var(--t0);
    padding: 11px 12px; font-size: 16px; line-height: 1.375;
    outline: none; resize: none; overflow: hidden;
    field-sizing: content;
  }
  .edit-input:focus { outline: 2px solid var(--accent); outline-offset: -2px; }
  .edit-hint { font-size: 12px; color: var(--t3); margin-top: 4px; display: flex; gap: 4px; }
  .edit-link { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font-size: inherit; text-decoration: underline; }

  /* Message action bar */
  .msg-actions {
    position: absolute; top: -14px; right: 12px;
    background: var(--bg-1); border: 1px solid rgba(4,4,5,.2);
    border-radius: var(--r-md); padding: 3px;
    display: flex; gap: 1px;
    opacity: 0; transition: opacity .1s;
    pointer-events: none; z-index: 1;
    box-shadow: 0 4px 12px rgba(0,0,0,.3);
  }
  .msg-row:hover .msg-actions,
  .msg-row:focus-within .msg-actions { opacity: 1; pointer-events: auto; }
  @media (hover: none) { .msg-actions { opacity: 1; pointer-events: auto; position: relative; top: auto; right: auto; background: none; border: none; box-shadow: none; padding: 4px 0 0; } }

  .act-btn {
    width: 32px; height: 32px; border: none; background: none;
    border-radius: var(--r-sm); color: var(--t3); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background .1s, color .1s;
  }
  .act-btn:hover { background: rgba(79,84,92,.3); color: var(--t0); }
  .act-delete:hover { background: rgba(242,63,67,.1); color: var(--err); }

  /* ══════════════════════════════════════
     COMPOSER
  ══════════════════════════════════════ */
  .composer-wrap {
    padding: 0 16px 16px;
    padding-bottom: max(16px, env(safe-area-inset-bottom, 16px));
    flex-shrink: 0;
  }
  .reply-strip {
    display: flex; align-items: center; gap: 8px;
    background: rgba(79,84,92,.2);
    border-radius: var(--r-md) var(--r-md) 0 0;
    padding: 6px 12px 6px 16px; font-size: 13px; overflow: hidden;
  }
  .rs-label   { flex-shrink: 0; color: var(--t2); }
  .rs-label strong { color: var(--accent); }
  .rs-preview { flex: 1; color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .composer {
    display: flex; align-items: center;
    background: var(--bg-2); border-radius: var(--r-md);
    padding: 0 12px;
  }
  .composer.has-reply { border-top-left-radius: 0; border-top-right-radius: 0; }

  .composer-icon-btn {
    background: none; border: none; cursor: pointer;
    color: var(--t3); padding: 4px 6px; border-radius: var(--r-sm);
    line-height: 0; flex-shrink: 0; transition: color .1s;
  }
  .composer-icon-btn:hover { color: var(--t0); }

  .composer-input {
    flex: 1; background: none; border: none; outline: none;
    color: var(--t0); font-size: 16px;
    padding: 11px 8px; line-height: 1.375; min-width: 0;
  }
  .composer-input::placeholder { color: var(--t4); }

  .composer-send {
    background: none; border: none; cursor: pointer;
    padding: 6px; border-radius: var(--r-sm); line-height: 0;
    flex-shrink: 0; color: var(--t3); transition: color .12s;
  }
  .composer-send:disabled { cursor: default; opacity: .3; }
  .composer-send.ready { color: var(--accent); }
  .composer-send.ready:hover { color: var(--accent-dim); }

  /* GIF picker */
  .gif-picker {
    background: var(--bg-1); border: 1px solid rgba(4,4,5,.2);
    border-bottom: none; border-radius: var(--r-md) var(--r-md) 0 0;
    display: flex; flex-direction: column; max-height: 320px; overflow: hidden;
  }
  .gif-header {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; border-bottom: 1px solid rgba(4,4,5,.2); flex-shrink: 0;
  }
  .gif-search {
    flex: 1; background: var(--bg-0); border: none;
    border-radius: var(--r-sm); color: var(--t0);
    padding: 6px 10px; font-size: 14px; outline: none;
  }
  .gif-search:focus { outline: 2px solid var(--accent); outline-offset: -2px; }
  .gif-status { padding: 24px; text-align: center; font-size: 14px; color: var(--t3); }
  .gif-grid   { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; overflow-y: auto; padding: 4px; }
  .gif-item   {
    background: var(--bg-3); border: none; border-radius: var(--r-sm);
    overflow: hidden; cursor: pointer; aspect-ratio: 1; padding: 0;
    transition: opacity .1s;
  }
  .gif-item:hover { opacity: .85; }
  .gif-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gif-credit { margin: 0; padding: 4px 12px; font-size: 11px; color: var(--t3); text-align: right; flex-shrink: 0; border-top: 1px solid rgba(4,4,5,.2); }

  /* ══════════════════════════════════════
     MEMBER PANEL
  ══════════════════════════════════════ */
  .member-panel {
    width: var(--member-w); background: var(--bg-1);
    display: flex; flex-direction: column;
    flex-shrink: 0; overflow: hidden;
    transition: width .2s ease;
  }
  .member-panel.hidden { width: 0; }
  .member-header {
    margin: 0; padding: 24px 8px 8px 16px;
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .7px; color: var(--t3);
    white-space: nowrap; overflow: hidden;
    flex-shrink: 0;
  }
  .member-scroll { flex: 1; overflow-y: auto; padding: 4px 0; }
  .member-section {
    margin: 0; padding: 16px 8px 4px 16px;
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: var(--t3);
  }
  .member-row {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 8px 6px 12px; margin: 1px 8px;
    border-radius: var(--r-sm); cursor: pointer; transition: background .1s;
  }
  .member-row:hover { background: rgba(79,84,92,.16); }
  .member-name { font-size: 15px; font-weight: 400; color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .member-empty { padding: 8px 16px; font-size: 13px; color: var(--t3); margin: 0; }

  /* ══════════════════════════════════════
     SHARED / UTILITIES
  ══════════════════════════════════════ */
  .avatar {
    border-radius: 50%; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; text-transform: uppercase; flex-shrink: 0;
  }
  .sz16 { width: 16px; height: 16px; font-size: 8px; }
  .sz24 { width: 24px; height: 24px; font-size: 10px; }
  .sz32 { width: 32px; height: 32px; font-size: 13px; }
  .sz40 { width: 40px; height: 40px; font-size: 15px; }

  .icon-btn {
    background: none; border: none; color: var(--t3); cursor: pointer;
    padding: 4px; border-radius: var(--r-sm); line-height: 0;
    flex-shrink: 0; transition: color .1s;
  }
  .icon-btn:hover { color: var(--t0); }

  /* ══════════════════════════════════════
     EMOJI PICKER (fixed)
  ══════════════════════════════════════ */
  .ep-backdrop { position: fixed; inset: 0; z-index: 199; background: transparent; }
  .ep {
    position: fixed; z-index: 200;
    background: var(--bg-float); border: 1px solid rgba(4,4,5,.3);
    border-radius: var(--r-lg); padding: 6px;
    display: flex; flex-wrap: wrap; gap: 2px; width: 232px;
    box-shadow: 0 8px 16px rgba(0,0,0,.5);
  }
  .ep-btn {
    width: 36px; height: 36px; border: none; background: none;
    border-radius: var(--r-sm); font-size: 18px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background .08s;
  }
  .ep-btn:hover { background: rgba(79,84,92,.3); }

  /* Mobile overlay */
  .overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.7); z-index: 9;
  }

  /* ══════════════════════════════════════
     RESPONSIVE / MOBILE
  ══════════════════════════════════════ */
  @media (max-width: 720px) {
    :root {
      --sidebar-w: 260px;
      --member-w:  220px;
    }
    .hamburger { display: flex; }

    .sidebar {
      position: fixed; left: 0; top: 0; bottom: 0;
      z-index: 10;
      transform: translateX(-100%);
      transition: transform .22s ease;
    }
    .app.sidebar-open .sidebar { transform: translateX(0); }
    .app.sidebar-open .overlay { display: block; }

    .member-panel { display: none; }

    .msg-row { padding: 2px 12px 2px 12px; }
    .msg-row:not(.msg-grouped) { padding-top: 17px; }
    .msg-body { grid-column: 2; }
    .welcome { padding: 32px 12px 16px; }
    .date-sep { margin: 16px 12px 8px; }
    .composer-wrap { padding: 0 8px 8px; padding-bottom: max(8px, env(safe-area-inset-bottom, 8px)); }
    .gif-grid { grid-template-columns: repeat(3, 1fr); }
    .msg-actions { opacity: 1; pointer-events: auto; position: relative; top: auto; right: auto; background: none; border: none; box-shadow: none; padding: 4px 0 0; }
    .welcome-title { font-size: 24px; }
  }

  @media (max-width: 480px) {
    .msg-row { grid-template-columns: 32px 1fr; }
    .sz40 { width: 32px; height: 32px; font-size: 12px; }
    .gif-grid { grid-template-columns: repeat(2, 1fr); }
    .auth-card { padding: 20px; }
  }
</style>
