(function () {
  let pageFlip = null;

  const $ = (id) => document.getElementById(id);

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
    const safeCount = Math.max(0, Math.min(8, Number(count) || 0));

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
        <div class="ry-book-page ry-cover-page ${orientation}" data-density="hard">
          <div class="ry-cover-content">
            <div class="ry-cover-small">R&Y PRINTING LAB</div>
            <div class="ry-cover-title">Back Cover</div>
            <div class="ry-cover-subtitle">
              Photobook Preview
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="ry-book-page ry-cover-page ${orientation}" data-density="hard">
        <div class="ry-cover-content">
          <div class="ry-cover-small">R&Y PRINTING LAB</div>
          <div class="ry-cover-title">Photobook Preview</div>
          <div class="ry-cover-subtitle">
            Calculator Layout Preview
          </div>
        </div>
      </div>
    `;
  }

  function destroyFlipbook() {
    if (pageFlip) {
      try {
        pageFlip.destroy();
      } catch (error) {
        console.warn("Flipbook destroy warning:", error);
      }

      pageFlip = null;
    }
  }

  function updateCounter() {
    const counter = $("ryFlipbookCounter");

    if (!counter || !pageFlip) return;

    const current = pageFlip.getCurrentPageIndex();
    const total = pageFlip.getPageCount();

    if (current === 0) {
      counter.textContent = `Front Cover • ${total} total pages`;
      return;
    }

    if (current >= total - 1) {
      counter.textContent = `Back Cover • ${total} total pages`;
      return;
    }

    counter.textContent = `Page ${current} of ${total - 2}`;
  }

  function clear(message = "Calculate a layout to generate the flipbook preview.") {
    destroyFlipbook();

    const host = $("ryFlipbook");

    if (host) {
      host.innerHTML = `
        <div class="ry-flipbook-empty">
          ${message}
        </div>
      `;
    }

    const counter = $("ryFlipbookCounter");

    if (counter) {
      counter.textContent = "No preview";
    }
  }

  function render(distribution, size = {}) {
    const host = $("ryFlipbook");

    if (!host) {
      console.warn('Flipbook container "#ryFlipbook" was not found.');
      return;
    }

    if (!Array.isArray(distribution) || distribution.length === 0) {
      clear();
      return;
    }

    if (!window.St || !window.St.PageFlip) {
      clear("Flipbook animation library could not be loaded.");
      console.error(
        "StPageFlip library not found. Make sure page-flip.browser.js loads before flipbook.js."
      );
      return;
    }

    destroyFlipbook();

    host.innerHTML = "";

    const dimensions = getDimensions(size);

    const temporaryContainer = document.createElement("div");

    temporaryContainer.innerHTML = makeCover(size, false);

    distribution.forEach((photoCount, index) => {
      temporaryContainer.innerHTML += makeInsidePage(
        photoCount,
        index + 1,
        size
      );
    });

    temporaryContainer.innerHTML += makeCover(size, true);

    const pages = Array.from(temporaryContainer.children);

    pages.forEach((page) => {
      host.appendChild(page);
    });

    try {
      pageFlip = new window.St.PageFlip(host, {
        width: dimensions.width,
        height: dimensions.height,

        size: "stretch",

        minWidth: 220,
        maxWidth: 620,

        minHeight: 220,
        maxHeight: 620,

        maxShadowOpacity: 0.45,

        showCover: true,

        mobileScrollSupport: false,

        usePortrait: true,

        autoSize: true,

        flippingTime: 850,

        swipeDistance: 25,

        useMouseEvents: true,

        startPage: 0,

        drawShadow: true,

        showPageCorners: true,

        disableFlipByClick: false,
      });

      pageFlip.loadFromHTML(
        host.querySelectorAll(".ry-book-page")
      );

      pageFlip.on("flip", function () {
        updateCounter();
      });

      pageFlip.on("changeOrientation", function () {
        updateCounter();
      });

      updateCounter();
    } catch (error) {
      console.error("Flipbook initialization error:", error);

      clear(
        "Unable to start the animated flipbook. Check the browser console for details."
      );
    }
  }

  function next() {
    if (!pageFlip) return;

    try {
      pageFlip.flipNext();
    } catch (error) {
      console.warn("Next page error:", error);
    }
  }

  function prev() {
    if (!pageFlip) return;

    try {
      pageFlip.flipPrev();
    } catch (error) {
      console.warn("Previous page error:", error);
    }
  }

  window.RYFlipbook = {
    render,
    clear,
    next,
    prev,
  };
})();