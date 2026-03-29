/**
 * Batutynas.lt AI Chat Widget
 * Self-contained, embeddable customer support chat widget.
 * No framework dependencies — vanilla JS only.
 *
 * Usage: Include this script + CSS, then call BatutynasChat.init({ webhookUrl: '...' })
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'batutynas_chat';
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  const LANGUAGES = {
    lt: { name: 'Lietuvi\u0173', placeholder: 'Ra\u0161ykite \u017einut\u0119...', escalate: 'Kalb\u0117ti su \u017emogumi' },
    en: { name: 'English', placeholder: 'Type your message...', escalate: 'Talk to a human' }
  };

  let config = {
    webhookUrl: '',
    authToken: '', // Bearer token for webhook authentication
    position: 'bottom-right',
    primaryColor: '#6C3CE1',
    storeName: 'Batutynas.lt',
    userEmail: null,
    userName: null,
    language: null, // auto-detect if null, defaults to Lithuanian
    quickPrompts: null // override with array, or null to use defaults
  };

  let state = {
    open: false,
    sessionId: null,
    messages: [],
    language: 'lt',
    sending: false,
    animatedOpen: false
  };

  // --- Session Management ---

  const MAX_MESSAGE_LENGTH = 2000;

  function generateSessionId() {
    var rand = crypto.getRandomValues(new Uint8Array(10));
    var randStr = Array.from(rand, function (b) { return b.toString(36); }).join('').substring(0, 12);
    return 'sess_' + Date.now().toString(36) + '_' + randStr;
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.sessionId || typeof data.timestamp !== 'number') {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      if (Date.now() - data.timestamp > SESSION_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function saveSession() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionId: state.sessionId,
        messages: state.messages.slice(-50),
        language: state.language,
        timestamp: Date.now()
      }));
    } catch {
      // localStorage full or unavailable
    }
  }

  function initSession() {
    const saved = loadSession();
    if (saved) {
      state.sessionId = saved.sessionId;
      state.messages = saved.messages || [];
      state.language = saved.language || detectLanguage();
    } else {
      state.sessionId = generateSessionId();
      state.messages = [];
      state.language = config.language || detectLanguage();
    }
  }

  // --- Language Detection ---

  function detectLanguage() {
    if (config.language) return config.language;
    const browserLang = (navigator.language || navigator.userLanguage || 'lt').substring(0, 2).toLowerCase();
    return LANGUAGES[browserLang] ? browserLang : 'lt';
  }

  function t(key) {
    return (LANGUAGES[state.language] || LANGUAGES.lt)[key] || LANGUAGES.lt[key];
  }

  // --- DOM Helpers ---

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'innerHTML') node.innerHTML = attrs[k];
        else if (k.startsWith('on')) node.addEventListener(k.substring(2).toLowerCase(), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (child) {
        if (typeof child === 'string') node.appendChild(document.createTextNode(child));
        else if (child) node.appendChild(child);
      });
    }
    return node;
  }

  // --- Rendering ---

  function render() {
    // Ensure Nunito font is loaded (backup for CSS @import)
    if (!document.getElementById('batutynas-font-link')) {
      var fontLink = document.createElement('link');
      fontLink.id = 'batutynas-font-link';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(fontLink);
    }

    var existing = document.getElementById('woo-ai-chat-widget');
    // Cleanup viewport listener from previous render
    if (existing && existing._cleanupViewport) {
      existing._cleanupViewport();
    }
    if (existing) existing.remove();

    var widget = el('div', { id: 'woo-ai-chat-widget' });

    // Chat window
    var windowClasses = 'woo-chat-window' + (state.open ? ' open' : '');
    if (state.open && !state.animatedOpen) {
      windowClasses += ' woo-animate-in';
      state.animatedOpen = true;
    }
    var chatWindow = el('div', { className: windowClasses });

    // Header with online dot
    var header = el('div', { className: 'woo-chat-header' }, [
      el('div', { className: 'woo-chat-header-info' }, [
        el('div', { className: 'woo-chat-header-avatar', innerHTML: '&#129302;' }),
        el('div', { className: 'woo-chat-header-text' }, [
          el('h3', null, config.storeName),
          el('p', { innerHTML: '<span class="online-dot"></span> AI Asistentas' })
        ])
      ]),
      createLanguageSelect()
    ]);
    chatWindow.appendChild(header);

    chatWindow.setAttribute('role', 'dialog');
    chatWindow.setAttribute('aria-label', 'Pokalbis');
    chatWindow.setAttribute('aria-modal', 'true');

    // Messages
    var messagesContainer = el('div', { className: 'woo-chat-messages', id: 'woo-chat-messages', role: 'log', 'aria-live': 'polite' });

    if (state.messages.length === 0) {
      var welcomeDiv = el('div', { className: 'woo-chat-welcome' });
      welcomeDiv.innerHTML = '<div class="welcome-hero">' +
        '<div class="welcome-emoji-row">\uD83C\uDFAA \uD83C\uDFF0 \uD83C\uDF89 \uD83E\uDD84</div>' +
        '<div class="welcome-title">Batutynas.lt</div>' +
        '<div class="welcome-subtitle">Batut\u0173 nuoma \u0161vent\u0117ms ir renginiams</div>' +
        '</div>' +
        '<div class="welcome-pills">' +
        '<span class="welcome-pill">Gimtadieniai</span>' +
        '<span class="welcome-pill">Renginiai</span>' +
        '<span class="welcome-pill">Vakar\u0117liai</span>' +
        '<span class="welcome-pill">Pirkimas</span>' +
        '</div>' +
        '<div class="welcome-divider">K\u0105 norite veikti?</div>' +
        '<div class="welcome-actions">' +
        '<button class="welcome-action-btn wa-birthday" data-welcome-action="Planuoju vaik\u0173 gimtadien\u012F arba krik\u0161tynas"><span class="welcome-action-emoji" aria-hidden="true">\uD83C\uDF82</span>Planuoti gimtadien\u012F</button>' +
        '<button class="welcome-action-btn wa-event" data-welcome-action="Planuoju vie\u0161\u0105 rengin\u012F arba \u012Fmon\u0117s s\u0105skrydi\u012F"><span class="welcome-action-emoji" aria-hidden="true">\uD83C\uDFAA</span>Vie\u0161as renginys</button>' +
        '<button class="welcome-action-btn wa-buy" data-welcome-action="Noriu pirkti batut\u0105"><span class="welcome-action-emoji" aria-hidden="true">\uD83D\uDED2</span>Pirkti batut\u0105</button>' +
        '<button class="welcome-action-btn wa-party" data-welcome-action="Planuoju triuk\u0161ming\u0105 vakar\u0117l\u012F"><span class="welcome-action-emoji" aria-hidden="true">\uD83C\uDF89</span>Vakar\u0117lis</button>' +
        '<button class="welcome-action-btn wa-info" data-welcome-action="Saugumas, DUK ir kontaktai"><span class="welcome-action-emoji" aria-hidden="true">\u2139\uFE0F</span>Info ir kontaktai</button>' +
        '</div>';

      messagesContainer.appendChild(welcomeDiv);
    }

    var lastTimestamp = 0;
    state.messages.forEach(function (msg, idx) {
      if (msg.time && msg.time - lastTimestamp > 5 * 60 * 1000) {
        messagesContainer.appendChild(el('div', { className: 'woo-chat-time' }, formatTimestamp(msg.time)));
      }
      lastTimestamp = msg.time || lastTimestamp;
      messagesContainer.appendChild(createMessageBubble(msg, idx));
    });

    // Typing indicator
    var typing = el('div', { className: 'woo-chat-typing' + (state.sending ? ' visible' : ''), id: 'woo-chat-typing' }, [
      el('span'), el('span'), el('span')
    ]);
    messagesContainer.appendChild(typing);

    chatWindow.appendChild(messagesContainer);

    // Input area
    var textarea = el('textarea', {
      className: 'woo-chat-input',
      id: 'woo-chat-input',
      'aria-label': t('placeholder'),
      placeholder: t('placeholder'),
      maxlength: String(MAX_MESSAGE_LENGTH),
      rows: '1',
      onKeydown: function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      },
      onInput: function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 80) + 'px';
      }
    });

    var sendBtn = el('button', {
      className: 'woo-chat-send',
      id: 'woo-chat-send-btn',
      'aria-label': 'Si\u0173sti \u017einut\u0119',
      onClick: sendMessage,
      innerHTML: '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>'
    });

    chatWindow.appendChild(el('div', { className: 'woo-chat-input-area' }, [textarea, sendBtn]));

    // Escalation button
    chatWindow.appendChild(el('button', {
      className: 'woo-chat-escalate',
      onClick: escalate
    }, t('escalate')));

    widget.appendChild(chatWindow);

    // Toggle button
    var toggleClasses = 'woo-chat-toggle' + (state.open ? ' open' : '');
    if (state._hasUnread && !state.open) toggleClasses += ' has-unread';
    var toggleBtn = el('button', {
      className: toggleClasses,
      'aria-label': state.open ? 'U\u017edaryti pokalb\u012F' : 'Atidaryti pokalb\u012F',
      onClick: toggleChat,
      innerHTML: '<svg class="chat-open-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg><svg class="chat-close-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
    });
    widget.appendChild(toggleBtn);

    document.body.appendChild(widget);

    // Apply custom color
    if (config.primaryColor !== '#6C3CE1') {
      widget.style.setProperty('--chat-primary', config.primaryColor);
      widget.style.setProperty('--chat-primary-hover', adjustColor(config.primaryColor, -20));
    }

    // Scroll to bottom (skip when addMessage will handle scroll-to-start)
    if (state.open && !state._scrollToStart) {
      scrollToBottom();
    }
    if (state.open) {
      var input = document.getElementById('woo-chat-input');
      if (input) input.focus();
    }

    // Mobile keyboard handling
    if (state.open && window.visualViewport && window.innerWidth <= 480) {
      var vv = window.visualViewport;
      var initialHeight = vv.height;

      function onViewportResize() {
        var diff = initialHeight - vv.height;
        var win = document.querySelector('.woo-chat-window');
        if (!win) return;
        if (diff > 100) {
          win.style.height = vv.height - 80 + 'px';
        } else {
          win.style.height = '';
        }
        scrollToBottom();
      }

      vv.addEventListener('resize', onViewportResize);
      widget._cleanupViewport = function () {
        vv.removeEventListener('resize', onViewportResize);
      };
    }
  }

  function createMessageBubble(msg, msgIndex) {
    var bubble = el('div', { className: 'woo-chat-msg ' + msg.role, 'data-msg-index': String(msgIndex) });
    if (msg.text && msg.text.indexOf('{{HTML}}') === 0) {
      bubble.innerHTML = sanitizeHtml(msg.text.substring(8));
      bubble.classList.add('html-content');
    } else {
      bubble.innerHTML = formatMessage(msg.text);
    }
    return bubble;
  }

  function sanitizeHtml(html) {
    var ALLOWED_TAGS = ['div', 'span', 'p', 'br', 'strong', 'em', 'b', 'i', 'a', 'button',
      'input', 'textarea', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'label'];
    var ALLOWED_ATTRS = ['class', 'data-chat-option', 'data-chat-date', 'data-chat-date-confirm',
      'data-chat-retry', 'data-chat-email', 'data-chat-email-confirm', 'data-custom-field',
      'data-chat-custom-submit', 'data-chat-address', 'data-chat-address-confirm',
      'data-chat-address-fill', 'data-chat-detail-toggle', 'data-chat-addon',
      'data-chat-addon-continue', 'data-chat-no-addon-send', 'data-chat-no-addon-back',
      'data-chat-zoom', 'data-step', 'type', 'min', 'value', 'disabled', 'href',
      'target', 'rel', 'src', 'alt', 'placeholder', 'id', 'role', 'tabindex', 'rows',
      'aria-label', 'aria-pressed', 'aria-hidden', 'aria-describedby', 'loading', 'autocomplete'];
    var ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

    var tmp = document.createElement('div');
    tmp.innerHTML = html;

    // Walk all elements with allowlist approach
    var allEls = Array.from(tmp.querySelectorAll('*'));
    for (var i = 0; i < allEls.length; i++) {
      var node = allEls[i];
      var tag = node.tagName.toLowerCase();

      // Remove disallowed tags entirely
      if (ALLOWED_TAGS.indexOf(tag) === -1) {
        node.remove();
        continue;
      }

      // Remove disallowed attributes
      var attrs = Array.from(node.attributes);
      for (var j = 0; j < attrs.length; j++) {
        var attrName = attrs[j].name.toLowerCase();
        if (ALLOWED_ATTRS.indexOf(attrName) === -1) {
          node.removeAttribute(attrs[j].name);
          continue;
        }
        // Validate href/src protocols
        if (attrName === 'href' || attrName === 'src') {
          try {
            var url = new URL(attrs[j].value, window.location.href);
            if (ALLOWED_PROTOCOLS.indexOf(url.protocol) === -1) {
              node.removeAttribute(attrs[j].name);
            }
          } catch (e) {
            node.removeAttribute(attrs[j].name);
          }
        }
      }
    }
    return tmp.innerHTML;
  }

  function createLanguageSelect() {
    var select = el('select', {
      className: 'woo-chat-lang-select',
      'aria-label': 'Kalba',
      onChange: function () {
        state.language = this.value;
        saveSession();
        render();
      }
    });

    Object.keys(LANGUAGES).forEach(function (code) {
      var opt = el('option', { value: code }, LANGUAGES[code].name);
      if (code === state.language) opt.selected = true;
      select.appendChild(opt);
    });

    return select;
  }

  // --- Message Formatting ---

  function formatMessage(text) {
    if (!text) return '';
    var escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
      .replace(/(https?:\/\/[^\s<"&]+)/g, function (url) {
        return '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
      });
  }

  function formatTimestamp(ts) {
    var d = new Date(ts);
    var now = new Date();
    var hours = String(d.getHours()).padStart(2, '0');
    var mins = String(d.getMinutes()).padStart(2, '0');
    var time = hours + ':' + mins;
    if (d.toDateString() === now.toDateString()) {
      return time;
    }
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return (state.language === 'en' ? 'Yesterday' : 'Vakar') + ', ' + time;
    }
    var month = d.toLocaleDateString(state.language === 'en' ? 'en-US' : 'lt-LT', { month: 'short', day: 'numeric' });
    return month + ', ' + time;
  }

  function adjustColor(hex, amount) {
    hex = hex.replace('#', '');
    var r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
    var g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
    var b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
    return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  }

  // --- Actions ---

  function toggleChat() {
    if (state._animating) return;
    if (state.open) {
      var win = document.querySelector('.woo-chat-window');
      if (win) {
        state._animating = true;
        var closed = false;
        function doClose() {
          if (closed) return;
          closed = true;
          state.open = false;
          state.animatedOpen = false;
          state._animating = false;
          render();
        }
        win.classList.add('woo-animate-out');
        win.addEventListener('animationend', function () { doClose(); var tb = document.querySelector('.woo-chat-toggle'); if (tb) tb.focus(); }, { once: true });
        setTimeout(function () { doClose(); var tb = document.querySelector('.woo-chat-toggle'); if (tb) tb.focus(); }, 300);
      } else {
        state.open = false;
        state.animatedOpen = false;
        render();
        var tb = document.querySelector('.woo-chat-toggle'); if (tb) tb.focus();
      }
    } else {
      state.open = true;
      state._hasUnread = false;
      render();
    }
  }

  function scrollToBottom() {
    setTimeout(function () {
      var container = document.getElementById('woo-chat-messages');
      if (container) container.scrollTop = container.scrollHeight;
    }, 50);
  }

  function showTyping(visible) {
    var el = document.getElementById('woo-chat-typing');
    if (el) el.className = 'woo-chat-typing' + (visible ? ' visible' : '');
    if (visible) scrollToBottom();
  }

  var _scrollTimer = null;
  function addMessage(role, text) {
    state.messages.push({ role: role, text: text, time: Date.now() });
    saveSession();
    state._scrollToStart = true;
    render();
    // Cancel any previous pending scroll so only the latest message's scroll fires
    if (_scrollTimer) clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(function () {
      state._scrollToStart = false;
      _scrollTimer = null;
      var container = document.getElementById('woo-chat-messages');
      if (!container) return;
      var msgs = container.querySelectorAll('.woo-chat-msg');
      var last = msgs[msgs.length - 1];
      if (last) {
        container.scrollTop = last.offsetTop - 8;
      }
    }, 300);
  }

  // --- Shared webhook send logic ---

  function _sendToWebhook(text) {
    if (!config.webhookUrl) {
      addMessage('system', '{{HTML}}Konfigūracijos klaida: webhookUrl nenurodytas.<br><small>Susisiekite su administratoriumi.</small>');
      return;
    }
    state._lastSentText = text;
    state.sending = true;

    var sendBtn = document.getElementById('woo-chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    showTyping(true);

    var payload = {
      message: text,
      session_id: state.sessionId,
      language: state.language,
      email: config.userEmail || null,
      name: config.userName || null
    };

    var fetchHeaders = { 'Content-Type': 'application/json' };
    if (config.authToken) {
      fetchHeaders['Authorization'] = 'Bearer ' + config.authToken;
    }

    var _fetchCtrl = new AbortController();
    var _fetchTimeout = setTimeout(function() { _fetchCtrl.abort(); }, 30000);
    fetch(config.webhookUrl, {
      method: 'POST',
      headers: fetchHeaders,
      body: JSON.stringify(payload),
      signal: _fetchCtrl.signal
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.sending = false;
        showTyping(false);
        var response = data.response || data.output || data.text || 'Atsiprašome, \u012Fvyko klaida. Pabandykite dar kart\u0105.';
        addMessage('agent', response);
        if (data.session_id) state.sessionId = data.session_id;
      })
      .catch(function () {
        state.sending = false;
        showTyping(false);
        addMessage('system', '{{HTML}}Ry\u0161io klaida.<br><button class="woo-chat-retry" data-chat-retry>Bandyti dar kart\u0105</button>');
      })
      .finally(function () {
        clearTimeout(_fetchTimeout);
        state.sending = false;
        var btn = document.getElementById('woo-chat-send-btn');
        if (btn) btn.disabled = false;
      });
  }

  function sendMessage() {
    if (state.sending) return;

    var input = document.getElementById('woo-chat-input');
    if (!input) return;

    var text = input.value.trim();
    if (!text) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      text = text.substring(0, MAX_MESSAGE_LENGTH);
    }

    input.value = '';
    input.style.height = '';
    addMessage('customer', text);
    _sendToWebhook(text);
  }

  function quickSend(text) {
    if (state.sending) return;
    if (!text || (typeof text === 'string' && !text.trim())) return;
    if (typeof text === 'string' && text.length > MAX_MESSAGE_LENGTH) {
      text = text.substring(0, MAX_MESSAGE_LENGTH);
    }
    var inp = document.getElementById('woo-chat-input');
    if (inp) { inp.value = ''; inp.style.height = ''; }
    addMessage('customer', text);
    _sendToWebhook(text);
  }

  function escalate() {
    if (state.sending) return;
    var label = t('escalate');
    addMessage('customer', label);
    _sendToWebhook(label);
  }

  // --- Persist interactive state back to stored messages ---

  function persistInteractionState(chatBubble) {
    if (!chatBubble) return;
    var indexStr = chatBubble.getAttribute('data-msg-index');
    if (indexStr === null) return;
    var index = parseInt(indexStr, 10);
    if (isNaN(index) || index < 0 || index >= state.messages.length) return;
    var msg = state.messages[index];
    if (msg.text && msg.text.indexOf('{{HTML}}') === 0) {
      state.messages[index].text = '{{HTML}}' + chatBubble.innerHTML;
      saveSession();
    }
  }

  // --- Email validation helper ---

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // --- Event Delegation for Interactive HTML ---

  var _delegationAttached = false;

  function attachDelegation() {
    if (_delegationAttached) return;
    _delegationAttached = true;

    document.addEventListener('click', function (e) {
      // Welcome screen action buttons
      var welcomeBtn = e.target.closest('[data-welcome-action]');
      if (welcomeBtn) {
        if (state.sending) return;
        var value = welcomeBtn.getAttribute('data-welcome-action');
        quickSend(value);
        // Safety fallback: remove welcome screen immediately in case render() is async/delayed
        // and the welcome element would otherwise remain visible momentarily.
        var welcomeEl = document.querySelector('.woo-chat-welcome');
        if (welcomeEl) welcomeEl.remove();
        return;
      }

      // Detail expand toggle (MUST be before data-chat-option to prevent parent card capture)
      var detailBtn = e.target.closest('[data-chat-detail-toggle]');
      if (detailBtn) {
        e.stopPropagation();
        var card = detailBtn.closest('.chat-trampoline-select');
        if (card) {
          var detail = card.querySelector('.t-detail');
          if (detail) detail.classList.toggle('open');
        }
        return;
      }

      // Image zoom on click (MUST be before data-chat-option)
      var zoomImg = e.target.closest('[data-chat-zoom]');
      if (zoomImg && zoomImg.tagName === 'IMG') {
        e.stopPropagation();
        e.preventDefault();
        var overlay = document.createElement('div');
        overlay.className = 't-zoom-overlay';
        var fullImg = document.createElement('img');
        fullImg.src = zoomImg.src.replace(/w=\d+/, 'w=1200').replace(/h=\d+/, 'h=800');
        fullImg.alt = zoomImg.alt || '';
        var closeBtn = document.createElement('button');
        closeBtn.className = 't-zoom-close';
        closeBtn.textContent = '\u00d7';
        overlay.appendChild(fullImg);
        overlay.appendChild(closeBtn);
        if (zoomImg.alt) {
          var caption = document.createElement('div');
          caption.className = 't-zoom-caption';
          caption.textContent = zoomImg.alt;
          overlay.appendChild(caption);
        }
        function closeOverlay() { overlay.remove(); }
        overlay.addEventListener('click', closeOverlay);
        fullImg.addEventListener('click', function(ev) { ev.stopPropagation(); });
        var existingOverlay = document.querySelector('.t-zoom-overlay');
        if (existingOverlay) existingOverlay.remove();
        document.body.appendChild(overlay);
        return;
      }

      // Option buttons (pill buttons and trampoline cards)
      var optBtn = e.target.closest('[data-chat-option]');
      if (optBtn) {
        if (optBtn.hasAttribute('disabled')) return;
        if (state.sending) return;
        var msgBubble = optBtn.closest('.chat-products') || optBtn.closest('.chat-options') || optBtn.closest('.chat-trampoline-grid') || optBtn.closest('.woo-chat-msg');

        // If this bubble also has addon cards AND the clicked element is a trampoline card,
        // treat it as single-select toggle (don't send yet). CTA buttons should send immediately.
        var hasAddons = msgBubble && msgBubble.querySelector('[data-chat-addon]');
        var isTrampolineCard = optBtn.classList.contains('chat-trampoline-select');
        if (hasAddons && isTrampolineCard) {
          // Deselect other trampoline options, select this one
          msgBubble.querySelectorAll('.chat-trampoline-select[data-chat-option]').forEach(function (btn) {
            btn.classList.remove('selected');
          });
          optBtn.classList.add('selected');
          return;
        }

        if (msgBubble) {
          msgBubble.querySelectorAll('[data-chat-option]').forEach(function (btn) {
            btn.setAttribute('disabled', 'true');
            if (btn.tagName === 'BUTTON') btn.disabled = true;
          });
          msgBubble.querySelectorAll('[data-chat-date]').forEach(function (inp) {
            inp.setAttribute('disabled', 'true');
            inp.disabled = true;
          });
          msgBubble.querySelectorAll('[data-chat-date-confirm]').forEach(function (btn) {
            btn.setAttribute('disabled', 'true');
            btn.disabled = true;
          });
          optBtn.classList.add('selected');
          var chatBubble = optBtn.closest('.woo-chat-msg');
          if (chatBubble) persistInteractionState(chatBubble);
        }
        var value = optBtn.getAttribute('data-chat-option');
        quickSend(value);
        return;
      }

      // Date confirm button
      var dateConfirmBtn = e.target.closest('[data-chat-date-confirm]');
      if (dateConfirmBtn) {
        if (dateConfirmBtn.hasAttribute('disabled')) return;
        var dateInput = dateConfirmBtn.parentElement.querySelector('[data-chat-date]');
        if (dateInput && dateInput.value) {
          dateConfirmBtn.setAttribute('disabled', 'true');
          dateConfirmBtn.disabled = true;
          dateInput.setAttribute('disabled', 'true');
          dateInput.disabled = true;
          // Also disable any sibling option buttons
          var bubble = dateConfirmBtn.closest('.chat-products') || dateConfirmBtn.closest('.woo-chat-msg');
          if (bubble) {
            bubble.querySelectorAll('[data-chat-option]').forEach(function (btn) {
              btn.setAttribute('disabled', 'true');
              if (btn.tagName === 'BUTTON') btn.disabled = true;
            });
          }
          var dateBubble = dateConfirmBtn.closest('.woo-chat-msg');
          if (dateBubble) persistInteractionState(dateBubble);
          quickSend(dateInput.value);
        }
        return;
      }

      // Email confirm button (purchase catalog flow)
      var emailConfirmBtn = e.target.closest('[data-chat-email-confirm]');
      if (emailConfirmBtn) {
        if (emailConfirmBtn.hasAttribute('disabled') || emailConfirmBtn.disabled) return;
        var emailInput = emailConfirmBtn.parentElement.querySelector('[data-chat-email]');
        if (emailInput && isValidEmail(emailInput.value.trim())) {
          var emailValue = emailInput.value.trim();
          emailConfirmBtn.disabled = true;
          emailConfirmBtn.setAttribute('disabled', 'true');
          emailInput.disabled = true;
          emailInput.setAttribute('disabled', 'true');
          var emailBubble = emailConfirmBtn.closest('.woo-chat-msg');
          if (emailBubble) persistInteractionState(emailBubble);
          quickSend('Mano el. paštas katalogui: ' + emailValue);
        } else if (emailInput) {
          emailInput.focus();
          emailInput.style.borderColor = '#e74c3c';
          var errEl = emailInput.parentElement.querySelector('.form-error');
          if (!errEl) {
            errEl = document.createElement('div');
            errEl.className = 'form-error';
            errEl.setAttribute('role', 'alert');
            errEl.style.cssText = 'color:#e74c3c;font-size:11px;margin-top:2px;';
            emailInput.parentElement.appendChild(errEl);
          }
          errEl.textContent = 'Neteisingas el. pašto formatas';
        }
        return;
      }

      // No-addon confirmation: send without addons
      var noAddonSend = e.target.closest('[data-chat-no-addon-send]');
      if (noAddonSend) {
        if (state.sending) return;
        var confirmDiv = noAddonSend.closest('.chat-no-addon-confirm');
        var trampName = noAddonSend.getAttribute('data-chat-no-addon-send');
        if (confirmDiv) confirmDiv.remove();
        quickSend(trampName);
        return;
      }
      // No-addon confirmation: go back to pick addons
      var noAddonBack = e.target.closest('[data-chat-no-addon-back]');
      if (noAddonBack) {
        var confirmDiv2 = noAddonBack.closest('.chat-no-addon-confirm');
        if (confirmDiv2) {
          var addonBubble2 = confirmDiv2.closest('.woo-chat-msg');
          confirmDiv2.remove();
          // Re-enable addon cards, trampoline options, and continue button so user can interact
          if (addonBubble2) {
            addonBubble2.querySelectorAll('[data-chat-addon]').forEach(function (card) {
              card.removeAttribute('disabled');
            });
            addonBubble2.querySelectorAll('[data-chat-option]').forEach(function (btn) {
              btn.removeAttribute('disabled');
              if (btn.tagName === 'BUTTON') btn.disabled = false;
            });
            var continueBtn2 = addonBubble2.querySelector('[data-chat-addon-continue]');
            if (continueBtn2) {
              continueBtn2.disabled = false;
              continueBtn2.removeAttribute('disabled');
            }
            // Persist the re-enabled state so session restore doesn't leave buttons stuck disabled
            persistInteractionState(addonBubble2);
            // Scroll to the addon section using direct scrollTop (reliable, matches Change 1 pattern)
            var addonSection2 = addonBubble2.querySelector('[data-chat-addon]');
            var chatContainer2 = document.getElementById('woo-chat-messages');
            if (addonSection2 && chatContainer2) {
              chatContainer2.scrollTop = addonSection2.offsetTop - 8;
            }
          }
        }
        return;
      }

      // Addon multi-select toggle
      var addonCard = e.target.closest('[data-chat-addon]');
      if (addonCard) {
        if (addonCard.hasAttribute('disabled')) return;
        addonCard.classList.toggle('addon-selected');
        addonCard.setAttribute('aria-pressed', addonCard.classList.contains('addon-selected') ? 'true' : 'false');
        return;
      }

      // Addon continue button
      var addonContinueBtn = e.target.closest('[data-chat-addon-continue]');
      if (addonContinueBtn) {
        if (addonContinueBtn.hasAttribute('disabled') || addonContinueBtn.disabled) return;
        var addonBubble = addonContinueBtn.closest('.chat-products') || addonContinueBtn.closest('.woo-chat-msg');
        var selected = [];
        var trampolineSelection = '';
        if (addonBubble) {
          // Collect trampoline selection (if trampolines are in same bubble)
          var selectedTrampoline = addonBubble.querySelector('.chat-trampoline-select[data-chat-option].selected');
          if (selectedTrampoline) {
            trampolineSelection = selectedTrampoline.getAttribute('data-chat-option');
          }
          // Require trampoline if trampoline selection cards exist in this bubble (not cancel buttons)
          var hasTrampolines = addonBubble.querySelector('.chat-trampoline-select[data-chat-option]');
          if (hasTrampolines && !trampolineSelection) {
            // Flash hint — user must select a trampoline first
            addonContinueBtn.textContent = 'Pirma pasirinkite batutą ↑';
            addonContinueBtn.classList.add('shake');
            setTimeout(function () {
              addonContinueBtn.textContent = 'Tęsti →';
              addonContinueBtn.classList.remove('shake');
            }, 2000);
            return;
          }
          addonBubble.querySelectorAll('[data-chat-addon].addon-selected').forEach(function (card) {
            selected.push(card.getAttribute('data-chat-addon'));
          });
          // Disable everything
          addonContinueBtn.disabled = true;
          addonContinueBtn.setAttribute('disabled', 'true');
          addonBubble.querySelectorAll('[data-chat-addon]').forEach(function (card) {
            card.setAttribute('disabled', 'true');
          });
          addonBubble.querySelectorAll('[data-chat-option]').forEach(function (btn) {
            btn.setAttribute('disabled', 'true');
            if (btn.tagName === 'BUTTON') btn.disabled = true;
          });
        }
        var chatBubble = addonContinueBtn.closest('.woo-chat-msg');
        // Build message with trampoline + optional addons
        var msg = '';
        if (trampolineSelection) {
          if (selected.length > 0) {
            if (chatBubble) persistInteractionState(chatBubble);
            msg = trampolineSelection + ' + Papildomos: ' + selected.join(', ');
          } else {
            // No addons chosen — ask "are you sure?" (they're free)
            var confirmHtml = '<div class="chat-no-addon-confirm" style="background:#fffbe6;border:1px solid #ffe082;border-radius:12px;padding:14px 16px;margin-top:10px;text-align:center;">'
              + '<div style="font-size:14px;margin-bottom:10px;">Papildomos pramogos yra <strong>NEMOKAMOS</strong>! Tikrai nenorite jokių?</div>'
              + '<div style="display:flex;gap:8px;justify-content:center;">'
              + '<button type="button" data-chat-no-addon-back style="padding:8px 16px;border-radius:8px;border:1px solid var(--chat-primary);background:white;color:var(--chat-primary);font-size:13px;font-weight:600;cursor:pointer;">Grįžti ir pasirinkti</button>'
              + '<button type="button" data-chat-no-addon-send="' + trampolineSelection.replace(/"/g, '&quot;') + '" style="padding:8px 16px;border-radius:8px;border:none;background:var(--chat-primary);color:white;font-size:13px;font-weight:600;cursor:pointer;">Tęsti be pramogų</button>'
              + '</div></div>';
            var chatBubbleForConfirm = addonContinueBtn.closest('.woo-chat-msg');
            if (chatBubbleForConfirm) {
              chatBubbleForConfirm.insertAdjacentHTML('beforeend', confirmHtml);
              // Persist AFTER confirm dialog is in DOM so session restore shows it
              persistInteractionState(chatBubbleForConfirm);
              var confirmEl = chatBubbleForConfirm.querySelector('.chat-no-addon-confirm');
              // Scroll to confirm dialog using direct scrollTop (reliable, matches Change 1 pattern)
              var chatContainer3 = document.getElementById('woo-chat-messages');
              if (confirmEl && chatContainer3) {
                chatContainer3.scrollTop = confirmEl.offsetTop - 8;
              }
            }
            return;
          }
        } else {
          // Party equipment flow (no trampoline selection)
          if (selected.length === 0) {
            // Re-enable everything so user can still interact after the shake hint
            addonContinueBtn.disabled = false;
            addonContinueBtn.removeAttribute('disabled');
            if (addonBubble) {
              addonBubble.querySelectorAll('[data-chat-addon]').forEach(function (card) {
                card.removeAttribute('disabled');
              });
            }
            // Re-persist with re-enabled state (prevents session restore from leaving buttons stuck disabled)
            if (chatBubble) persistInteractionState(chatBubble);
            addonContinueBtn.textContent = 'Pasirinkite bent vieną ↑';
            addonContinueBtn.classList.add('shake');
            setTimeout(function () {
              addonContinueBtn.textContent = 'Tęsti →';
              addonContinueBtn.classList.remove('shake');
            }, 2000);
            return;
          }
          msg = 'Papildomos pramogos: ' + selected.join(', ');
          if (chatBubble) persistInteractionState(chatBubble);
        }
        quickSend(msg);
        return;
      }

      // Address city fill button
      var addressFillBtn = e.target.closest('[data-chat-address-fill]');
      if (addressFillBtn) {
        if (addressFillBtn.hasAttribute('disabled')) return;
        var city = addressFillBtn.getAttribute('data-chat-address-fill');
        var addressForm = addressFillBtn.closest('.chat-products') || addressFillBtn.closest('.woo-chat-msg');
        if (addressForm) {
          var addrInput = addressForm.querySelector('[data-chat-address]');
          if (addrInput && !addrInput.disabled) {
            addrInput.value = city + ', ';
            addrInput.focus();
            var addrConfirm = addressForm.querySelector('[data-chat-address-confirm]');
            if (addrConfirm) {
              var isOtherCity = city.toLowerCase().includes('kitas');
              if (isOtherCity) {
                // "Kitas miestas" — keep confirm disabled until user adds a real address
                addrConfirm.disabled = true;
                if (!addrInput._addrListener) {
                  addrInput._addrListener = true;
                  addrInput.addEventListener('input', function () {
                    var val = addrInput.value.trim();
                    // Enable when user typed something meaningful (min 3 chars, not just the prefix)
                    // Also block bare "Kitas miestas" without comma (in case user manually removes the comma)
                    addrConfirm.disabled = !val || val.length < 3 || val === 'Kitas miestas,' || val.toLowerCase() === 'kitas miestas';
                  });
                }
              } else {
                // Known city — enable confirm immediately
                addrConfirm.disabled = false;
              }
            }
          }
        }
        return;
      }

      // Address confirm button
      var addressConfirmBtn = e.target.closest('[data-chat-address-confirm]');
      if (addressConfirmBtn) {
        if (addressConfirmBtn.hasAttribute('disabled') || addressConfirmBtn.disabled) return;
        var addrInput = addressConfirmBtn.parentElement.querySelector('[data-chat-address]');
        if (addrInput && addrInput.value.trim()) {
          // Strip trailing comma/space that the city fill button pre-populates (e.g. "Tauragė, ")
          var addressValue = addrInput.value.trim().replace(/[,\s]+$/, '');
          addressConfirmBtn.disabled = true;
          addressConfirmBtn.setAttribute('disabled', 'true');
          addrInput.disabled = true;
          addrInput.setAttribute('disabled', 'true');
          // Disable city fill buttons
          var addrBubble = addressConfirmBtn.closest('.chat-products') || addressConfirmBtn.closest('.woo-chat-msg');
          if (addrBubble) {
            addrBubble.querySelectorAll('[data-chat-address-fill]').forEach(function (btn) {
              btn.setAttribute('disabled', 'true');
              if (btn.tagName === 'BUTTON') btn.disabled = true;
            });
          }
          var chatBubble = addressConfirmBtn.closest('.woo-chat-msg');
          if (chatBubble) persistInteractionState(chatBubble);
          quickSend(addressValue);
        }
        return;
      }

      // Custom manufacturing form submit
      var customSubmitBtn = e.target.closest('[data-chat-custom-submit]');
      if (customSubmitBtn) {
        if (customSubmitBtn.hasAttribute('disabled') || customSubmitBtn.disabled) return;
        var form = customSubmitBtn.closest('.chat-custom-form');
        if (!form) return;
        var fields = form.querySelectorAll('[data-custom-field]');
        var formData = {};
        fields.forEach(function (field) {
          formData[field.getAttribute('data-custom-field')] = field.value.trim();
        });
        // Validate email field — required
        if (!formData.email || !isValidEmail(formData.email)) {
          var emailInput = form.querySelector('[data-custom-field="email"]');
          if (emailInput) {
            emailInput.focus();
            emailInput.style.borderColor = '#e74c3c';
            var errEl = emailInput.parentElement.querySelector('.form-error');
            if (!errEl) {
              errEl = document.createElement('div');
              errEl.className = 'form-error';
              errEl.setAttribute('role', 'alert');
              errEl.style.cssText = 'color:#e74c3c;font-size:11px;margin-top:2px;';
              emailInput.parentElement.appendChild(errEl);
            }
            errEl.textContent = !formData.email ? 'El. paštas privalomas' : 'Neteisingas el. pašto formatas';
          }
          return;
        }
        // Validate phone field — require at least 8 digits
        var phoneVal = formData.phone || '';
        if (phoneVal.replace(/\D/g, '').length < 8) {
          var phoneInput = form.querySelector('[data-custom-field="phone"]');
          if (phoneInput) {
            phoneInput.focus();
            phoneInput.style.borderColor = '#e74c3c';
            var errEl2 = phoneInput.parentElement.querySelector('.form-error');
            if (!errEl2) {
              errEl2 = document.createElement('div');
              errEl2.className = 'form-error';
              errEl2.setAttribute('role', 'alert');
              errEl2.style.cssText = 'color:#e74c3c;font-size:11px;margin-top:2px;';
              phoneInput.parentElement.appendChild(errEl2);
            }
            errEl2.textContent = 'Telefono numeris per trumpas';
          }
          return;
        }
        // Disable all form fields
        customSubmitBtn.disabled = true;
        customSubmitBtn.setAttribute('disabled', 'true');
        fields.forEach(function (field) {
          field.disabled = true;
          field.setAttribute('disabled', 'true');
        });
        var customBubble = customSubmitBtn.closest('.woo-chat-msg');
        if (customBubble) persistInteractionState(customBubble);
        var summary = 'Individualaus batuto užklausa:\n';
        if (formData.dimensions) summary += 'Matmenys: ' + formData.dimensions + '\n';
        if (formData.colors) summary += 'Spalvos: ' + formData.colors + '\n';
        if (formData.characters) summary += 'Personažai: ' + formData.characters + '\n';
        if (formData.notes) summary += 'Papildomi pageidavimai: ' + formData.notes + '\n';
        if (formData.email) summary += 'El. paštas: ' + formData.email + '\n';
        if (formData.phone) summary += 'Telefonas: ' + formData.phone;
        quickSend(summary.trim());
        return;
      }
    });

    document.addEventListener('click', function (e) {
      var retryBtn = e.target.closest('[data-chat-retry]');
      if (retryBtn && !state.sending) {
        var textToRetry = state._lastSentText;
        if (!textToRetry) {
          for (var i = state.messages.length - 1; i >= 0; i--) {
            if (state.messages[i].role === 'customer') {
              textToRetry = state.messages[i].text;
              break;
            }
          }
        }
        if (!textToRetry) return;
        var systemBubble = retryBtn.closest('.woo-chat-msg');
        if (systemBubble) {
          var msgIdx = parseInt(systemBubble.getAttribute('data-msg-index'), 10);
          if (!isNaN(msgIdx) && msgIdx >= 0 && msgIdx < state.messages.length && state.messages[msgIdx].role === 'system') {
            state.messages.splice(msgIdx, 1);
            saveSession();
          }
        }
        addMessage('customer', textToRetry);
        _sendToWebhook(textToRetry);
      }
    });

    document.addEventListener('keydown', function (e) {
      // Close zoom overlay on Escape
      if (e.key === 'Escape') {
        var zoomOverlay = document.querySelector('.t-zoom-overlay');
        if (zoomOverlay) {
          zoomOverlay.remove();
          return;
        }
      }

      // FR-5.6: Focus trap inside open dialog
      if (e.key === 'Tab' && state.open) {
        var chatWin = document.querySelector('.woo-chat-window');
        if (!chatWin || !chatWin.contains(document.activeElement)) return;
        var focusable = chatWin.querySelectorAll(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
        );
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !chatWin.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !chatWin.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }

      if (e.key === 'Escape' && state.open) {
        var active = document.activeElement;
        var tag = active ? active.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          active.blur();
          return;
        }
        toggleChat();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        var optBtn = e.target.closest('div[data-chat-option][role="button"]');
        if (optBtn) {
          e.preventDefault();
          optBtn.click();
          return;
        }
        var addonBtn = e.target.closest('[data-chat-addon]');
        if (addonBtn) {
          e.preventDefault();
          addonBtn.click();
          return;
        }
        var addonContinue = e.target.closest('[data-chat-addon-continue]');
        if (addonContinue) {
          e.preventDefault();
          addonContinue.click();
          return;
        }
      }
    });

    document.addEventListener('change', function (e) {
      var dateInput = e.target.closest('[data-chat-date]');
      if (dateInput) {
        var confirmBtn = dateInput.parentElement.querySelector('[data-chat-date-confirm]');
        if (confirmBtn) {
          confirmBtn.disabled = !dateInput.value;
        }
      }
    });

    // Email input live validation
    document.addEventListener('input', function (e) {
      var emailInput = e.target.closest('[data-chat-email]');
      if (emailInput) {
        var confirmBtn = emailInput.parentElement.querySelector('[data-chat-email-confirm]');
        if (confirmBtn) {
          confirmBtn.disabled = !isValidEmail(emailInput.value.trim());
        }
      }

      // Address input live validation
      var addrInput = e.target.closest('[data-chat-address]');
      if (addrInput) {
        var addrConfirm = addrInput.parentElement.querySelector('[data-chat-address-confirm]');
        if (addrConfirm) {
          addrConfirm.disabled = !addrInput.value.trim();
        }
      }

      // Custom form field live validation — enable submit when email + phone are filled
      var customField = e.target.closest('[data-custom-field]');
      if (customField) {
        var form = customField.closest('.chat-custom-form');
        if (form) {
          var emailField = form.querySelector('[data-custom-field="email"]');
          var phoneField = form.querySelector('[data-custom-field="phone"]');
          var submitBtn = form.querySelector('.chat-custom-submit');
          if (submitBtn && emailField && phoneField) {
            var hasEmail = emailField.value.trim().length > 0;
            var hasPhone = phoneField.value.trim().replace(/\D/g, '').length >= 8;
            submitBtn.disabled = !(hasEmail && hasPhone);
          }
        }
      }
    });
  }

  // --- Public API ---

  window.BatutynasChat = {
    init: function (options) {
      if (!options || !options.webhookUrl) {
        console.error('[BatutynasChat] webhookUrl is required. Call BatutynasChat.init({ webhookUrl: "..." })');
        return;
      }

      Object.keys(options).forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(config, key)) config[key] = options[key];
      });

      initSession();
      attachDelegation();
      render();

      // Proactive greeting for new sessions — triggers welcome with menu when chat opens
      // (Handled in open() function — fetches welcome with [MAIN_MENU] buttons)
    },

    open: function () {
      state.open = true;
      render();
    },

    close: function () {
      state.open = false;
      render();
    },

    reset: function () {
      localStorage.removeItem(STORAGE_KEY);
      state.sessionId = generateSessionId();
      state.messages = [];
      state.animatedOpen = false;
      render();
    },

    setUser: function (email, name) {
      config.userEmail = email;
      config.userName = name;
    }
  };
})();
