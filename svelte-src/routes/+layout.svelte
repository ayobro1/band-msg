<slot />

<style>

  :global(html), :global(body) {
    height: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    background: #313338;
    color: #dbdee1;
    font-family: 'gg sans', 'Helvetica Neue', Arial, Helvetica, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.6;
    -webkit-overflow-scrolling: touch;
  }

  /* Safe area for iOS notch/Dynamic Island */
  @supports (padding-top: max(env(safe-area-inset-top), 0px)) {
    :global(body) {
      padding-top: max(env(safe-area-inset-top), 0px);
      padding-bottom: max(env(safe-area-inset-bottom), 0px);
      padding-left: max(env(safe-area-inset-left), 0px);
      padding-right: max(env(safe-area-inset-right), 0px);
    }
  }

  :global(body > div) {
    height: 100%;
    min-height: 100vh;
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(button),
  :global(input) {
    font: inherit;
  }

  :global(:root) {
    /* Discord-like color scheme */
    --bg-root:       #313338;
    --bg-surface:    #2b2d31;
    --bg-surface-2:  #1e1f22;
    --bg-elevated:   #1e1f22;
    --bg-base-primary: #313338;
    --bg-base-secondary: #2b2d31;
    --bg-base-tertiary: #1e1f22;
    --bg-modifier-hover: rgba(79,84,92,0.16);
    --bg-modifier-active: rgba(79,84,92,0.24);
    --bg-modifier-selected: rgba(79,84,92,0.32);

    --header-primary: #f2f3f5;
    --header-secondary: #b5bac1;
    --text-normal: #dbdee1;
    --text-muted: #949ba4;
    --text-link: #00a8fc;
    --text-positive: #00ba7c;
    --text-warning: #faa81a;
    --text-danger: #fa7777;

    --interactive-normal: #b5bac1;
    --interactive-hover: #dbdee1;
    --interactive-active: #ffffff;
    --interactive-muted: #6d6f78;

    --background-primary: #313338;
    --background-secondary: #2b2d31;
    --background-secondary-alt: #1e1f22;
    --background-tertiary: #1e1f22;
    --background-accent: #5865f2;
    --background-floating: #111214;
    --background-modifier-hover: rgba(79,84,92,0.16);
    --background-modifier-selected: rgba(79,84,92,0.32);
    --background-message-hover: rgba(4,4,5,0.07);

    --brand-experiment: #5865f2;
    --brand-experiment-500: #5865f2;
    --brand-experiment-600: #3f45ba;

    --primary-100: #f2f3f5;
    --primary-200: #e3e5e8;
    --primary-300: #c7c9cd;
    --primary-400: #949ba4;
    --primary-500: #80848e;
    --primary-600: #6d6f78;
    --primary-630: #5e606b;
    --primary-660: #585a66;
    --primary-700: #42454a;
    --primary-800: #2e3035;
    --primary-830: #2b2d31;

    --green-360: #23a559;
    --green-400: #00d66f;
    --green-500: #00ba7c;

    --red-400: #f45768;
    --red-500: #f04054;

    --yellow-500: #ffc80f;

    --border-base: #1e1f22;
    --border-strong: rgba(255,255,255,0.16);
    --border-subtle: rgba(255,255,255,0.08);
    --border-faint: rgba(255,255,255,0.04);
    --border-hover: rgba(255,255,255,0.12);
    --border-focused: #5865f2;

    --online: #23a559;
    --idle: #f0b232;
    --dnd: #f23f43;
    --offline: #80848e;

    --radius-xs: 4px;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
    --radius-full: 9999px;

    --elevation-low: 0 1px 0 rgba(4,4,5,0.2), 0 1.5px 0 rgba(6,6,7,0.05), 0 2px 0 rgba(4,4,5,0.05);
    --elevation-medium: 0 4px 4px rgba(0,0,0,0.16);
    --elevation-high: 0 8px 16px rgba(0,0,0,0.24);
  }

  /* Custom Scrollbar - Discord style */
  :global(::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
  }

  :global(::-webkit-scrollbar-track) {
    background: var(--bg-base-tertiary);
    border-radius: 4px;
  }

  :global(::-webkit-scrollbar-thumb) {
    background: var(--primary-600);
    border-radius: 4px;
  }

  :global(::-webkit-scrollbar-thumb:hover) {
    background: var(--primary-500);
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
