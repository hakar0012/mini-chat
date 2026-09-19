// =======================================================
// FIREBASE CONFIGURATION & INITIALIZATION
// =======================================================
// SECURITY NOTE: In production, use environment variables or a secure config service.
// For now, replace these placeholders with your actual Firebase config values.
// NEVER commit real API keys to version control.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "YOUR_API_KEY_HERE", // Replace with your API key
  authDomain: "mini-chaty.firebaseapp.com",
  databaseURL: "https://mini-chaty-default-rtdb.firebaseio.com",
  projectId: "mini-chaty",
  storageBucket: "mini-chaty.firebasestorage.app",
  messagingSenderId: "524920955180",
  appId: "1:524920955180:web:3b9f8ff90e89a709388c89"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();
const DOMAIN = '@minichat.local';
const ADMIN_UID = 'Gzw028WXugRIWJyBJ8xYqKypAu03';

// =======================================================
// SECURITY: Admin validation helper (server-side validation recommended)
// =======================================================
/**
 * Checks if current user is admin based on UID.
 * NOTE: This is client-side only. For production, implement server-side validation
 * using Firebase Custom Claims or Cloud Functions.
 */
function isAdminUser(user) {
  return user && user.uid === ADMIN_UID;
}

// =======================================================
// SHARED UTILITY FUNCTIONS
// =======================================================

/**
 * Escapes unsafe characters in a string to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
