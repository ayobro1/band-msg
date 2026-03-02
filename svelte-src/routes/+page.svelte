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

<main>
  <h1>Band Chat · Svelte + Convex</h1>

  {#if !me}
    <section>
      <h2>Login</h2>
      <input bind:value={loginUsername} placeholder="Username" />
      <input bind:value={loginPassword} type="password" placeholder="Password" />
      <button on:click={login}>Sign in</button>
    </section>

    <section>
      <h2>Register</h2>
      <input bind:value={registerUsername} placeholder="Username" />
      <input bind:value={registerPassword} type="password" placeholder="Password (12+ chars)" />
      <button on:click={register}>Create account</button>
    </section>
  {:else}
    <section>
      <p>Signed in as <strong>{me.username}</strong> ({me.role})</p>
      <button on:click={logout}>Logout</button>
    </section>

    {#if me.role === "admin"}
      <section>
        <h2>Create channel</h2>
        <input bind:value={newChannel} placeholder="channel-name" />
        <input bind:value={newChannelDescription} placeholder="description" />
        <button on:click={createChannel}>Create</button>
      </section>
    {/if}

    <section>
      <h2>Channels</h2>
      {#if channels.length === 0}
        <p>No channels yet.</p>
      {/if}
      {#each channels as channel}
        <button on:click={() => selectChannel(channel)}>#{channel.name}</button>
      {/each}
    </section>

    <section>
      <h2>Messages {selectedChannelName ? `in #${selectedChannelName}` : ""}</h2>
      {#each messages as msg}
        <p><strong>{msg.author}</strong>: {msg.content}</p>
      {/each}
      <input bind:value={newMessage} placeholder="Message" />
      <button on:click={sendMessage}>Send</button>
    </section>
  {/if}

  {#if error}
    <p>{error}</p>
  {/if}
</main>
