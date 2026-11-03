(function () {
  "use strict";

  // =====================================================
  // STATE
  // =====================================================

  let pageFlip = null;
  let pdfFile = null;
  let pdfDocument = null;

  let renderedPageUrls = [];

  let zoomLevel = 1;

  const MIN_ZOOM = 0.6;
  const MAX_ZOOM = 2;
  const ZOOM_STEP = 0.1;

  const $ = (id) => document.getElementById(id);


  // =====================================================
  // PDF.JS SETUP
  // =====================================================

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }


  // =====================================================
  // STATUS
  // =====================================================

  function showStatus(message, type = "info") {
    const status = $("uploadStatus");

    if (!status) return;

    status.className =
      "mt-4 rounded-xl px-4 py-3 text-xs font-bold border";

    if (type === "error") {
      status.classList.add(
        "bg-red-50",
        "text-red-700",
        "border-red-200"
      );
    } else if (type === "success") {
      status.classList.add(
        "bg-emerald-50",
        "text-emerald-700",
        "border-emerald-200"
      );
    } else {
      status.classList.add(
        "bg-blue-50",
        "text-blue-700",
        "border-blue-200"
      );
    }

    status.textContent = message;
  }


  function hideStatus() {
    const status = $("uploadStatus");

    if (!status) return;

    status.classList.add("hidden");
  }


  // =====================================================
  // FILE SIZE
  // =====================================================

  function formatFileSize(bytes) {
    if (!bytes) return "0 KB";

    const mb =
      bytes / (1024 * 1024);

    if (mb >= 1) {
      return `${mb.toFixed(2)} MB`;
    }

    return `${Math.round(
      bytes / 1024
    )} KB`;
  }


  // =====================================================
  // BOOK SIZE
  // =====================================================

  function getBookSize() {
    const value =
      $("bookSize")?.value || "10x7";

    const sizes = {
      "6x6": {
        width: 6,
        height: 6
      },

      "8x7": {
        width: 8,
        height: 7
      },

      "10x7": {
        width: 10,
        height: 7
      },

      "7x10": {
        width: 7,
        height: 10
      }
    };

    return sizes[value] ||
      sizes["10x7"];
  }


  function getPageDimensions() {
    const size =
      getBookSize();

    const maxSide = 430;

    if (size.width >= size.height) {
      return {
        width: maxSide,

        height: Math.round(
          maxSide *
          (size.height / size.width)
        )
      };
    }

    return {
      width: Math.round(
        maxSide *
        (size.width / size.height)
      ),

      height: maxSide
    };
  }


  // =====================================================
  // DESTROY PAGEFLIP
  // =====================================================

  function destroyFlipbook() {
    if (!pageFlip) return;

    const oldPageFlip =
      pageFlip;

    pageFlip = null;

    try {
      oldPageFlip.destroy();
    } catch (error) {
      console.warn(
        "Client flipbook destroy warning:",
        error
      );
    }
  }


  // =====================================================
  // FRESH HOST
  // Same lifecycle strategy as our working calculator.
  // =====================================================

  function getStage() {
    return document.querySelector(
      ".client-flipbook-stage"
    );
  }


  function createFreshHost() {
    const stage =
      getStage();

    if (!stage) {
      console.warn(
        "Client flipbook stage not found."
      );

      return null;
    }

    stage.innerHTML = "";

    const host =
      document.createElement("div");

    host.id =
      "clientFlipbook";

    host.className =
      "client-flipbook-book";

    stage.appendChild(host);

    applyZoom();

    return host;
  }


  // =====================================================
  // BADGE
  // =====================================================

  function setPreviewBadge(
    text,
    ready = false
  ) {
    const badge =
      $("previewBadge");

    if (!badge) return;

    badge.textContent = text;

    if (ready) {
      badge.classList.add(
        "is-ready"
      );
    } else {
      badge.classList.remove(
        "is-ready"
      );
    }
  }


  // =====================================================
  // PDF INFO
  // =====================================================

  function updatePdfInfo() {
    const info =
      $("pdfFileInfo");

    if (!info) return;

    if (!pdfFile) {
      info.classList.add(
        "hidden"
      );

      info.innerHTML = "";

      return;
    }

    info.classList.remove(
      "hidden"
    );

    info.innerHTML = `
      <strong>✓ ${escapeHtml(
        pdfFile.name
      )}</strong>

      <div style="
        margin-top:4px;
        opacity:.75;
      ">
        ${formatFileSize(
          pdfFile.size
        )}
      </div>
    `;
  }


  function updatePdfStats(
    totalPages = 0
  ) {
    const stats =
      $("pdfStats");

    const total =
      $("pdfTotalPages");

    const inside =
      $("pdfInsidePages");

    if (
      !stats ||
      !total ||
      !inside
    ) {
      return;
    }

    if (!totalPages) {
      stats.classList.add(
        "hidden"
      );

      total.textContent = "0";
      inside.textContent = "0";

      return;
    }

    stats.classList.remove(
      "hidden"
    );

    total.textContent =
      String(totalPages);

    inside.textContent =
      String(
        Math.max(
          0,
          totalPages - 2
        )
      );
  }


  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }


  // =====================================================
  // READ PDF
  // =====================================================

  async function loadPdf(file) {
    if (!window.pdfjsLib) {
      throw new Error(
        "PDF.js library was not loaded."
      );
    }

    const arrayBuffer =
      await file.arrayBuffer();

    const loadingTask =
      window.pdfjsLib.getDocument({
        data: arrayBuffer
      });

    return await loadingTask.promise;
  }


  // =====================================================
  // RENDER ONE PDF PAGE TO IMAGE
  // =====================================================

  async function renderPdfPageToImage(
    pdf,
    pageNumber
  ) {
    const page =
      await pdf.getPage(
        pageNumber
      );

    /*
     * Render at higher resolution so Canva
     * designs remain sharp while zooming.
     */

    const baseViewport =
      page.getViewport({
        scale: 1
      });

    const targetWidth = 1600;

    const scale =
      targetWidth /
      baseViewport.width;

    const viewport =
      page.getViewport({
        scale
      });

    const canvas =
      document.createElement(
        "canvas"
      );

    const context =
      canvas.getContext(
        "2d",
        {
          alpha: false
        }
      );

    canvas.width =
      Math.ceil(
        viewport.width
      );

    canvas.height =
      Math.ceil(
        viewport.height
      );

    context.fillStyle =
      "#ffffff";

    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    await page.render({
      canvasContext: context,
      viewport
    }).promise;

    /*
     * WebP keeps preview quality high
     * without making browser memory
     * unnecessarily huge.
     */

    return canvas.toDataURL(
      "image/webp",
      0.92
    );
  }


  // =====================================================
  // RENDER ALL PDF PAGES
  // =====================================================

  async function renderAllPdfPages(
    pdf,
    onProgress
  ) {
    const urls = [];

    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      if (onProgress) {
        onProgress(
          pageNumber,
          pdf.numPages
        );
      }

      const imageUrl =
        await renderPdfPageToImage(
          pdf,
          pageNumber
        );

      urls.push(imageUrl);

      /*
       * Give browser a tiny break between
       * large Canva pages.
       */

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            0
          )
      );
    }

    return urls;
  }


  // =====================================================
  // CREATE PAGE
  // =====================================================

  function createPageElement(
    imageUrl,
    pageNumber,
    totalPages
  ) {
    const page =
      document.createElement(
        "div"
      );

    const isFrontCover =
      pageNumber === 1;

    const isBackCover =
      pageNumber ===
      totalPages;

    page.className =
      (
        isFrontCover ||
        isBackCover
      )
        ? "client-book-page client-cover-page"
        : "client-book-page";

    if (
      isFrontCover ||
      isBackCover
    ) {
      page.setAttribute(
        "data-density",
        "hard"
      );
    }

    if (isFrontCover) {
      page.setAttribute(
        "aria-label",
        "Front Cover"
      );
    } else if (isBackCover) {
      page.setAttribute(
        "aria-label",
        "Back Cover"
      );
    } else {
      page.setAttribute(
        "aria-label",
        `Inside Page ${
          pageNumber - 1
        }`
      );
    }

    const image =
      document.createElement(
        "img"
      );

    image.className =
      "client-page-image";

    image.src =
      imageUrl;

    image.draggable =
      false;

    if (isFrontCover) {
      image.alt =
        "Front Cover";
    } else if (isBackCover) {
      image.alt =
        "Back Cover";
    } else {
      image.alt =
        `Photobook Page ${
          pageNumber - 1
        }`;
    }

    page.appendChild(
      image
    );

    return page;
  }


  // =====================================================
  // BUILD PAGES
  // =====================================================

  function buildFlipbookPages(
    host,
    pageUrls
  ) {
    const totalPages =
      pageUrls.length;

    pageUrls.forEach(
      (imageUrl, index) => {

        host.appendChild(
          createPageElement(
            imageUrl,
            index + 1,
            totalPages
          )
        );

      }
    );
  }


  // =====================================================
  // WAIT FOR IMAGES
  // =====================================================

  function waitForImages(host) {
    const images =
      Array.from(
        host.querySelectorAll(
          "img"
        )
      );

    if (!images.length) {
      return Promise.resolve();
    }

    return Promise.all(
      images.map(
        (image) => {

          if (
            image.complete &&
            image.naturalWidth > 0
          ) {
            return Promise.resolve();
          }

          return new Promise(
            (resolve) => {

              const finish =
                () => resolve();

              image.addEventListener(
                "load",
                finish,
                {
                  once: true
                }
              );

              image.addEventListener(
                "error",
                finish,
                {
                  once: true
                }
              );

            }
          );

        }
      )
    );
  }


  // =====================================================
  // COUNTER
  // =====================================================

  function updateCounter() {
    const counter =
      $("clientPageCounter");

    if (
      !counter ||
      !pageFlip
    ) {
      return;
    }

    try {
      const current =
        pageFlip
          .getCurrentPageIndex();

      const total =
        pageFlip
          .getPageCount();

      if (!total) {
        counter.textContent =
          "No preview";

        return;
      }

      if (current === 0) {
        counter.textContent =
          "Front Cover";

        return;
      }

      if (
        current >=
        total - 1
      ) {
        counter.textContent =
          "Back Cover";

        return;
      }

      counter.textContent =
        `Page ${current} of ${
          total - 2
        }`;

    } catch (error) {
      console.warn(
        "Counter warning:",
        error
      );
    }
  }


  // =====================================================
  // GENERATE FLIPBOOK
  // =====================================================

  async function generateFlipbook() {
    if (!pdfFile) {
      showStatus(
        "Please upload a photobook PDF first.",
        "error"
      );

      return;
    }

    if (
      !window.pdfjsLib
    ) {
      showStatus(
        "PDF reader could not be loaded.",
        "error"
      );

      return;
    }

    if (
      !window.St ||
      !window.St.PageFlip
    ) {
      showStatus(
        "Flipbook animation library could not be loaded.",
        "error"
      );

      return;
    }

    const button =
      $("generateFlipbookBtn");

    if (button) {
      button.disabled = true;

      button.textContent =
        "Reading PDF...";
    }

    hideStatus();

    destroyFlipbook();

    setPreviewBadge(
      "LOADING PDF",
      false
    );

    const host =
      createFreshHost();

    if (!host) {
      showStatus(
        "Preview area could not be found.",
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent =
          "Generate Flipbook";
      }

      return;
    }

    host.innerHTML = `
      <div class="client-flipbook-empty">

        <div class="empty-book-icon">
          📄
        </div>

        <h4>
          Reading photobook PDF...
        </h4>

        <p id="pdfRenderProgress">
          Preparing pages...
        </p>

      </div>
    `;

    try {
      // LOAD PDF

      pdfDocument =
        await loadPdf(
          pdfFile
        );

      const totalPages =
        pdfDocument.numPages;

      if (totalPages < 3) {
        throw new Error(
          "Photobook PDF needs at least 3 pages: front cover, inside page and back cover."
        );
      }

      updatePdfStats(
        totalPages
      );


      // RENDER PDF PAGES

      if (button) {
        button.textContent =
          `Rendering 0 / ${totalPages}`;
      }

      renderedPageUrls =
        await renderAllPdfPages(
          pdfDocument,
          (
            current,
            total
          ) => {

            const progress =
              $("pdfRenderProgress");

            if (progress) {
              progress.textContent =
                `Rendering page ${current} of ${total}...`;
            }

            if (button) {
              button.textContent =
                `Rendering ${current} / ${total}`;
            }

          }
        );


      // DESTROY ANY OLD PAGEFLIP AGAIN
      // then rebuild a totally fresh host.

      destroyFlipbook();

      const freshHost =
        createFreshHost();

      if (!freshHost) {
        throw new Error(
          "Could not rebuild preview area."
        );
      }


      buildFlipbookPages(
        freshHost,
        renderedPageUrls
      );


      await waitForImages(
        freshHost
      );


      const pageElements =
        freshHost.querySelectorAll(
          ".client-book-page"
        );

      if (!pageElements.length) {
        throw new Error(
          "No PDF pages were generated."
        );
      }


      // CREATE PAGEFLIP

      const dimensions =
        getPageDimensions();

      pageFlip =
        new window.St.PageFlip(
          freshHost,
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
              650,

            minHeight:
              220,

            maxHeight:
              650,

            maxShadowOpacity:
              0.5,

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
              false
          }
        );


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


      requestAnimationFrame(
        function () {

          requestAnimationFrame(
            function () {

              if (pageFlip) {
                updateCounter();
                applyZoom();
              }

            }
          );

        }
      );


      setPreviewBadge(
        "PDF READY",
        true
      );


      showStatus(
        `${totalPages} PDF pages loaded successfully. Front cover and back cover included.`,
        "success"
      );

    } catch (error) {
      console.error(
        "PDF flipbook error:",
        error
      );

      destroyFlipbook();

      setPreviewBadge(
        "PDF ERROR",
        false
      );

      const errorHost =
        createFreshHost();

      if (errorHost) {
        errorHost.innerHTML = `
          <div class="client-flipbook-empty">

            <div class="empty-book-icon">
              ⚠️
            </div>

            <h4>
              Could not load PDF
            </h4>

            <p>
              ${escapeHtml(
                error.message ||
                "Please check the PDF and try again."
              )}
            </p>

          </div>
        `;
      }

      showStatus(
        error.message ||
        "Unable to generate PDF flipbook.",
        "error"
      );

    } finally {
      if (button) {
        button.disabled = false;

        button.textContent =
          "Generate Flipbook";
      }
    }
  }


  // =====================================================
  // NEXT / PREVIOUS
  // =====================================================

  function nextPage() {
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


  function previousPage() {
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


  // =====================================================
  // ZOOM
  // =====================================================

  function clampZoom(value) {
    return Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        value
      )
    );
  }


  function updateZoomLabel() {
    const label =
      $("clientZoomValue");

    if (!label) return;

    label.textContent =
      `${Math.round(
        zoomLevel * 100
      )}%`;
  }


  function applyZoom() {
    const host =
      $("clientFlipbook");

    if (host) {
      host.style.transform =
        `scale(${zoomLevel})`;

      host.style.transformOrigin =
        "center center";
    }

    updateZoomLabel();
  }


  function setZoom(value) {
    zoomLevel =
      clampZoom(value);

    applyZoom();
  }


  function zoomIn() {
    setZoom(
      Number(
        (
          zoomLevel +
          ZOOM_STEP
        ).toFixed(2)
      )
    );
  }


  function zoomOut() {
    setZoom(
      Number(
        (
          zoomLevel -
          ZOOM_STEP
        ).toFixed(2)
      )
    );
  }


  function resetZoom() {
    setZoom(1);
  }


  // =====================================================
  // FULLSCREEN
  // =====================================================

  function getFullscreenSection() {
    return $(
      "clientFlipbookSection"
    );
  }


  function isFullscreen() {
    return Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement
    );
  }


  function toggleFullscreen() {
    const section =
      getFullscreenSection();

    if (!section) return;

    if (isFullscreen()) {
      if (
        document.exitFullscreen
      ) {
        document.exitFullscreen();
      } else if (
        document.webkitExitFullscreen
      ) {
        document.webkitExitFullscreen();
      }

      return;
    }

    if (
      section.requestFullscreen
    ) {
      section
        .requestFullscreen()
        .catch(
          (error) => {
            console.warn(
              "Fullscreen error:",
              error
            );
          }
        );
    } else if (
      section.webkitRequestFullscreen
    ) {
      section.webkitRequestFullscreen();
    }
  }


  function updateFullscreenButton() {
    const button =
      $("clientFullscreenBtn");

    if (!button) return;

    button.textContent =
      isFullscreen()
        ? "✕ Exit Fullscreen"
        : "⛶ Fullscreen";
  }


  // =====================================================
  // CLEAR
  // =====================================================

  function clearPdf() {
    destroyFlipbook();

    pdfFile = null;
    pdfDocument = null;
    renderedPageUrls = [];

    const input =
      $("photobookPdfInput");

    if (input) {
      input.value = "";
    }

    updatePdfInfo();
    updatePdfStats(0);

    setPreviewBadge(
      "NO PDF",
      false
    );

    zoomLevel = 1;

    updateZoomLabel();

    const counter =
      $("clientPageCounter");

    if (counter) {
      counter.textContent =
        "No preview";
    }

    const host =
      createFreshHost();

    if (host) {
      host.innerHTML = `
        <div class="client-flipbook-empty">

          <div class="empty-book-icon">
            📖
          </div>

          <h4>
            No photobook loaded
          </h4>

          <p>
            Upload your finished Canva PDF
            and click Generate Flipbook.
          </p>

        </div>
      `;
    }

    hideStatus();
  }


  // =====================================================
  // PDF INPUT
  // =====================================================

  const pdfInput =
    $("photobookPdfInput");

  if (pdfInput) {
    pdfInput.addEventListener(
      "change",
      function () {

        const file =
          this.files &&
          this.files.length
            ? this.files[0]
            : null;

        if (!file) {
          pdfFile = null;

          updatePdfInfo();

          return;
        }

        const isPdf =
          file.type ===
            "application/pdf" ||
          file.name
            .toLowerCase()
            .endsWith(".pdf");

        if (!isPdf) {
          this.value = "";

          pdfFile = null;

          updatePdfInfo();

          showStatus(
            "Please select a PDF file.",
            "error"
          );

          return;
        }

        destroyFlipbook();

        pdfFile = file;
        pdfDocument = null;
        renderedPageUrls = [];

        updatePdfInfo();

        updatePdfStats(0);

        setPreviewBadge(
          "PDF SELECTED",
          false
        );

        const counter =
          $("clientPageCounter");

        if (counter) {
          counter.textContent =
            "Ready to generate";
        }

        showStatus(
          "PDF selected. Click Generate Flipbook.",
          "info"
        );

      }
    );
  }


  // =====================================================
  // BUTTONS
  // =====================================================

  $("generateFlipbookBtn")
    ?.addEventListener(
      "click",
      generateFlipbook
    );


  $("clearUploadBtn")
    ?.addEventListener(
      "click",
      clearPdf
    );


  $("clientPrevBtn")
    ?.addEventListener(
      "click",
      previousPage
    );


  $("clientNextBtn")
    ?.addEventListener(
      "click",
      nextPage
    );


  $("clientZoomOutBtn")
    ?.addEventListener(
      "click",
      zoomOut
    );


  $("clientZoomInBtn")
    ?.addEventListener(
      "click",
      zoomIn
    );


  $("clientResetZoomBtn")
    ?.addEventListener(
      "click",
      resetZoom
    );


  $("clientFullscreenBtn")
    ?.addEventListener(
      "click",
      toggleFullscreen
    );


  // =====================================================
  // BOOK SIZE CHANGE
  // Rebuild PageFlip without rerendering PDF canvases.
  // =====================================================

  $("bookSize")
    ?.addEventListener(
      "change",
      async function () {

        if (
          !renderedPageUrls.length
        ) {
          return;
        }

        destroyFlipbook();

        const host =
          createFreshHost();

        if (!host) return;

        buildFlipbookPages(
          host,
          renderedPageUrls
        );

        await waitForImages(
          host
        );

        const pageElements =
          host.querySelectorAll(
            ".client-book-page"
          );

        const dimensions =
          getPageDimensions();

        try {
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
                  650,

                minHeight:
                  220,

                maxHeight:
                  650,

                maxShadowOpacity:
                  0.5,

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
                  false
              }
            );

          pageFlip.loadFromHTML(
            pageElements
          );

          pageFlip.on(
            "flip",
            updateCounter
          );

          pageFlip.on(
            "init",
            updateCounter
          );

          requestAnimationFrame(
            function () {
              updateCounter();
              applyZoom();
            }
          );

        } catch (error) {
          console.error(
            "Resize rebuild error:",
            error
          );
        }

      }
    );


  // =====================================================
  // FULLSCREEN EVENTS
  // =====================================================

  document.addEventListener(
    "fullscreenchange",
    function () {
      updateFullscreenButton();

      requestAnimationFrame(
        applyZoom
      );
    }
  );


  document.addEventListener(
    "webkitfullscreenchange",
    function () {
      updateFullscreenButton();

      requestAnimationFrame(
        applyZoom
      );
    }
  );


  // =====================================================
  // MOUSE WHEEL ZOOM IN FULLSCREEN
  // =====================================================

  let lastWheelTime = 0;

  document.addEventListener(
    "wheel",
    function (event) {

      if (!isFullscreen()) {
        return;
      }

      const section =
        getFullscreenSection();

      if (
        !section ||
        !section.contains(
          event.target
        )
      ) {
        return;
      }

      event.preventDefault();

      const now =
        Date.now();

      if (
        now -
        lastWheelTime <
        80
      ) {
        return;
      }

      lastWheelTime = now;

      if (
        event.deltaY < 0
      ) {
        zoomIn();
      } else {
        zoomOut();
      }

    },
    {
      passive: false
    }
  );


  // =====================================================
  // INITIAL
  // =====================================================

  updateZoomLabel();
  updateFullscreenButton();

})();