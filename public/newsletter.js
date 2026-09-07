/**
 * Q Youth NZ — Newsletter signup
 * Posts every .newsletter-form to Web3Forms without a page reload, then shows
 * the result in the form's .newsletter-status paragraph. Self-contained:
 *   <script src="newsletter.js" defer></script>
 * The form itself carries the action and the hidden Web3Forms fields, so it
 * still submits normally if this script fails to load.
 */
(function () {
  'use strict';

  var FALLBACK = 'Sorry, something went wrong. Please email manager@qyouthnz.com instead.';

  function wire(form) {
    var button = form.querySelector('button[type="submit"]');
    var status = form.querySelector('.newsletter-status');
    if (!button || !status) return;

    function showStatus(message) {
      status.textContent = message;
      status.style.display = 'block';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Subscribing…';
      showStatus('Signing you up…');

      fetch(form.action, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { ok: response.ok, data: data };
          });
        })
        .then(function (result) {
          if (result.ok && result.data.success) {
            form.reset();
            showStatus('Thank you! You are on the list — watch your inbox for our next update.');
          } else {
            showStatus((result.data && result.data.message) || FALLBACK);
          }
        })
        .catch(function () {
          showStatus(FALLBACK);
        })
        .finally(function () {
          button.disabled = false;
          button.textContent = originalLabel;
        });
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.newsletter-form'), wire);
})();
