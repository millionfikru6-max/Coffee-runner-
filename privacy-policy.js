/*
 * Coffee Runner — Privacy Policy
 * Progressive-enhancement script only. Every feature here is optional:
 * the page's content, navigation and links all work with JavaScript
 * disabled. This file only adds small conveniences:
 *   1. Marks <html> so CSS can show JS-only affordances.
 *   2. Highlights the current section in the "On this page" list.
 *   3. Shows/hides the back-to-top button based on scroll position.
 *   4. Updates the footer copyright year automatically.
 *   5. Lets the support email be copied to the clipboard.
 */
(function () {
  "use strict";

  document.documentElement.classList.add("has-js");

  /* ---- 1. Footer year ---- */
  var yearEl = document.getElementById("current-year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* ---- 2. Scrollspy for the table of contents ---- */
  var tocLinks = Array.prototype.slice.call(
    document.querySelectorAll(".toc-list a[href^='#']")
  );
  var sections = tocLinks
    .map(function (link) {
      var id = link.getAttribute("href").slice(1);
      return document.getElementById(id);
    })
    .filter(Boolean);

  if (tocLinks.length && sections.length && "IntersectionObserver" in window) {
    var activeId = null;

    var setActive = function (id) {
      if (id === activeId) return;
      activeId = id;
      tocLinks.forEach(function (link) {
        var isActive = link.getAttribute("href") === "#" + id;
        link.classList.toggle("is-active", isActive);
        if (isActive) {
          link.setAttribute("aria-current", "true");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    };

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  /* ---- 3. Back-to-top visibility ---- */
  var backToTop = document.querySelector(".back-to-top");
  if (backToTop) {
    var toggleBackToTop = function () {
      var scrolled = window.scrollY || document.documentElement.scrollTop;
      backToTop.classList.toggle("is-visible", scrolled > 480);
    };
    toggleBackToTop();
    window.addEventListener("scroll", toggleBackToTop, { passive: true });
  }

  /* ---- 4. Copy support email to clipboard ---- */
  var copyButtons = document.querySelectorAll("[data-copy-value]");
  copyButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var value = button.getAttribute("data-copy-value");
      if (!value) return;

      var done = function () {
        button.setAttribute("data-copied", "true");
        window.clearTimeout(button._copyTimeout);
        button._copyTimeout = window.setTimeout(function () {
          button.removeAttribute("data-copied");
        }, 2000);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done).catch(function () {
          /* Clipboard API unavailable or blocked — the mailto/link
             fallback the button sits next to still works. */
        });
      }
    });
  });
})();
