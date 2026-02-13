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
  const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

  const LANGUAGES = {
    lt: { name: 'Lietuvi\u0173', placeholder: 'Ra\u0161ykite \u017einut\u0119...', welcome: 'Sveiki! Kuo galiu pad\u0117ti?', escalate: 'Kalb\u0117ti su \u017emogumi', welcomeTitle: 'Sveiki!' },
    en: { name: 'English', placeholder: 'Type your message...', welcome: 'Hi! How can I help you today?', escalate: 'Talk to a human', welcomeTitle: 'Welcome!' }
  };

  const QUICK_PROMPTS = {
    lt: ['Nuomos kainos', 'Batut\u0173 katalogas', 'U\u017esakyti batut\u0105', 'Pristatymo zonos'],
    en: ['Rental prices', 'Trampoline catalog', 'Book a trampoline', 'Delivery areas']
  };

  let config = {
    webhookUrl: '',
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

  var MAX_MESSAGE_LENGTH = 2000;

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

    // Messages
    var messagesContainer = el('div', { className: 'woo-chat-messages', id: 'woo-chat-messages', role: 'log', 'aria-live': 'polite' });

    if (state.messages.length === 0) {
      var welcomeDiv = el('div', { className: 'woo-chat-welcome' }, [
        el('h4', null, t('welcomeTitle')),
        el('p', null, t('welcome'))
      ]);

      // Quick prompt buttons
      var prompts = config.quickPrompts || QUICK_PROMPTS[state.language] || QUICK_PROMPTS.lt;
      if (prompts && prompts.length > 0) {
        var btnsContainer = el('div', { className: 'woo-chat-quick-btns' });
        prompts.forEach(function (prompt) {
          btnsContainer.appendChild(el('button', {
            className: 'woo-chat-quick-btn',
            onClick: function () { quickSend(prompt); }
          }, prompt));
        });
        welcomeDiv.appendChild(btnsContainer);
      }

      messagesContainer.appendChild(welcomeDiv);
    }

    state.messages.forEach(function (msg) {
      messagesContainer.appendChild(createMessageBubble(msg));
    });

    // Typing indicator
    var typing = el('div', { className: 'woo-chat-typing', id: 'woo-chat-typing' }, [
      el('span'), el('span'), el('span')
    ]);
    messagesContainer.appendChild(typing);

    chatWindow.appendChild(messagesContainer);

    // Input area
    var textarea = el('textarea', {
      className: 'woo-chat-input',
      id: 'woo-chat-input',
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
    if (state._hasRead) toggleClasses += ' has-read';
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

    // Scroll to bottom
    if (state.open) {
      scrollToBottom();
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

  function createMessageBubble(msg) {
    var bubble = el('div', { className: 'woo-chat-msg ' + msg.role });
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
      'input', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'label'];
    var ALLOWED_ATTRS = ['class', 'data-chat-option', 'data-chat-date', 'data-chat-date-confirm',
      'type', 'min', 'value', 'disabled', 'href', 'target', 'rel', 'src', 'alt', 'style',
      'placeholder', 'id', 'role', 'tabindex'];
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

  function adjustColor(hex, amount) {
    hex = hex.replace('#', '');
    var r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
    var g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
    var b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
    return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  }

  // --- Actions ---

  function toggleChat() {
    state.open = !state.open;
    if (state.open && !state._hasRead) {
      state._hasRead = true;
    }
    if (!state.open) {
      state.animatedOpen = false;
    }
    render();
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

  function addMessage(role, text) {
    state.messages.push({ role: role, text: text, time: Date.now() });
    saveSession();
    render();
    scrollToBottom();
  }

  // --- Shared webhook send logic ---

  function _sendToWebhook(text) {
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

    fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        showTyping(false);
        var response = data.response || data.output || data.text || 'Atsiprašome, \u012Fvyko klaida. Pabandykite dar kart\u0105.';
        addMessage('agent', response);
        if (data.session_id) state.sessionId = data.session_id;
      })
      .catch(function () {
        showTyping(false);
        addMessage('system', 'Ry\u0161io klaida. Pabandykite dar kart\u0105.');
      })
      .finally(function () {
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

    addMessage('customer', text);
    _sendToWebhook(text);
  }

  function quickSend(text) {
    if (state.sending) return;
    addMessage('customer', text);
    _sendToWebhook(text);
  }

  function escalate() {
    if (state.sending) return;
    addMessage('customer', t('escalate'));
    _sendToWebhook('Nor\u0117\u010Diau pasikalb\u0117ti su \u017emogumi.');
  }

  // --- Event Delegation for Interactive HTML ---

  var _delegationAttached = false;

  function attachDelegation() {
    if (_delegationAttached) return;
    _delegationAttached = true;

    document.addEventListener('click', function (e) {
      // Option buttons (pill buttons and trampoline cards)
      var optBtn = e.target.closest('[data-chat-option]');
      if (optBtn) {
        if (optBtn.hasAttribute('disabled')) return;
        var msgBubble = optBtn.closest('.chat-products') || optBtn.closest('.chat-options') || optBtn.closest('.chat-trampoline-grid') || optBtn.closest('.woo-chat-msg');
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
          quickSend(dateInput.value);
        }
        return;
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var optBtn = e.target.closest('[data-chat-option][role="button"]');
        if (optBtn) {
          e.preventDefault();
          optBtn.click();
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
