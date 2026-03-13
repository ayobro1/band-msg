<script lang="ts">
  type SocialProvider = 'google' | 'facebook' | 'apple';
  type Theme = 'gray' | 'white' | 'black';
  
  export let social: SocialProvider;
  export let theme: Theme = 'gray';
  export let disabled = false;
  
  const icons = {
    google: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z" fill="#4285F4"/>
      <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853"/>
      <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
      <path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z" fill="#EA4335"/>
    </svg>`,
    facebook: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 9C18 4.02944 13.9706 0 9 0C4.02944 0 0 4.02944 0 9C0 13.4922 3.29115 17.2155 7.59375 17.8907V11.6016H5.30859V9H7.59375V7.01719C7.59375 4.76156 8.93742 3.51562 10.9932 3.51562C11.9776 3.51562 13.0078 3.69141 13.0078 3.69141V5.90625H11.8729C10.755 5.90625 10.4062 6.60001 10.4062 7.3125V9H12.9023L12.5033 11.6016H10.4062V17.8907C14.7088 17.2155 18 13.4922 18 9Z" fill="#1877F2"/>
    </svg>`,
    apple: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.5125 9.5625C14.5031 8.34375 14.9531 7.3125 15.8625 6.46875C15.2406 5.58281 14.2969 5.08594 13.0312 4.98281C11.8219 4.88438 10.4906 5.69531 9.98438 5.69531C9.45 5.69531 8.29688 5.01562 7.35938 5.01562C5.41875 5.04375 3.375 6.54375 3.375 9.60938C3.375 10.4719 3.52031 11.3625 3.81094 12.2812C4.19062 13.4906 5.71875 16.6406 7.3125 16.5938C8.19375 16.5703 8.81719 15.9656 9.95625 15.9656C11.0625 15.9656 11.6438 16.5938 12.6188 16.5938C14.2312 16.5703 15.6094 13.6969 15.975 12.4875C13.6969 11.3531 14.5125 9.63281 14.5125 9.5625ZM12.4594 3.75C13.3969 2.625 13.3031 1.60312 13.275 1.21875C12.4406 1.27969 11.4656 1.80469 10.8844 2.46094C10.2469 3.16406 9.86719 4.03125 9.94688 5.00625C10.8656 5.07656 11.7094 4.60312 12.4594 3.75Z" fill="currentColor"/>
    </svg>`
  };
  
  const themeClasses = {
    gray: 'bg-white/5 border border-white/10 text-white hover:bg-white/10',
    white: 'bg-white border border-gray-300 text-gray-900 hover:bg-gray-50',
    black: 'bg-black border border-white/20 text-white hover:bg-white/5'
  };
</script>

<button
  on:click
  {disabled}
  class="flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors {themeClasses[theme]} disabled:opacity-50 disabled:cursor-not-allowed w-full"
>
  <span class="shrink-0">
    {@html icons[social]}
  </span>
  <slot />
</button>
