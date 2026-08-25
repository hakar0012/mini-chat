// =======================================================
// MINI GROUP CHAT - COMPLETE LOGIC WITH MENTIONS & AUDIO
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
  const attachPollBtn = document.getElementById("attachPollBtn");
  const typingIndicator = document.getElementById("typingIndicator");
  const mentionPopup = document.getElementById("mentionPopup");
  const jumpBottomBtn = document.getElementById("jumpBottomBtn");
  const jumpBottomText = document.getElementById("jumpBottomText");
  const emojiBtn = document.getElementById("emojiBtn");
  const emojiPickerPopup = document.getElementById("emojiPickerPopup");

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
  let isInitialLoadDone = false;
  let mentionSelectedIndex = 0;
  let currentMentionMatches = [];
  let unreadCount = 0;
  let pollVotesCache = {};

  // =======================================================
  // AUDIO CHIMES & BROWSER NOTIFICATIONS PREFERENCES
  // =======================================================
  const DEFAULT_NOTIF_PREFS = {
    masterMute: false,
    normalSound: true,
    normalDesktop: true,
    mentionSound: true,
    mentionDesktop: true
  };

  function getNotifPrefs() {
    try {
      const raw = localStorage.getItem('chat_notif_prefs');
      return raw ? { ...DEFAULT_NOTIF_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_NOTIF_PREFS };
    } catch (e) {
      return { ...DEFAULT_NOTIF_PREFS };
    }
  }

  window.saveNotifPrefs = function() {
    const prefs = {
      masterMute: document.getElementById('notifMasterMute')?.checked || false,
      normalSound: document.getElementById('notifNormalSound')?.checked || false,
      normalDesktop: document.getElementById('notifNormalDesktop')?.checked || false,
      mentionSound: document.getElementById('notifMentionSound')?.checked || false,
      mentionDesktop: document.getElementById('notifMentionDesktop')?.checked || false
    };
    localStorage.setItem('chat_notif_prefs', JSON.stringify(prefs));
    updateSoundBtn();

    if ((prefs.normalDesktop || prefs.mentionDesktop) && !prefs.masterMute) {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  };

  window.toggleNotifModal = function() {
    const modal = document.getElementById('notifModal');
    if (!modal) return;
    const isHidden = modal.classList.toggle('hidden');
    if (!isHidden) loadNotifPrefsIntoUI();
  };

  function loadNotifPrefsIntoUI() {
    const prefs = getNotifPrefs();
    if (document.getElementById('notifMasterMute')) document.getElementById('notifMasterMute').checked = prefs.masterMute;
    if (document.getElementById('notifNormalSound')) document.getElementById('notifNormalSound').checked = prefs.normalSound;
    if (document.getElementById('notifNormalDesktop')) document.getElementById('notifNormalDesktop').checked = prefs.normalDesktop;
    if (document.getElementById('notifMentionSound')) document.getElementById('notifMentionSound').checked = prefs.mentionSound;
    if (document.getElementById('notifMentionDesktop')) document.getElementById('notifMentionDesktop').checked = prefs.mentionDesktop;
  }

  window.testSound = function(isMention) {
    playChime(isMention, true);
  };

  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function updateSoundBtn() {
    const btn = document.getElementById('soundToggleBtn');
    if (btn) {
      const prefs = getNotifPrefs();
      btn.innerHTML = prefs.masterMute ? '🔕' : '🔔';
      btn.title = prefs.masterMute ? 'Notifications are muted (Click for settings)' : 'Notification settings';
    }
  }

  function playChime(isMention = false, force = false) {
    const prefs = getNotifPrefs();
    if (!force) {
      if (prefs.masterMute) return;
      if (isMention && !prefs.mentionSound) return;
      if (!isMention && !prefs.normalSound) return;
    }

    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (isMention) {
        // Cheerful 3-note arpeggio (G5, B5, E6)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(784, now);
        osc.frequency.setValueAtTime(987, now + 0.08);
        osc.frequency.setValueAtTime(1318, now + 0.16);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else {
        // Soft marimba pop (D5 -> A5)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.07);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {
      console.warn("Audio chime error:", e);
    }
  }

  function sendNotification(title, body) {
    const prefs = getNotifPrefs();
    if (prefs.masterMute) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      try {
        const notif = new Notification(title, {
          body: (body || "").substring(0, 100)
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (e) {
        console.warn("Notification error:", e);
      }
    }
  }

  // =======================================================
  // @MENTION AUTOCOMPLETE SYSTEM
  // =======================================================
  function initMentionSystem() {
    if (!mentionPopup) return;

    textInput.addEventListener("input", handleMentionInput);
    textInput.addEventListener("keydown", handleMentionKeydown);
    document.addEventListener("click", (e) => {
      if (!mentionPopup.contains(e.target) && e.target !== textInput) {
        closeMentionPopup();
      }
    });
  }

  function handleMentionInput() {
    const val = textInput.value;
    const cursorPos = textInput.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);

    if (!match) {
      closeMentionPopup();
      return;
    }

    const query = match[1].toLowerCase();
    
    // Collect unique users from cache & online users
    const candidatesMap = {};
    Object.keys(onlineUsers).forEach(uid => {
      const p = userProfilesCache[uid];
      if (p && p.name) candidatesMap[p.name.toLowerCase()] = { ...p, uid: uid };
    });
    Object.values(userProfilesCache).forEach(p => {
      if (p && p.name && !candidatesMap[p.name.toLowerCase()]) {
        candidatesMap[p.name.toLowerCase()] = p;
      }
    });

    const candidates = Object.values(candidatesMap).filter(p => {
      return p.name && p.name.toLowerCase().startsWith(query);
    });

    if (candidates.length === 0) {
      closeMentionPopup();
      return;
    }

    currentMentionMatches = candidates;
    mentionSelectedIndex = 0;
    renderMentionPopup(match.index, match[0].length);
  }

  function renderMentionPopup(matchIndex, matchLength) {
    mentionPopup.innerHTML = "";
    mentionPopup.classList.remove("hidden");

    currentMentionMatches.forEach((user, idx) => {
      const isOnline = onlineUsers[user.uid] === true;
      const div = document.createElement("div");
      div.className = "mention-item" + (idx === mentionSelectedIndex ? " selected" : "");
      div.appendChild(createAvatarEl(user.avatarType, user.avatarValue, user.name, user.uid));

      const nameSpan = document.createElement("span");
      nameSpan.className = "mention-item-name";
      nameSpan.textContent = "@" + user.name;
      div.appendChild(nameSpan);

      if (isOnline) {
        const statusSpan = document.createElement("span");
        statusSpan.className = "mention-item-status";
        statusSpan.textContent = "● online";
        div.appendChild(statusSpan);
      }

      div.onmousedown = (e) => {
        e.preventDefault();
        insertMention(user.name, matchIndex, matchLength);
      };

      mentionPopup.appendChild(div);
    });
  }

  function handleMentionKeydown(e) {
    if (mentionPopup.classList.contains("hidden")) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      mentionSelectedIndex = (mentionSelectedIndex + 1) % currentMentionMatches.length;
      updateMentionSelection();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      mentionSelectedIndex = (mentionSelectedIndex - 1 + currentMentionMatches.length) % currentMentionMatches.length;
      updateMentionSelection();
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (currentMentionMatches[mentionSelectedIndex]) {
        e.preventDefault();
        const val = textInput.value;
        const cursorPos = textInput.selectionStart;
        const textBeforeCursor = val.slice(0, cursorPos);
        const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
        if (match) {
          insertMention(currentMentionMatches[mentionSelectedIndex].name, match.index, match[0].length);
        }
      }
    } else if (e.key === "Escape") {
      closeMentionPopup();
    }
  }

  function updateMentionSelection() {
    const items = mentionPopup.querySelectorAll(".mention-item");
    items.forEach((it, idx) => {
      it.classList.toggle("selected", idx === mentionSelectedIndex);
    });
  }

  function insertMention(username, matchIndex, matchLength) {
    const val = textInput.value;
    const before = val.slice(0, matchIndex);
    const after = val.slice(matchIndex + matchLength);
    textInput.value = before + "@" + username + " " + after;
    const newCursor = matchIndex + username.length + 2;
    textInput.selectionStart = newCursor;
    textInput.selectionEnd = newCursor;
    closeMentionPopup();
    textInput.focus();
  }

  function closeMentionPopup() {
    mentionPopup.classList.add("hidden");
    currentMentionMatches = [];
    mentionSelectedIndex = 0;
  }

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
        avatarValue: data.avatarValue,
        uid: data.uid
      };
    }
  }

  function createAvatarEl(type, value, name, uid) {
    const el = document.createElement("div");
    el.style.cssText = "width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;flex-shrink:0;user-select:none;box-shadow:0 1px 4px rgba(0,0,0,0.2);";
    if (type === 'preset') {
      el.textContent = value || '👤';
      el.style.background = 'var(--bg-card)';
    } else {
      el.textContent = (name || '?').charAt(0).toUpperCase();
      el.style.background = value || 'var(--primary)';
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

    // Markdown: `code`, *bold*, _italic_, ~~strike~~, ||spoiler||
    safeText = safeText.replace(/`([^`]+)`/g, '<code>$1</code>');
    safeText = safeText.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    safeText = safeText.replace(/_([^_]+)_/g, '<em>$1</em>');
    safeText = safeText.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    safeText = safeText.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

    return safeText;
  }

  // Lightbox Modal
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
          container.style.marginTop = "4px";
          const img = document.createElement("img");
          img.src = part;
          img.style.cssText = "max-width:min(300px, 100%);max-height:260px;border-radius:8px;display:block;cursor:zoom-in;";
          img.loading = "lazy";
          img.onclick = () => openLightbox(img.src);
          img.onerror = () => {
            container.innerHTML = "";
            const a = document.createElement("a");
            a.href = part; a.target = "_blank"; a.rel = "noopener noreferrer";
            a.textContent = part; a.style.cssText = "color:#818cf8;word-break:break-all;text-decoration:underline;";
            container.appendChild(a);
          };
          container.appendChild(img);
          fragment.appendChild(container);
        } else if (isVideo) {
          const container = document.createElement("div");
          container.style.marginTop = "4px";
          const video = document.createElement("video");
          video.src = part;
          video.controls = true;
          video.style.cssText = "max-width:min(300px, 100%);max-height:260px;border-radius:8px;";
          video.onerror = () => {
            container.innerHTML = "";
            const a = document.createElement("a");
            a.href = part; a.target = "_blank"; a.rel = "noopener noreferrer";
            a.textContent = part; a.style.cssText = "color:#818cf8;word-break:break-all;text-decoration:underline;";
            container.appendChild(a);
          };
          container.appendChild(video);
          fragment.appendChild(container);
        } else {
          const a = document.createElement("a");
          a.href = part; a.target = "_blank"; a.rel = "noopener noreferrer";
          a.textContent = part;
          a.style.cssText = "color:#a5b4fc;text-decoration:underline;word-break:break-all;";
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

    // Reply Quote inside Message
    if (data.replyToId) {
      const rep = document.createElement("div");
      rep.className = "reply-preview";
      rep.innerHTML = `
        <div class="reply-preview-name">↩ ${escapeHtml(data.replyToName || "anon")}</div>
        <div class="reply-preview-text">${parseMarkdownAndMentions(data.replyToText || "")}</div>
      `;
      rep.onclick = (e) => {
        e.stopPropagation();
        const targetEl = document.getElementById('msg-' + data.replyToId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const bubble = targetEl.querySelector('.msg') || targetEl;
          bubble.classList.remove('highlight');
          void bubble.offsetWidth; // trigger reflow
          bubble.classList.add('highlight');
          setTimeout(() => bubble.classList.remove('highlight'), 1800);
        }
      };
      msgBox.appendChild(rep);
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `${escapeHtml(data.name || "anon")} · ${timeLabel(data.ts)} ${data.edited ? '<span class="edited">(edited)</span>' : ''}`;

    const body = document.createElement("div");
    if (data.text) {
      body.appendChild(parseMessageText(data.text));
    }

    // Render Poll Component if message has a poll
    if (data.isPoll && data.poll) {
      const pollWrapper = document.createElement("div");
      pollWrapper.className = "poll-wrapper";
      pollWrapper.appendChild(buildPollDOM(data.poll, msgId));
      body.appendChild(pollWrapper);
    }

    msgBox.appendChild(meta);
    msgBox.appendChild(body);

    const reactionsContainer = document.createElement("div");
    reactionsContainer.className = "reactions-container";
    msgBox.appendChild(reactionsContainer);

    // Floating Action Toolbar attached directly to bubble
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

    msgBox.appendChild(toolbar);
    row.appendChild(avatar);
    row.appendChild(msgBox);

    // Mobile tap support
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

  window.jumpToBottom = function() {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
    hideJumpBtn();
  };

  function showJumpBtn(count) {
    if (!jumpBottomBtn) return;
    jumpBottomBtn.classList.remove('hidden');
    if (jumpBottomText) {
      jumpBottomText.textContent = count > 1 ? `${count} new messages` : 'New messages';
    }
  }

  function hideJumpBtn() {
    if (!jumpBottomBtn) return;
    unreadCount = 0;
    jumpBottomBtn.classList.add('hidden');
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
      const nearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
      messagesEl.appendChild(row);
      const isMine = data.uid === myUid;
      
      if (nearBottom || isMine) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
        hideJumpBtn();
      } else if (isInitialLoadDone) {
        unreadCount++;
        showJumpBtn(unreadCount);
      }

      // Audio and Notification handling for incoming live messages
      if (isInitialLoadDone && !isMine) {
        const prefs = getNotifPrefs();
        const isMention = myName && data.text && data.text.toLowerCase().includes('@' + myName.toLowerCase());
        
        playChime(isMention);

        if (document.hidden && !prefs.masterMute) {
          if (isMention && prefs.mentionDesktop) {
            sendNotification(`@${data.name || 'Someone'} mentioned you in #${room}`, data.text || 'Sent an attachment');
          } else if (!isMention && prefs.normalDesktop) {
            sendNotification(`${data.name || 'Someone'} in #${room}`, data.text || 'Sent an attachment');
          }
        }
      }
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
    const isNearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
    if (isNearBottom) {
      hideJumpBtn();
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
    replyName.innerHTML = `<span>↩ Replying to <strong>@${escapeHtml(msg.name || "anon")}</strong>: ${parseMarkdownAndMentions(replyingTo.text)}</span>`;
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

  // Keyboard shortcut: Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cancelReply();
      closeMentionPopup();
      if (gifModal) { gifModal.remove(); gifModal = null; }
      const lightbox = document.querySelector('.lightbox-modal');
      if (lightbox) lightbox.remove();
    }
  });

  // =======================================================
  // ANIMATED TYPING INDICATOR
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

  // GIF Picker
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
  // BUILT-IN EMOJI PICKER WITH KEYWORD SEARCH
  // =======================================================
  const EMOJI_DATABASE = [
    // Smileys
    { e: '😀', k: 'grinning face happy smile laugh' },
    { e: '😃', k: 'smiley happy joy laugh' },
    { e: '😄', k: 'smile happy laugh eyes' },
    { e: '😁', k: 'beam grin teeth happy' },
    { e: '😆', k: 'laugh haha lol closed eyes' },
    { e: '😅', k: 'sweat smile relief cold' },
    { e: '😂', k: 'joy laugh tears haha lol funny' },
    { e: '🤣', k: 'rofl rolling on floor laughing lol funny' },
    { e: '😊', k: 'blush happy smile proud warm' },
    { e: '😇', k: 'innocent angel halo holy' },
    { e: '🙂', k: 'slight smile nice' },
    { e: '🙃', k: 'upside down silly sarcasm' },
    { e: '😉', k: 'wink flirting joke' },
    { e: '😍', k: 'heart eyes love admire crush' },
    { e: '🥰', k: 'in love hearts smiling affectionate' },
    { e: '😘', k: 'kiss blowing love romance' },
    { e: '😋', k: 'yum delicious tongue tasty food' },
    { e: '😛', k: 'tongue silly cheeky' },
    { e: '😜', k: 'wink tongue crazy goofy' },
    { e: '🤪', k: 'zany goofy crazy wild' },
    { e: '😎', k: 'sunglasses cool stylish boss' },
    { e: '🥳', k: 'party celebrate hat horn birthday' },
    { e: '😏', k: 'smirk sneaky suggestive' },
    { e: '😒', k: 'unamused annoyed bored' },
    { e: '😞', k: 'disappointed sad down' },
    { e: '🥺', k: 'pleading puppy eyes please cute beg' },
    { e: '😢', k: 'cry tear sad upset' },
    { e: '😭', k: 'sob crying tears loud heartbreak' },
    { e: '😤', k: 'triumph steam proud angry' },
    { e: '😠', k: 'angry mad grumpy frustrated' },
    { e: '😡', k: 'rage red mad furious anger' },
    { e: '🤯', k: 'exploding head mind blown shocked' },
    { e: '😳', k: 'flushed shocked embarrassed stunned' },
    { e: '🥵', k: 'hot sweating summer fever spicy' },
    { e: '🥶', k: 'cold freezing winter frost chill' },
    { e: '😱', k: 'scream fear shocked horrified omg' },
    { e: '😨', k: 'fear scared worried' },
    { e: '🤔', k: 'thinking ponder hmm wonder' },
    { e: '🤗', k: 'hug embrace warm love' },
    { e: '🤫', k: 'shh quiet secret silence' },
    { e: '🤐', k: 'zipper mouth silent secret mute' },
    { e: '😴', k: 'sleeping tired zzz bedtime' },
    { e: '🤮', k: 'vomit sick puke gross disgusting' },
    { e: '🤡', k: 'clown foolish circus silly' },
    { e: '💩', k: 'poop shit crap funny' },
    { e: '👻', k: 'ghost spooky halloween boocool' },
    { e: '💀', k: 'skull dead skeleton laugh died rip' },
    { e: '👽', k: 'alien ufo extra extraterrestrial' },
    { e: '🤖', k: 'robot bot tech AI' },

    // Gestures & People
    { e: '👍', k: 'thumbs up like approve good yes +1' },
    { e: '👎', k: 'thumbs down dislike bad no -1' },
    { e: '👏', k: 'clap applause bravo cheering' },
    { e: '🙌', k: 'raised hands praise celebrate yay' },
    { e: '👐', k: 'open hands embrace' },
    { e: '🤝', k: 'handshake deal agree partner business' },
    { e: '✌️', k: 'peace victory two v' },
    { e: '🤞', k: 'crossed fingers luck hope wish' },
    { e: '🤟', k: 'love you gesture ily' },
    { e: '🤘', k: 'rock on heavy metal horns party' },
    { e: '🤙', k: 'call me hang loose shaka chill' },
    { e: '👈', k: 'point left finger' },
    { e: '👉', k: 'point right finger' },
    { e: '👆', k: 'point up finger' },
    { e: '👇', k: 'point down finger' },
    { e: '☝️', k: 'point up one index' },
    { e: '✋', k: 'hand raised stop five high' },
    { e: '🤚', k: 'raised back hand stop' },
    { e: '🖐️', k: 'five splayed fingers wave' },
    { e: '🖖', k: 'vulcan spock salute star trek' },
    { e: '👋', k: 'wave hello goodbye hi bye' },
    { e: '💪', k: 'muscle flex strong power gym fitness' },
    { e: '🖕', k: 'middle finger rude angry fu' },
    { e: '✍️', k: 'writing pen hand write note' },
    { e: '🙏', k: 'pray please thanks thank you namaste bless' },
    { e: '💅', k: 'nail polish sassy care fabulous' },
    { e: '🫂', k: 'people hugging hug friends comfort' },
    { e: '👀', k: 'eyes look see glance watching peek' },
    { e: '🧠', k: 'brain smart think mind genius' },
    { e: '🫀', k: 'heart anatomical organ cardio' },
    { e: '👑', k: 'crown king queen royal win champion leader' },

    // Hearts & Vibes
    { e: '❤️', k: 'red heart love passion romantic' },
    { e: '🧡', k: 'orange heart love' },
    { e: '💛', k: 'yellow heart friendship' },
    { e: '💚', k: 'green heart nature' },
    { e: '💙', k: 'blue heart peace' },
    { e: '💜', k: 'purple heart purple love' },
    { e: '🖤', k: 'black heart dark emo' },
    { e: '🤍', k: 'white heart pure peace' },
    { e: '🤎', k: 'brown heart' },
    { e: '💔', k: 'broken heart sad breakup pain' },
    { e: '❤️‍🔥', k: 'heart on fire passion burning love' },
    { e: '💕', k: 'two hearts love floating' },
    { e: '💖', k: 'sparkling heart love shine sparkle' },
    { e: '💗', k: 'growing heart pulse expand' },
    { e: '💘', k: 'cupid arrow love struck' },
    { e: '💝', k: 'gift ribbon heart present' },
    { e: '✨', k: 'sparkles stars magic shiny sparkle clean aesthetic' },
    { e: '🌟', k: 'glowing star shine bright gold' },
    { e: '⭐', k: 'star favorite rate yellow' },
    { e: '🔥', k: 'fire lit flame hot burn hype' },
    { e: '💥', k: 'collision boom bang explode blast' },
    { e: '💯', k: 'hundred percent perfect score 100 real' },
    { e: '💢', k: 'anger mad symbol comic' },
    { e: '🎉', k: 'party popper confetti celebrate congratulations' },
    { e: '🎊', k: 'confetti ball celebration party' },
    { e: '🎈', k: 'balloon birthday party celebration' },
    { e: '🚀', k: 'rocket launch moon fast speed boost crypto' },
    { e: '💎', k: 'gem stone diamond rich shiny luxury' },
    { e: '🌈', k: 'rainbow pride colors nature sky' },
    { e: '⚡', k: 'lightning electric thunder fast power shock energy' },
    { e: '🍀', k: 'clover four leaf lucky luck irish' },

    // Food & Fun & Misc
    { e: '🍕', k: 'pizza slice cheese food lunch dinner fast food' },
    { e: '🍔', k: 'burger hamburger fast food beef lunch' },
    { e: '🍟', k: 'fries french fries snack potato fast food' },
    { e: '🌭', k: 'hotdog sausage fast food snack' },
    { e: '🍿', k: 'popcorn movie snack cinema film' },
    { e: '🥞', k: 'pancakes breakfast sweet syrup' },
    { e: '🧇', k: 'waffle breakfast sweet' },
    { e: '🥓', k: 'bacon meat breakfast crispy pork' },
    { e: '🥩', k: 'steak meat beef dinner steakhouse' },
    { e: '🍗', k: 'chicken leg drumstick meat poultry' },
    { e: '🍩', k: 'doughnut donut sweet pastry glaze' },
    { e: '🍪', k: 'cookie chocolate snack sweet biscuit' },
    { e: '🎂', k: 'birthday cake sweet celebrate party anniversary' },
    { e: '🍫', k: 'chocolate bar sweet dessert cocoa' },
    { e: '🍬', k: 'candy sweet treat sugar' },
    { e: '🍭', k: 'lollipop candy sweet treat' },
    { e: '🍺', k: 'beer drink alcohol pub bar mug cold' },
    { e: '🍻', k: 'cheers beers clinking party toast celebrate' },
    { e: '🥂', k: 'champagne glasses toast cheers celebrate wedding' },
    { e: '🍷', k: 'wine glass red alcohol drink dinner' },
    { e: '🥃', k: 'whiskey bourbon tumbler liquor drink' },
    { e: '🍸', k: 'cocktail martini drink olive bar' },
    { e: '🍹', k: 'tropical drink cocktail summer beach' },
    { e: '☕', k: 'coffee tea warm cup cafe morning espresso' },
    { e: '🍵', k: 'matcha green tea cup hot' },
    { e: '🥤', k: 'soda cup with straw drink beverage cola' },
    { e: '🎮', k: 'game controller gaming play ps xbox video game' },
    { e: '🎲', k: 'dice game roll luck board game chance' },
    { e: '🎯', k: 'target dart bullseye goal accurate hit' },
    { e: '🏆', k: 'trophy champion win first award tournament' },
    { e: '🥇', k: 'first medal gold winner champion' },
    { e: '⚽', k: 'soccer football ball sport world cup' },
    { e: '🏀', k: 'basketball ball sport nba hoop' },
    { e: '🎸', k: 'guitar rock music instrument acoustic electric' },
    { e: '🎵', k: 'music note song melody audio tune' },
    { e: '🎶', k: 'musical notes audio sound songs playlist' }
  ];

  const EMOJI_CATEGORIES = {
    smileys: { icon: '😀', name: 'Smileys', start: 0, end: 49 },
    hands: { icon: '👍', name: 'Gestures', start: 49, end: 79 },
    hearts: { icon: '❤️', name: 'Hearts', start: 79, end: 110 },
    fun: { icon: '🍕', name: 'Food & Fun', start: 110, end: EMOJI_DATABASE.length }
  };

  let activeEmojiTab = 'smileys';

  function initEmojiPicker() {
    if (!emojiBtn || !emojiPickerPopup) return;

    emojiBtn.onclick = (e) => {
      e.stopPropagation();
      toggleEmojiPicker();
    };

    document.addEventListener("click", (e) => {
      if (emojiPickerPopup && !emojiPickerPopup.contains(e.target) && e.target !== emojiBtn) {
        closeEmojiPicker();
      }
    });
  }

  function toggleEmojiPicker() {
    const isHidden = emojiPickerPopup.classList.toggle("hidden");
    if (!isHidden) {
      buildEmojiPickerDOM();
    }
  }

  function closeEmojiPicker() {
    if (emojiPickerPopup) emojiPickerPopup.classList.add("hidden");
  }

  function buildEmojiPickerDOM() {
    emojiPickerPopup.innerHTML = `
      <div class="emoji-picker-header">
        <input type="text" id="emojiSearchInput" class="emoji-search-input" placeholder="Search emojis (e.g. smile, fire, pizza)..." autocomplete="off" />
      </div>
      <div class="emoji-picker-tabs" id="emojiPickerTabs"></div>
      <div class="emoji-picker-grid" id="emojiGrid"></div>
    `;

    const tabsEl = document.getElementById("emojiPickerTabs");
    Object.keys(EMOJI_CATEGORIES).forEach(catKey => {
      const tab = document.createElement("div");
      tab.className = "emoji-tab" + (catKey === activeEmojiTab ? " active" : "");
      tab.textContent = EMOJI_CATEGORIES[catKey].icon;
      tab.title = EMOJI_CATEGORIES[catKey].name;
      tab.onclick = (e) => {
        e.stopPropagation();
        activeEmojiTab = catKey;
        const searchInp = document.getElementById("emojiSearchInput");
        if (searchInp) searchInp.value = "";
        updateEmojiTabsUI();
        renderEmojiGrid("");
      };
      tabsEl.appendChild(tab);
    });

    const searchInput = document.getElementById("emojiSearchInput");
    searchInput.oninput = (e) => {
      const query = e.target.value.trim().toLowerCase();
      renderEmojiGrid(query);
    };

    renderEmojiGrid("");
    setTimeout(() => searchInput.focus(), 30);
  }

  function updateEmojiTabsUI() {
    const tabs = document.querySelectorAll(".emoji-tab");
    const catKeys = Object.keys(EMOJI_CATEGORIES);
    tabs.forEach((t, i) => {
      t.classList.toggle("active", catKeys[i] === activeEmojiTab);
    });
  }

  function renderEmojiGrid(query = "") {
    const gridEl = document.getElementById("emojiGrid");
    if (!gridEl) return;
    gridEl.innerHTML = "";

    let items = [];
    if (query) {
      items = EMOJI_DATABASE.filter(item => {
        return item.k.includes(query) || item.e.includes(query);
      });
    } else {
      const cat = EMOJI_CATEGORIES[activeEmojiTab];
      items = EMOJI_DATABASE.slice(cat.start, cat.end);
    }

    if (items.length === 0) {
      gridEl.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 24px 0; font-size: 13px;">No matching emojis</div>';
      return;
    }

    items.forEach(item => {
      const div = document.createElement("div");
      div.className = "emoji-item";
      div.textContent = item.e;
      div.title = item.k.split(' ')[0];
      div.onclick = (e) => {
        e.stopPropagation();
        insertEmoji(item.e);
      };
      gridEl.appendChild(div);
    });
  }

  function insertEmoji(emoji) {
    const val = textInput.value;
    const start = textInput.selectionStart || 0;
    const end = textInput.selectionEnd || 0;
    textInput.value = val.slice(0, start) + emoji + val.slice(end);
    const newPos = start + emoji.length;
    textInput.selectionStart = newPos;
    textInput.selectionEnd = newPos;
    textInput.focus();
  }

  // =======================================================
  // POLL SYSTEM (VOTING & CREATION)
  // =======================================================
  function buildPollDOM(poll, msgId) {
    const pollBox = document.createElement("div");
    pollBox.className = "poll-container";

    const pollHeader = document.createElement("div");
    pollHeader.className = "poll-question";
    pollHeader.innerHTML = `<span>📊</span> <span>${escapeHtml(poll.question || "Poll")}</span>`;
    pollBox.appendChild(pollHeader);

    const optionsBox = document.createElement("div");
    optionsBox.className = "poll-options";

    const votes = (pollVotesCache && pollVotesCache[msgId]) || {};
    const options = poll.options || [];

    // Count votes per option
    const counts = new Array(options.length).fill(0);
    let totalVotes = 0;
    let myVotedIndex = -1;

    Object.keys(votes).forEach(uid => {
      const optIdx = votes[uid];
      if (typeof optIdx === 'number' && optIdx >= 0 && optIdx < options.length) {
        counts[optIdx]++;
        totalVotes++;
        if (uid === myUid) myVotedIndex = optIdx;
      }
    });

    options.forEach((optText, idx) => {
      const count = counts[idx];
      const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      const hasVotedThis = (myVotedIndex === idx);

      const optBtn = document.createElement("div");
      optBtn.className = "poll-option-btn" + (hasVotedThis ? " voted" : "");
      optBtn.onclick = (e) => {
        e.stopPropagation();
        togglePollVote(msgId, idx);
      };

      const fillEl = document.createElement("div");
      fillEl.className = "poll-option-fill";
      fillEl.style.width = percent + "%";
      optBtn.appendChild(fillEl);

      const contentEl = document.createElement("div");
      contentEl.className = "poll-option-content";

      const labelEl = document.createElement("div");
      labelEl.className = "poll-option-label";
      if (hasVotedThis) {
        labelEl.innerHTML = `<span class="poll-option-check">✓</span> <span>${escapeHtml(optText)}</span>`;
      } else {
        labelEl.innerHTML = `<span>${escapeHtml(optText)}</span>`;
      }

      const statsEl = document.createElement("div");
      statsEl.className = "poll-option-stats";
      statsEl.textContent = `${count} (${percent}%)`;

      contentEl.appendChild(labelEl);
      contentEl.appendChild(statsEl);
      optBtn.appendChild(contentEl);
      optionsBox.appendChild(optBtn);
    });

    pollBox.appendChild(optionsBox);

    const pollFooter = document.createElement("div");
    pollFooter.className = "poll-footer";
    pollFooter.innerHTML = `
      <span>${totalVotes} total vote${totalVotes === 1 ? '' : 's'}</span>
      <span>${myVotedIndex >= 0 ? 'Tap to change vote' : 'Tap option to vote'}</span>
    `;
    pollBox.appendChild(pollFooter);

    return pollBox;
  }

  function updateAllPollUIs() {
    Object.keys(messagesCache).forEach(msgId => {
      const data = messagesCache[msgId];
      if (data && data.isPoll && data.poll) {
        const rowEl = document.getElementById("msg-" + msgId);
        if (rowEl) {
          const wrapper = rowEl.querySelector(".poll-wrapper");
          if (wrapper) {
            wrapper.innerHTML = "";
            wrapper.appendChild(buildPollDOM(data.poll, msgId));
          }
        }
      }
    });
  }

  window.togglePollVote = async function(msgId, optionIndex) {
    if (!myUid) {
      alert("Please sign in to vote.");
      return;
    }
    const msg = messagesCache[msgId];
    if (!msg || !msg.poll) return;

    if (!pollVotesCache[msgId]) pollVotesCache[msgId] = {};
    const hasVotedThis = (pollVotesCache[msgId][myUid] === optionIndex);

    // Optimistic local update
    if (hasVotedThis) {
      delete pollVotesCache[msgId][myUid];
    } else {
      pollVotesCache[msgId][myUid] = optionIndex;
    }
    updateAllPollUIs();

    // Firebase Realtime update
    try {
      const voteRef = db.ref(`rooms/${room}/pollVotes/${msgId}/${myUid}`);
      if (hasVotedThis) {
        await voteRef.remove();
      } else {
        await voteRef.set(optionIndex);
      }
    } catch (err) {
      console.warn("Poll vote error:", err);
    }
  };

  window.togglePollModal = function() {
    const modal = document.getElementById("pollModal");
    if (!modal) return;
    const isHidden = modal.classList.toggle("hidden");
    if (!isHidden) {
      const qInput = document.getElementById("pollQuestionInput");
      if (qInput) {
        qInput.value = "";
        qInput.focus();
      }
      const container = document.getElementById("pollOptionsContainer");
      if (container) {
        container.innerHTML = `
          <input type="text" class="room-panel-input poll-option-input" placeholder="Option 1" required maxlength="80" autocomplete="off" />
          <input type="text" class="room-panel-input poll-option-input" placeholder="Option 2" required maxlength="80" autocomplete="off" />
        `;
      }
    }
  };

  window.addPollOptionRow = function() {
    const container = document.getElementById("pollOptionsContainer");
    if (!container) return;
    const count = container.querySelectorAll(".poll-option-input").length;
    if (count >= 10) {
      alert("Maximum 10 options per poll.");
      return;
    }
    const input = document.createElement("input");
    input.type = "text";
    input.className = "room-panel-input poll-option-input";
    input.placeholder = `Option ${count + 1}`;
    input.required = true;
    input.maxLength = 80;
    input.autocomplete = "off";
    container.appendChild(input);
    input.focus();
  };

  window.submitPollForm = function(e) {
    e.preventDefault();
    const qInput = document.getElementById("pollQuestionInput");
    const question = qInput ? qInput.value.trim() : "";
    const optionInputs = document.querySelectorAll(".poll-option-input");
    const options = [];
    optionInputs.forEach(inp => {
      const val = inp.value.trim();
      if (val) options.push(val);
    });

    if (!question) {
      alert("Please enter a question.");
      return;
    }
    if (options.length < 2) {
      alert("Please provide at least 2 options.");
      return;
    }

    createPollMessage(question, options);
    togglePollModal();
  };

  function createPollMessage(question, options) {
    if (!myUid) return;
    const newMsg = {
      uid: myUid,
      name: myName,
      avatarType: myAvatarType,
      avatarValue: myAvatarValue,
      text: "",
      isPoll: true,
      poll: {
        question: question,
        options: options,
        votes: {}
      },
      ts: firebase.database.ServerValue.TIMESTAMP
    };
    if (replyingTo) {
      newMsg.replyToId = replyingTo.id;
      newMsg.replyToName = replyingTo.name;
      newMsg.replyToText = replyingTo.text;
    }
    messagesRef.push(newMsg);
    cancelReply();
  }

  if (attachPollBtn) {
    attachPollBtn.onclick = (e) => {
      e.stopPropagation();
      attachMenu.classList.add("hidden");
      togglePollModal();
    };
  }

  // =======================================================
  // CHAT FORM SUBMIT & SLASH COMMANDS
  // =======================================================
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    let text = textInput.value.trim();
    stopTyping();
    closeMentionPopup();
    closeEmojiPicker();
    if (!text) return;

    // Handle Slash Commands
    if (text.startsWith('/') && !editingId) {
      const parts = text.slice(1).trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ');

      if (cmd === 'shrug') {
        text = (arg ? arg + ' ' : '') + '¯\\_(ツ)_/¯';
      } else if (cmd === 'tableflip') {
        text = (arg ? arg + ' ' : '') + '(╯°□°)╯︵ ┻━┻';
      } else if (cmd === 'unflip') {
        text = (arg ? arg + ' ' : '') + '┬─┬ノ( º _ ºノ)';
      } else if (cmd === 'flip') {
        const side = Math.random() < 0.5 ? 'Heads' : 'Tails';
        text = `🪙 Flipped a coin: **${side}**!`;
      } else if (cmd === 'roll') {
        const max = parseInt(arg, 10) || 6;
        const result = Math.floor(Math.random() * max) + 1;
        text = `🎲 Rolled a **${result}** (1-${max})`;
      } else if (cmd === 'poll') {
        const matches = [...arg.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map(m => m[1] || m[2] || m[3]);
        if (matches.length >= 3) {
          const question = matches[0];
          const options = matches.slice(1);
          createPollMessage(question, options);
          textInput.value = "";
          return;
        } else {
          togglePollModal();
          const qInput = document.getElementById("pollQuestionInput");
          if (qInput && arg) qInput.value = arg.replace(/["']/g, '');
          textInput.value = "";
          return;
        }
      } else if (cmd === 'help') {
        alert("✨ Slash Commands:\n/poll \"Question\" \"Opt1\" \"Opt2\" - Create a poll\n/shrug [text] - Post a shrug\n/tableflip [text] - Flip a table\n/unflip [text] - Put table back\n/flip - Flip a coin (Heads/Tails)\n/roll [max] - Roll dice (e.g. /roll 20)");
        textInput.value = "";
        return;
      }
    }

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
          if (s.exists()) userProfilesCache[missingUids[i]] = { ...s.val(), uid: missingUids[i] };
        });
      }
      updateOnlineUI();
    });

    // Preload user profiles for mentions and search
    db.ref('users').once('value', (snap) => {
      const val = snap.val() || {};
      Object.keys(val).forEach(uid => {
        userProfilesCache[uid] = { ...val[uid], uid: uid };
      });
    });

    // Reactions Listener
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

    // Poll Votes Real-time Listener
    db.ref(`rooms/${room}/pollVotes`).on('value', (snap) => {
      pollVotesCache = snap.val() || {};
      updateAllPollUIs();
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

    // Build Header
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

    // Sound / Notification Toggle Button
    const soundBtn = document.createElement("button");
    soundBtn.id = "soundToggleBtn";
    soundBtn.className = "btn-header-sound";
    soundBtn.onclick = toggleNotifModal;

    // Logout Button
    const logoutBtn = document.createElement("button");
    logoutBtn.className = "btn-header-logout";
    logoutBtn.textContent = "Logout";
    logoutBtn.onclick = () => auth.signOut().then(() => location.href = 'login.html');

    header.appendChild(userChip);
    header.appendChild(roomBadge);
    header.appendChild(roomDrawerBtn);
    header.appendChild(onlinePill);
    header.appendChild(soundBtn);
    header.appendChild(logoutBtn);
    
    updateOnlineUI();
    updateSoundBtn();

    chatForm.classList.remove("hidden");
    textInput.focus();

    // Initialize @mention Autocomplete & Emoji Picker
    initMentionSystem();
    initEmojiPicker();

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

    // Mark initial load done after initial messages have populated
    setTimeout(() => {
      isInitialLoadDone = true;
    }, 1200);
    
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
