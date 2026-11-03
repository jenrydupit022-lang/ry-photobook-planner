(function () {
  "use strict";

  // =====================================================
  // CONFIG
  // =====================================================

  const SUPABASE_URL =
    "https://vqyxzbdtsatxmlkjfemh.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_uq_7P9z4Ig3DzPpF66Br3A_JzGNmmh7";

  const supabaseClient =
    window.supabase
      ? window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_KEY
        )
      : null;

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }


  // =====================================================
  // STATE
  // =====================================================

  let pageFlip = null;

  let currentBookSize =
    "10x7";

  let zoomLevel = 1;

  const MIN_ZOOM = 0.6;
  const MAX_ZOOM = 2;
  const ZOOM_STEP = 0.1;

  const $ = (id) =>
    document.getElementById(id);


  // =====================================================
  // GET SHARE CODE
  // =====================================================

  function getShareCode() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    return (
      params.get("id") ||
      params.get("code") ||
      ""
    ).trim();
  }


  // =====================================================
  // BOOK SIZE
  // =====================================================

  function getBookSize() {
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

    return (
      sizes[currentBookSize] ||
      sizes["10x7"]
    );
  }


  function getPageDimensions() {
    const size =
      getBookSize();

    const maxSide = 430;

    if (
      size.width >=
      size.height
    ) {
      return {
        width: maxSide,

        height: Math.round(
          maxSide *
            (
              size.height /
              size.width
            )
        )
      };
    }

    return {
      width: Math.round(
        maxSide *
          (
            size.width /
            size.height
          )
      ),

      height: maxSide
    };
  }


  // =====================================================
  // DISPLAY HELPERS
  // =====================================================

  function setBadge(
    text,
    type = "loading"
  ) {
    const badge =
      $("buyerStatusBadge");

    if (!badge) return;

    badge.textContent =
      text;

    badge.className =
      "text-[9px] sm:text-[10px] font-black px-3 py-2 rounded-full";

    if (type === "ready") {
      badge.classList.add(
        "bg-emerald-100",
        "text-emerald-700"
      );

    } else if (type === "error") {
      badge.classList.add(
        "bg-red-100",
        "text-red-700"
      );

    } else {
      badge.classList.add(
        "bg-slate-100",
        "text-slate-500"
      );
    }
  }


  function setLoadingText(text) {
    const element =
      $("buyerLoadingText");

    if (element) {
      element.textContent =
        text;
    }
  }


  function showError(
    title,
    message
  ) {
    destroyFlipbook();

    setBadge(
      "ERROR",
      "error"
    );

    const projectName =
      $("buyerProjectName");

    if (projectName) {
      projectName.textContent =
        title;
    }

    const bookInfo =
      $("buyerBookInfo");

    if (bookInfo) {
      bookInfo.textContent =
        message;
    }

    const host =
      createFreshHost();

    if (!host) return;

    host.innerHTML = `
      <div class="buyer-loading buyer-error">

        <div
          style="
            font-size:40px;
            margin-bottom:12px;
          "
        >
          ⚠️
        </div>

        <h4
          style="
            font-size:18px;
            font-weight:900;
          "
        >
          ${escapeHtml(title)}
        </h4>

        <p
          style="
            margin-top:8px;
            font-size:12px;
            color:#64748b;
          "
        >
          ${escapeHtml(message)}
        </p>

      </div>
    `;

    const counter =
      $("buyerPageCounter");

    if (counter) {
      counter.textContent =
        "Unavailable";
    }
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
        "Buyer flipbook destroy warning:",
        error
      );
    }
  }


  // =====================================================
  // FRESH HOST
  // Same lifecycle as our working editor flipbook.
  // =====================================================

  function getStage() {
    return document.querySelector(
      ".buyer-stage"
    );
  }


  function createFreshHost() {
    const stage =
      getStage();

    if (!stage) {
      return null;
    }

    stage.innerHTML = "";

    const host =
      document.createElement(
        "div"
      );

    host.id =
      "buyerFlipbook";

    stage.appendChild(
      host
    );

    applyZoom();

    return host;
  }


  // =====================================================
  // LOAD RECORD FROM SUPABASE
  // =====================================================

  async function loadClientRecord(
    shareCode
  ) {
    if (!supabaseClient) {
      throw new Error(
        "Preview service could not be loaded."
      );
    }

    const {
      data,
      error
    } =
      await supabaseClient
        .from("client_flipbooks")
        .select(
          "project_name, pdf_url, book_size, created_at"
        )
        .eq(
          "share_code",
          shareCode
        )
        .single();

    if (error) {
      console.error(
        "Client record error:",
        error
      );

      throw new Error(
        "This photobook preview could not be found."
      );
    }

    if (!data) {
      throw new Error(
        "This photobook preview could not be found."
      );
    }

    return data;
  }


  // =====================================================
  // LOAD PDF
  // =====================================================

  async function loadPdfFromUrl(
    pdfUrl
  ) {
    if (!window.pdfjsLib) {
      throw new Error(
        "PDF reader could not be loaded."
      );
    }

    const loadingTask =
      window.pdfjsLib.getDocument({
        url: pdfUrl
      });

    return await loadingTask.promise;
  }


  // =====================================================
  // RENDER PDF PAGE
  // =====================================================

  async function renderPdfPageToImage(
    pdf,
    pageNumber
  ) {
    const page =
      await pdf.getPage(
        pageNumber
      );

    const baseViewport =
      page.getViewport({
        scale: 1
      });

    const targetWidth =
      1600;

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

    if (!context) {
      throw new Error(
        "Your browser could not render the photobook."
      );
    }

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

    return canvas.toDataURL(
      "image/webp",
      0.92
    );
  }


  // =====================================================
  // RENDER ALL PDF PAGES
  // =====================================================

  async function renderAllPages(
    pdf
  ) {
    const urls = [];

    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {
      setLoadingText(
        `Rendering page ${pageNumber} of ${pdf.numPages}...`
      );

      const imageUrl =
        await renderPdfPageToImage(
          pdf,
          pageNumber
        );

      urls.push(
        imageUrl
      );

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
  // CREATE PAGE ELEMENT
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
        ? "buyer-book-page buyer-cover-page"
        : "buyer-book-page";

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
        `Photobook Page ${
          pageNumber - 1
        }`
      );
    }

    const image =
      document.createElement(
        "img"
      );

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

  function buildPages(
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
      $("buyerPageCounter");

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
  // CREATE PAGEFLIP
  // =====================================================

  async function createFlipbook(
    pageUrls
  ) {
    if (
      !window.St ||
      !window.St.PageFlip
    ) {
      throw new Error(
        "Flipbook animation could not be loaded."
      );
    }

    destroyFlipbook();

    const host =
      createFreshHost();

    if (!host) {
      throw new Error(
        "Preview area could not be found."
      );
    }

    buildPages(
      host,
      pageUrls
    );

    await waitForImages(
      host
    );

    const pageElements =
      host.querySelectorAll(
        ".buyer-book-page"
      );

    if (!pageElements.length) {
      throw new Error(
        "No photobook pages were generated."
      );
    }

    const dimensions =
      getPageDimensions();

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
      "changeOrientation",
      updateCounter
    );

    pageFlip.on(
      "init",
      updateCounter
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
  }


  // =====================================================
  // LOAD CLIENT PREVIEW
  // =====================================================

  async function loadPreview() {
    const shareCode =
      getShareCode();

    if (!shareCode) {
      showError(
        "Invalid Preview Link",
        "The client preview code is missing from this link."
      );

      return;
    }

    try {
      setBadge(
        "LOADING",
        "loading"
      );

      setLoadingText(
        "Finding your photobook..."
      );

      const record =
        await loadClientRecord(
          shareCode
        );

      currentBookSize =
        record.book_size ||
        "10x7";

      const projectName =
        $("buyerProjectName");

      if (projectName) {
        projectName.textContent =
          record.project_name ||
          "Photobook Preview";
      }

      const bookInfo =
        $("buyerBookInfo");

      if (bookInfo) {
        bookInfo.textContent =
          `${currentBookSize} Photobook • Digital Client Preview`;
      }

      setLoadingText(
        "Downloading photobook PDF..."
      );

      const pdf =
        await loadPdfFromUrl(
          record.pdf_url
        );

      if (
        !pdf ||
        pdf.numPages < 3
      ) {
        throw new Error(
          "The saved photobook does not contain enough pages."
        );
      }

      setLoadingText(
        `Preparing ${pdf.numPages} pages...`
      );

      const pageUrls =
        await renderAllPages(
          pdf
        );

      setLoadingText(
        "Building animated photobook..."
      );

      await createFlipbook(
        pageUrls
      );

      setBadge(
        "READY",
        "ready"
      );

    } catch (error) {
      console.error(
        "Buyer preview error:",
        error
      );

      showError(
        "Preview Unavailable",
        error?.message ||
          "This photobook preview could not be loaded."
      );
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
      $("buyerZoomValue");

    if (!label) return;

    label.textContent =
      `${Math.round(
        zoomLevel * 100
      )}%`;
  }


  function applyZoom() {
    const host =
      $("buyerFlipbook");

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
      "buyerPreviewSection"
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
      $("buyerFullscreenBtn");

    if (!button) return;

    button.textContent =
      isFullscreen()
        ? "✕ Exit Fullscreen"
        : "⛶ Fullscreen";
  }


  // =====================================================
  // BUTTON EVENTS
  // =====================================================

  $("buyerPrevBtn")
    ?.addEventListener(
      "click",
      previousPage
    );


  $("buyerNextBtn")
    ?.addEventListener(
      "click",
      nextPage
    );


  $("buyerZoomOutBtn")
    ?.addEventListener(
      "click",
      zoomOut
    );


  $("buyerZoomInBtn")
    ?.addEventListener(
      "click",
      zoomIn
    );


  $("buyerResetZoomBtn")
    ?.addEventListener(
      "click",
      resetZoom
    );


  $("buyerFullscreenBtn")
    ?.addEventListener(
      "click",
      toggleFullscreen
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
  // WHEEL ZOOM IN FULLSCREEN
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

      lastWheelTime =
        now;

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
  // START
  // =====================================================

  updateZoomLabel();
  updateFullscreenButton();

  loadPreview();

})();