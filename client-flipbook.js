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
  // SUPABASE
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

  let isFlipbookReady = false;
  let isSavingShare = false;


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
  // SHARE STATUS / CONTROLS
  // =====================================================

  function showShareStatus(message, type = "info") {
    const status = $("shareStatus");

    if (!status) return;

    status.className =
      "mt-3 rounded-xl px-4 py-3 text-xs font-bold border";

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


  function hideShareStatus() {
    const status = $("shareStatus");

    if (!status) return;

    status.classList.add("hidden");
  }


  function hideShareResult() {
    const result = $("shareResult");

    if (result) {
      result.classList.add("hidden");
    }

    const input = $("shareLinkInput");

    if (input) {
      input.value = "";
    }

    const open = $("openShareLinkBtn");

    if (open) {
      open.href = "#";
    }
  }


  function updateSaveShareButton() {
    const button = $("saveShareBtn");

    if (!button) return;

    button.disabled =
      !pdfFile ||
      !isFlipbookReady ||
      isSavingShare;
  }


  function resetShareState() {
    isFlipbookReady = false;
    isSavingShare = false;

    hideShareStatus();
    hideShareResult();
    updateSaveShareButton();
  }


  function createShareCode() {
    if (window.crypto?.randomUUID) {
      return window.crypto
        .randomUUID()
        .replaceAll("-", "");
    }

    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    );
  }


  function createStorageFileName(file) {
    const extension =
      file.name.toLowerCase().endsWith(".pdf")
        ? ".pdf"
        : "";

    return `${
      window.crypto?.randomUUID?.() ||
      createShareCode()
    }${extension}`;
  }


  // =====================================================
  // SAVE + CREATE SHARE LINK
  // =====================================================

  async function saveAndCreateShareLink() {
    if (isSavingShare) return;

    if (!supabaseClient) {
      showShareStatus(
        "Supabase could not be loaded. Refresh the page and try again.",
        "error"
      );

      return;
    }

    const projectName =
      $("projectName")?.value.trim() || "";

    if (!projectName) {
      showShareStatus(
        "Please enter the Project / Client Name first.",
        "error"
      );

      $("projectName")?.focus();

      return;
    }

    if (!pdfFile) {
      showShareStatus(
        "Please upload a PDF first.",
        "error"
      );

      return;
    }

    if (!isFlipbookReady) {
      showShareStatus(
        "Generate the flipbook first before creating a share link.",
        "error"
      );

      return;
    }

    isSavingShare = true;

    updateSaveShareButton();
    hideShareResult();

    const button =
      $("saveShareBtn");

    const originalText =
      button?.textContent ||
      "Save & Create Share Link";

    if (button) {
      button.textContent =
        "Saving PDF...";
    }

    let uploadedPath = null;

    try {
      const {
        data: { user },
        error: userError
      } =
        await supabaseClient.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error(
          "Your login session expired. Please return to the dashboard and log in again."
        );
      }

      const fileName =
        createStorageFileName(pdfFile);

      uploadedPath =
        `${user.id}/${fileName}`;

      showShareStatus(
        "Uploading PDF to R&Y storage...",
        "info"
      );

      const { error: uploadError } =
        await supabaseClient.storage
          .from("client-flipbooks")
          .upload(
            uploadedPath,
            pdfFile,
            {
              contentType:
                "application/pdf",

              upsert: false
            }
          );

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } =
        supabaseClient.storage
          .from("client-flipbooks")
          .getPublicUrl(
            uploadedPath
          );

      const pdfUrl =
        publicUrlData?.publicUrl;

      if (!pdfUrl) {
        throw new Error(
          "PDF was uploaded but its public URL could not be created."
        );
      }

      if (button) {
        button.textContent =
          "Creating Share Link...";
      }

      showShareStatus(
        "PDF uploaded. Creating client link...",
        "info"
      );

      const shareCode =
        createShareCode();

      const bookSize =
        $("bookSize")?.value ||
        "10x7";

      const { error: insertError } =
        await supabaseClient
  .from("client_flipbooks")
  .insert({
    share_code: shareCode,
    project_name: projectName,
    pdf_url: pdfUrl,
    book_size: bookSize,
    user_id: user.id
  });

      if (insertError) {
        throw insertError;
      }

      const shareUrl =
        `${window.location.origin}/preview.html?id=${encodeURIComponent(
          shareCode
        )}`;

      const shareInput =
        $("shareLinkInput");

      const openButton =
        $("openShareLinkBtn");

      const result =
        $("shareResult");

      if (shareInput) {
        shareInput.value =
          shareUrl;
      }

      if (openButton) {
        openButton.href =
          shareUrl;
      }

      if (result) {
        result.classList.remove(
          "hidden"
        );
      }

      showShareStatus(
        "Saved successfully. Your client link is ready!",
        "success"
        
      );
await loadSavedClientFlipbooks();
    } catch (error) {
      console.error(
        "Save/share error:",
        error
      );

      if (
        uploadedPath &&
        supabaseClient
      ) {
        try {
          await supabaseClient.storage
            .from("client-flipbooks")
            .remove([
              uploadedPath
            ]);
        } catch (cleanupError) {
          console.warn(
            "Uploaded PDF cleanup warning:",
            cleanupError
          );
        }
      }

      showShareStatus(
        error?.message ||
          "Unable to save the client flipbook.",
        "error"
      );

    } finally {
      isSavingShare = false;

      if (button) {
        button.textContent =
          originalText;
      }

      updateSaveShareButton();
    }
  }


  // =====================================================
  // COPY SHARE LINK
  // =====================================================

  async function copyShareLink() {
    const input =
      $("shareLinkInput");

    const button =
      $("copyShareLinkBtn");

    if (!input?.value) return;

    try {
      await navigator.clipboard.writeText(
        input.value
      );

      if (button) {
        const oldText =
          button.textContent;

        button.textContent =
          "Copied ✓";

        setTimeout(() => {
          button.textContent =
            oldText;
        }, 1500);
      }

    } catch (error) {
      input.focus();
      input.select();

      showShareStatus(
        "Copy was blocked by the browser. The link is selected — press Ctrl+C.",
        "info"
      );
    }
  }


  // =====================================================
  // FILE SIZE
  // =====================================================

  function formatFileSize(bytes) {
    if (!bytes) {
      return "0 KB";
    }

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
      $("bookSize")?.value ||
      "10x7";

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
      sizes[value] ||
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
      document.createElement(
        "div"
      );

    host.id =
      "clientFlipbook";

    host.className =
      "client-flipbook-book";

    stage.appendChild(
      host
    );

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

    badge.textContent =
      text;

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
      <strong>
        ✓ ${escapeHtml(
          pdfFile.name
        )}
      </strong>

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

      total.textContent =
        "0";

      inside.textContent =
        "0";

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

    if (!window.pdfjsLib) {
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
      button.disabled =
        true;

      button.textContent =
        "Reading PDF...";
    }

    hideStatus();

    isFlipbookReady =
      false;

    hideShareResult();
    hideShareStatus();
    updateSaveShareButton();

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
        button.disabled =
          false;

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

      isFlipbookReady =
        true;

      updateSaveShareButton();

      showStatus(
        `${totalPages} PDF pages loaded successfully. Front cover and back cover included.`,
        "success"
      );

    } catch (error) {
      console.error(
        "PDF flipbook error:",
        error
      );

      isFlipbookReady =
        false;

      updateSaveShareButton();

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
        button.disabled =
          false;

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
  // CLEAR PDF
  // =====================================================

  function clearPdf() {
    destroyFlipbook();

    pdfFile = null;
    pdfDocument = null;
    renderedPageUrls = [];

    resetShareState();

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

          resetShareState();
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

          resetShareState();
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

        resetShareState();

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
  // MAIN BUTTONS
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
  // SHARE BUTTONS
  // =====================================================

  $("saveShareBtn")
    ?.addEventListener(
      "click",
      saveAndCreateShareLink
    );


  $("copyShareLinkBtn")
    ?.addEventListener(
      "click",
      copyShareLink
    );


  // =====================================================
  // PROJECT NAME CHANGE
  // =====================================================

  $("projectName")
    ?.addEventListener(
      "input",
      function () {
        hideShareResult();
        hideShareStatus();
      }
    );


  // =====================================================
  // BOOK SIZE CHANGE
  // Rebuild PageFlip without rerendering the PDF.
  // =====================================================

  $("bookSize")
    ?.addEventListener(
      "change",
      async function () {

        hideShareResult();
        hideShareStatus();

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
                  updateCounter();
                  applyZoom();
                }
              );
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
  // INITIAL
  // =====================================================

    // =====================================================
  // ADMIN — SAVED CLIENT FLIPBOOKS
  // =====================================================

  function showClientFlipbooksStatus(
    message,
    type = "info"
  ) {
    const status =
      $("clientFlipbooksStatus");

    if (!status) return;

    status.className =
      "mb-4 rounded-xl px-4 py-3 text-xs font-bold border";

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

    status.textContent =
      message;
  }


  function hideClientFlipbooksStatus() {
    const status =
      $("clientFlipbooksStatus");

    if (status) {
      status.classList.add(
        "hidden"
      );
    }
  }


  function formatClientResponseDate(
    value
  ) {
    if (!value) {
      return "";
    }

    try {
      return new Intl.DateTimeFormat(
        "en-PH",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        }
      ).format(
        new Date(value)
      );

    } catch (error) {
      return "";
    }
  }


  function getClientStatusInfo(
    status
  ) {
    if (status === "approved") {
      return {
        label:
          "APPROVED FOR PRINTING",

        badge:
          "bg-emerald-50 text-emerald-700 border-emerald-200",

        card:
          "border-emerald-200"
      };
    }


    if (status === "revision") {
      return {
        label:
          "REVISION REQUESTED",

        badge:
          "bg-orange-50 text-orange-700 border-orange-200",

        card:
          "border-orange-200"
      };
    }


    return {
      label:
        "PENDING REVIEW",

      badge:
        "bg-amber-50 text-amber-700 border-amber-200",

      card:
        "border-slate-200"
    };
  }


  function updateClientSummary(
    flipbooks
  ) {
    let pending = 0;
    let approved = 0;
    let revision = 0;

    flipbooks.forEach(
      function (item) {
        if (
          item.status ===
          "approved"
        ) {
          approved++;

        } else if (
          item.status ===
          "revision"
        ) {
          revision++;

        } else {
          pending++;
        }
      }
    );


    const pendingElement =
      $("pendingClientCount");

    const approvedElement =
      $("approvedClientCount");

    const revisionElement =
      $("revisionClientCount");


    if (pendingElement) {
      pendingElement.textContent =
        String(pending);
    }


    if (approvedElement) {
      approvedElement.textContent =
        String(approved);
    }


    if (revisionElement) {
      revisionElement.textContent =
        String(revision);
    }
  }


  function renderSavedClientFlipbooks(
    flipbooks
  ) {
    const container =
      $("savedClientFlipbooks");

    if (!container) return;


    if (!flipbooks.length) {
      container.innerHTML = `
        <div
          class="
            bg-white
            border
            border-slate-200
            rounded-3xl
            p-8
            text-center
          "
        >

          <div class="text-3xl">
            📚
          </div>

          <p
            class="
              font-black
              text-slate-700
              mt-3
            "
          >
            No saved client flipbooks yet
          </p>

          <p
            class="
              text-xs
              text-slate-400
              mt-1
            "
          >
            Saved client previews will appear here.
          </p>

        </div>
      `;

      return;
    }


    container.innerHTML =
      flipbooks
        .map(
          function (item) {

            const status =
              item.status ||
              "pending";

            const statusInfo =
              getClientStatusInfo(
                status
              );

            const projectName =
              escapeHtml(
                item.project_name ||
                "Untitled Photobook"
              );

            const bookSize =
              escapeHtml(
                item.book_size ||
                "—"
              );

            const clientName =
              escapeHtml(
                item.client_name ||
                ""
              );

            const revisionPage =
              escapeHtml(
                item.revision_page ||
                ""
              );

            const message =
              escapeHtml(
                item.client_message ||
                ""
              );

            const respondedAt =
              formatClientResponseDate(
                item.responded_at
              );

            const createdAt =
              formatClientResponseDate(
                item.created_at
              );

            const shareUrl =
              `${window.location.origin}/preview.html?id=${encodeURIComponent(
                item.share_code
              )}`;


            let responseDetails = "";


            if (
              status ===
              "approved"
            ) {
              responseDetails = `
                <div
                  class="
                    mt-4
                    bg-emerald-50
                    border
                    border-emerald-100
                    rounded-2xl
                    p-4
                  "
                >

                  <p
                    class="
                      text-[10px]
                      font-black
                      text-emerald-600
                      uppercase
                      tracking-wider
                    "
                  >
                    Client Approval
                  </p>

                  <p
                    class="
                      text-sm
                      font-black
                      text-slate-800
                      mt-2
                    "
                  >
                    ${
                      clientName
                        ? `Approved by ${clientName}`
                        : "Approved by client"
                    }
                  </p>

                  ${
                    respondedAt
                      ? `
                        <p
                          class="
                            text-[11px]
                            text-slate-500
                            mt-1
                          "
                        >
                          ${escapeHtml(
                            respondedAt
                          )}
                        </p>
                      `
                      : ""
                  }

                </div>
              `;
            }


            if (
              status ===
              "revision"
            ) {
              responseDetails = `
                <div
                  class="
                    mt-4
                    bg-orange-50
                    border
                    border-orange-100
                    rounded-2xl
                    p-4
                  "
                >

                  <p
                    class="
                      text-[10px]
                      font-black
                      text-orange-600
                      uppercase
                      tracking-wider
                    "
                  >
                    Revision Details
                  </p>

                  <div
                    class="
                      flex
                      flex-wrap
                      gap-x-5
                      gap-y-2
                      mt-2
                    "
                  >

                    ${
                      clientName
                        ? `
                          <p
                            class="
                              text-xs
                              text-slate-600
                            "
                          >
                            <strong>
                              Client:
                            </strong>

                            ${clientName}
                          </p>
                        `
                        : ""
                    }


                    ${
                      revisionPage
                        ? `
                          <p
                            class="
                              text-xs
                              text-slate-600
                            "
                          >
                            <strong>
                              Page:
                            </strong>

                            ${revisionPage}
                          </p>
                        `
                        : ""
                    }

                  </div>


                  ${
                    message
                      ? `
                        <div
                          class="
                            mt-3
                            bg-white
                            border
                            border-orange-100
                            rounded-xl
                            px-4
                            py-3
                          "
                        >

                          <p
                            class="
                              text-xs
                              text-slate-700
                              leading-relaxed
                            "
                          >
                            “${message}”
                          </p>

                        </div>
                      `
                      : ""
                  }


                  ${
                    respondedAt
                      ? `
                        <p
                          class="
                            text-[10px]
                            text-slate-400
                            mt-3
                          "
                        >
                          Submitted ${escapeHtml(
                            respondedAt
                          )}
                        </p>
                      `
                      : ""
                  }

                </div>
              `;
            }


            if (
              status ===
              "pending"
            ) {
              responseDetails = `
                <div
                  class="
                    mt-4
                    bg-amber-50
                    border
                    border-amber-100
                    rounded-2xl
                    p-4
                  "
                >

                  <p
                    class="
                      text-xs
                      font-bold
                      text-amber-700
                    "
                  >
                    Waiting for the client to approve
                    the photobook or request a revision.
                  </p>

                </div>
              `;
            }


            return `
              <article
                class="
                  bg-white
                  border
                  ${statusInfo.card}
                  rounded-3xl
                  p-5
                  sm:p-6
                  shadow-sm
                "
              >

                <div
                  class="
                    flex
                    flex-col
                    lg:flex-row
                    lg:items-start
                    lg:justify-between
                    gap-4
                  "
                >

                  <div
                    class="
                      min-w-0
                      flex-1
                    "
                  >

                    <div
                      class="
                        flex
                        flex-wrap
                        items-center
                        gap-2
                      "
                    >

                      <span
                        class="
                          inline-flex
                          items-center
                          rounded-full
                          border
                          px-3
                          py-1
                          text-[9px]
                          font-black
                          ${statusInfo.badge}
                        "
                      >
                        ${statusInfo.label}
                      </span>


                      <span
                        class="
                          bg-slate-100
                          text-slate-600
                          rounded-full
                          px-3
                          py-1
                          text-[9px]
                          font-black
                        "
                      >
                        ${bookSize}
                      </span>

                    </div>


                    <h3
                      class="
                        text-lg
                        sm:text-xl
                        font-black
                        text-slate-900
                        mt-3
                        break-words
                      "
                    >
                      ${projectName}
                    </h3>


                    ${
                      createdAt
                        ? `
                          <p
                            class="
                              text-[10px]
                              text-slate-400
                              mt-1
                            "
                          >
                            Created ${escapeHtml(
                              createdAt
                            )}
                          </p>
                        `
                        : ""
                    }


                    ${responseDetails}

                  </div>


                  <div
                    class="
                      flex
                      flex-col
                      sm:flex-row
                      lg:flex-col
                      gap-2
                      lg:w-44
                      flex-shrink-0
                    "
                  >

                    <a
                      href="${shareUrl}"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="
                        text-center
                        bg-slate-900
                        text-white
                        rounded-xl
                        px-4
                        py-3
                        text-xs
                        font-black
                        hover:bg-slate-800
                        transition
                      "
                    >
                      Open Preview ↗
                    </a>


                    <button
                      type="button"
                      data-copy-client-link="${escapeHtml(
                        shareUrl
                      )}"
                      class="
                        copy-client-preview-btn
                        text-center
                        bg-white
                        border
                        border-slate-200
                        text-slate-600
                        rounded-xl
                        px-4
                        py-3
                        text-xs
                        font-black
                        hover:bg-slate-50
                        transition
                      "
                    >
                      Copy Link
                    </button>

                  </div>

                </div>

              </article>
            `;
          }
        )
        .join("");


    container
      .querySelectorAll(
        ".copy-client-preview-btn"
      )
      .forEach(
        function (button) {

          button.addEventListener(
            "click",
            async function () {

              const url =
                this.dataset
                  .copyClientLink;

              if (!url) return;

              try {
                await navigator.clipboard
                  .writeText(url);

                const oldText =
                  this.textContent;

                this.textContent =
                  "Copied ✓";

                setTimeout(
                  () => {
                    this.textContent =
                      oldText;
                  },
                  1500
                );

              } catch (error) {
                window.prompt(
                  "Copy this client link:",
                  url
                );
              }
            }
          );
        }
      );
  }


  async function loadSavedClientFlipbooks() {
    const container =
      $("savedClientFlipbooks");

    if (!container) {
      return;
    }


    if (!supabaseClient) {
      showClientFlipbooksStatus(
        "Supabase could not be loaded.",
        "error"
      );

      return;
    }


    hideClientFlipbooksStatus();


    container.innerHTML = `
      <div
        class="
          bg-white
          border
          border-slate-200
          rounded-3xl
          p-8
          text-center
        "
      >

        <div
          class="
            w-8
            h-8
            mx-auto
            rounded-full
            border-4
            border-slate-200
            border-t-teal-500
            animate-spin
          "
        ></div>

        <p
          class="
            font-black
            text-slate-700
            mt-4
          "
        >
          Loading client responses...
        </p>

      </div>
    `;


    try {
      const {
        data: { user },
        error: userError
      } =
        await supabaseClient
          .auth
          .getUser();


      if (userError) {
        throw userError;
      }


      if (!user) {
        throw new Error(
          "Your login session expired. Please return to the dashboard and log in again."
        );
      }


      const {
        data,
        error
      } =
       await supabaseClient
  .from(
    "client_flipbooks"
  )
  .select(
    "share_code, project_name, book_size, status, client_name, client_message, revision_page, responded_at, created_at"
  )
  .eq(
    "user_id",
    user.id
  )
  .order(
            "created_at",
            {
              ascending:
                false
            }
          );


      if (error) {
        throw error;
      }


      const flipbooks =
        Array.isArray(data)
          ? data
          : [];


      updateClientSummary(
        flipbooks
      );


      renderSavedClientFlipbooks(
        flipbooks
      );


    } catch (error) {
      console.error(
        "Load saved client flipbooks error:",
        error
      );


      updateClientSummary(
        []
      );


      container.innerHTML = `
        <div
          class="
            bg-white
            border
            border-red-200
            rounded-3xl
            p-8
            text-center
          "
        >

          <div class="text-3xl">
            ⚠️
          </div>

          <p
            class="
              font-black
              text-red-700
              mt-3
            "
          >
            Could not load client flipbooks
          </p>

          <p
            class="
              text-xs
              text-slate-500
              mt-1
            "
          >
            ${escapeHtml(
              error?.message ||
              "Please refresh and try again."
            )}
          </p>

        </div>
      `;


      showClientFlipbooksStatus(
        error?.message ||
          "Unable to load saved client flipbooks.",
        "error"
      );
    }
  }


  // =====================================================
  // ADMIN REFRESH BUTTON
  // =====================================================

  $("refreshClientFlipbooksBtn")
    ?.addEventListener(
      "click",
      async function () {

        const oldText =
          this.textContent;

        this.disabled =
          true;

        this.textContent =
          "Refreshing...";

        await loadSavedClientFlipbooks();

        this.disabled =
          false;

        this.textContent =
          oldText;
      }
    );


  // =====================================================
  // INITIAL
  // =====================================================

  updateZoomLabel();
  updateFullscreenButton();
  updateSaveShareButton();

  loadSavedClientFlipbooks();

})();