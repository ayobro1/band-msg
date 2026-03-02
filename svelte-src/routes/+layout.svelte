<slot />

<style>
  :global(:root) {
    /* ── Discord dark theme ─────────────────────── */
    --bg-0:        #313338;   /* main chat area          */
    --bg-1:        #2b2d31;   /* sidebar                 */
    --bg-2:        #383a40;   /* inputs / raised surface */
    --bg-3:        #4e5058;   /* accent / hover chips    */
    --bg-tertiary: #1e1f22;   /* user panel / darkest    */
    --bg-floating: #111214;   /* tooltips / popups       */

    --separator: rgba(6,6,7,0.36);
    --fill:      rgba(79,84,92,0.16);

    /* Text */
    --text-primary:     #f2f3f5;
    --text-secondary:   #dbdee1;
    --text-tertiary:    #80848e;
    --text-placeholder: #4e5058;
    --text-interactive: #b5bac1;

    /* Semantic */
    --color-error:   #f23f43;
    --color-success: #23a559;

    /* Discord blurple */
    --accent:       #5865f2;
    --accent-hover: #4752c4;

    /* Selection tints */
    --tint:        rgba(4,4,5,0.07);
    --tint-strong: rgba(79,84,92,0.32);

    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
  }

  :global(body) {
    margin: 0;
    font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
    background: var(--bg-0);
    color: var(--text-secondary);
    min-height: 100vh;
    min-height: 100svh;
    line-height: 1.375;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :global(*) { box-sizing: border-box; }
  :global(button), :global(input), :global(textarea) { font: inherit; }

  :global(::-webkit-scrollbar) { width: 8px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) {
    background: var(--bg-tertiary);
    border-radius: 4px;
  }
  :global(::-webkit-scrollbar-thumb:hover) { background: #1a1b1e; }
</style>
