/**
 * Q Youth Site Editor — Preview Injection Script
 * Served at /editor-inject.js and loaded into the preview iframe via <script src>.
 */
(function () {
  'use strict';

  // ── Highlight styles ───────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.id = 'qe-styles';
  style.textContent = [
    /* editable text */
    'main h1, main h2, main h3,',
    'main .card > p, main .program-card-body > p,',
    'main .about-text p, main .hero-text .hero-desc,',
    'main .page-hero-inner p, main .support-card p,',
    'main .section-header > p, [data-editable]',
    '{ cursor: text !important; }',

    'main h1:hover, main h2:hover, main h3:hover,',
    'main .card > p:hover, main .program-card-body > p:hover,',
    'main .about-text p:hover, main .hero-text .hero-desc:hover,',
    'main .page-hero-inner p:hover, main .support-card p:hover,',
    'main .section-header > p:hover, [data-editable]:hover',
    '{ outline: 2px dashed rgba(124,58,237,.65) !important; }',

    /* images and icon containers — teal dashed */
    'img:hover:not(svg img), .card-icon:hover, .program-card-header-icon:hover, .support-card-icon:hover',
    '{ outline: 3px dashed rgba(13,148,136,.8) !important; cursor: pointer !important; }',

    /* buttons/links — pink dashed */
    'main .btn:hover, main a.btn:hover { outline: 2px dashed rgba(236,72,153,.75) !important; cursor: pointer !important; }',

    /* data-edit-panel sections */
    '[data-edit-panel]:hover { outline: 2px dashed rgba(236,72,153,.5) !important; cursor: pointer !important; }',

    /* active contenteditable */
    '.qe-active { outline: 2px solid #7C3AED !important; background: rgba(124,58,237,.04) !important; }',
    '.qe-active:focus { outline: 2px solid #7C3AED !important; }',
  ].join('\n');
  document.head.appendChild(style);

  // ── State ─────────────────────────────────────────────────────────────────
  var activeEl = null;
  var lastImg = null;
  var lastImgContainer = null;
  var isIconContainer = false; // true when clicking a card-icon / program-card-header-icon
  var lastBtn = null;

  var TEXT_SEL = [
    'main h1', 'main h2', 'main h3',
    'main .card > p',
    'main .program-card-body > p',
    'main .about-text p',
    'main .hero-text .hero-desc',
    'main .page-hero-inner p',
    'main .support-card p',
    'main .section-header > p',
    '[data-editable]'
  ].join(', ');

  var ICON_SEL = '.card-icon, .program-card-header-icon, .support-card-icon';

  // ── Helpers ────────────────────────────────────────────────────────────────
  function post(msg) { window.parent.postMessage(msg, '*'); }

  function getCoverScale(img, container) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var cw = container ? container.offsetWidth : img.offsetWidth;
    var ch = container ? container.offsetHeight : img.offsetHeight;
    if (!iw || !ih || !cw || !ch) return 100;
    var containS = Math.min(cw / iw, ch / ih);
    var coverS   = Math.max(cw / iw, ch / ih);
    return Math.round((coverS / containS) * 100);
  }

  // Position an image within its frame. object-position pans the part of the image
  // that overflows the frame at scale 1 (e.g. a tall photo in a square frame).
  // transform translate pans the extra overflow created by zooming in, so X/Y keep
  // working at any zoom and even when the image matches the frame's aspect ratio.
  // Percentages keep it responsive, so the saved inline style works on the live site.
  function positionImg(img, x, y, scale) {
    var s = (scale || 100) / 100;
    img.style.objectFit = 'cover';
    img.style.transformOrigin = 'center center';
    if (x === 50 && y === 50 && s === 1) {
      img.style.objectPosition = '';
      img.style.transform = '';
      return;
    }
    img.style.objectPosition = x + '% ' + y + '%';
    if (s === 1) {
      img.style.transform = '';
    } else {
      // translate range ±(s-1)*50% of the element covers exactly the zoom overflow
      img.style.transform =
        'translate(' + ((s - 1) * (50 - x)) + '%,' + ((s - 1) * (50 - y)) + '%) scale(' + s + ')';
    }
  }

  function deactivate() {
    if (activeEl) {
      activeEl.contentEditable = 'false';
      activeEl.classList.remove('qe-active');
      activeEl = null;
    }
  }

  function activateText(el) {
    deactivate();
    el.contentEditable = 'true';
    el.classList.add('qe-active');
    el.focus();
    try {
      var r = document.createRange(), sel = window.getSelection();
      r.selectNodeContents(el); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    } catch (ex) {}
    activeEl = el;
    post({ type: 'text-active', tag: el.tagName.toLowerCase(), id: el.dataset.editable || null, text: el.innerText });
  }

  // ── Click dispatcher (capture phase) ──────────────────────────────────────
  document.addEventListener('click', function (e) {
    // Images: allowed anywhere including nav (for nav logo)
    var img = e.target.tagName === 'IMG' ? e.target : e.target.closest('img:not(svg img)');
    if (img) {
      e.preventDefault(); e.stopPropagation();
      deactivate();
      lastImg = img;
      isIconContainer = false;
      lastImgContainer = img.closest('.img-container, .directory-logo, .marquee-item, .page-hero-img, .nav-logo') || img.parentElement;
      post({
        type: 'img-click',
        src: img.getAttribute('src') || '',
        bgColor: lastImgContainer ? (lastImgContainer.style.backgroundColor || '') : '',
        objPos: img.style.objectPosition || '',
        attribution: img.getAttribute('data-attribution') || '',
        scale: (function () {
          var m = (img.style.transform || '').match(/scale\(([\d.]+)\)/);
          return m ? Math.round(parseFloat(m[1]) * 100) : 100;
        })(),
        isDynamic: !!(img.closest('.marquee-item, .directory-logo')),
        coverScale: getCoverScale(img, lastImgContainer)
      });
      return;
    }

    // Check for icon containers (card-icon etc.) — skip nav/footer for these
    var iconEl = e.target.closest(ICON_SEL);
    if (iconEl && !e.target.closest('nav, footer')) {
      e.preventDefault(); e.stopPropagation();
      deactivate();
      lastImg = null;
      lastImgContainer = iconEl;
      isIconContainer = true;
      post({
        type: 'img-click',
        src: (iconEl.querySelector('img') || {}).getAttribute ? (iconEl.querySelector('img').getAttribute('src') || '') : '',
        bgColor: iconEl.style.backgroundColor || '',
        objPos: '',
        isDynamic: false,
        isIcon: true
      });
      return;
    }

    // Exclude nav/footer for remaining interactions
    if (e.target.closest('nav, footer, .skip-link')) return;

    var panel = e.target.closest('[data-edit-panel]');
    var btn = !iconEl && (e.target.closest('.btn') || e.target.closest('a.btn'));
    var textEl = !btn && (
      e.target.matches(TEXT_SEL) ? e.target : e.target.closest(TEXT_SEL)
    );

    if (!panel && !btn && !textEl) { deactivate(); return; }

    if (btn) {
      e.preventDefault(); e.stopPropagation();
      deactivate();
      lastBtn = btn;
      post({ type: 'link-click', text: btn.innerText.trim(), href: btn.getAttribute('href') || '#' });
      return;
    }

    if (panel && !textEl) {
      post({ type: 'panel-open', panel: panel.dataset.editPanel });
      return;
    }

    if (textEl) {
      e.preventDefault();
      activateText(textEl);
    }
  }, true);

  document.addEventListener('input', function () {
    post({ type: 'page-dirty' });
  });

  // ── Messages from parent ───────────────────────────────────────────────────
  window.addEventListener('message', function (e) {
    if (!e.data || !e.data.type) return;
    var d = e.data;

    if (d.type === 'update-text' && d.id) {
      var el = document.querySelector('[data-editable="' + d.id + '"]');
      if (el) el.innerText = d.text;
    }

    if (d.type === 'update-img') {
      if (lastImg) {
        // Normal image replacement
        lastImg.src = d.newSrc;
        if (lastImgContainer) lastImgContainer.style.backgroundColor = d.bgColor || '';
        if (d.x !== undefined || d.scale !== undefined) {
          positionImg(lastImg, d.x !== undefined ? d.x : 50, d.y !== undefined ? d.y : 50, d.scale);
        }
        if (d.attribution !== undefined) {
          if (d.attribution) lastImg.setAttribute('data-attribution', d.attribution);
          else lastImg.removeAttribute('data-attribution');
          // Rebind so the credit tooltip works in the preview without a reload.
          if (window.qAttribScan) window.qAttribScan();
        }
      } else if (isIconContainer && lastImgContainer) {
        // Replace icon container content with an image
        lastImgContainer.innerHTML = '';
        var newImg = document.createElement('img');
        newImg.src = d.newSrc;
        newImg.alt = '';
        newImg.style.objectFit = 'cover';
        newImg.style.borderRadius = 'inherit';
        newImg.style.width = '100%';
        newImg.style.height = '100%';
        if (d.bgColor) lastImgContainer.style.backgroundColor = d.bgColor;
        lastImgContainer.appendChild(newImg);
        // Track the new img for position updates
        lastImg = newImg;
        isIconContainer = false;
      }
      post({ type: 'page-dirty' });
    }

    if (d.type === 'update-img-position' && lastImg) {
      positionImg(lastImg, d.x !== undefined ? d.x : 50, d.y !== undefined ? d.y : 50, d.scale);
    }

    if (d.type === 'update-link' && lastBtn) {
      if (d.text !== undefined) lastBtn.innerText = d.text;
      if (d.href !== undefined) lastBtn.setAttribute('href', d.href);
      post({ type: 'page-dirty' });
    }

    if (d.type === 'serialize') {
      deactivate();
      setTimeout(function () {
        // Serialize a CLONE so we can strip JS-rendered content without disturbing
        // the live preview. site-content.js re-renders these at runtime, so saving
        // their output would bake duplicate copies into the file on every save.
        var root = document.documentElement.cloneNode(true);
        ['sponsor-marquee', 'directory-list', 'resources-container', 'blog-container'].forEach(function (id) {
          var el = root.querySelector('#' + id);
          if (el) el.innerHTML = '';
        });
        var inj = root.querySelector('#qe-inject');
        if (inj) inj.remove();
        var html = '<!DOCTYPE html>\n' + root.outerHTML;
        // Strip injected editor artifacts
        html = html.replace(/<style id="qe-styles">[\s\S]*?<\/style>\s*/g, '');
        html = html.replace(/<script[^>]+editor-inject\.js[^>]*><\/script>\s*/g, '');
        html = html.replace(/ contenteditable="(true|false)"/g, '');
        html = html.replace(/\bqe-active\b/g, '');
        html = html.replace(/ class=""\s*/g, ' ');
        // Fix absolute localhost URLs → relative paths (images, links etc.)
        html = html.replace(/https?:\/\/localhost:\d+\//g, '');
        post({ type: 'serialized-html', html: html });
      }, 40);
    }
  });

  console.log('[Q Editor] Injection ready');
})();
