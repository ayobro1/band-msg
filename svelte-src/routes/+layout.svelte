<slot />

<style>
  :global(:root) {
    /* ── Discord exact dark palette ── */
    --bg-0:       #313338;   /* main chat                */
    --bg-1:       #2b2d31;   /* sidebar / member panel   */
    --bg-2:       #383a40;   /* inputs / elevated        */
    --bg-3:       #404249;   /* higher elevation         */
    --bg-dark:    #232428;   /* user panel               */
    --bg-darker:  #1e1f22;   /* member panel header bg   */
    --bg-float:   #111214;   /* popovers / tooltips      */

    --separator: rgba(4,4,5,0.2);

    /* Text scale */
    --t0: #f2f3f5;     /* primary   */
    --t1: #dbdee1;     /* secondary */
    --t2: #b5bac1;     /* interactive / muted */
    --t3: #80848e;     /* tertiary  */
    --t4: #4e5058;     /* placeholder */

    /* Accent (blurple) */
    --accent:     #5865f2;
    --accent-dim: #4752c4;

    /* Semantic */
    --err:  #f23f43;
    --ok:   #23a559;

    /* Layout */
    --sidebar-w:  240px;
    --member-w:   240px;
    --header-h:   48px;
    --panel-h:    52px;

    /* Shape */
    --r-xs: 3px;
    --r-sm: 4px;
    --r-md: 8px;
    --r-lg: 12px;
  }

  :global(body) {
    margin: 0;
    font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
    background: var(--bg-0);
    color: var(--t1);
    line-height: 1.375;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow: hidden;
  }

  :global(*) { box-sizing: border-box; }
  :global(button), :global(input), :global(textarea) { font: inherit; }

  /* Thin Discord-style scrollbar */
  :global(::-webkit-scrollbar) { width: 8px; height: 8px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) {
    background: var(--bg-float);
    border-radius: 4px;
  }
  :global(::-webkit-scrollbar-thumb:hover) { background: #0d0e10; }
  :global(::-webkit-scrollbar-corner) { background: transparent; }
</style>
