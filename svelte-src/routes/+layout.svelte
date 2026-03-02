<slot />

<style>
  :global(:root) {
    --sidebar-bg: #2b2d31;
    --sidebar-channel-bg: #1e1f22;
    --main-bg: #313338;
    --input-bg: #383a40;
    --surface: #2b2d31;
    --surface-raised: #383a40;
    --border: rgba(255,255,255,0.06);
    --accent: #5865f2;
    --accent-hover: #4752c4;
    --green: #23a55a;
    --red: #f23f43;
    --yellow: #f0b132;
    --text-1: #f2f3f5;
    --text-2: #b5bac1;
    --text-3: #80848e;
    --text-muted: #6d6f78;
    --msg-hover: rgba(4,4,5,0.07);
    --radius: 4px;
    --radius-lg: 8px;
  }

  :global(body) {
    margin: 0;
    font-family: "Inter", "gg sans", system-ui, -apple-system, sans-serif;
    background: var(--main-bg);
    color: var(--text-2);
    min-height: 100vh;
    line-height: 1.375;
    -webkit-font-smoothing: antialiased;
  }

  :global(*) { box-sizing: border-box; }

  :global(button), :global(input), :global(textarea) { font: inherit; }

  :global(::-webkit-scrollbar) { width: 8px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) {
    background: #1a1b1e;
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: content-box;
  }
</style>
