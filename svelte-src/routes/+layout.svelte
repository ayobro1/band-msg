<script>
  import { inject } from '@vercel/analytics';
  import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
  import './app.css';
  
  // Initialize Vercel Analytics
  inject();
  
  // Initialize Vercel Speed Insights
  injectSpeedInsights();
</script>

<slot />
