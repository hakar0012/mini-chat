// =======================================================
// AUTHENTICATION LOGIC (LOGIN & SIGNUP)
// =======================================================
(function() {
  const tabs = document.querySelectorAll('.tab');
  const errorMsg = document.getElementById('errorMsg');
  const submitBtn = document.getElementById('submitBtn');
  const authForm = document.getElementById('authForm');
  const forceLogoutBtn = document.getElementById('forceLogout');
  
  let currentMode = 'login';

  window.switchMode = function(mode) {
    currentMode = mode;
    tabs[0].classList.toggle('active', mode === 'login');
    tabs[1].classList.toggle('active', mode === 'signup');
    submitBtn.textContent = mode === 'login' ? 'Login' : 'Create Account';
    errorMsg.style.display = 'none';
  };

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  }

  // Handle Login / Sign Up Submit
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.style.display = 'none';
    
    const rawUsername = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const remember = document.getElementById('rememberMe').checked;

    if (!rawUsername || !password) return;
    
    // Clean username (lowercase, no spaces)
    const cleanUsername = rawUsername.toLowerCase().replace(/\s+/g, '');
    const fakeEmail = cleanUsername + DOMAIN;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Please wait...';

    try {
      // 1. Set Persistence (Remember Me)
      const persistenceType = remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
      await auth.setPersistence(persistenceType);

      let userCredential;

      // 2. Login or Sign Up
      if (currentMode === 'signup') {
        userCredential = await auth.createUserWithEmailAndPassword(fakeEmail, password);
      } else {
        userCredential = await auth.signInWithEmailAndPassword(fakeEmail, password);
      }

      const uid = userCredential.user.uid;

      // 3. Check if user is banned
      const banSnap = await db.ref('bannedUsers/' + uid).once('value');
      if (banSnap.exists() && banSnap.val() === true) {
        await auth.signOut();
        throw new Error("This account has been banned by an admin.");
      }

      // 4. Success! Redirect to profile (if new) or chat
      const profileSnap = await db.ref('users/' + uid).once('value');
      if (!profileSnap.exists()) {
        // Save initial profile
        await db.ref('users/' + uid).set({
          name: rawUsername,
          avatarType: 'initials',
          avatarValue: '#2563eb',
          createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        // Claim the lowercase username
        await db.ref('usernames/' + cleanUsername).set({ uid: uid });
        
        window.location.href = 'profile.html';
      } else {
        window.location.href = 'index.html';
      }

    } catch (err) {
      console.error(err);
      let friendlyError = "An error occurred. Please try again.";
      
      if (err.code === 'auth/email-already-in-use') {
        friendlyError = "That username is already taken.";
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        friendlyError = "Invalid username or password.";
      } else if (err.code === 'auth/weak-password') {
        friendlyError = "Password must be at least 6 characters.";
      } else if (err.message && err.message.includes("banned")) {
        friendlyError = err.message;
      }
      
      showError(friendlyError);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = currentMode === 'login' ? 'Login' : 'Create Account';
    }
  });

  // Auto-redirect if already logged in and not banned
  auth.onAuthStateChanged(async (user) => {
    if (user && !user.isAnonymous) {
      const banSnap = await db.ref('bannedUsers/' + user.uid).once('value');
      if (banSnap.exists() && banSnap.val() === true) {
        auth.signOut();
        return;
      }
      const profileSnap = await db.ref('users/' + user.uid).once('value');
      if (profileSnap.exists()) {
        window.location.href = 'index.html';
      } else {
        window.location.href = 'profile.html';
      }
    }
  });

  if (forceLogoutBtn) {
    forceLogoutBtn.onclick = (e) => {
      e.preventDefault();
      auth.signOut().then(() => location.reload());
    };
  }
})();
