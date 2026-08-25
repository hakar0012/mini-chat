// =======================================================
// PROFILE EDITING & PREFERENCES LOGIC
// =======================================================
(function() {
  const PRESETS = ['🐱', '🐶', '🦊', '🐼', '🐸', '👻', '🤖', '👽', '🦄', '🐙'];
  
  const nameInput = document.getElementById('nameInput');
  const nameError = document.getElementById('nameError');
  const colorInput = document.getElementById('colorInput');
  const avatarPreview = document.getElementById('avatarPreview');
  const avatarTypeRadios = document.getElementsByName('avatarType');
  const initialsOptions = document.getElementById('initialsOptions');
  const presetOptions = document.getElementById('presetOptions');
  const presetList = document.getElementById('presetList');
  const saveBtn = document.getElementById('saveBtn');
  const saveError = document.getElementById('saveError');
  const logoutBtn = document.getElementById('logoutBtn');

  let currentProfile = null;
  let selectedPreset = '🐱';

  // Render Preset Emojis
  PRESETS.forEach(p => {
    const div = document.createElement('div');
    div.className = 'preset' + (p === selectedPreset ? ' selected' : '');
    div.textContent = p;
    div.onclick = () => {
      selectedPreset = p;
      document.querySelectorAll('.preset').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      updatePreview();
    };
    presetList.appendChild(div);
  });

  function updatePreview() {
    const checkedRadio = document.querySelector('input[name="avatarType"]:checked');
    const type = checkedRadio ? checkedRadio.value : 'initials';
    const name = nameInput.value.trim() || '?';
    const color = colorInput.value;

    if (type === 'initials') {
      avatarPreview.textContent = name.charAt(0).toUpperCase() || '?';
      avatarPreview.style.background = color;
    } else {
      avatarPreview.textContent = selectedPreset;
      avatarPreview.style.background = '#1e293b';
    }
  }

  nameInput.addEventListener('input', updatePreview);
  colorInput.addEventListener('input', updatePreview);
  
  Array.from(avatarTypeRadios).forEach(r => r.addEventListener('change', () => {
    if (r.value === 'initials') {
      initialsOptions.style.display = 'block';
      presetOptions.style.display = 'none';
    } else {
      initialsOptions.style.display = 'none';
      presetOptions.style.display = 'block';
    }
    updatePreview();
  }));

  // Auth State Listener & Profile Loader
  auth.onAuthStateChanged(async (user) => {
    if (!user || user.isAnonymous) {
      window.location.href = 'login.html';
      return;
    }

    const banSnap = await db.ref('bannedUsers/' + user.uid).once('value');
    if (banSnap.exists() && banSnap.val() === true) {
      await auth.signOut();
      window.location.href = 'login.html';
      return;
    }

    const snap = await db.ref('users/' + user.uid).once('value');
    if (snap.exists()) {
      currentProfile = snap.val();
      nameInput.value = currentProfile.name || '';
      
      if (currentProfile.avatarType === 'preset') {
        const presetRadio = document.querySelector('input[name="avatarType"][value="preset"]');
        if (presetRadio) presetRadio.checked = true;
        initialsOptions.style.display = 'none';
        presetOptions.style.display = 'block';
        selectedPreset = currentProfile.avatarValue || '🐱';
        document.querySelectorAll('.preset').forEach(el => {
          el.classList.toggle('selected', el.textContent === selectedPreset);
        });
      } else {
        colorInput.value = currentProfile.avatarValue || '#2563eb';
      }
      updatePreview();
    } else {
      updatePreview();
    }
  });

  // Save Profile Handler
  saveBtn.onclick = async () => {
    saveError.style.display = 'none';
    nameError.style.display = 'none';

    const name = nameInput.value.trim();
    if (!name) {
      nameError.textContent = 'Name cannot be empty.';
      nameError.style.display = 'block';
      return;
    }
    if (name.length < 3) {
      nameError.textContent = 'Name must be at least 3 characters.';
      nameError.style.display = 'block';
      return;
    }

    const checkedRadio = document.querySelector('input[name="avatarType"]:checked');
    const type = checkedRadio ? checkedRadio.value : 'initials';
    const value = type === 'initials' ? colorInput.value : selectedPreset;

    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid;
    const lowerName = name.toLowerCase();

    saveBtn.disabled = true;

    try {
      // Check username collision
      const usernameSnap = await db.ref('usernames/' + lowerName).once('value');
      if (usernameSnap.exists() && usernameSnap.val().uid !== uid) {
        nameError.textContent = 'This name is already taken.';
        nameError.style.display = 'block';
        saveBtn.disabled = false;
        return;
      }

      // If user changed name, release previous username
      if (currentProfile && currentProfile.name) {
        const oldLowerName = currentProfile.name.toLowerCase();
        if (oldLowerName !== lowerName) {
          await db.ref('usernames/' + oldLowerName).remove();
        }
      }

      const updates = {};
      updates['users/' + uid] = {
        name: name,
        avatarType: type,
        avatarValue: value,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      };
      updates['usernames/' + lowerName] = { uid: uid };

      await db.ref().update(updates);

      localStorage.setItem('chat_name', name);
      window.location.href = 'index.html';

    } catch (err) {
      saveError.textContent = 'Error saving: ' + err.message;
      saveError.style.display = 'block';
    } finally {
      saveBtn.disabled = false;
    }
  };

  if (logoutBtn) {
    logoutBtn.onclick = (e) => {
      e.preventDefault();
      auth.signOut().then(() => window.location.href = 'login.html');
    };
  }

  updatePreview();
})();
