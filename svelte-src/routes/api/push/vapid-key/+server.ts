const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async () => {
  let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;

  // Generate keys if not configured (for development)
  if (!vapidPublicKey) {
    console.warn('VAPID keys not configured, generating temporary keys...');
    try {
      const webPush = await import('web-push');
      const keys = webPush.default.generateVAPIDKeys();
      vapidPublicKey = keys.publicKey;
      // Store in a file for persistence across restarts
      const fs = await import('fs');
      const path = await import('path');
      const envPath = path.join(process.cwd(), '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
      }
      if (!envContent.includes('VAPID_PUBLIC_KEY')) {
        envContent += `\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`;
        fs.writeFileSync(envPath, envContent);
      }
      process.env.VAPID_PUBLIC_KEY = keys.publicKey;
      process.env.VAPID_PRIVATE_KEY = keys.privateKey;
      console.log('VAPID keys generated and saved to .env');
    } catch (e: any) {
      console.error('Failed to generate VAPID keys:', e.message);
      return toJson({ error: "Failed to generate VAPID keys: " + e.message }, 500);
    }
  }

  return toJson({ publicKey: vapidPublicKey });
};
