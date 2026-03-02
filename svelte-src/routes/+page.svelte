<script lang="ts">
  import { onMount } from "svelte";

  type User = { username: string; role: "admin" | "member"; status: "approved" | "pending" };
  type Channel = { id: string; name: string; description: string };
  type Message = { id: string; author: string; content: string; createdAt: number };

  let me: User | null = null;
  let channels: Channel[] = [];
  let messages: Message[] = [];
  let selectedChannelId = "";
  let selectedChannelName = "";

  let registerUsername = "";
  let registerPassword = "";
  let loginUsername = "";
  let loginPassword = "";
  let newMessage = "";
  let newChannel = "";
  let newChannelDescription = "";
  let error = "";

  $: isAuthenticated = !!me;

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
      selectedChannelId = channels[0].id;
      selectedChannelName = channels[0].name;
      await refreshMessages();
    }
  }

  async function refreshMessages() {
    if (!selectedChannelId) return;
    const res = await fetch(`/api/messages?channelId=${encodeURIComponent(selectedChannelId)}`);
    if (!res.ok) return;
    messages = await res.json();
  }

  async function register() {
    error = "";
    const res = await apiPost("/api/auth/register", {
      username: registerUsername,
      password: registerPassword
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Registration failed" }));
      error = body.error;
      return;
    }

    registerUsername = "";
    registerPassword = "";
    error = "Registered successfully. First user is auto-approved admin.";
  }

  async function login() {
    error = "";
    const res = await apiPost("/api/auth/login", {
      username: loginUsername,
      password: loginPassword
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Login failed" }));
      error = body.error;
      return;
    }

    loginPassword = "";
    await refreshMe();
    await refreshChannels();
  }

  async function logout() {
    await apiPost("/api/auth/logout", {});
    me = null;
    channels = [];
    messages = [];
    selectedChannelId = "";
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
      error = body.error;
      return;
    }
    newChannel = "";
    newChannelDescription = "";
    await refreshChannels();
  }

  async function selectChannel(channel: Channel) {
    selectedChannelId = channel.id;
    selectedChannelName = channel.name;
    await refreshMessages();
  }

  onMount(async () => {
    await refreshMe();
    await refreshChannels();
    setInterval(() => {
      refreshMessages();
    }, 3000);
  });
</script>

<main class="app-shell">
  <header class="topbar card">
    <div>
      <p class="eyebrow">Band Messaging</p>
      <h1>Svelte + Convex Chat</h1>
    </div>
    {#if isAuthenticated}
      <div class="user-chip">
        <div>
          <p class="chip-user">{me?.username}</p>
          <p class="chip-role">{me?.role}</p>
        </div>
        <button class="btn btn-ghost" on:click={logout}>Logout</button>
      </div>
    {/if}
  </header>

  {#if error}
    <section class="alert" role="alert">
      {error}
    </section>
  {/if}

  {#if !isAuthenticated}
    <section class="auth-grid">
      <article class="card form-card">
        <h2>Sign in</h2>
        <p class="muted">Jump back into your channels.</p>
        <input class="input" bind:value={loginUsername} placeholder="Username" autocomplete="username" />
        <input class="input" bind:value={loginPassword} type="password" placeholder="Password" autocomplete="current-password" />
        <button class="btn" on:click={login}>Sign in</button>
      </article>

      <article class="card form-card">
        <h2>Create account</h2>
        <p class="muted">First account becomes admin automatically.</p>
        <input class="input" bind:value={registerUsername} placeholder="Username" autocomplete="username" />
        <input class="input" bind:value={registerPassword} type="password" placeholder="Password (12+ chars)" autocomplete="new-password" />
        <button class="btn" on:click={register}>Register</button>
      </article>
    </section>
  {:else}
    <section class="chat-grid">
      <aside class="card sidebar">
        {#if me?.role === "admin"}
          <div class="admin-box">
            <h2>Create channel</h2>
            <input class="input" bind:value={newChannel} placeholder="channel-name" />
            <input class="input" bind:value={newChannelDescription} placeholder="description" />
            <button class="btn" on:click={createChannel}>Create</button>
          </div>
        {/if}

        <div class="channel-box">
          <h2>Channels</h2>
          {#if channels.length === 0}
            <p class="muted">No channels yet.</p>
          {/if}
          <div class="channel-list">
            {#each channels as channel}
              <button
                class="channel-item"
                class:active={channel.id === selectedChannelId}
                on:click={() => selectChannel(channel)}
              >
                <span>#{channel.name}</span>
                {#if channel.description}
                  <small>{channel.description}</small>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      </aside>

      <section class="card messages-panel">
        <header class="messages-header">
          <h2>{selectedChannelName ? `#${selectedChannelName}` : "Select a channel"}</h2>
          <p class="muted">{messages.length} message{messages.length === 1 ? "" : "s"}</p>
        </header>

        <div class="messages-list">
          {#if messages.length === 0}
            <p class="muted">No messages yet. Say hello 👋</p>
          {:else}
            {#each messages as msg}
              <article class="message-item">
                <div class="message-meta">
                  <strong>{msg.author}</strong>
                  <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p>{msg.content}</p>
              </article>
            {/each}
          {/if}
        </div>

        <footer class="composer">
          <input
            class="input"
            bind:value={newMessage}
            placeholder={selectedChannelId ? "Write a message..." : "Select a channel to chat"}
            disabled={!selectedChannelId}
            on:keydown={(event) => event.key === "Enter" && sendMessage()}
          />
          <button class="btn" on:click={sendMessage} disabled={!selectedChannelId || !newMessage.trim()}>Send</button>
        </footer>
      </section>
    </section>
  {/if}
</main>

<style>
  .app-shell {
    width: min(1100px, 94vw);
    margin: 2rem auto;
    display: grid;
    gap: 1rem;
  }

  .card {
    background: rgba(15, 23, 42, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 16px;
    backdrop-filter: blur(6px);
    box-shadow: 0 20px 60px rgba(2, 6, 23, 0.35);
  }

  .topbar {
    padding: 1.1rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .topbar h1 {
    margin: 0;
    font-size: clamp(1.25rem, 2.2vw, 1.6rem);
    color: #f8fafc;
  }

  .eyebrow {
    margin: 0 0 0.2rem;
    color: #93c5fd;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.74rem;
    font-weight: 700;
  }

  .user-chip {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    background: rgba(15, 23, 42, 0.65);
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 999px;
    padding: 0.4rem 0.5rem 0.4rem 0.8rem;
  }

  .chip-user,
  .chip-role {
    margin: 0;
    line-height: 1.2;
  }

  .chip-user {
    font-size: 0.9rem;
    color: #e2e8f0;
  }

  .chip-role {
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #93c5fd;
  }

  .alert {
    background: rgba(127, 29, 29, 0.7);
    border: 1px solid rgba(252, 165, 165, 0.35);
    color: #fecaca;
    border-radius: 12px;
    padding: 0.8rem 1rem;
    font-weight: 600;
  }

  .auth-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .form-card {
    padding: 1.2rem;
    display: grid;
    gap: 0.75rem;
  }

  .form-card h2,
  .sidebar h2,
  .messages-panel h2 {
    margin: 0;
    font-size: 1rem;
    color: #f8fafc;
  }

  .muted {
    margin: 0;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .chat-grid {
    display: grid;
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
    gap: 1rem;
    min-height: 65vh;
  }

  .sidebar {
    padding: 1rem;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 1rem;
  }

  .admin-box,
  .channel-box {
    display: grid;
    gap: 0.65rem;
  }

  .channel-list {
    display: grid;
    gap: 0.45rem;
    align-content: start;
    max-height: 46vh;
    overflow: auto;
    padding-right: 0.25rem;
  }

  .channel-item {
    width: 100%;
    text-align: left;
    padding: 0.7rem 0.8rem;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(30, 41, 59, 0.55);
    color: #e2e8f0;
    display: grid;
    gap: 0.2rem;
    cursor: pointer;
  }

  .channel-item small {
    color: #94a3b8;
    font-size: 0.75rem;
  }

  .channel-item.active,
  .channel-item:hover {
    border-color: rgba(96, 165, 250, 0.8);
    background: rgba(30, 58, 138, 0.55);
  }

  .messages-panel {
    padding: 1rem;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 0.8rem;
  }

  .messages-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .messages-list {
    overflow: auto;
    padding: 0.2rem 0.1rem;
    display: grid;
    gap: 0.55rem;
    align-content: start;
  }

  .message-item {
    padding: 0.65rem 0.75rem;
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.2);
  }

  .message-item p {
    margin: 0.25rem 0 0;
    color: #e5e7eb;
    word-break: break-word;
  }

  .message-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .message-meta strong {
    color: #bfdbfe;
  }

  .message-meta span {
    color: #94a3b8;
    font-size: 0.74rem;
  }

  .composer {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.65rem;
  }

  .input {
    width: 100%;
    border: 1px solid rgba(148, 163, 184, 0.24);
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.66);
    color: #f1f5f9;
    padding: 0.65rem 0.75rem;
    outline: none;
  }

  .input::placeholder {
    color: #94a3b8;
  }

  .input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.22);
  }

  .btn {
    border: 0;
    border-radius: 10px;
    background: linear-gradient(135deg, #2563eb, #3b82f6);
    color: #eff6ff;
    font-weight: 700;
    padding: 0.62rem 0.95rem;
    cursor: pointer;
    transition: filter 0.15s ease;
  }

  .btn:hover {
    filter: brightness(1.07);
  }

  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.58;
    filter: none;
  }

  .btn-ghost {
    background: rgba(30, 41, 59, 0.75);
    border: 1px solid rgba(148, 163, 184, 0.4);
    padding-inline: 0.8rem;
  }

  @media (max-width: 940px) {
    .auth-grid,
    .chat-grid {
      grid-template-columns: 1fr;
    }

    .messages-panel {
      min-height: 55vh;
    }

    .topbar {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
