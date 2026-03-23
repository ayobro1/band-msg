<script>
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { inject } from '@vercel/analytics';
  import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
  import './app.css';

  function shouldEnableVercelClientScripts() {
    if (!browser) return false;

    const { hostname } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    const isPrivateIp =
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

    return !isLocalHost && !isPrivateIp;
  }

  onMount(() => {
    if (!shouldEnableVercelClientScripts()) {
      return;
    }

    inject();
    injectSpeedInsights();
  });
</script>

<slot />
