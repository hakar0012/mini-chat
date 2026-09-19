# Deployment Guide - Mini Group Chat

## Quick Start

### 1. Replace API Keys

Before deploying, you must replace the placeholder API keys:

#### Firebase Configuration (`js/firebase-init.js`)
```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_FIREBASE_API_KEY", // Get from Firebase Console
  authDomain: "mini-chaty.firebaseapp.com",
  databaseURL: "https://mini-chaty-default-rtdb.firebaseio.com",
  projectId: "mini-chaty",
  storageBucket: "mini-chaty.firebasestorage.app",
  messagingSenderId: "524920955180",
  appId: "1:524920955180:web:3b9f8ff90e89a709388c89"
};
```

**How to get your Firebase API key:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create new one)
3. Go to Project Settings ⚙️ → General
4. Scroll to "Your apps" → SDK setup and configuration
5. Copy the `apiKey` value

#### Third-Party APIs (`js/chat.js`)

**ImgBB API Key:**
1. Sign up at https://api.imgbb.com/
2. Get your API key from dashboard
3. Replace: `const IMGBB_API_KEY = "YOUR_IMGBB_API_KEY";`

**Klipy API Key:**
1. Sign up at https://klipy.com/
2. Get your API key
3. Replace: `const KLIPY_API_KEY = "YOUR_KLIPY_API_KEY";`

---

### 2. Deploy Firebase Security Rules

**CRITICAL**: Without security rules, anyone can access your database!

#### Option A: Firebase Console (Manual)
1. Go to Firebase Console → Realtime Database → Rules
2. Copy contents of `firebase-security-rules.json`
3. Paste into the rules editor
4. Click "Publish"

#### Option B: Firebase CLI (Recommended)
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init database

# This will create database.rules.json
# Copy our rules to that file or edit directly

# Deploy rules only
firebase deploy --only database:rules
```

---

### 3. Hosting Options

#### Option A: Firebase Hosting (Recommended)
```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login
firebase login

# Initialize hosting
firebase init hosting

# Select your project
# Choose existing files when prompted
# Set public directory to current folder (.)

# Deploy
firebase deploy --only hosting
```

#### Option B: Netlify (Free Alternative)
1. Create account at https://netlify.com
2. Drag and drop your project folder
3. Done! Your site is live

#### Option C: GitHub Pages
1. Push code to GitHub repository
2. Go to Settings → Pages
3. Select main branch → Save
4. Your site will be at `https://username.github.io/repo-name`

#### Option D: Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

---

### 4. Post-Deployment Checklist

- [ ] Test user registration and login
- [ ] Verify messages are being saved to Firebase
- [ ] Test admin panel access (should only work for your UID)
- [ ] Check that banned users cannot log in
- [ ] Test image upload functionality
- [ ] Test GIF search
- [ ] Verify real-time updates work
- [ ] Test on mobile devices
- [ ] Check browser console for errors

---

## Environment Variables (Optional but Recommended)

For better security, use environment variables:

### Create `.env` file:
```env
FIREBASE_API_KEY=your_actual_firebase_key
IMGBB_API_KEY=your_imgbb_key
KLIPY_API_KEY=your_klipy_key
```

### Update JavaScript files to read from environment:
```javascript
// Already implemented in updated files
const firebaseApiKey = process.env.FIREBASE_API_KEY || "YOUR_API_KEY_HERE";
```

**Note**: Client-side environment variables still expose values to users. For true secrecy, use backend proxy (see below).

---

## Backend Proxy for API Keys (Advanced)

To completely hide third-party API keys, create Cloud Functions:

### 1. Enable Cloud Functions
```bash
firebase enable functions
firebase init functions
```

### 2. Create Proxy Function (`functions/index.js`)
```javascript
const functions = require('firebase-functions');
const axios = require('axios');

exports.proxyImgBB = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }
  
  const response = await axios.post(
    `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
    data.image,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  
  return response.data;
});

exports.proxyKlipy = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }
  
  const response = await axios.get(
    `https://api.klipy.com/v2/search?q=${data.query}&key=${process.env.KLIPY_API_KEY}`
  );
  
  return response.data;
});
```

### 3. Deploy Functions
```bash
firebase deploy --only functions
```

### 4. Update Frontend to Use Functions
```javascript
// Instead of direct API calls
const proxyImgBB = firebase.functions().httpsCallable('proxyImgBB');
const result = await proxyImgBB({ image: imageData });
```

---

## Performance Optimization

### Enable CDN for Static Assets
All hosting options above include CDN by default.

### Optimize Images
- Compress images before upload
- Use WebP format when possible
- Implement lazy loading

### Database Indexing
Add indexes in Firebase Console for faster queries:
```json
{
  "indexes": [
    {
      "path": "/rooms/{roomId}/messages",
      "queryGroup": "ORDER_BY_CHILD",
      "orderBy": "ts",
      "descending": true
    }
  ]
}
```

---

## Monitoring & Maintenance

### 1. Enable Firebase Analytics
Track usage and errors in Firebase Console.

### 2. Set Up Error Reporting
```bash
npm install @sentry/browser
```

### 3. Monitor Firebase Usage
Check Firebase Console → Usage regularly to avoid billing surprises.

### 4. Regular Backups
```bash
firebase database:get / > backup-$(date +%Y%m%d).json
```

---

## Troubleshooting

### Common Issues

**"Permission denied" errors:**
- Check Firebase Security Rules are deployed
- Verify user is authenticated
- Check browser console for specific error

**API keys not working:**
- Ensure keys are correctly copied (no extra spaces)
- Check API quotas on respective dashboards
- Verify CORS settings for third-party APIs

**Messages not appearing in real-time:**
- Check Firebase connection in browser DevTools
- Verify database URL is correct
- Ensure no ad blockers interfering

**Admin panel shows "Access Denied":**
- Verify your UID matches ADMIN_UID in `firebase-init.js`
- Check you're logged in with correct account

---

## Security Best Practices

1. **Never commit real API keys** to version control
2. **Enable Firebase App Check** for additional protection
3. **Regularly rotate API keys** (every 90 days recommended)
4. **Monitor Firebase billing** alerts
5. **Keep dependencies updated**
6. **Use HTTPS** (all hosting options provide this automatically)
7. **Implement rate limiting** (see SECURITY_AUDIT.md)
8. **Regular security audits**

---

## Support

- Firebase Documentation: https://firebase.google.com/docs
- Firebase Community: https://stackoverflow.com/questions/tagged/firebase
- Report Issues: Create issue in this repository
