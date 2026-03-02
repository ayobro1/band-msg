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
  let toastMessage = "";
  let toastType: "error" | "success" = "error";
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  $: isAuthenticated = !!me;

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
    const res = await apiPost("/api/auth/register", {
      username: registerUsername,
      password: registerPassword
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Registration failed" }));
      showToast(body.error || "Registration failed", "error");
      return;
    }

    registerUsername = "";
    registerPassword = "";
    showToast("Registered successfully.", "success");
  }

  async function login() {
    const res = await apiPost("/api/auth/login", {
      username: loginUsername,
      password: loginPassword
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Login failed" }));
      showToast(body.error || "Login failed", "error");
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
      showToast(body.error || "Create channel failed", "error");
      return;
    }
    newChannel = "";
    newChannelDescription = "";
    showToast("Channel created.", "success");
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

<main class="discord-app">
  {#if !isAuthenticated}
    <section class="auth-shell">
      <article class="auth-card">
        <h1>Welcome back</h1>
        <p>Sign in to continue chatting.</p>
        <input class="field" bind:value={loginUsername} placeholder="Username" autocomplete="username" />
        <input class="field" bind:value={loginPassword} type="password" placeholder="Password" autocomplete="current-password" />
        <button class="primary-btn" on:click={login}>Log In</button>
      </article>

      <article class="auth-card">
        <h2>Create account</h2>
        <p>First account becomes admin.</p>
        <input class="field" bind:value={registerUsername} placeholder="Username" autocomplete="username" />
        <input class="field" bind:value={registerPassword} type="password" placeholder="Password (12+ chars)" autocomplete="new-password" />
        <button class="primary-btn" on:click={register}>Register</button>
      </article>
    </section>
  {:else}
    <section class="chat-shell">
      <aside class="server-rail">
        <div class="server-pill active">BM</div>
      </aside>

      <aside class="channel-sidebar">
        <header class="sidebar-header">
          <h2>Band Chat</h2>
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
          <p class="section-title">Channels</p>
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
          <div>
            <strong>{me?.username}</strong>
            <p>{me?.role}</p>
          </div>
          <button class="ghost-btn" on:click={logout}>Logout</button>
        </footer>
      </aside>

      <section class="chat-main">
        <header class="chat-header">
          <h3>{selectedChannelName ? `#${selectedChannelName}` : "Select a channel"}</h3>
        </header>

        <div class="messages-scroll">
          {#if messages.length === 0}
            <p class="empty-state">No messages yet.</p>
          {:else}
            {#each messages as msg}
              <article class="message-row">
                <div class="avatar">{msg.author.slice(0, 1).toUpperCase()}</div>
                <div class="message-content">
                  <div class="message-head">
                    <strong>{msg.author}</strong>
                    <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p>{msg.content}</p>
                </div>
              </article>
            {/each}
          {/if}
        </div>

        <footer class="composer">
          <input
            class="field"
            bind:value={newMessage}
            placeholder={selectedChannelId ? `Message #${selectedChannelName || "channel"}` : "Select a channel to chat"}
            disabled={!selectedChannelId}
            on:keydown={(event) => event.key === "Enter" && sendMessage()}
          />
          <button class="primary-btn" on:click={sendMessage} disabled={!selectedChannelId || !newMessage.trim()}>Send</button>
        </footer>
      </section>
    </section>
  {/if}

  {#if toastMessage}
    <section class="toast" class:error={toastType === "error"} class:success={toastType === "success"} role="status">
      {toastMessage}
    </section>
  {/if}
</main>

<style>
  .discord-app {
    min-height: 100vh;
    padding: 1rem;
    display: grid;
    gap: 0.85rem;
    background: #313338;
  }

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

  .chat-shell {
    min-height: calc(100vh - 2rem);
    display: grid;
    grid-template-columns: 72px 280px minmax(0, 1fr);
    gap: 0;
    border-radius: 10px;
    overflow: hidden;
  }

  .server-rail {
    background: #1e1f22;
    padding: 0.75rem 0;
    display: grid;
    align-content: start;
    justify-content: center;
  }

  .server-pill {
    width: 48px;
    height: 48px;
    border-radius: 16px;
    background: #5865f2;
    color: #fff;
    display: grid;
    place-items: center;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

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
  }

  .messages-scroll {
    overflow: auto;
    padding: 1rem;
    display: grid;
    gap: 0.8rem;
    align-content: start;
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

  .message-content p {
    margin: 0.15rem 0 0;
    color: #dbdee1;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .composer {
    padding: 0 1rem 1rem;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.6rem;
  }

  .field {
    width: 100%;
    border: 1px solid #1e1f22;
    background: #1e1f22;
    color: #f2f3f5;
    border-radius: 8px;
    padding: 0.62rem 0.72rem;
    outline: none;
  }

  .field:focus {
    border-color: #5865f2;
  }

  .field::placeholder {
    color: #949ba4;
  }

  .field:disabled {
    opacity: 0.65;
  }

  .primary-btn,
  .ghost-btn {
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    padding: 0.62rem 0.86rem;
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

  .empty-state {
    color: #949ba4;
    margin: 0;
    font-size: 0.88rem;
  }

  @media (max-width: 980px) {
    .auth-shell {
      grid-template-columns: 1fr;
    }

    .chat-shell {
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
  }
</style>
