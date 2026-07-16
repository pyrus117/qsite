/**
 * Q Youth NZ — Image Attribution
 * Shows a small credit tooltip when hovering an image that has a
 * data-attribution="..." attribute. Self-contained: include on any page with
 *   <script src="image-attribution.js" defer></script>
 * Set the credit text in the editor's Image panel (Attribution field).
 */
(function () {
  'use strict';

  var tip = null;
  var current = null; // image currently hovered/showing

  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'img-attrib-tip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    return tip;
  }

  function position(img) {
    if (!tip) return;
    var r = img.getBoundingClientRect();
    var tr = tip.getBoundingClientRect();
    // Nestle into the image's bottom-right, then clamp to the viewport.
    var left = Math.min(r.right - tr.width - 8, window.innerWidth - tr.width - 8);
    var top = r.bottom - tr.height - 8;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }

  function show(img) {
    var text = img.getAttribute('data-attribution');
    if (!text) return;
    current = img;
    var t = ensureTip();
    t.textContent = text;
    t.classList.add('on');
    position(img);
  }

  function hide(img) {
    if (img && img !== current) return;
    current = null;
    if (tip) tip.classList.remove('on');
  }

  // Bind to every image: showing is gated on the attribute being present at
  // hover time, so credits added later (e.g. in the editor) work without a rescan.
  function bind(img) {
    if (img._attribBound) return;
    img._attribBound = true;
    img.addEventListener('mouseenter', function () { show(img); });
    img.addEventListener('mouseleave', function () { hide(img); });
  }

  function scan() {
    var imgs = document.getElementsByTagName('img');
    for (var i = 0; i < imgs.length; i++) bind(imgs[i]);
  }

  // Keep the tooltip aligned if the page scrolls/resizes while visible.
  window.addEventListener('scroll', function () { if (current) position(current); }, true);
  window.addEventListener('resize', function () { if (current) position(current); });

  if (document.readyState !== 'loading') scan();
  else document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);

  // Allow the editor preview to rebind after it injects/replaces images.
  window.qAttribScan = scan;
}());
