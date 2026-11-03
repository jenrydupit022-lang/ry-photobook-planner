(function () {
  "use strict";

  // =====================================================
  // STATE
  // =====================================================

  let pageFlip = null;

  let frontCoverFile = null;
  let insidePageFiles = [];
  let backCoverFile = null;

  let activeObjectUrls = [];

  let zoomLevel = 1;

  const MIN_ZOOM = 0.6;
  const MAX_ZOOM = 2;
  const ZOOM_STEP = 0.1;


  // =====================================================
  // HELPERS
  // =====================================================

  const $ = (id) => document.getElementById(id);


  function showStatus(message, type = "info") {
    const status = $("uploadStatus");

    if (!status) {
      return;
    }

    status.classList.remove(
      "hidden",
      "bg-red-50",
      "text-red-700",
      "border-red-200",
      "bg-emerald-50",
      "text-emerald-700",
      "border-emerald-200",
      "bg-blue-50",
      "text-blue-700",
      "border-blue-200"
    );

    status.classList.add("border");

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

    if (status) {
      status.classList.add("hidden");
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
  // NATURAL FILE SORT
  // 1, 2, 3, 10 instead of 1, 10, 2, 3
  // =====================================================

  function naturalSortFiles(files) {
    return [...files].sort((a, b) =>
      a.name.localeCompare(
        b.name,
        undefined,
        {
          numeric: true,
          sensitivity: "base"
        }
      )
    );
  }


  // =====================================================
  // BOOK SIZE
  // =====================================================

  function getBookSize() {
    const select = $("bookSize");

    const value = select
      ? select.value
      : "10x7";

    const sizes = {
      "6x6": {
        width: 6,
        height: 6,
        orientation: "square"
      },

      "8x7": {
        width: 8,
        height: 7,
        orientation: "landscape"
      },

      "10x7": {
        width: 10,
        height: 7,
        orientation: "landscape"
      },

      "7x10": {
        width: 7,
        height: 10,
        orientation: "portrait"
      }
    };

    return sizes[value] || sizes["10x7"];
  }


  function getPageDimensions() {
    const size = getBookSize();

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
  // FILE INFO
  // =====================================================

  function updateFrontCoverInfo() {
    const info = $("frontCoverInfo");

    if (!info) {
      return;
    }

    if (!frontCoverFile) {
      info.classList.add("hidden");
      info.innerHTML = "";
      return;
    }

    info.classList.remove("hidden");

    info.innerHTML =
      `✓ ${escapeHtml(frontCoverFile.name)}`;
  }


  function updateInsidePagesInfo() {
    const info = $("insidePagesInfo");

    if (!info) {
      return;
    }

    if (!insidePageFiles.length) {
      info.classList.add("hidden");
      info.innerHTML = "";
      return;
    }

    const previewNames =
      insidePageFiles
        .slice(0, 4)
        .map((file) =>
          escapeHtml(file.name)
        )
        .join("<br>");

    const extra =
      insidePageFiles.length > 4
        ? `<br>+ ${insidePageFiles.length - 4} more`
        : "";

    info.classList.remove("hidden");

    info.innerHTML = `
      ✓ ${insidePageFiles.length}
      inside page${insidePageFiles.length === 1 ? "" : "s"}
      selected
      <div style="margin-top:5px; opacity:.75;">
        ${previewNames}
        ${extra}
      </div>
    `;
  }


  function updateBackCoverInfo() {
    const info = $("backCoverInfo");

    if (!info) {
      return;
    }

    if (!backCoverFile) {
      info.classList.add("hidden");
      info.innerHTML = "";
      return;
    }

    info.classList.remove("hidden");

    info.innerHTML =
      `✓ ${escapeHtml(backCoverFile.name)}`;
  }


  // =====================================================
  // OBJECT URL MANAGEMENT
  // =====================================================

  function revokeObjectUrls() {
    activeObjectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn(
          "Could not revoke image URL:",
          error
        );
      }
    });

    activeObjectUrls = [];
  }


  function createImageUrl(file) {
    const url =
      URL.createObjectURL(file);

    activeObjectUrls.push(url);

    return url;
  }


  // =====================================================
  // PAGEFLIP LIFECYCLE
  // IMPORTANT:
  // Same fresh-host strategy as our working calculator.
  // =====================================================

  function getStage() {
    return document.querySelector(
      ".client-flipbook-stage"
    );
  }


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
        "Client flipbook destroy warning:",
        error
      );
    }
  }


  function createFreshHost() {
    const stage = getStage();

    if (!stage) {
      console.warn(
        "Client flipbook stage was not found."
      );

      return null;
    }

    stage.innerHTML = "";

    const host =
      document.createElement("div");

    host.id = "clientFlipbook";
    host.className =
      "client-flipbook-book";

    stage.appendChild(host);

    applyZoom();

    return host;
  }


  // =====================================================
  // PAGE CREATION
  // =====================================================

  function createPageElement(
    imageUrl,
    options = {}
  ) {
    const {
      cover = false,
      label = ""
    } = options;

    const page =
      document.createElement("div");

    page.className =
      cover
        ? "client-book-page client-cover-page"
        : "client-book-page";

    if (cover) {
      page.setAttribute(
        "data-density",
        "hard"
      );
    }

    if (label) {
      page.setAttribute(
        "aria-label",
        label
      );
    }

    const image =
      document.createElement("img");

    image.className =
      "client-page-image";

    image.src = imageUrl;
    image.alt = label || "Photobook page";
    image.draggable = false;

    page.appendChild(image);

    return page;
  }


  function buildPages(host) {
    revokeObjectUrls();

    // FRONT COVER
    const frontUrl =
      createImageUrl(frontCoverFile);

    host.appendChild(
      createPageElement(
        frontUrl,
        {
          cover: true,
          label: "Front Cover"
        }
      )
    );


    // INSIDE PAGES
    insidePageFiles.forEach(
      (file, index) => {

        const imageUrl =
          createImageUrl(file);

        host.appendChild(
          createPageElement(
            imageUrl,
            {
              cover: false,
              label:
                `Page ${index + 1}`
            }
          )
        );

      }
    );


    // BACK COVER
    const backUrl =
      createImageUrl(backCoverFile);

    host.appendChild(
      createPageElement(
        backUrl,
        {
          cover: true,
          label: "Back Cover"
        }
      )
    );
  }


  // =====================================================
  // IMAGE PRELOAD
  // Prevents PageFlip from sizing before images are ready.
  // =====================================================

  function waitForImages(host) {
    const images =
      Array.from(
        host.querySelectorAll("img")
      );

    if (!images.length) {
      return Promise.resolve();
    }

    return Promise.all(
      images.map((image) => {

        if (
          image.complete &&
          image.naturalWidth > 0
        ) {
          return Promise.resolve();
        }

        return new Promise((resolve) => {

          const done = () => {
            resolve();
          };

          image.addEventListener(
            "load",
            done,
            { once: true }
          );

          image.addEventListener(
            "error",
            done,
            { once: true }
          );

        });

      })
    );
  }


  // =====================================================
  // COUNTER
  // =====================================================

  function updateCounter() {
    const counter =
      $("clientPageCounter");

    if (!counter || !pageFlip) {
      return;
    }

    try {
      const current =
        pageFlip.getCurrentPageIndex();

      const total =
        pageFlip.getPageCount();

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

      if (current >= total - 1) {
        counter.textContent =
          "Back Cover";

        return;
      }

      counter.textContent =
        `Page ${current} of ${total - 2}`;

    } catch (error) {
      console.warn(
        "Client counter warning:",
        error
      );
    }
  }


  // =====================================================
  // PREVIEW BADGE
  // =====================================================

  function setPreviewReady(ready) {
    const badge =
      $("previewBadge");

    if (!badge) {
      return;
    }

    if (ready) {
      badge.textContent =
        "DESIGN READY";

      badge.classList.add(
        "is-ready"
      );
    } else {
      badge.textContent =
        "NO DESIGN";

      badge.classList.remove(
        "is-ready"
      );
    }
  }


  // =====================================================
  // VALIDATION
  // =====================================================

  function validateUploads() {
    if (!frontCoverFile) {
      showStatus(
        "Please upload the front cover first.",
        "error"
      );

      return false;
    }

    if (!insidePageFiles.length) {
      showStatus(
        "Please upload at least one inside page.",
        "error"
      );

      return false;
    }

    if (!backCoverFile) {
      showStatus(
        "Please upload the back cover.",
        "error"
      );

      return false;
    }

    return true;
  }


  // =====================================================
  // GENERATE FLIPBOOK
  // =====================================================

  async function generateFlipbook() {
    if (!validateUploads()) {
      return;
    }

    hideStatus();

    if (
      !window.St ||
      !window.St.PageFlip
    ) {
      showStatus(
        "The flipbook animation library could not be loaded.",
        "error"
      );

      return;
    }

    const generateButton =
      $("generateFlipbookBtn");

    if (generateButton) {
      generateButton.disabled = true;
      generateButton.textContent =
        "Generating...";
    }

    destroyFlipbook();

    const host =
      createFreshHost();

    if (!host) {
      showStatus(
        "Flipbook preview area could not be found.",
        "error"
      );

      if (generateButton) {
        generateButton.disabled = false;
        generateButton.textContent =
          "Generate Flipbook";
      }

      return;
    }

    try {
      buildPages(host);

      await waitForImages(host);

      const pageElements =
        host.querySelectorAll(
          ".client-book-page"
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


      setPreviewReady(true);

      showStatus(
        `${insidePageFiles.length + 2} photobook pages loaded successfully.`,
        "success"
      );

    } catch (error) {
      console.error(
        "Client flipbook error:",
        error
      );

      pageFlip = null;

      setPreviewReady(false);

      const freshHost =
        createFreshHost();

      if (freshHost) {
        freshHost.innerHTML = `
          <div class="client-flipbook-empty">

            <div class="empty-book-icon">
              ⚠
            </div>

            <h4>
              Preview error
            </h4>

            <p>
              The photobook could not be generated.
              Please check your uploaded images
              and try again.
            </p>

          </div>
        `;
      }

      showStatus(
        "Unable to generate the photobook preview.",
        "error"
      );

    } finally {
      if (generateButton) {
        generateButton.disabled = false;
        generateButton.textContent =
          "Generate Flipbook";
      }
    }
  }


  // =====================================================
  // PAGE CONTROLS
  // =====================================================

  function nextPage() {
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


  function previousPage() {
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

    if (!label) {
      return;
    }

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


  function enterFullscreen() {
    const section =
      getFullscreenSection();

    if (!section) {
      return;
    }

    if (section.requestFullscreen) {
      section
        .requestFullscreen()
        .catch((error) => {
          console.warn(
            "Fullscreen error:",
            error
          );
        });

      return;
    }

    if (
      section.webkitRequestFullscreen
    ) {
      section.webkitRequestFullscreen();
    }
  }


  function exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();

      return;
    }

    if (
      document.webkitExitFullscreen
    ) {
      document.webkitExitFullscreen();
    }
  }


  function toggleFullscreen() {
    if (isFullscreen()) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }


  function updateFullscreenButton() {
    const button =
      $("clientFullscreenBtn");

    if (!button) {
      return;
    }

    button.textContent =
      isFullscreen()
        ? "✕ Exit Fullscreen"
        : "⛶ Fullscreen";
  }


  // =====================================================
  // CLEAR
  // =====================================================

  function clearUploads() {
    destroyFlipbook();

    revokeObjectUrls();

    frontCoverFile = null;
    insidePageFiles = [];
    backCoverFile = null;

    const frontInput =
      $("frontCoverInput");

    const insideInput =
      $("insidePagesInput");

    const backInput =
      $("backCoverInput");

    if (frontInput) {
      frontInput.value = "";
    }

    if (insideInput) {
      insideInput.value = "";
    }

    if (backInput) {
      backInput.value = "";
    }

    updateFrontCoverInfo();
    updateInsidePagesInfo();
    updateBackCoverInfo();

    setPreviewReady(false);

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
            Upload your front cover,
            inside pages and back cover,
            then click Generate Flipbook.
          </p>

        </div>
      `;
    }

    hideStatus();
  }


  // =====================================================
  // FILE INPUT EVENTS
  // =====================================================

  const frontCoverInput =
    $("frontCoverInput");

  if (frontCoverInput) {
    frontCoverInput.addEventListener(
      "change",
      function () {

        frontCoverFile =
          this.files &&
          this.files.length
            ? this.files[0]
            : null;

        updateFrontCoverInfo();

        setPreviewReady(false);
      }
    );
  }


  const insidePagesInput =
    $("insidePagesInput");

  if (insidePagesInput) {
    insidePagesInput.addEventListener(
      "change",
      function () {

        insidePageFiles =
          this.files
            ? naturalSortFiles(
                Array.from(this.files)
              )
            : [];

        updateInsidePagesInfo();

        setPreviewReady(false);
      }
    );
  }


  const backCoverInput =
    $("backCoverInput");

  if (backCoverInput) {
    backCoverInput.addEventListener(
      "change",
      function () {

        backCoverFile =
          this.files &&
          this.files.length
            ? this.files[0]
            : null;

        updateBackCoverInfo();

        setPreviewReady(false);
      }
    );
  }


  // =====================================================
  // BUTTON EVENTS
  // =====================================================

  const generateButton =
    $("generateFlipbookBtn");

  if (generateButton) {
    generateButton.addEventListener(
      "click",
      generateFlipbook
    );
  }


  const clearButton =
    $("clearUploadBtn");

  if (clearButton) {
    clearButton.addEventListener(
      "click",
      clearUploads
    );
  }


  const previousButton =
    $("clientPrevBtn");

  if (previousButton) {
    previousButton.addEventListener(
      "click",
      previousPage
    );
  }


  const nextButton =
    $("clientNextBtn");

  if (nextButton) {
    nextButton.addEventListener(
      "click",
      nextPage
    );
  }


  const zoomOutButton =
    $("clientZoomOutBtn");

  if (zoomOutButton) {
    zoomOutButton.addEventListener(
      "click",
      zoomOut
    );
  }


  const zoomInButton =
    $("clientZoomInBtn");

  if (zoomInButton) {
    zoomInButton.addEventListener(
      "click",
      zoomIn
    );
  }


  const resetZoomButton =
    $("clientResetZoomBtn");

  if (resetZoomButton) {
    resetZoomButton.addEventListener(
      "click",
      resetZoom
    );
  }


  const fullscreenButton =
    $("clientFullscreenBtn");

  if (fullscreenButton) {
    fullscreenButton.addEventListener(
      "click",
      toggleFullscreen
    );
  }


  // =====================================================
  // BOOK SIZE CHANGE
  // Rebuild preview if a design is already loaded.
  // =====================================================

  const bookSizeSelect =
    $("bookSize");

  if (bookSizeSelect) {
    bookSizeSelect.addEventListener(
      "change",
      function () {

        if (
          frontCoverFile &&
          insidePageFiles.length &&
          backCoverFile
        ) {
          generateFlipbook();
        }

      }
    );
  }


  // =====================================================
  // FULLSCREEN EVENTS
  // =====================================================

  document.addEventListener(
    "fullscreenchange",
    function () {

      updateFullscreenButton();

      requestAnimationFrame(
        function () {
          applyZoom();
        }
      );

    }
  );


  document.addEventListener(
    "webkitfullscreenchange",
    function () {

      updateFullscreenButton();

      requestAnimationFrame(
        function () {
          applyZoom();
        }
      );

    }
  );


  // =====================================================
  // FULLSCREEN MOUSE-WHEEL ZOOM
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
        !section.contains(event.target)
      ) {
        return;
      }

      const now =
        Date.now();

      if (
        now - lastWheelTime <
        80
      ) {
        event.preventDefault();
        return;
      }

      lastWheelTime = now;

      event.preventDefault();

      if (event.deltaY < 0) {
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
  // CLEANUP
  // =====================================================

  window.addEventListener(
    "beforeunload",
    function () {
      revokeObjectUrls();
    }
  );


  // =====================================================
  // INITIAL STATE
  // =====================================================

  updateZoomLabel();
  updateFullscreenButton();

})();