// =============================================================================
//  Q YOUTH NZ — SITE CONTENT
//  Data now lives in  site-data.json  — use the editor app (editor.py) or
//  edit that JSON file directly.  This file only contains rendering code.
// =============================================================================

(function () {
  'use strict';

  // Queue of callbacks waiting for data to load
  var _data = null;
  var _callbacks = [];

  function _ready(fn) {
    if (_data) { fn(_data); } else { _callbacks.push(fn); }
  }

  // Fetch data once on page load
  fetch('site-data.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (d) {
      _data = d;
      _callbacks.forEach(function (fn) { fn(d); });
      _callbacks = [];
    })
    .catch(function (e) {
      console.error('[Q Youth] Could not load site-data.json:', e.message);
    });

  // Safely encode a filename so spaces/special chars work in img.src URLs
  function _imgPath(folder, filename) {
    if (!filename) return '';
    return folder + encodeURIComponent(filename);
  }

  // Basic HTML escaping for text inserted via innerHTML
  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


  // ---------------------------------------------------------------------------
  //  SPONSORS — scrolling marquee banner
  // ---------------------------------------------------------------------------
  function renderMarquee(containerId) {
    _ready(function (data) {
      var container = document.getElementById(containerId);
      if (!container || !data.sponsors || !data.sponsors.length) return;

      var outer = document.createElement('div');
      outer.className = 'marquee-outer';

      var track = document.createElement('div');
      track.className = 'marquee-track';

      // Duplicate list so the CSS animation loops seamlessly
      var doubled = data.sponsors.concat(data.sponsors);
      doubled.forEach(function (sponsor) {
        var item = document.createElement('div');
        item.className = 'marquee-item';

        if (sponsor.bgColor) item.style.backgroundColor = sponsor.bgColor;

        if (sponsor.logo) {
          var img = document.createElement('img');
          img.src     = _imgPath('images/sponsors/', sponsor.logo);
          img.alt     = sponsor.name;
          img.loading = 'lazy';
          if (sponsor.width && sponsor.height) {
            img.width  = sponsor.width;
            img.height = sponsor.height;
          }
          img.onerror = function () {
            item.innerHTML = '';
            var span = document.createElement('span');
            span.textContent = sponsor.name;
            item.appendChild(span);
          };
          item.appendChild(img);
        } else {
          var span = document.createElement('span');
          span.textContent = sponsor.name;
          item.appendChild(span);
        }

        track.appendChild(item);
      });

      outer.appendChild(track);
      container.appendChild(outer);
    });
  }


  // ---------------------------------------------------------------------------
  //  DIRECTORY — local LGBTQIA+ organisation listing
  // ---------------------------------------------------------------------------
  function renderDirectory(containerId) {
    _ready(function (data) {
      var container = document.getElementById(containerId);
      if (!container || !data.directory || !data.directory.length) return;

      data.directory.forEach(function (org) {
        var item = document.createElement('div');
        item.className = 'directory-item';

        // Logo column
        var logoDiv = document.createElement('div');
        logoDiv.className = 'directory-logo';

        if (org.bgColor) logoDiv.style.backgroundColor = org.bgColor;

        if (org.logo) {
          var img = document.createElement('img');
          img.src     = _imgPath('images/logos/', org.logo);
          img.alt     = org.name + ' logo';
          img.width   = 72;
          img.height  = 72;
          img.loading = 'lazy';
          img.onerror = function () {
            logoDiv.classList.add('directory-logo-empty');
            if (logoDiv.contains(img)) logoDiv.removeChild(img);
          };
          logoDiv.appendChild(img);
        } else {
          logoDiv.classList.add('directory-logo-empty');
        }
        item.appendChild(logoDiv);

        // Text column
        var body = document.createElement('div');
        body.className = 'directory-item-body';

        var header = document.createElement('div');
        header.className = 'directory-item-header';

        var h3 = document.createElement('h3');
        if (org.website) {
          var link = document.createElement('a');
          link.href      = org.website;
          link.target    = '_blank';
          link.rel       = 'noopener noreferrer';
          link.className = 'directory-link';
          link.textContent = org.name;
          h3.appendChild(link);
        } else {
          h3.textContent = org.name;
        }
        header.appendChild(h3);

        var badge = document.createElement('span');
        badge.className  = 'badge ' + (org.badge || 'badge-purple');
        badge.textContent = org.location;
        header.appendChild(badge);

        var desc = document.createElement('p');
        desc.textContent = org.description;

        body.appendChild(header);
        body.appendChild(desc);
        item.appendChild(body);
        container.appendChild(item);
      });
    });
  }


  // ---------------------------------------------------------------------------
  //  RESOURCES — grouped resource list with optional links
  // ---------------------------------------------------------------------------
  function renderResources(containerId) {
    _ready(function (data) {
      var container = document.getElementById(containerId);
      if (!container || !data.resources || !data.resources.length) return;

      var iconMap  = { pdf: 'icon-file-text', video: 'icon-play',     link: 'icon-globe'         };
      var arrowMap = { pdf: 'icon-download',  video: 'icon-play',     link: 'icon-external-link'  };

      data.resources.forEach(function (group) {
        var groupEl = document.createElement('div');
        groupEl.className = 'resource-group';

        var h3 = document.createElement('h3');
        h3.textContent = group.group;
        groupEl.appendChild(h3);

        var list = document.createElement('div');
        list.className = 'resource-list';

        group.items.forEach(function (resource) {
          var icon  = iconMap[resource.type]  || 'icon-file-text';
          var arrow = arrowMap[resource.type] || 'icon-arrow-right';

          // Embedded video: the URL field holds an <iframe> embed code.
          if (resource.type === 'video' && /<iframe[\s\S]*<\/iframe>/i.test(resource.url || '')) {
            var card = document.createElement('div');
            card.className = 'resource-video';

            if (resource.title || resource.description) {
              var head = document.createElement('div');
              head.className = 'resource-video-head';
              head.innerHTML =
                '<strong>' + _esc(resource.title) + '</strong>' +
                (resource.description ? '<span>' + _esc(resource.description) + '</span>' : '');
              card.appendChild(head);
            }

            var embed = document.createElement('div');
            embed.className = 'resource-embed';
            embed.innerHTML = resource.url;            // owner-supplied embed code
            var ifr = embed.querySelector('iframe');
            if (ifr) { ifr.removeAttribute('width'); ifr.removeAttribute('height'); }
            card.appendChild(embed);

            list.appendChild(card);
            return;
          }

          var el;
          if (resource.url) {
            el = document.createElement('a');
            el.href   = resource.url;
            el.target = '_blank';
            el.rel    = 'noopener noreferrer';
            el.className = 'resource-item';
          } else {
            el = document.createElement('div');
            el.className = 'resource-item resource-item-unlisted';
          }

          el.innerHTML =
            '<div class="resource-item-icon" aria-hidden="true">' +
              '<svg class="icon icon-md" focusable="false"><use href="icons.svg#' + icon + '"></use></svg>' +
            '</div>' +
            '<div class="resource-item-text">' +
              '<strong>' + _esc(resource.title) + '</strong>' +
              '<span>'   + _esc(resource.description) + '</span>' +
            '</div>' +
            (resource.url
              ? '<svg class="icon icon-sm resource-item-arrow" aria-hidden="true" focusable="false"><use href="icons.svg#' + arrow + '"></use></svg>'
              : '<span class="resource-item-soon">Coming soon</span>');

          list.appendChild(el);
        });

        groupEl.appendChild(list);
        container.appendChild(groupEl);
      });
    });
  }


  // ---------------------------------------------------------------------------
  //  BLOG — dated posts, newest first
  // ---------------------------------------------------------------------------
  function renderBlog(containerId) {
    _ready(function (data) {
      var container = document.getElementById(containerId);
      if (!container) return;

      var posts = (data.blog || []).slice();
      if (!posts.length) {
        var empty = document.createElement('p');
        empty.className = 'blog-empty';
        empty.textContent = 'No posts yet — check back soon.';
        container.appendChild(empty);
        return;
      }

      // ISO dates (YYYY-MM-DD) sort correctly as strings
      posts.sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || ''));
      });

      posts.forEach(function (post) {
        var article = document.createElement('article');
        article.className = 'blog-post';

        if (post.image) {
          var figure = document.createElement('div');
          figure.className = 'blog-post-img';
          var img = document.createElement('img');
          img.src     = _imgPath('images/', post.image);
          img.alt     = post.imageAlt || '';
          img.loading = 'lazy';
          img.onerror = function () {
            if (article.contains(figure)) article.removeChild(figure);
          };
          figure.appendChild(img);
          article.appendChild(figure);
        }

        var body = document.createElement('div');
        body.className = 'blog-post-body';

        if (post.date) {
          var time = document.createElement('time');
          time.className = 'blog-post-date';
          time.setAttribute('datetime', post.date);
          var d = new Date(post.date + 'T00:00:00');
          time.textContent = isNaN(d.getTime())
            ? post.date
            : d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
          body.appendChild(time);
        }

        // byline only for runner posts (author field set by publish.ts)
        if (post.author) {
          var byline = document.createElement('span');
          byline.className = 'blog-post-author';
          byline.textContent = 'by ' + post.author;
          body.appendChild(byline);
        }

        var h3 = document.createElement('h3');
        h3.textContent = post.title;
        body.appendChild(h3);

        // Blank lines in the body become paragraph breaks
        String(post.body || '').split(/\n\s*\n/).forEach(function (para) {
          if (!para.trim()) return;
          var p = document.createElement('p');
          p.textContent = para.trim();
          body.appendChild(p);
        });

        if (post.link) {
          var a = document.createElement('a');
          a.className = 'btn btn-secondary btn-sm';
          a.href = post.link;
          if (/^https?:/i.test(post.link)) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
          }
          a.textContent = post.linkLabel || 'Read more';
          body.appendChild(a);
        }

        article.appendChild(body);
        container.appendChild(article);
      });
    });
  }


  // Expose globally so HTML pages can call renderMarquee(), etc.
  window.renderMarquee   = renderMarquee;
  window.renderDirectory = renderDirectory;
  window.renderResources = renderResources;
  window.renderBlog      = renderBlog;

}());
