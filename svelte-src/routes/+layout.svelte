<slot />

<style>
  :global(html) {
    height: 100%;
    overflow-y: auto;
  }

  :global(body) {
    margin: 0;
    font-family: Inter, system-ui, -apple-system, sans-serif;
    background:
      radial-gradient(1200px 600px at 10% -10%, #1e293b 0%, transparent 60%),
      radial-gradient(900px 500px at 90% 0%, #1d4ed8 0%, transparent 60%),
      #0b1120;
    color: #e5e7eb;
    min-height: 100vh;
    line-height: 1.5;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(button),
  :global(input) {
    font: inherit;
  }
</style>
