import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [tailwindcss(), sveltekit()],
    define: {
      // Make env variables available to server-side code
      'process.env.DATABASE_URL': JSON.stringify(env.DATABASE_URL),
      'process.env.POSTGRES_URL': JSON.stringify(env.POSTGRES_URL),
      'process.env.GIPHY_API_KEY': JSON.stringify(env.GIPHY_API_KEY),
      'process.env.VAPID_PUBLIC_KEY': JSON.stringify(env.VAPID_PUBLIC_KEY),
      'process.env.VAPID_PRIVATE_KEY': JSON.stringify(env.VAPID_PRIVATE_KEY),
      'process.env.FIREBASE_ADMIN_PROJECT_ID': JSON.stringify(env.FIREBASE_ADMIN_PROJECT_ID),
      'process.env.FIREBASE_ADMIN_CLIENT_EMAIL': JSON.stringify(env.FIREBASE_ADMIN_CLIENT_EMAIL),
      'process.env.FIREBASE_ADMIN_PRIVATE_KEY': JSON.stringify(env.FIREBASE_ADMIN_PRIVATE_KEY),
    }
  };
});
