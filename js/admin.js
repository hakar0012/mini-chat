// =======================================================
// ADMIN OVERLORD DASHBOARD LOGIC
// =======================================================
(function() {
  let allUsers = {};
  let bannedUsers = {};
  let allRooms = {};
  let currentTab = 'users';
  let searchQuery = '';

  const searchInput = document.getElementById('adminSearchInput');

  // 1. Security Check
  auth.onAuthStateChanged(async (user) => {
    if (!user || user.uid !== ADMIN_UID) {
      alert("ACCESS DENIED. Overlord privileges required.");
      window.location.href = 'login.html';
      return;
    }
    loadData();
    loadRooms();
  });

  window.switchTab = function(tab) {
    currentTab = tab;
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    
    if (tab === 'users') {
      const userTab = document.querySelectorAll('.admin-tab')[0];
      if (userTab) userTab.classList.add('active');
      const userPanel = document.getElementById('usersPanel');
      if (userPanel) userPanel.classList.add('active');
      renderUsers();
    } else {
      const roomTab = document.querySelectorAll('.admin-tab')[1];
      if (roomTab) roomTab.classList.add('active');
      const roomPanel = document.getElementById('roomsPanel');
      if (roomPanel) roomPanel.classList.add('active');
      renderRooms();
    }
  };

  async function loadData() {
    const usersSnap = await db.ref('users').once('value');
    allUsers = usersSnap.val() || {};
    
    const bannedSnap = await db.ref('bannedUsers').once('value');
    bannedUsers = bannedSnap.val() || {};
    
    updateStats();
    renderUsers();
  }

  function updateStats() {
    const totalUsers = Object.keys(allUsers).length;
    const totalBanned = Object.keys(bannedUsers).filter(uid => bannedUsers[uid] === true).length;
    const totalRooms = Object.keys(allRooms).length;

    const uEl = document.getElementById('statUsers');
    const bEl = document.getElementById('statBanned');
    const rEl = document.getElementById('statRooms');

    if (uEl) uEl.textContent = totalUsers;
    if (bEl) bEl.textContent = totalBanned;
    if (rEl) rEl.textContent = totalRooms;
  }

  function renderUsers() {
    const list = document.getElementById('usersList');
    if (!list) return;
    list.innerHTML = '';
    
    let uids = Object.keys(allUsers);
    
    if (searchQuery) {
      uids = uids.filter(uid => {
        const name = (allUsers[uid]?.name || '').toLowerCase();
        return name.includes(searchQuery) || uid.toLowerCase().includes(searchQuery);
      });
    }

    if (uids.length === 0) {
      list.innerHTML = '<div class="empty-state">No users match your filter.</div>';
      return;
    }

    uids.forEach(uid => {
      const user = allUsers[uid] || {};
      const isBanned = bannedUsers[uid] === true;
      const isMe = uid === ADMIN_UID;
      
      const div = document.createElement('div');
      div.className = 'list-item';
      
      div.innerHTML = `
        <div class="item-info">
          <h3>${escapeHtml(user.name || 'Unknown')} ${isMe ? '<span class="badge-you">(You)</span>' : ''} ${isBanned ? '<span class="badge-banned">BANNED</span>' : ''}</h3>
          <p>${escapeHtml(uid)}</p>
        </div>
        <div>
          ${isMe ? '' : (isBanned 
            ? `<button class="btn-action btn-success" onclick="unbanUser('${escapeHtml(uid)}')">Unban</button>` 
            : `<button class="btn-action btn-danger" onclick="banUser('${escapeHtml(uid)}')">Ban</button>`)}
        </div>
      `;
      list.appendChild(div);
    });
  }

  window.banUser = async function(uid) {
    if (confirm("Ban this user? They will be instantly kicked out and blocked from logging in.")) {
      await db.ref('bannedUsers/' + uid).set(true);
      bannedUsers[uid] = true;
      updateStats();
      renderUsers();
    }
  };

  window.unbanUser = async function(uid) {
    await db.ref('bannedUsers/' + uid).remove();
    delete bannedUsers[uid];
    updateStats();
    renderUsers();
  };

  async function loadRooms() {
    const roomsSnap = await db.ref('rooms').once('value');
    allRooms = roomsSnap.val() || {};
    updateStats();
    if (currentTab === 'rooms') renderRooms();
  }

  function renderRooms() {
    const list = document.getElementById('roomsList');
    if (!list) return;
    list.innerHTML = '';
    
    let roomIds = Object.keys(allRooms);
    if (searchQuery) {
      roomIds = roomIds.filter(id => id.toLowerCase().includes(searchQuery));
    }

    if (roomIds.length === 0) {
      list.innerHTML = '<div class="empty-state">No rooms found.</div>';
      return;
    }

    roomIds.forEach(id => {
      const msgCount = allRooms[id].messages ? Object.keys(allRooms[id].messages).length : 0;
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `
        <div class="item-info">
          <h3># ${escapeHtml(id)}</h3>
          <p>${msgCount} messages</p>
        </div>
        <button class="btn-action btn-warning" onclick="wipeRoom('${escapeHtml(id)}')">Wipe Room</button>
      `;
      list.appendChild(div);
    });
  }

  window.wipeRoom = async function(roomId) {
    if (confirm(`⚠️ WARNING: This will permanently delete ALL messages, reactions, and typing data in #${roomId}. Continue?`)) {
      await db.ref('rooms/' + roomId).remove();
      delete allRooms[roomId];
      updateStats();
      renderRooms();
    }
  };

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      if (currentTab === 'users') renderUsers();
      else renderRooms();
    });
  }

  window.logout = function() {
    auth.signOut().then(() => window.location.href = 'login.html');
  };
})();
