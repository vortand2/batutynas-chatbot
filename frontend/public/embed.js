/**
 * Batutynas Chatbot Embed Script
 * Usage: <script src="https://YOUR_DOMAIN/embed.js"></script>
 *
 * Auto-detects the base URL from the script's own src.
 * Injects a floating button + iframe popup on any website.
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
    '}',
    '#bat-frame-wrap.bat-visible{opacity:1;transform:translateY(0) scale(1);pointer-events:all;}',
    '#bat-frame{width:100%;height:100%;border:none;background:#fff;}',
    '@media(max-width:480px){',
      '#bat-frame-wrap{width:calc(100vw - 16px);right:8px;bottom:88px;height:calc(100vh - 110px);}',
      '#bat-fab{bottom:16px;right:16px;width:56px;height:56px;font-size:24px;}',
    '}',
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── Create FAB button ─────────────────────────────────────────────────────
  var fab = document.createElement('button');
  fab.id = 'bat-fab';
  fab.setAttribute('aria-label', 'Atidaryti pokalbį su Batutynas');
  fab.setAttribute('title', 'Batutynas pokalbis');
  fab.innerHTML = '&#127922;'; // 🎪

  // ── Create iframe wrapper ─────────────────────────────────────────────────
  var wrap = document.createElement('div');
  wrap.id = 'bat-frame-wrap';

  var iframe = document.createElement('iframe');
  iframe.id = 'bat-frame';
  iframe.src = baseUrl + '/embed';
  iframe.setAttribute('allow', 'microphone');
  iframe.setAttribute('title', 'Batutynas pokalbio asistentas');
  iframe.setAttribute('loading', 'lazy');

  wrap.appendChild(iframe);
  document.body.appendChild(fab);
  document.body.appendChild(wrap);

  // ── Toggle logic ──────────────────────────────────────────────────────────
  var isOpen = false;
  fab.addEventListener('click', function () {
    isOpen = !isOpen;
    fab.classList.toggle('bat-open', isOpen);
    wrap.classList.toggle('bat-visible', isOpen);
    fab.innerHTML = isOpen
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '&#127922;';
    fab.setAttribute('aria-label', isOpen ? 'Uždaryti pokalbį' : 'Atidaryti pokalbį su Batutynas');
  });

  // ── Close on Escape key ───────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) fab.click();
  });
})();
