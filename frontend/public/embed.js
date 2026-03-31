/**
 * Batutynas Chatbot Embed Script
 * Usage: <script src="https://YOUR_DOMAIN/embed.js" defer></script>
 *
 * Auto-detects the base URL from the script's own src.
 * Injects a floating button + iframe popup on any website.
 * Communicates with the ChatWidget via postMessage.
 */
(function () {
  'use strict';

  // ── Resolve base URL from this script's src ──────────────────────────────
  var baseUrl = '';
  var scripts = document.getElementsByTagName('script');
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].src && scripts[i].src.indexOf('embed.js') !== -1) {
      baseUrl = scripts[i].src.replace(/\/embed\.js.*$/, '');
      break;
    }
  }
  if (!baseUrl) { console.warn('[Batutynas] Could not detect base URL.'); return; }

  // ── Inject styles ─────────────────────────────────────────────────────────
  var css = [
    '#bat-fab{',
      'position:fixed;bottom:24px;right:24px;z-index:2147483640;',
      'width:62px;height:62px;border-radius:50%;border:none;cursor:pointer;',
      'background:linear-gradient(135deg,#7c3aed,#6d28d9);',
      'box-shadow:0 4px 22px rgba(124,58,237,.55);',
      'transition:transform .2s,box-shadow .2s;',
      'display:flex;align-items:center;justify-content:center;',
      'font-size:27px;line-height:1;',
    '}',
    '#bat-fab:hover{transform:scale(1.09);box-shadow:0 6px 32px rgba(124,58,237,.7);}',
    '#bat-fab.bat-open{transform:scale(0.93);}',
    '#bat-frame-wrap{',
      'position:fixed;bottom:96px;right:24px;z-index:2147483630;',
      'width:430px;height:650px;',
      'max-width:calc(100vw - 16px);max-height:calc(100vh - 116px);',
      'border-radius:20px;overflow:hidden;',
      'box-shadow:0 24px 80px rgba(0,0,0,.28);',
      'opacity:0;transform:translateY(28px) scale(.96);',
      'transition:opacity .28s cubic-bezier(.4,0,.2,1),transform .28s cubic-bezier(.4,0,.2,1);',
      'pointer-events:none;',
      'display:none;',
    '}',
    '#bat-frame-wrap.bat-visible{opacity:1;transform:translateY(0) scale(1);pointer-events:all;display:block;}',
    '#bat-frame{width:100%;height:100%;border:none;background:#fff;}',
    '@media(max-width:480px){',
      '#bat-frame-wrap{width:calc(100vw - 16px);right:8px;bottom:88px;height:calc(100vh - 110px);}',
      '#bat-fab{bottom:16px;right:16px;width:56px;height:56px;font-size:24px;}',
    '}',
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── SVG icons (safe static strings) ───────────────────────────────────────
  var ICON_CHAT = '\u{1F3AA}'; // 🎪
  var ICON_CLOSE_SVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ICON_CLOSE_SVG.setAttribute('width', '20');
  ICON_CLOSE_SVG.setAttribute('height', '20');
  ICON_CLOSE_SVG.setAttribute('viewBox', '0 0 24 24');
  ICON_CLOSE_SVG.setAttribute('fill', 'none');
  ICON_CLOSE_SVG.setAttribute('stroke', 'white');
  ICON_CLOSE_SVG.setAttribute('stroke-width', '2.5');
  ICON_CLOSE_SVG.setAttribute('stroke-linecap', 'round');
  var line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line1.setAttribute('x1', '18'); line1.setAttribute('y1', '6');
  line1.setAttribute('x2', '6');  line1.setAttribute('y2', '18');
  var line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line2.setAttribute('x1', '6');  line2.setAttribute('y1', '6');
  line2.setAttribute('x2', '18'); line2.setAttribute('y2', '18');
  ICON_CLOSE_SVG.appendChild(line1);
  ICON_CLOSE_SVG.appendChild(line2);

  // ── Create FAB button ─────────────────────────────────────────────────────
  var fab = document.createElement('button');
  fab.id = 'bat-fab';
  fab.setAttribute('aria-label', 'Atidaryti pokalbį su Batutynas');
  fab.setAttribute('title', 'Batutynas pokalbis');
  fab.textContent = ICON_CHAT;

  // ── Create iframe wrapper (iframe loads lazily on first open) ─────────────
  var wrap = document.createElement('div');
  wrap.id = 'bat-frame-wrap';

  var iframe = null;

  function ensureIframe() {
    if (iframe) return;
    iframe = document.createElement('iframe');
    iframe.id = 'bat-frame';
    iframe.src = baseUrl + '/embed';
    iframe.setAttribute('allow', 'microphone');
    iframe.setAttribute('title', 'Batutynas pokalbio asistentas');
    wrap.appendChild(iframe);
  }

  document.body.appendChild(fab);
  document.body.appendChild(wrap);

  // ── Toggle logic ──────────────────────────────────────────────────────────
  var isOpen = false;

  function openChat() {
    ensureIframe();
    isOpen = true;
    fab.classList.add('bat-open');
    wrap.classList.add('bat-visible');
    fab.textContent = '';
    fab.appendChild(ICON_CLOSE_SVG.cloneNode(true));
    fab.setAttribute('aria-label', 'Uždaryti pokalbį');
  }

  function closeChat() {
    isOpen = false;
    fab.classList.remove('bat-open');
    wrap.classList.remove('bat-visible');
    fab.textContent = ICON_CHAT;
    fab.setAttribute('aria-label', 'Atidaryti pokalbį su Batutynas');
  }

  fab.addEventListener('click', function () {
    if (isOpen) { closeChat(); } else { openChat(); }
  });

  // ── Listen for close message from iframe (ChatWidget X button) ────────────
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'batutynas-close') {
      closeChat();
    }
  });

  // ── Close on Escape key ───────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) closeChat();
  });
})();
