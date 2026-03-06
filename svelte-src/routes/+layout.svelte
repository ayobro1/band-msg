<slot />

<style>
  :global(html), :global(body) {
    height: 100%;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    background: var(--bg-root);
    color: var(--text-body);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.6;
    overflow: hidden;
    -webkit-overflow-scrolling: touch;
  }

  :global(body > div) {
    height: 100%;
    height: 100dvh;
    width: 100%;
    overflow: hidden;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(button),
  :global(input) {
    font: inherit;
  }

  :global(:root) {
    --bg-root:       #09090B;
    --bg-surface:    #0F0F12;
    --bg-elevated:   #18181B;
    --bg-hover:      #27272A;
    --bg-active:     #303033;
    --bg-inset:      #0C0C0E;

    --border:        rgba(255,255,255,0.07);
    --border-subtle: rgba(255,255,255,0.04);
    --border-hover:  rgba(255,255,255,0.12);
    --border-focus:  #3B82F6;

    --text-primary:  #FAFAFA;
    --text-body:     #D4D4D8;
    --text-secondary:#A1A1AA;
    --text-muted:    #71717A;

    --accent:        #3B82F6;
    --accent-hover:  #2563EB;
    --accent-subtle: rgba(59,130,246,0.10);
    --accent-text:   #93C5FD;

    --success:       #22C55E;
    --success-subtle:rgba(34,197,94,0.10);
    --error:         #EF4444;
    --error-subtle:  rgba(239,68,68,0.10);
    --warning:       #EAB308;

    --online:        #22C55E;
    --idle:          #EAB308;
    --dnd:           #EF4444;
    --offline:       #52525B;

    --radius-sm:     6px;
    --radius-md:     10px;
    --radius-lg:     14px;
    --radius-xl:     18px;
    --radius-full:   9999px;
  }

  :global(html), :global(body) {
    height: 100%;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    background: var(--bg-root);
    color: var(--text-body);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.6;
    overflow: hidden;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  :global(body > div) {
    height: 100%;
    height: 100dvh;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(button),
  :global(input) {
    font: inherit;
  }

  /* Custom Scrollbar */
  :global(::-webkit-scrollbar) {
    width: 6px;
  }

  :global(::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(::-webkit-scrollbar-thumb) {
    background: var(--bg-hover);
    border-radius: 3px;
  }

  :global(::-webkit-scrollbar-thumb:hover) {
    background: #3F3F46;
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    :global(*),
    :global(*::before),
    :global(*::after) {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
