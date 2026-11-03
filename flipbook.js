(function () {
  let pageFlip = null;

  const $ = (id) => document.getElementById(id);

  // =====================================================
  // BOOK SIZE / ORIENTATION
  // =====================================================

  function getOrientation(size = {}) {
    const width = Number(size.width) || 10;
    const height = Number(size.height) || 7;

    if (Math.abs(width - height) < 0.01) {
      return "square";
    }

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

  // =====================================================
  // PAGE HTML
  // =====================================================

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

  // =====================================================
  // HOST MANAGEMENT
  // =====================================================

  function getStage() {
    return document.querySelector(".ry-flipbook-stage");
  }

  function createFreshHost() {
    const stage = getStage();

    if (!stage) {
      console.warn(
        'Flipbook stage ".ry-flipbook-stage" was not found.'
      );

      return null;
    }

    /*
     * IMPORTANT:
     * PageFlip can modify/remove DOM elements when destroy()
     * is called.
     *
     * Instead of trusting the old #ryFlipbook element,
     * we create a completely fresh one every time.
     */

    stage.innerHTML = "";

    const host = document.createElement("div");

    host.id = "ryFlipbook";
    host.className = "ry-flipbook-book";

    stage.appendChild(host);

    return host;
  }

  // =====================================================
  // DESTROY
  // =====================================================

  function destroyFlipbook() {
    if (!pageFlip) {
      return;
    }

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

  // =====================================================
  // COUNTER
  // =====================================================

  function updateCounter() {
    const counter = $("ryFlipbookCounter");

    if (!counter || !pageFlip) {
      return;
    }

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

  // =====================================================
  // CLEAR PREVIEW
  // =====================================================

  function clear(
    message =
      "Calculate a layout to generate the flipbook preview."
  ) {
    /*
     * Destroy old PageFlip first.
     */
    destroyFlipbook();

    /*
     * IMPORTANT:
     * Do NOT try to reuse the old host.
     * Create a fresh host after destroy().
     */
    const host = createFreshHost();

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

  // =====================================================
  // BUILD PAGE ELEMENTS
  // =====================================================

  function buildPages(
    host,
    distribution,
    size
  ) {
    const temporaryContainer =
      document.createElement("div");

    temporaryContainer.insertAdjacentHTML(
      "beforeend",
      makeCover(size, false)
    );

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

    const fragment =
      document.createDocumentFragment();

    Array.from(
      temporaryContainer.children
    ).forEach((page) => {
      fragment.appendChild(page);
    });

    host.appendChild(fragment);
  }

  // =====================================================
  // RENDER FLIPBOOK
  // =====================================================

  function render(
    distribution,
    size = {}
  ) {
    /*
     * Validate calculator result first.
     */

    if (
      !Array.isArray(distribution) ||
      distribution.length === 0
    ) {
      clear();
      return;
    }

    /*
     * Check PageFlip library.
     */

    if (
      !window.St ||
      !window.St.PageFlip
    ) {
      clear(
        "Flipbook animation library could not be loaded."
      );

      console.error(
        "StPageFlip library was not found."
      );

      return;
    }

    /*
     * Kill previous PageFlip.
     */

    destroyFlipbook();

    /*
     * NEVER reuse the old host.
     * Make a fresh one after destroying PageFlip.
     */

    const host = createFreshHost();

    if (!host) {
      return;
    }

    const counter =
      $("ryFlipbookCounter");

    if (counter) {
      counter.textContent =
        "Loading preview...";
    }

    /*
     * Build clean pages.
     */

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

    const dimensions =
      getDimensions(size);

    try {
      /*
       * Create new PageFlip instance.
       */

      pageFlip =
        new window.St.PageFlip(
          host,
          {
            width:
              dimensions.width,

            height:
              dimensions.height,

            size:
              "stretch",

            minWidth:
              220,

            maxWidth:
              620,

            minHeight:
              220,

            maxHeight:
              620,

            maxShadowOpacity:
              0.45,

            showCover:
              true,

            mobileScrollSupport:
              false,

            usePortrait:
              true,

            autoSize:
              true,

            flippingTime:
              850,

            swipeDistance:
              25,

            useMouseEvents:
              true,

            startPage:
              0,

            drawShadow:
              true,

            showPageCorners:
              true,

            disableFlipByClick:
              false,
          }
        );

      /*
       * Load the freshly-created page elements.
       */

      pageFlip.loadFromHTML(
        pageElements
      );

      /*
       * Events
       */

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
       * Initial counter update.
       */

      requestAnimationFrame(
        function () {

          requestAnimationFrame(
            function () {

              if (pageFlip) {
                updateCounter();
              }

            }
          );

        }
      );

    } catch (error) {
      console.error(
        "Flipbook initialization error:",
        error
      );

      /*
       * Avoid calling clear() while the broken
       * PageFlip instance may still be modifying DOM.
       */

      pageFlip = null;

      const freshHost =
        createFreshHost();

      if (freshHost) {
        freshHost.innerHTML = `
          <div class="ry-flipbook-empty">
            Unable to start the animated flipbook.
          </div>
        `;
      }

      if (counter) {
        counter.textContent =
          "Preview error";
      }
    }
  }

  // =====================================================
  // CONTROLS
  // =====================================================

  function next() {
    if (!pageFlip) {
      return;
    }

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
    if (!pageFlip) {
      return;
    }

    try {
      pageFlip.flipPrev();
    } catch (error) {
      console.warn(
        "Previous page error:",
        error
      );
    }
  }

  // =====================================================
  // PUBLIC API
  // =====================================================

  window.RYFlipbook = {
    render,
    clear,
    next,
    prev,
  };

})();