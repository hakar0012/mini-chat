// =======================================================
// MINI GROUP CHAT - MODERN OVERHAUL APPLICATION LOGIC
// =======================================================
(function() {
  // --- Third Party API Keys ---
  const IMGBB_API_KEY = "94b9d72bc5e7b37b1da9d1f1732c2142";
  const KLIPY_API_KEY = "qonfBVMFL4S3UGx546UVIJ6g6mvWM51F7RYKePDE78JIVs9kGV5DIwRrgPftFuBr";
  const KLIPY_BASE_URL = "https://api.klipy.com/v2";
  const EMOJIS = ['👍', '❤️', '😂', '🔥', '😮', '😢'];

  // --- Room Setup ---
  const params = new URLSearchParams(location.search);
  const room = (params.get("room") || "general").trim().slice(0, 80);
  const messagesRef = db.ref("rooms/" + room + "/messages");

  // --- DOM Elements ---
  const messagesEl = document.getElementById("messages");
  const chatForm = document.getElementById("chatForm");
  const textInput = document.getElementById("textInput");
  const sendBtn = document.getElementById("sendBtn");
  const header = document.getElementById("chatHeader");
  const replyBar = document.getElementById("replyBar");
  const replyName = document.getElementById("replyName");
  const imageInput = document.getElementById("imageInput");
  const attachBtn = document.getElementById("attachBtn");
  const attachMenu = document.getElementById("attachMenu");
  const attachImageBtn = document.getElementById("attachImageBtn");
  const attachGifBtn = document.getElementById("attachGifBtn");
  const typingIndicator = document.getElementById("typingIndicator");

  // --- State Variables ---
  let myName = "", myUid = "", myAvatarType = "", myAvatarValue = "";
  let messagesCache = {};
  let replyingTo = null;
  let editingId = null;
  let onlineUsers = {};
  let userProfilesCache = {};
  let oldestTs = Infinity;
  let isLoadingOlder = false;
  let allOlderLoaded = false;
  let typingTimer = null;
  let gifSearchDebounce = null;
  let currentGifQuery = "";
  let gifModal = null;

  // =======================================================
  // ROOM SWITCHER DRAWER
  // =======================================================
  function getRooms() {
    return JSON.parse(localStorage.getItem('chat_rooms') || '["global","general"]');
  }

  function saveRoom(name) {
    let rooms = getRooms();
    if (!rooms.includes(name)) {
      rooms.unshift(name);
      localStorage.setItem('chat_rooms', JSON.stringify(rooms.slice(0, 15)));
    }
  }
  saveRoom(room);

  window.toggleRoomPanel = function() {
    const panel = document.getElementById('roomPanel');
    const overlay = document.getElementById('roomPanelOverlay');
    const isOpen = panel.classList.toggle('open');
    overlay.classList.toggle('open', isOpen);
    if (isOpen) renderRoomPanel();
  };

  window.closeRoomPanel = function() {
    const panel = document.getElementById('roomPanel');
    const overlay = document.getElementById('roomPanelOverlay');
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
  };

  window.joinNewRoom = function() {
    const input = document.getElementById('newRoomInput');
    const name = input.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (name) {
      saveRoom(name);
      input.value = '';
      window.location.search = '?room=' + encodeURIComponent(name);
    }
  };

  function renderRoomPanel() {
    const list = document.getElementById('roomPanelList');
    if (!list) return;
    list.innerHTML = '';
    getRooms().forEach(r => {
      const div = document.createElement('div');
      div.className = 'room-panel-item' + (r === room ? ' active' : '');
      div.innerHTML = `<span style="font-weight:500;"># ${escapeHtml(r)}</span>`;
      if (r === room) div.innerHTML += '<span class="room-panel-item-indicator"></span>';
      div.onclick = () => {
        if (r !== room) {
          window.location.search = '?room=' + encodeURIComponent(r);
        } else {
          closeRoomPanel();
        }
      };
      list.appendChild(div);
    });
  }

  // =======================================================
  // ONLINE PRESENCE & AVATARS
  // =======================================================
  function updateOnlineUI() {
    const count = Object.keys(onlineUsers).length;
    const countEl = document.getElementById('onlineCountText');
    if (countEl) countEl.textContent = `${count} online`;
  }

  window.toggleOnlineModal = function() {
    const modal = document.getElementById('onlineModal');
    if (!modal) return;
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) renderOnlineList();
  };

  function renderOnlineList() {
    const listEl = document.getElementById('onlineList');
    if (!listEl) return;
    listEl.innerHTML = "";
    const uids = Object.keys(onlineUsers);
    if (uids.length === 0) {
      listEl.innerHTML = "<p style='opacity:0.6; text-align:center; padding:10px;'>No one is online.</p>";
      return;
    }
    uids.forEach(uid => {
      const profile = userProfilesCache[uid] || { name: "Unknown", avatarType: 'initials', avatarValue: '#334155' };
      const item = document.createElement("div");
      item.className = "online-item";
      item.style.cssText = "display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border-subtle);";
      item.appendChild(createAvatarEl(profile.avatarType, profile.avatarValue, profile.name, uid));
      const nameSpan = document.createElement("span");
      nameSpan.textContent = profile.name;
      nameSpan.style.cssText = "font-size:14px; font-weight:500;";
      item.appendChild(nameSpan);
      listEl.appendChild(item);
    });
  }

  function cacheProfile(data) {
    if (data && data.uid && !userProfilesCache[data.uid]) {
      userProfilesCache[data.uid] = {
        name: data.name,
        avatarType: data.avatarType,
        avatarValue: data.avatarValue
      };
    }
  }

  function createAvatarEl(type, value, name, uid) {
    const el = document.createElement("div");
    el.style.cssText = "width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;user-select:none;box-shadow:0 2px 5px rgba(0,0,0,0.2);";
    if (type === 'preset') {
      el.textContent = value || '👤';
      el.style.background = '#1e293b';
    } else {
      el.textContent = (name || '?').charAt(0).toUpperCase();
      el.style.background = value || '#2563eb';
      el.style.color = '#ffffff';
    }
    return el;
  }

  function timeLabel(ts) {
    if (!ts) ts = Date.now();
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // =======================================================
  // MARKDOWN & MESSAGE PARSING
  // =======================================================
  function parseMarkdownAndMentions(text) {
    let safeText = escapeHtml(text);

    // Mentions: @Name
    safeText = safeText.replace(/@([a-zA-Z0-9_]+)/g, (match, name) => {
      const matchUser = Object.values(userProfilesCache).find(p => p.name && p.name.toLowerCase() === name.toLowerCase());
      if (matchUser) {
        const isMe = matchUser.name.toLowerCase() === myName.toLowerCase();
        return `<span class="mention ${isMe ? 'mention-me' : ''}">${match}</span>`;
      }
      return match;
    });

    // Markdown: `code`, *bold*, _italic_, ~~strike~~
    safeText = safeText.replace(/`([^`]+)`/g, '<code>$1</code>');
    safeText = safeText.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    safeText = safeText.replace(/_([^_]+)_/g, '<em>$1</em>');
    safeText = safeText.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    return safeText;
  }

  // Image Lightbox Viewer
  function openLightbox(src) {
    const existing = document.querySelector('.lightbox-modal');
    if (existing) existing.remove();

    const box = document.createElement("div");
    box.className = "lightbox-modal";
    box.innerHTML = `<img src="${escapeHtml(src)}" class="lightbox-img" alt="Enlarged media" />`;
    box.onclick = () => box.remove();
    document.body.appendChild(box);
  }

  function parseMessageText(text) {
    if (!text) return document.createTextNode("");
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    const fragment = document.createDocumentFragment();

    parts.forEach(part => {
      if (/^https?:\/\/[^\s]+$/i.test(part)) {
        const lowerPart = part.toLowerCase();
        const isImage = /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/.test(lowerPart);
        const isVideo = /\.(mp4|webm|ogg|mov)(\?.*)?$/.test(lowerPart);

        if (isImage) {
          const container = document.createElement("div");
          container.style.marginTop = "6px";
          const img = document.createElement("img");
          img.src = part;
          img.style.cssText = "max-width:100%;max-height:280px;border-radius:10px;display:block;cursor:zoom-in;box-shadow:0 3px 10px rgba(0,0,0,0.3);";
          img.loading = "lazy";
          img.onclick = () => openLightbox(img.src);
          img.onerror = () => {
            container.innerHTML = "";
            const a = document.createElement("a");
            a.href = part; a.target = "_blank"; a.rel = "noopener noreferrer";
            a.textContent = part; a.style.cssText = "color:#60a5fa;word-break:break-all;text-decoration:underline;";
            container.appendChild(a);
          };
          container.appendChild(img);
          fragment.appendChild(container);
        } else if (isVideo) {
          const container = document.createElement("div");
          container.style.marginTop = "6px";
          const video = document.createElement("video");
          video.src = part;
          video.controls = true;
          video.style.cssText = "max-width:100%;max-height:280px;border-radius:10px;box-shadow:0 3px 10px rgba(0,0,0,0.3);";
          video.onerror = () => {
            container.innerHTML = "";
            const a = document.createElement("a");
            a.href = part; a.target = "_blank"; a.rel = "noopener noreferrer";
            a.textContent = part; a.style.cssText = "color:#60a5fa;word-break:break-all;text-decoration:underline;";
            container.appendChild(a);
          };
          container.appendChild(video);
          fragment.appendChild(container);
        } else {
          const a = document.createElement("a");
          a.href = part; a.target = "_blank"; a.rel = "noopener noreferrer";
          a.textContent = part;
          a.style.cssText = "color:#93c5fd;text-decoration:underline;word-break:break-all;";
          fragment.appendChild(a);
        }
      } else if (part.length > 0) {
        const span = document.createElement('span');
        span.innerHTML = parseMarkdownAndMentions(part);
        fragment.appendChild(span);
      }
    });
    return fragment;
  }

  // =======================================================
  // REACTIONS
  // =======================================================
  function showReactionPicker(msgId, anchorEl) {
    const existing = document.querySelector('.reaction-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.className = 'reaction-picker';

    EMOJIS.forEach(em => {
      const span = document.createElement('span');
      span.textContent = em;
      span.onclick = (e) => {
        e.stopPropagation();
        db.ref(`rooms/${room}/reactions/${msgId}/${em}/${myUid}`).set(true);
        picker.remove();
      };
      picker.appendChild(span);
    });

    anchorEl.appendChild(picker);

    setTimeout(() => {
      document.body.onclick = () => {
        picker.remove();
        document.body.onclick = null;
      };
    }, 10);
  }

  // =======================================================
  // MESSAGE RENDERING & FEED
  // =======================================================
  function renderMessage(data, msgId) {
    const row = document.createElement("div");
    const isMine = data.uid === myUid;
    row.className = "msg-row" + (isMine ? " mine" : "");
    row.id = "msg-" + msgId;

    const avatar = createAvatarEl(data.avatarType, data.avatarValue, data.name, data.uid);

    const msgBox = document.createElement("div");
    msgBox.className = "msg";

    // Overhauled Reply Quote inside Message
    if (data.replyToId) {
      const rep = document.createElement("div");
      rep.className = "reply-preview";
      rep.innerHTML = `
        <div class="reply-preview-name">↩ ${escapeHtml(data.replyToName || "anon")}</div>
        <div class="reply-preview-text">${escapeHtml(data.replyToText || "")}</div>
      `;
      rep.onclick = (e) => {
        e.stopPropagation();
        const targetEl = document.getElementById('msg-' + data.replyToId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.classList.remove('highlight');
          void targetEl.offsetWidth; // trigger reflow
          targetEl.classList.add('highlight');
          setTimeout(() => targetEl.classList.remove('highlight'), 2000);
        }
      };
      msgBox.appendChild(rep);
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `${escapeHtml(data.name || "anon")} · ${timeLabel(data.ts)} ${data.edited ? '<span class="edited">(edited)</span>' : ''}`;

    const body = document.createElement("div");
    body.appendChild(parseMessageText(data.text));

    msgBox.appendChild(meta);
    msgBox.appendChild(body);

    const reactionsContainer = document.createElement("div");
    reactionsContainer.className = "reactions-container";
    msgBox.appendChild(reactionsContainer);

    // Floating Quick-Action Toolbar on Message Hover
    const toolbar = document.createElement("div");
    toolbar.className = "msg-toolbar";

    // Reply Button
    const replyBtn = document.createElement("button");
    replyBtn.className = "msg-toolbar-btn";
    replyBtn.title = "Reply";
    replyBtn.innerHTML = "↩";
    replyBtn.onclick = (e) => { e.stopPropagation(); startReply(msgId); };
    toolbar.appendChild(replyBtn);

    // React Button
    const reactBtn = document.createElement("button");
    reactBtn.className = "msg-toolbar-btn";
    reactBtn.title = "Add Reaction";
    reactBtn.innerHTML = "😊";
    reactBtn.onclick = (e) => { e.stopPropagation(); showReactionPicker(msgId, msgBox); };
    toolbar.appendChild(reactBtn);

    if (isMine) {
      const editBtn = document.createElement("button");
      editBtn.className = "msg-toolbar-btn";
      editBtn.title = "Edit Message";
      editBtn.innerHTML = "✏️";
      editBtn.onclick = (e) => { e.stopPropagation(); startEdit(msgId); };
      toolbar.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "msg-toolbar-btn";
      deleteBtn.title = "Delete Message";
      deleteBtn.innerHTML = "🗑️";
      deleteBtn.onclick = (e) => { e.stopPropagation(); deleteMsg(msgId); };
      toolbar.appendChild(deleteBtn);
    }

    row.appendChild(avatar);
    row.appendChild(msgBox);
    row.appendChild(toolbar);

    // Mobile tap support for toolbar
    row.addEventListener('click', (e) => {
      document.querySelectorAll('.msg-row.touch-active').forEach(r => {
        if (r !== row) r.classList.remove('touch-active');
      });
      row.classList.toggle('touch-active');
    });

    return row;
  }

  function checkEmptyState() {
    const existingHero = document.querySelector('.empty-hero');
    const msgCount = Object.keys(messagesCache).length;
    if (msgCount === 0) {
      if (!existingHero) {
        const hero = document.createElement("div");
        hero.className = "empty-hero";
        hero.innerHTML = `
          <div class="empty-hero-icon">💬</div>
          <h3>Welcome to #${escapeHtml(room)}!</h3>
          <p>No messages yet. Say hello and start the conversation 👋</p>
        `;
        messagesEl.appendChild(hero);
      }
    } else {
      if (existingHero) existingHero.remove();
    }
  }

  function addMessage(data, msgId, prepend = false) {
    const existingHero = document.querySelector('.empty-hero');
    if (existingHero) existingHero.remove();

    cacheProfile(data);
    messagesCache[msgId] = data;
    const row = renderMessage(data, msgId);

    if (prepend) {
      messagesEl.insertBefore(row, messagesEl.firstChild);
    } else {
      const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
      messagesEl.appendChild(row);
      const isMine = data.uid === myUid;
      if (nearBottom || isMine) messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    updateOnlineUI();
  }

  // =======================================================
  // PAGINATION & INFINITE SCROLL
  // =======================================================
  function loadOlderMessages() {
    if (isLoadingOlder || allOlderLoaded || oldestTs === Infinity) return;
    isLoadingOlder = true;
    const prevScrollHeight = messagesEl.scrollHeight;

    messagesRef.orderByChild("ts").endAt(oldestTs - 1).limitToLast(30).once("value", (snap) => {
      if (!snap.exists() || snap.numChildren() === 0) {
        allOlderLoaded = true;
        isLoadingOlder = false;
        return;
      }

      const olderMsgs = [];
      snap.forEach(child => {
        const val = child.val();
        if (val && !messagesCache[child.key]) {
          olderMsgs.push({ val: val, key: child.key });
          if (val.ts && val.ts < oldestTs) oldestTs = val.ts;
        }
      });

      if (olderMsgs.length === 0) {
        allOlderLoaded = true;
      } else {
        olderMsgs.reverse().forEach(m => addMessage(m.val, m.key, true));
        messagesEl.scrollTop = messagesEl.scrollHeight - prevScrollHeight;
      }
      isLoadingOlder = false;
    });
  }

  messagesEl.addEventListener('scroll', () => {
    if (messagesEl.scrollTop === 0) {
      loadOlderMessages();
    }
  });

  // =======================================================
  // MESSAGE ACTIONS (REPLY, EDIT, DELETE)
  // =======================================================
  window.startReply = function(id) {
    const msg = messagesCache[id];
    if (!msg) return;
    replyingTo = { id: id, name: msg.name, text: (msg.text || "").substring(0, 50) };
    replyBar.classList.add("active");
    replyName.innerHTML = `<span>↩ Replying to <strong>@${escapeHtml(msg.name || "anon")}</strong>: "${escapeHtml(replyingTo.text)}"</span>`;
    textInput.focus();
  };

  window.cancelReply = function() {
    replyingTo = null;
    replyBar.classList.remove("active");
  };

  window.startEdit = function(id) {
    const msg = messagesCache[id];
    if (!msg) return;
    editingId = id;
    textInput.value = msg.text;
    sendBtn.textContent = "Save";
    cancelReply();
    textInput.focus();
  };

  window.deleteMsg = async function(id) {
    if (!confirm("Delete this message?")) return;
    try {
      await messagesRef.child(id).remove();
      const el = document.getElementById("msg-" + id);
      if (el) el.remove();
      delete messagesCache[id];
      checkEmptyState();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  // Keyboard shortcut: Escape to cancel reply or modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelReply();
      if (gifModal) { gifModal.remove(); gifModal = null; }
      const lightbox = document.querySelector('.lightbox-modal');
      if (lightbox) lightbox.remove();
    }
  });

  // =======================================================
  // ANIMATED 3-DOT TYPING INDICATOR
  // =======================================================
  const typingRef = () => db.ref(`rooms/${room}/typing/${myUid}`);

  function startTyping() {
    if (!typingTimer) {
      typingRef().set(true);
      typingRef().onDisconnect().remove();
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingRef().remove();
      typingTimer = null;
    }, 2500);
  }

  function stopTyping() {
    clearTimeout(typingTimer);
    typingTimer = null;
    typingRef().remove();
  }

  textInput.addEventListener('input', startTyping);

  db.ref(`rooms/${room}/typing`).on('value', async (snap) => {
    const typingUsers = snap.val() || {};
    delete typingUsers[myUid];
    
    const uids = Object.keys(typingUsers);
    if (!typingIndicator) return;
    
    if (uids.length === 0) {
      typingIndicator.innerHTML = "";
      return;
    }

    const names = [];
    for (const uid of uids) {
      if (!userProfilesCache[uid]) {
        const s = await db.ref('users/' + uid).once('value');
        if (s.exists()) userProfilesCache[uid] = s.val();
      }
      names.push(userProfilesCache[uid]?.name || 'Someone');
    }
    
    let text = "";
    if (names.length === 1) text = `${names[0]} is typing`;
    else if (names.length === 2) text = `${names[0]} and ${names[1]} are typing`;
    else text = `${names[0]} and ${names.length - 1} others are typing`;

    typingIndicator.innerHTML = `
      <span>${escapeHtml(text)}</span>
      <span class="typing-dots">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </span>
    `;
  });

  // =======================================================
  // ATTACHMENTS (IMAGE UPLOAD & GIF PICKER)
  // =======================================================
  attachBtn.onclick = (e) => {
    e.stopPropagation();
    attachMenu.classList.toggle("hidden");
  };

  document.addEventListener("click", () => attachMenu.classList.add("hidden"));

  attachImageBtn.onclick = (e) => {
    e.stopPropagation();
    attachMenu.classList.add("hidden");
    imageInput.click();
  };

  imageInput.onchange = async () => {
    const file = imageInput.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      imageInput.value = "";
      return;
    }
    if (file.size > 32 * 1024 * 1024) {
      alert("File too large. Max 32MB.");
      imageInput.value = "";
      return;
    }

    sendBtn.disabled = true;
    attachBtn.disabled = true;
    attachBtn.textContent = "⏳";
    textInput.placeholder = "Uploading image...";

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || "Upload failed");

      textInput.value = data.data.url;
      textInput.focus();
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      sendBtn.disabled = false;
      attachBtn.disabled = false;
      attachBtn.textContent = "+";
      textInput.placeholder = "Type a message...";
      imageInput.value = "";
    }
  };

  // GIF Picker Modal
  attachGifBtn.onclick = (e) => {
    e.stopPropagation();
    attachMenu.classList.add("hidden");
    openGifPanel();
  };

  async function openGifPanel(query = "") {
    currentGifQuery = query;
    const existing = document.getElementById("gifPanel");
    if (existing) existing.remove();

    gifModal = document.createElement("div");
    gifModal.id = "gifPanel";
    gifModal.className = "modal";
    gifModal.innerHTML = `
      <div class="modal-content" style="padding:0; max-width:420px;">
        <div style="padding: 14px; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 8px; align-items: center;">
          <div style="flex: 1; position: relative;">
            <input type="text" id="gifSearchInput" placeholder="Search GIFs..." 
              style="width: 100%; padding: 10px 14px 10px 36px; border-radius: 20px; font-size: 14px;"
              value="${escapeHtml(query)}" autocomplete="off" />
            <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); opacity: 0.5; pointer-events: none;">🔍</span>
          </div>
          <button id="gifCloseBtn" class="close-modal">×</button>
        </div>
        <div id="gifGrid" style="flex: 1; overflow-y: auto; padding: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; max-height: 55vh;">
          <div style="grid-column: 1 / -1; text-align: center; opacity: 0.5; padding: 20px;">Loading GIFs...</div>
        </div>
        <div style="padding: 8px 14px; border-top: 1px solid var(--border-subtle); font-size: 11px; color: var(--text-dim); text-align: center;">
          Powered by Klipy
        </div>
      </div>
    `;
    document.body.appendChild(gifModal);

    const searchInput = document.getElementById("gifSearchInput");
    const gifGrid = document.getElementById("gifGrid");
    const closeBtn = document.getElementById("gifCloseBtn");

    const closePanel = () => {
      if (gifModal) gifModal.remove();
      gifModal = null;
    };
    closeBtn.onclick = closePanel;
    gifModal.onclick = (e) => { if (e.target === gifModal) closePanel(); };

    searchInput.oninput = (e) => {
      clearTimeout(gifSearchDebounce);
      gifSearchDebounce = setTimeout(() => {
        currentGifQuery = e.target.value.trim();
        loadGifs(currentGifQuery, gifGrid);
      }, 250);
    };

    searchInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        clearTimeout(gifSearchDebounce);
        currentGifQuery = searchInput.value.trim();
        loadGifs(currentGifQuery, gifGrid);
      }
    };

    setTimeout(() => searchInput.focus(), 50);
    loadGifs(query, gifGrid);
  }

  async function loadGifs(query, gridEl) {
    gridEl.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; opacity: 0.5; padding: 20px;">Loading GIFs...</div>';
    
    try {
      const url = query 
        ? `${KLIPY_BASE_URL}/search?q=${encodeURIComponent(query)}&limit=30&key=${KLIPY_API_KEY}`
        : `${KLIPY_BASE_URL}/featured?limit=30&key=${KLIPY_API_KEY}`;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = data.results;
      
      if (!results || results.length === 0) {
        gridEl.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; opacity: 0.5; padding: 20px;">No GIFs found</div>';
        return;
      }

      gridEl.innerHTML = results.map(gif => {
        const media = gif.media_formats?.gif || gif.media_formats?.tinygif || gif.media_formats?.nanogif;
        const gifUrl = media?.url || gif.url;
        const previewUrl = gif.media_formats?.tinygif?.url || gif.media_formats?.nanogif?.url || media?.url || gifUrl;
        const description = gif.content_description || gif.title || 'GIF';
        return `
          <img src="${escapeHtml(previewUrl)}" 
               data-full="${escapeHtml(gifUrl)}"
               alt="${escapeHtml(description)}" 
               style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: transform 0.15s, border-color 0.15s;"
               onclick="selectGif(this.dataset.full)"
               onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='scale(1.04)'"
               onmouseout="this.style.borderColor='transparent'; this.style.transform='scale(1)'"
               loading="lazy">
        `;
      }).join('');
    } catch (err) {
      gridEl.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--danger); padding: 20px;">Failed to load: ' + escapeHtml(err.message) + '</div>';
    }
  }

  window.selectGif = function(url) {
    if (gifModal) gifModal.remove();
    gifModal = null;
    if (!myUid) return;
    
    const newMsg = { 
      uid: myUid, 
      name: myName, 
      avatarType: myAvatarType, 
      avatarValue: myAvatarValue, 
      text: url, 
      ts: firebase.database.ServerValue.TIMESTAMP 
    };
    if (replyingTo) {
      newMsg.replyToId = replyingTo.id;
      newMsg.replyToName = replyingTo.name;
      newMsg.replyToText = replyingTo.text;
    }
    messagesRef.push(newMsg);
    cancelReply();
  };

  // =======================================================
  // CHAT FORM SUBMIT
  // =======================================================
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = textInput.value.trim();
    stopTyping();
    if (!text) return;
    sendBtn.disabled = true;

    try {
      if (editingId) {
        await messagesRef.child(editingId).update({ text: text, edited: true });
        editingId = null;
        sendBtn.textContent = "Send";
      } else {
        const newMsg = {
          uid: myUid,
          name: myName,
          avatarType: myAvatarType,
          avatarValue: myAvatarValue,
          text: text,
          ts: firebase.database.ServerValue.TIMESTAMP
        };
        if (replyingTo) {
          newMsg.replyToId = replyingTo.id;
          newMsg.replyToName = replyingTo.name;
          newMsg.replyToText = replyingTo.text;
        }
        await messagesRef.push(newMsg);
        cancelReply();
      }
      textInput.value = "";
      textInput.focus();
    } catch (err) {
      alert("Failed to send: " + err.message);
    } finally {
      sendBtn.disabled = false;
    }
  });

  // =======================================================
  // MAIN INITIALIZATION & AUTH LISTENER
  // =======================================================
  auth.onAuthStateChanged(async (user) => {
    if (!user || user.isAnonymous) {
      window.location.href = 'login.html';
      return;
    }
    myUid = user.uid;

    // Real-time listener: Kick immediately if banned
    db.ref("bannedUsers/" + myUid).on("value", (snap) => {
      if (snap.exists() && snap.val() === true) {
        alert("Your account has been banned by an administrator.");
        auth.signOut().then(() => {
          window.location.href = 'login.html';
        });
      }
    });

    // Online Presence
    const myPresenceRef = db.ref("presence/" + myUid);
    myPresenceRef.set(true);
    myPresenceRef.onDisconnect().remove();

    db.ref("presence").on("value", async (snap) => {
      onlineUsers = snap.val() || {};
      const uids = Object.keys(onlineUsers);
      const missingUids = uids.filter(uid => !userProfilesCache[uid]);
      if (missingUids.length > 0) {
        const promises = missingUids.map(uid => db.ref('users/' + uid).once('value'));
        const snaps = await Promise.all(promises);
        snaps.forEach((s, i) => {
          if (s.exists()) userProfilesCache[missingUids[i]] = s.val();
        });
      }
      updateOnlineUI();
    });

    // Reactions Listener (Targeted updates)
    db.ref(`rooms/${room}/reactions`).on('value', (snap) => {
      const allReactions = snap.val() || {};
      
      Object.keys(messagesCache).forEach(msgId => {
        const container = document.querySelector(`#msg-${msgId} .reactions-container`);
        if (!container) return;
        
        container.innerHTML = '';
        const emojis = allReactions[msgId] || {};
        
        Object.keys(emojis).forEach(emoji => {
          const users = emojis[emoji];
          if (!users) return;
          const count = Object.keys(users).length;
          if (count === 0) return;
          const isMine = users[myUid] === true;
          
          const pill = document.createElement('div');
          pill.className = 'reaction-pill' + (isMine ? ' mine' : '');
          pill.innerHTML = `${emoji} <span>${count}</span>`;
          pill.onclick = (e) => {
            e.stopPropagation();
            const ref = db.ref(`rooms/${room}/reactions/${msgId}/${emoji}/${myUid}`);
            if (isMine) ref.remove(); else ref.set(true);
          };
          container.appendChild(pill);
        });
      });
    });

    // Profile Load & Header Setup
    const snap = await db.ref('users/' + myUid).once('value');
    if (!snap.exists()) {
      window.location.href = 'profile.html';
      return;
    }

    const profile = snap.val();
    myName = profile.name;
    myAvatarType = profile.avatarType;
    myAvatarValue = profile.avatarValue;

    // Build Modern Header
    header.innerHTML = "";

    // User Profile Chip
    const userChip = document.createElement("div");
    userChip.className = "header-user-chip";
    userChip.title = "Edit your profile";
    userChip.onclick = () => window.location.href = 'profile.html';
    userChip.appendChild(createAvatarEl(myAvatarType, myAvatarValue, myName, myUid));
    const nameStrong = document.createElement("strong");
    nameStrong.textContent = myName;
    userChip.appendChild(nameStrong);

    // Room Label Pill
    const roomBadge = document.createElement("div");
    roomBadge.className = "header-room-badge";
    roomBadge.innerHTML = `<span class="hash">#</span> ${escapeHtml(room)}`;

    // Room Switcher Button
    const roomDrawerBtn = document.createElement("button");
    roomDrawerBtn.className = "btn-room-drawer";
    roomDrawerBtn.innerHTML = "<span>💬</span> Rooms";
    roomDrawerBtn.onclick = toggleRoomPanel;

    // Online Users Badge
    const onlinePill = document.createElement("div");
    onlinePill.className = "online-pill";
    onlinePill.onclick = toggleOnlineModal;
    onlinePill.innerHTML = `<span class="pulse-dot"></span> <span id="onlineCountText">0 online</span>`;

    // Logout Button
    const logoutBtn = document.createElement("button");
    logoutBtn.className = "btn-header-logout";
    logoutBtn.textContent = "Logout";
    logoutBtn.onclick = () => auth.signOut().then(() => location.href = 'login.html');

    header.appendChild(userChip);
    header.appendChild(roomBadge);
    header.appendChild(roomDrawerBtn);
    header.appendChild(onlinePill);
    header.appendChild(logoutBtn);
    updateOnlineUI();

    chatForm.classList.remove("hidden");
    textInput.focus();

    // Check empty state initially
    checkEmptyState();

    // Direct, reliable real-time message stream
    messagesRef.orderByChild("ts").limitToLast(50).on("child_added", (snap) => {
      const val = snap.val();
      const key = snap.key;
      if (!val) return;
      if (messagesCache[key]) return;
      if (val.ts && val.ts < oldestTs) oldestTs = val.ts;
      addMessage(val, key, false);
    });
    
    // Message Updates (Edits)
    messagesRef.on("child_changed", (s) => {
      const oldEl = document.getElementById("msg-" + s.key);
      const newRow = renderMessage(s.val(), s.key);
      cacheProfile(s.val());
      messagesCache[s.key] = s.val();
      if (oldEl) oldEl.replaceWith(newRow);
      updateOnlineUI();
    });
    
    // Message Deletions
    messagesRef.on("child_removed", (s) => {
      const el = document.getElementById("msg-" + s.key);
      if (el) el.remove();
      delete messagesCache[s.key];
      checkEmptyState();
    });
  });
})();
