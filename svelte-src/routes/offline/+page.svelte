<div class="offline">
  <div class="icon">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <circle cx="12" cy="20" r="1"/>
    </svg>
  </div>
  <h1>You're offline</h1>
  <p>Band Chat needs a connection to load. Check your internet and try again.</p>
  <button on:click={() => location.reload()}>Try again</button>
</div>

<style>
  .offline {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    background: #313338;
    color: #dbdee1;
    padding: 2rem;
    text-align: center;
    font-family: "gg sans", system-ui, sans-serif;
  }
  .icon { color: #80848e; margin-bottom: 0.5rem; }
  h1 { margin: 0; font-size: 1.5rem; font-weight: 700; color: #f2f3f5; }
  p { margin: 0; font-size: 1rem; color: #80848e; max-width: 320px; }
  button {
    margin-top: 0.5rem;
    padding: 0.625rem 1.5rem;
    background: #5865f2;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
  }
  button:hover { background: #4752c4; }
</style>
