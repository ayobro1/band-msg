<slot />

<style>
  :global(:root) {
    --bg-base: #07101f;
    --bg-surface: rgba(13, 22, 42, 0.78);
    --bg-surface-hover: rgba(20, 33, 61, 0.82);
    --bg-input: rgba(8, 16, 34, 0.7);
    --border: rgba(148, 163, 184, 0.15);
    --border-focus: #3b82f6;
    --accent: #3b82f6;
    --accent-hover: #2563eb;
    --accent-glow: rgba(59, 130, 246, 0.25);
    --text-primary: #f1f5f9;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    --radius-lg: 18px;
    --radius-md: 12px;
    --radius-sm: 8px;
    --shadow-lg: 0 24px 64px rgba(2, 6, 23, 0.5);
    --shadow-sm: 0 2px 12px rgba(2, 6, 23, 0.3);
  }

  :global(body) {
    margin: 0;
    font-family: "Inter", system-ui, -apple-system, sans-serif;
    background:
      radial-gradient(ellipse 1400px 700px at 15% -5%, #0f2044 0%, transparent 55%),
      radial-gradient(ellipse 900px 600px at 85% 5%, #1a1060 0%, transparent 55%),
      radial-gradient(ellipse 600px 400px at 50% 100%, #0c1a30 0%, transparent 60%),
      var(--bg-base);
    color: var(--text-primary);
    min-height: 100vh;
    line-height: 1.55;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(button),
  :global(input),
  :global(textarea) {
    font: inherit;
  }
</style>
