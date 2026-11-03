(function () {
  let pageFlip = null;
  let renderTimer = null;
  let renderVersion = 0;

  const $ = (id) => document.getElementById(id);
  function getOrCreateFlipbookHost() {
  let host = document.getElementById("ryFlipbook");

  if (host && host.isConnected) {
    return host;
  }

  const stage = document.querySelector(".ry-flipbook-stage");

  if (!stage) {
    console.warn('Flipbook stage ".ry-flipbook-stage" was not found.');
    return null;
  }

  stage.innerHTML = "";

  host = document.createElement("div");
  host.id = "ryFlipbook";
  host.className = "ry-flipbook-book";

  stage.appendChild(host);

  return host;
}

  function getOrientation(size = {}) {
    const width = Number(size.width) || 10;
    const height = Number(size.height) || 7;

    if (Math.abs(width - height) < 0.01) return "square";
    return width > height ? "landscape" : "portrait";
  }

  function getDimensions(size = {}) {
    const width = Number(size.width) || 10;
    const height = Number(size.height) || 7;

    const maxSide = 420;

    if (width >= height) {
      return {
        width: maxSide,
        height: Math.round(maxSide * (height / width)),
      };
    }

    return {
      width: Math.round(maxSide * (width / height)),
      height: maxSide,
    };
  }

  function makePhotoSlots(count, orientation) {
    const safeCount = Math.max(
      0,
      Math.min(8, Number(count) || 0)
    );

    if (safeCount === 0) {
      return `
        <div class="ry-empty-page">
          <span>Blank Page</span>
        </div>
      `;
    }

    let slots = "";

    for (let i = 1; i <= safeCount; i++) {
      slots += `
        <div class="ry-photo-slot">
          <span>PHOTO ${i}</span>
        </div>
      `;
    }

    return `
      <div class="ry-photo-grid count-${safeCount} ${orientation}">
        ${slots}
      </div>
    `;
  }

  function makeInsidePage(count, pageNumber, size) {
    const orientation = getOrientation(size);

    return `
      <div class="ry-book-page">
        <div class="ry-page-inner">
          <div class="ry-page-label">
            PAGE ${pageNumber}
          </div>

          ${makePhotoSlots(count, orientation)}

          <div class="ry-page-footer">
            ${count} ${Number(count) === 1 ? "photo" : "photos"}
          </div>
        </div>
      </div>
    `;
  }

  function makeCover(size, isBack = false) {
    const orientation = getOrientation(size);

    if (isBack) {
      return `
        <div
          class="ry-book-page ry-cover-page ${orientation}"
          data-density="hard"
        >
          <div class="ry-cover-content">
            <div class="ry-cover-small">
              R&Y PRINTING LAB
            </div>

            <div class="ry-cover-title">
              Back Cover
            </div>

            <div class="ry-cover-subtitle">
              Photobook Preview
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div
        class="ry-book-page ry-cover-page ${orientation}"
        data-density="hard"
      >
        <div class="ry-cover-content">
          <div class="ry-cover-small">
            R&Y PRINTING LAB
          </div>

          <div class="ry-cover-title">
            Photobook Preview
          </div>

          <div class="ry-cover-subtitle">
            Calculator Layout Preview
          </div>
        </div>
      </div>
    `;
  }

  function cancelPendingRender() {
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = null;
    }
  }

  function destroyFlipbook() {
    cancelPendingRender();

    if (pageFlip) {
      const oldPageFlip = pageFlip;

      pageFlip = null;

      try {
        oldPageFlip.destroy();
      } catch (error) {
        console.warn(
          "Flipbook destroy warning:",
          error
        );
      }
    }
  }

  function updateCounter() {
    const counter = $("ryFlipbookCounter");

    if (!counter || !pageFlip) return;

    try {
      const current =
        pageFlip.getCurrentPageIndex();

      const total =
        pageFlip.getPageCount();

      if (!total) {
        counter.textContent = "No preview";
        return;
      }

      if (current === 0) {
        counter.textContent =
          `Front Cover • ${total} total pages`;

        return;
      }

      if (current >= total - 1) {
        counter.textContent =
          `Back Cover • ${total} total pages`;

        return;
      }

      counter.textContent =
        `Page ${current} of ${total - 2}`;
    } catch (error) {
      console.warn(
        "Flipbook counter warning:",
        error
      );
    }
  }

  function clear(
    message =
      "Calculate a layout to generate the flipbook preview."
  ) {
    renderVersion++;

    destroyFlipbook();

    const host = $("ryFlipbook");

    if (host) {
      host.innerHTML = `
        <div class="ry-flipbook-empty">
          ${message}
        </div>
      `;
    }

    const counter =
      $("ryFlipbookCounter");

    if (counter) {
      counter.textContent =
        "No preview";
    }
  }

  function buildPages(
    host,
    distribution,
    size
  ) {
    const fragment =
      document.createDocumentFragment();

    const temporaryContainer =
      document.createElement("div");

    temporaryContainer.innerHTML =
      makeCover(size, false);

    distribution.forEach(
      (photoCount, index) => {
        temporaryContainer.insertAdjacentHTML(
          "beforeend",
          makeInsidePage(
            photoCount,
            index + 1,
            size
          )
        );
      }
    );

    temporaryContainer.insertAdjacentHTML(
      "beforeend",
      makeCover(size, true)
    );

    const pages =
      Array.from(
        temporaryContainer.children
      );

    pages.forEach((page) => {
      fragment.appendChild(page);
    });

    host.appendChild(fragment);
  }

  function startPageFlip(
    host,
    distribution,
    size,
    version
  ) {
    if (version !== renderVersion) {
      return;
    }

    if (!host || !host.isConnected) {
      return;
    }

    if (
      !window.St ||
      !window.St.PageFlip
    ) {
      clear(
        "Flipbook animation library could not be loaded."
      );

      console.error(
        "StPageFlip library not found. Make sure page-flip.browser.js loads before flipbook.js."
      );

      return;
    }

    const dimensions =
      getDimensions(size);

    host.innerHTML = "";

    buildPages(
      host,
      distribution,
      size
    );

    const pageElements =
      host.querySelectorAll(
        ".ry-book-page"
      );

    if (!pageElements.length) {
      clear(
        "No photobook pages were generated."
      );

      return;
    }

    try {
      const newPageFlip =
        new window.St.PageFlip(
          host,
          {
            width:
              dimensions.width,

            height:
              dimensions.height,

            size: "stretch",

            minWidth: 220,
            maxWidth: 620,

            minHeight: 220,
            maxHeight: 620,

            maxShadowOpacity:
              0.45,

            showCover: true,

            mobileScrollSupport:
              false,

            usePortrait: true,

            autoSize: true,

            flippingTime: 850,

            swipeDistance: 25,

            useMouseEvents: true,

            startPage: 0,

            drawShadow: true,

            showPageCorners: true,

            disableFlipByClick:
              false,
          }
        );

      /*
       * Important:
       * Another calculation may have happened
       * while this instance was being created.
       */
      if (version !== renderVersion) {
        try {
          newPageFlip.destroy();
        } catch (error) {
          console.warn(
            "Old flipbook cleanup warning:",
            error
          );
        }

        return;
      }

      pageFlip = newPageFlip;

      pageFlip.loadFromHTML(
        pageElements
      );

      pageFlip.on(
        "flip",
        function () {
          updateCounter();
        }
      );

      pageFlip.on(
        "changeOrientation",
        function () {
          updateCounter();
        }
      );

      pageFlip.on(
        "init",
        function () {
          updateCounter();
        }
      );

      /*
       * Wait until PageFlip has finished
       * creating its wrapper and page layers.
       */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (
            version !== renderVersion ||
            !pageFlip
          ) {
            return;
          }

          updateCounter();
        });
      });
    } catch (error) {
      console.error(
        "Flipbook initialization error:",
        error
      );

      if (version === renderVersion) {
        clear(
          "Unable to start the animated flipbook. Check the browser console for details."
        );
      }
    }
  }

  function render(
    distribution,
    size = {}
  ) {
    const host =
      $("ryFlipbook");

    if (!host) {
      console.warn(
        'Flipbook container "#ryFlipbook" was not found.'
      );

      return;
    }

    if (
      !Array.isArray(distribution) ||
      distribution.length === 0
    ) {
      clear();
      return;
    }

    /*
     * Create a new version number for
     * every calculation.
     *
     * Only the newest calculation is
     * allowed to render.
     */
    renderVersion++;

    const thisVersion =
      renderVersion;

    cancelPendingRender();

    /*
     * Destroy previous PageFlip first.
     */
    if (pageFlip) {
      const oldPageFlip =
        pageFlip;

      pageFlip = null;

      try {
        oldPageFlip.destroy();
      } catch (error) {
        console.warn(
          "Flipbook destroy warning:",
          error
        );
      }
    }

    /*
     * Clear old PageFlip generated DOM.
     */
    host.innerHTML = `
      <div class="ry-flipbook-empty">
        Generating photobook preview...
      </div>
    `;

    const counter =
      $("ryFlipbookCounter");

    if (counter) {
      counter.textContent =
        "Loading preview...";
    }

    /*
     * Small delay gives PageFlip/DOM enough
     * time to fully remove the old instance.
     *
     * If calculate() fires again during this
     * delay, the old render is cancelled.
     */
    renderTimer = setTimeout(
      function () {
        renderTimer = null;

        if (
          thisVersion !==
          renderVersion
        ) {
          return;
        }

        startPageFlip(
          host,
          distribution,
          size,
          thisVersion
        );
      },
      80
    );
  }

  function next() {
    if (!pageFlip) return;

    try {
      pageFlip.flipNext();
    } catch (error) {
      console.warn(
        "Next page error:",
        error
      );
    }
  }

  function prev() {
    if (!pageFlip) return;

    try {
      pageFlip.flipPrev();
    } catch (error) {
      console.warn(
        "Previous page error:",
        error
      );
    }
  }

  /*
   * Clean up if the browser leaves/reloads
   * the page.
   */
  window.addEventListener(
    "beforeunload",
    function () {
      destroyFlipbook();
    }
  );

  window.RYFlipbook = {
    render,
    clear,
    next,
    prev,
  };
})();