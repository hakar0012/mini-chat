// =======================================================
// FIREBASE CONFIGURATION & INITIALIZATION
// =======================================================
const firebaseConfig = {
  apiKey: "AIzaSyAbiBOlaMX7OjPvx5efi0Z3MOddr94wgKQ",
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
