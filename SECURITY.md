# Security Policy

## Firebase API Keys

### Public Client Keys (Safe to Expose)

The Firebase API keys in this repository are **client-side keys** that are designed to be public. They are found in:
- `public/firebase-messaging-sw.js`
- Client-side code

These keys are **NOT secrets** and are secured by:

1. **API Key Restrictions** - Domain whitelist in Google Cloud Console
2. **Firebase Security Rules** - Server-side access control
3. **App Check** (optional) - Additional bot protection

### Security Measures

✅ **API Key Restrictions Applied:**
- HTTP referrer restrictions (domain whitelist)
- API restrictions (only Firebase services enabled)

✅ **Firebase Security Rules:**
- Database access controlled by authentication
- Storage access controlled by user permissions

✅ **Server-Side Secrets:**
- Firebase Admin SDK private key stored in environment variables only
- Never committed to repository
- Only accessible server-side

### Why Firebase Client Keys Are Public

Firebase client API keys are different from traditional API keys:

1. **They identify your Firebase project** - like a project ID
2. **They don't grant access** - Firebase Security Rules control access
3. **They're meant to be in client code** - every Firebase web app has them visible
4. **They're protected by domain restrictions** - only your domains can use them

Reference: [Firebase Security Documentation](https://firebase.google.com/docs/projects/api-keys)

## Reporting Security Issues

Please do not open a public issue for suspected vulnerabilities.

Preferred path:

1. Use GitHub's private vulnerability reporting or repository security advisory flow if it is enabled.
2. If private reporting is not available, contact the maintainer through the repository owner's GitHub profile or other documented private channel.

Include:

- A short description of the issue
- Reproduction steps or proof of concept
- Affected routes, files, or deployment surface
- The impact you believe it has

The goal is coordinated disclosure and a private fix first.

## Environment Variables

### Public (Client-Side)
- `VITE_FIREBASE_*` - Firebase client configuration
- Safe to expose in client bundles

### Private (Server-Side Only)
- `FIREBASE_ADMIN_PRIVATE_KEY` - Never expose
- `GOOGLE_CLIENT_SECRET` - Never expose
- `DATABASE_URL` - Never expose

These are stored in:
- `.env.local` (gitignored)
- Vercel environment variables (production)
