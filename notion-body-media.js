(() => {
  "use strict";

  const DB_NAME =
    "clipnest-body-media";

  const DB_VERSION =
    1;

  const STORE_NAME =
    "drafts";

  const MAX_ITEMS =
    6;

  const DRAFT_TTL =
    2 * 60 * 60 * 1000;

  const PRUNE_TTL =
    24 * 60 * 60 * 1000;

  let root =
    null;

  let previews =
    null;

  let addButton =
    null;

  let menu =
    null;

  let status =
    null;

  let menuButtons =
    [];

  let items =
    [];

  let currentPageUrl =
    "";

  /*
   * PENDING NOTION PRESET RESUME - 1.9.8
   *
   * Body media already survives popup closes in IndexedDB.
   * Keep the owning Notion preset with that draft so a
   * manual reopen can return directly to the unfinished clip.
   */
  let currentNotionPresetId =
    "";


  let busy =
    false;

  function createId() {
    return (
      globalThis.crypto
        ?.randomUUID?.() ||
      `${Date.now()}-${Math.random()}`
    );
  }

  function openDb() {
    return new Promise(
      (
        resolve,
        reject
      ) => {
        const request =
          indexedDB.open(
            DB_NAME,
            DB_VERSION
          );

        request.onupgradeneeded =
          () => {
            const db =
              request.result;

            if (
              !db.objectStoreNames
                .contains(
                  STORE_NAME
                )
            ) {
              db.createObjectStore(
                STORE_NAME
              );
            }
          };

        request.onsuccess =
          () =>
            resolve(
              request.result
            );

        request.onerror =
          () =>
            reject(
              request.error
            );
      }
    );
  }

  async function readDraft(
    pageUrl
  ) {
    const db =
      await openDb();

    try {
      return await new Promise(
        (
          resolve,
          reject
        ) => {
          const transaction =
            db.transaction(
              STORE_NAME,
              "readonly"
            );

          const request =
            transaction
              .objectStore(
                STORE_NAME
              )
              .get(
                pageUrl
              );

          request.onsuccess =
            () =>
              resolve(
                request.result ||
                null
              );

          request.onerror =
            () =>
              reject(
                request.error
              );
        }
      );
    } finally {
      db.close();
    }
  }

  async function writeDraft() {
    if (
      !currentPageUrl
    ) {
      return;
    }

    const db =
      await openDb();

    try {
      await new Promise(
        (
          resolve,
          reject
        ) => {
          const transaction =
            db.transaction(
              STORE_NAME,
              "readwrite"
            );

          const store =
            transaction
              .objectStore(
                STORE_NAME
              );

          if (
            items.length
          ) {
            store.put(
              {
                pageUrl:
                  currentPageUrl,

                updatedAt:
                  Date.now(),

                notionPresetId:
                  currentNotionPresetId,

                items
              },
              currentPageUrl
            );
          } else {
            store.delete(
              currentPageUrl
            );
          }

          transaction.oncomplete =
            resolve;

          transaction.onerror =
            () =>
              reject(
                transaction.error
              );
        }
      );
    } finally {
      db.close();
    }
  }

  async function deleteDraft(
    pageUrl
  ) {
    if (!pageUrl) {
      return;
    }

    const db =
      await openDb();

    try {
      await new Promise(
        (
          resolve,
          reject
        ) => {
          const transaction =
            db.transaction(
              STORE_NAME,
              "readwrite"
            );

          transaction
            .objectStore(
              STORE_NAME
            )
            .delete(
              pageUrl
            );

          transaction.oncomplete =
            resolve;

          transaction.onerror =
            () =>
              reject(
                transaction.error
              );
        }
      );
    } finally {
      db.close();
    }
  }

  async function pruneDrafts() {
    const db =
      await openDb();

    try {
      await new Promise(
        (
          resolve,
          reject
        ) => {
          const transaction =
            db.transaction(
              STORE_NAME,
              "readwrite"
            );

          const store =
            transaction
              .objectStore(
                STORE_NAME
              );

          const request =
            store.openCursor();

          request.onsuccess =
            () => {
              const cursor =
                request.result;

              if (!cursor) {
                return;
              }

              const updatedAt =
                Number(
                  cursor.value
                    ?.updatedAt ||
                  0
                );

              if (
                !updatedAt ||
                Date.now() -
                  updatedAt >
                  PRUNE_TTL
              ) {
                cursor.delete();
              }

              cursor.continue();
            };

          transaction.oncomplete =
            resolve;

          transaction.onerror =
            () =>
              reject(
                transaction.error
              );
        }
      );
    } finally {
      db.close();
    }
  }

  function safeFilename(
    value,
    fallback =
      "clipnest-image.jpg"
  ) {
    const cleaned =
      String(
        value ||
        fallback
      )
        .replace(
          /[<>:"/\\|?*\x00-\x1f]/g,
          "-"
        )
        .trim()
        .slice(
          0,
          160
        );

    return (
      cleaned ||
      fallback
    );
  }

  function normalizeGeneratedImageFormat(
    value
  ) {
    return String(
      value ||
      ""
    ).toLowerCase() ===
      "webp"
      ? "webp"
      : "jpeg";
  }

  async function getGeneratedImageFormat() {
    const stored =
      await chrome.storage.local.get(
        "defaultImageFormat"
      );

    return normalizeGeneratedImageFormat(
      stored.defaultImageFormat
    );
  }

  function generatedImageMimeType(
    format
  ) {
    return normalizeGeneratedImageFormat(
      format
    ) ===
      "webp"
      ? "image/webp"
      : "image/jpeg";
  }

  function generatedImageExtension(
    format
  ) {
    return normalizeGeneratedImageFormat(
      format
    ) ===
      "webp"
      ? ".webp"
      : ".jpg";
  }

  function encodeGeneratedCanvas(
    canvas,
    format,
    jpegQuality = .92
  ) {
    const normalized =
      normalizeGeneratedImageFormat(
        format
      );

    return canvas.toDataURL(
      generatedImageMimeType(
        normalized
      ),
      normalized ===
        "webp"
        ? .90
        : jpegQuality
    );
  }

  function filenameFromUrl(
    value
  ) {
    try {
      const parsed =
        new URL(
          value
        );

      const last =
        parsed.pathname
          .split(
            "/"
          )
          .filter(Boolean)
          .pop();

      if (last) {
        return safeFilename(
          decodeURIComponent(
            last
          ),
          "image"
        );
      }
    } catch {
    }

    return "image";
  }

  function normalizeItem(
    item
  ) {
    if (
      !item ||
      typeof item !==
        "object"
    ) {
      return null;
    }

    if (
      item.kind ===
        "external"
    ) {
      const url =
        String(
          item.url ||
          ""
        ).trim();

      if (
        !/^https?:\/\//i.test(
          url
        )
      ) {
        return null;
      }

      return {
        id:
          String(
            item.id ||
            createId()
          ),

        kind:
          "external",

        url,

        filename:
          safeFilename(
            item.filename ||
            filenameFromUrl(
              url
            ),
            "image"
          ),

        label:
          String(
            item.label ||
            "Selected image"
          )
      };
    }

    const dataUrl =
      String(
        item.dataUrl ||
        ""
      );

    if (
      !/^data:image\//i.test(
        dataUrl
      )
    ) {
      return null;
    }

    return {
      id:
        String(
          item.id ||
          createId()
        ),

      kind:
        "data",

      dataUrl,

      mimeType:
        String(
          item.mimeType ||
          "image/jpeg"
        ),

      filename:
        safeFilename(
          item.filename ||
          "clipnest-screenshot.jpg"
        ),

      label:
        String(
          item.label ||
          "Screenshot"
        )
    };
  }

  function dataUrlByteSize(
    value
  ) {
    const source =
      String(
        value ||
        ""
      );

    const comma =
      source.indexOf(
        ","
      );

    if (comma < 0) {
      return 0;
    }

    const encoded =
      source.slice(
        comma + 1
      );

    if (!encoded) {
      return 0;
    }

    const padding =
      encoded.endsWith("==")
        ? 2
        : encoded.endsWith("=")
          ? 1
          : 0;

    return Math.max(
      0,
      Math.floor(
        encoded.length *
        3 /
        4
      ) -
      padding
    );
  }

  function formatMediaSize(
    bytes
  ) {
    const value =
      Number(
        bytes ||
        0
      );

    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
      return "";
    }

    if (value < 1024) {
      return `${Math.round(value)} B`;
    }

    if (
      value <
      1024 * 1024
    ) {
      return `${
        Math.round(
          value /
          1024
        )
      } KB`;
    }

    return `${
      (
        value /
        1024 /
        1024
      ).toFixed(
        value <
          10 *
          1024 *
          1024
          ? 1
          : 0
      )
    } MB`;
  }

  function mediaTypeLabel(
    item
  ) {
    const mime =
      String(
        item?.mimeType ||
        ""
      ).toLowerCase();

    if (
      mime.includes(
        "png"
      )
    ) {
      return "PNG";
    }

    if (
      mime.includes(
        "webp"
      )
    ) {
      return "WebP";
    }

    if (
      mime.includes(
        "gif"
      )
    ) {
      return "GIF";
    }

    if (
      mime.includes(
        "jpeg"
      ) ||
      mime.includes(
        "jpg"
      )
    ) {
      return "JPEG";
    }

    const filename =
      String(
        item?.filename ||
        ""
      ).toLowerCase();

    if (
      filename.endsWith(
        ".png"
      )
    ) {
      return "PNG";
    }

    if (
      filename.endsWith(
        ".webp"
      )
    ) {
      return "WebP";
    }

    if (
      filename.endsWith(
        ".gif"
      )
    ) {
      return "GIF";
    }

    if (
      filename.endsWith(
        ".jpg"
      ) ||
      filename.endsWith(
        ".jpeg"
      )
    ) {
      return "JPEG";
    }

    return "Image";
  }

  function setLocalStatus(
    message = "",
    isError = false
  ) {
    if (!status) {
      return;
    }

    status.textContent =
      String(
        message ||
        ""
      );

    status.classList.toggle(
      "error",
      Boolean(
        message &&
        isError
      )
    );

    status.classList.toggle(
      "hidden",
      !message
    );
  }

  function setBusy(
    value
  ) {
    busy =
      Boolean(
        value
      );

    menuButtons.forEach(
      (button) => {
        button.disabled =
          busy;
      }
    );

    if (addButton) {
      addButton.disabled =
        busy ||
        items.length >=
          MAX_ITEMS;
    }
  }

  function render() {
    if (
      !previews ||
      !addButton
    ) {
      return;
    }

    previews.replaceChildren();

    if (items.length) {
      const heading =
        document.createElement(
          "div"
        );

      heading.className =
        "notion-body-media-preview-heading";

      heading.textContent =
        `Attached image${
          items.length === 1
            ? ""
            : "s"
        } (${items.length})`;

      previews.append(
        heading
      );
    }

    for (
      const item of
        items
    ) {
      const card =
        document.createElement(
          "div"
        );

      card.className =
        "notion-body-media-thumb";

      const image =
        document.createElement(
          "img"
        );

      image.src =
        item.kind ===
          "external"
          ? item.url
          : item.dataUrl;

      image.alt =
        item.label ||
        "Page image";

      image.referrerPolicy =
        "no-referrer";

      const copy =
        document.createElement(
          "div"
        );

      copy.className =
        "notion-body-media-thumb-copy";

      const title =
        document.createElement(
          "div"
        );

      title.className =
        "notion-body-media-thumb-title";

      title.textContent =
        String(
          item.label ||
          "Image"
        );

      title.title =
        String(
          item.filename ||
          item.label ||
          "Image"
        );

      const meta =
        document.createElement(
          "div"
        );

      meta.className =
        "notion-body-media-thumb-meta";

      const size =
        item.kind ===
          "data"
          ? formatMediaSize(
              dataUrlByteSize(
                item.dataUrl
              )
            )
          : "";

      meta.textContent =
        [
          mediaTypeLabel(
            item
          ),
          size
        ]
          .filter(Boolean)
          .join(" · ");

      copy.append(
        title,
        meta
      );

      const remove =
        document.createElement(
          "button"
        );

      remove.type =
        "button";

      remove.className =
        "notion-body-media-remove";

      remove.textContent =
        "×";

      remove.title =
        "Remove image";

      remove.setAttribute(
        "aria-label",
        "Remove image"
      );

      remove.addEventListener(
        "click",
        async () => {
          items =
            items.filter(
              (candidate) =>
                candidate.id !==
                item.id
            );

          render();

          try {
            await writeDraft();
          } catch {
          }
        }
      );

      card.append(
        image,
        copy,
        remove
      );

      previews.append(
        card
      );
    }

    previews.classList.toggle(
      "hidden",
      !items.length
    );

    addButton.textContent =
      items.length
        ? "+ Capture another image"
        : "+ Capture image";

    addButton.disabled =
      busy ||
      items.length >=
        MAX_ITEMS;
  }

  async function addItem(
    rawItem
  ) {
    const item =
      normalizeItem(
        rawItem
      );

    if (!item) {
      throw new Error(
        "ClipNest could not use that image."
      );
    }

    if (
      item.kind ===
        "external" &&
      items.some(
        (candidate) =>
          candidate.kind ===
            "external" &&
          candidate.url ===
            item.url
      )
    ) {
      return;
    }

    if (
      items.length >=
        MAX_ITEMS
    ) {
      throw new Error(
        `You can add up to ${MAX_ITEMS} page images.`
      );
    }

    items.push(
      item
    );

    render();

    try {
      await writeDraft();
    } catch {
    }
  }

  function loadImage(
    dataUrl
  ) {
    return new Promise(
      (
        resolve,
        reject
      ) => {
        const image =
          new Image();

        image.onload =
          () =>
            resolve(
              image
            );

        image.onerror =
          reject;

        image.src =
          dataUrl;
      }
    );
  }

  async function transcodeGeneratedImage(
    dataUrl,
    format
  ) {
    const normalized =
      normalizeGeneratedImageFormat(
        format
      );

    if (
      normalized ===
        "jpeg" &&
      /^data:image\/jpeg/i.test(
        String(
          dataUrl ||
          ""
        )
      )
    ) {
      return dataUrl;
    }

    const image =
      await loadImage(
        dataUrl
      );

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      Math.max(
        1,
        image.naturalWidth
      );

    canvas.height =
      Math.max(
        1,
        image.naturalHeight
      );

    const context =
      canvas.getContext(
        "2d"
      );

    if (!context) {
      throw new Error(
        "Could not convert screenshot."
      );
    }

    context.drawImage(
      image,
      0,
      0
    );

    return encodeGeneratedCanvas(
      canvas,
      normalized,
      .92
    );
  }

  async function cropScreenshot(
    dataUrl,
    info,
    format =
      "jpeg"
  ) {
    const image =
      await loadImage(
        dataUrl
      );

    const viewportWidth =
      Number(
        info?.viewportWidth ||
        0
      );

    const viewportHeight =
      Number(
        info?.viewportHeight ||
        0
      );

    const rect =
      info?.rect ||
      {};

    if (
      !viewportWidth ||
      !viewportHeight
    ) {
      throw new Error(
        "Capture dimensions are missing."
      );
    }

    const scaleX =
      image.naturalWidth /
      viewportWidth;

    const scaleY =
      image.naturalHeight /
      viewportHeight;

    const sourceX =
      Math.max(
        0,
        Math.round(
          Number(
            rect.x ||
            0
          ) *
            scaleX
        )
      );

    const sourceY =
      Math.max(
        0,
        Math.round(
          Number(
            rect.y ||
            0
          ) *
            scaleY
        )
      );

    const sourceWidth =
      Math.min(
        image.naturalWidth -
          sourceX,
        Math.max(
          1,
          Math.round(
            Number(
              rect.width ||
              0
            ) *
              scaleX
          )
        )
      );

    const sourceHeight =
      Math.min(
        image.naturalHeight -
          sourceY,
        Math.max(
          1,
          Math.round(
            Number(
              rect.height ||
              0
            ) *
              scaleY
          )
        )
      );

    if (
      sourceWidth < 8 ||
      sourceHeight < 8
    ) {
      throw new Error(
        "The selected area was too small."
      );
    }

    const maxDimension =
      2400;

    const outputScale =
      Math.min(
        1,
        maxDimension /
          sourceWidth,
        maxDimension /
          sourceHeight
      );

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      Math.max(
        1,
        Math.round(
          sourceWidth *
          outputScale
        )
      );

    canvas.height =
      Math.max(
        1,
        Math.round(
          sourceHeight *
          outputScale
        )
      );

    const context =
      canvas.getContext(
        "2d"
      );

    if (!context) {
      throw new Error(
        "Could not create screenshot."
      );
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return encodeGeneratedCanvas(
      canvas,
      format,
      .92
    );
  }

  async function getActiveTab() {
    const tabs =
      await chrome.tabs.query({
        active:
          true,

        currentWindow:
          true
      });

    const tab =
      tabs?.[0];

    if (
      !Number.isInteger(
        tab?.id
      ) ||
      !/^https?:/i.test(
        tab.url ||
        ""
      )
    ) {
      throw new Error(
        "Open a normal webpage first."
      );
    }

    return tab;
  }

  async function captureVisibleArea() {
    const tab =
      await getActiveTab();

    const outputFormat =
      await getGeneratedImageFormat();

    const captureOptions =
      outputFormat ===
        "webp"
        ? {
            format:
              "png"
          }
        : {
            format:
              "jpeg",

            quality:
              92
          };

    let dataUrl =
      await chrome.tabs
        .captureVisibleTab(
          tab.windowId,
          captureOptions
        );

    if (!dataUrl) {
      throw new Error(
        "Could not capture the visible page."
      );
    }

    if (
      outputFormat ===
        "webp"
    ) {
      dataUrl =
        await transcodeGeneratedImage(
          dataUrl,
          outputFormat
        );
    }

    await addItem({
      kind:
        "data",

      dataUrl,

      mimeType:
        generatedImageMimeType(
          outputFormat
        ),

      filename:
        `clipnest-visible-${Date.now()}${generatedImageExtension(
          outputFormat
        )}`,

      label:
        "Visible area"
    });
  }

  function sleep(
    milliseconds
  ) {
    return new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          milliseconds
        )
    );
  }

  async function captureEntirePage() {
    const tab =
      await getActiveTab();

    const outputFormat =
      await getGeneratedImageFormat();

    const marker =
      `clipnest-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

    const initialResult =
      await chrome.scripting.executeScript({
        target: {
          tabId:
            tab.id
        },

        func:
          (
            markerValue
          ) => {
            document
              .querySelectorAll(
                "[data-clipnest-full-page-scroll]"
              )
              .forEach(
                (
                  element
                ) => {
                  element.removeAttribute(
                    "data-clipnest-full-page-scroll"
                  );
                }
              );

            const documentScroller =
              document.scrollingElement;

            const documentRange =
              documentScroller
                ? Math.max(
                    0,
                    documentScroller.scrollHeight -
                      documentScroller.clientHeight
                  )
                : 0;

            const candidates =
              [
                ...document.querySelectorAll(
                  "*"
                )
              ]
                .map(
                  (
                    element
                  ) => {
                    const style =
                      getComputedStyle(
                        element
                      );

                    const range =
                      Math.max(
                        0,
                        element.scrollHeight -
                          element.clientHeight
                      );

                    const scrollable =
                      range >
                        100 &&
                      [
                        "auto",
                        "scroll",
                        "overlay"
                      ].includes(
                        style.overflowY
                      );

                    if (!scrollable) {
                      return null;
                    }

                    const rect =
                      element
                        .getBoundingClientRect();

                    if (
                      rect.width <
                        100 ||
                      rect.height <
                        100
                    ) {
                      return null;
                    }

                    return {
                      element,
                      range,
                      scrollHeight:
                        element.scrollHeight,
                      clientHeight:
                        element.clientHeight,
                      clientWidth:
                        element.clientWidth
                    };
                  }
                )
                .filter(Boolean)
                .sort(
                  (
                    a,
                    b
                  ) =>
                    b.range -
                    a.range
                );

            const best =
              candidates[0] ||
              null;

            const useDocument =
              documentRange >
                100 &&
              (
                !best ||
                documentRange >=
                  best.range
              );

            if (useDocument) {
              return {
                mode:
                  "document",

                originalX:
                  window.scrollX,

                originalY:
                  window.scrollY,

                pageWidth:
                  window.innerWidth,

                pageHeight:
                  documentScroller
                    .scrollHeight,

                viewportWidth:
                  window.innerWidth,

                viewportHeight:
                  window.innerHeight,

                pixelRatio:
                  Number(
                    window.devicePixelRatio ||
                    1
                  )
              };
            }

            if (!best) {
              return {
                mode:
                  "document",

                originalX:
                  window.scrollX,

                originalY:
                  window.scrollY,

                pageWidth:
                  window.innerWidth,

                pageHeight:
                  window.innerHeight,

                viewportWidth:
                  window.innerWidth,

                viewportHeight:
                  window.innerHeight,

                pixelRatio:
                  Number(
                    window.devicePixelRatio ||
                    1
                  )
              };
            }

            best.element.setAttribute(
              "data-clipnest-full-page-scroll",
              markerValue
            );

            const rect =
              best.element
                .getBoundingClientRect();

            return {
              mode:
                "element",

              originalX:
                best.element.scrollLeft,

              originalY:
                best.element.scrollTop,

              pageWidth:
                best.element.clientWidth,

              pageHeight:
                best.element.scrollHeight,

              viewportWidth:
                best.element.clientWidth,

              viewportHeight:
                best.element.clientHeight,

              pixelRatio:
                Number(
                  window.devicePixelRatio ||
                  1
                ),

              rect: {
                left:
                  rect.left,

                top:
                  rect.top,

                width:
                  rect.width,

                height:
                  rect.height
              }
            };
          },

        args: [
          marker
        ]
      });

    const metrics =
      initialResult?.[0]
        ?.result;

    if (
      !metrics?.pageWidth ||
      !metrics?.pageHeight ||
      !metrics?.viewportHeight
    ) {
      throw new Error(
        "Could not measure this page."
      );
    }

    if (
      metrics.pageHeight >
        24000
    ) {
      throw new Error(
        "This page is too long for full-page capture. Use Select Area to Capture instead."
      );
    }

    /*
     * FULL PAGE RESOLUTION - 1.9.5
     *
     * captureVisibleTab can provide substantially
     * more pixels than the page's CSS dimensions,
     * especially on Retina displays.
     *
     * The old implementation flattened the final
     * canvas to at most 1200 CSS pixels wide, which
     * discarded that source resolution before the
     * image reached Notion or Obsidian.
     *
     * Preserve the available capture density while
     * keeping canvas dimensions and memory bounded.
     */

    const captureScale =
      Math.max(
        .1,
        Number(
          metrics.pixelRatio ||
          1
        )
      );

    const maxOutputWidth =
      2800;

    const maxOutputHeight =
      30000;

    /*
     * Keep the worst-case raw canvas allocation
     * roughly within the range the previous
     * implementation could already reach.
     */
    const maxCanvasPixels =
      28000000;

    const widthScale =
      maxOutputWidth /
      metrics.pageWidth;

    const heightScale =
      maxOutputHeight /
      metrics.pageHeight;

    const areaScale =
      Math.sqrt(
        maxCanvasPixels /
        (
          metrics.pageWidth *
          metrics.pageHeight
        )
      );

    const outputScale =
      Math.max(
        .01,
        Math.min(
          captureScale,
          widthScale,
          heightScale,
          areaScale
        )
      );

    const outputWidth =
      metrics.pageWidth *
      outputScale;

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      Math.max(
        1,
        Math.round(
          outputWidth
        )
      );

    canvas.height =
      Math.max(
        1,
        Math.round(
          metrics.pageHeight *
            outputScale
        )
      );

    const context =
      canvas.getContext(
        "2d"
      );

    if (!context) {
      throw new Error(
        "Could not create the full-page screenshot."
      );
    }

    context.imageSmoothingEnabled =
      true;

    context.imageSmoothingQuality =
      "high";

    const lastTop =
      Math.max(
        0,
        metrics.pageHeight -
          metrics.viewportHeight
      );

    /*
     * Overlap neighboring viewport captures.
     * The overlap is cropped from every tile after
     * the first one, which prevents visible seams
     * caused by sub-pixel scrolling and layout shifts.
     */
    const overlapCss =
      Math.min(
        96,
        Math.max(
          32,
          Math.round(
            metrics.viewportHeight *
              .12
          )
        )
      );

    const captureStep =
      Math.max(
        1,
        metrics.viewportHeight -
          overlapCss
      );

    const positions =
      [];

    for (
      let top = 0;
      top < lastTop;
      top +=
        captureStep
    ) {
      positions.push(
        top
      );
    }

    positions.push(
      lastTop
    );

    const uniquePositions =
      [
        ...new Set(
          positions.map(
            (
              value
            ) =>
              Math.max(
                0,
                Math.round(
                  value
                )
              )
          )
        )
      ];

    let previousCapturedBottomCss =
      null;

    try {
      /*
       * Hide scrollbar paint during capture without
       * changing scrollbar width or page geometry.
       * This prevents the scrollbar thumb from being
       * repeated at every stitched viewport.
       */
      await chrome.scripting.executeScript({
        target: {
          tabId:
            tab.id
        },

        func:
          (
            markerValue
          ) => {
            const styleAttr =
              "data-clipnest-full-page-scrollbar-style";

            document
              .querySelectorAll(
                `[${styleAttr}="${markerValue}"]`
              )
              .forEach(
                (
                  element
                ) =>
                  element.remove()
              );

            const style =
              document.createElement(
                "style"
              );

            style.setAttribute(
              styleAttr,
              markerValue
            );

            const scroller =
              `[data-clipnest-full-page-scroll="${markerValue}"]`;

            style.textContent =
              `
html::-webkit-scrollbar-thumb:vertical,
body::-webkit-scrollbar-thumb:vertical,
${scroller}::-webkit-scrollbar-thumb:vertical {
  background: transparent !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
`;

            (
              document.head ||
              document.documentElement
            ).append(
              style
            );
          },

        args: [
          marker
        ]
      });

      for (
        let index = 0;
        index <
          uniquePositions.length;
        index += 1
      ) {
        const top =
          uniquePositions[
            index
          ];

        const scrollResult =
          await chrome.scripting.executeScript({
            target: {
              tabId:
                tab.id
            },

            func:
              async (
                mode,
                markerValue,
                targetTop
              ) => {
                const waitFrames =
                  () =>
                    new Promise(
                      (
                        resolve
                      ) =>
                        requestAnimationFrame(
                          () =>
                            requestAnimationFrame(
                              resolve
                            )
                        )
                    );

                if (
                  mode ===
                    "document"
                ) {
                  const root =
                    document
                      .documentElement;

                  const previousBehavior =
                    root.style
                      .scrollBehavior;

                  root.style
                    .scrollBehavior =
                    "auto";

                  window.scrollTo(
                    0,
                    targetTop
                  );

                  await waitFrames();

                  root.style
                    .scrollBehavior =
                    previousBehavior;

                  return {
                    scrollTop:
                      window.scrollY,

                    viewportWidth:
                      window.innerWidth,

                    viewportHeight:
                      window.innerHeight,

                    windowWidth:
                      window.innerWidth,

                    windowHeight:
                      window.innerHeight,

                    rect: {
                      left:
                        0,

                      top:
                        0,

                      width:
                        window.innerWidth,

                      height:
                        window.innerHeight
                    }
                  };
                }

                const element =
                  document.querySelector(
                    `[data-clipnest-full-page-scroll="${markerValue}"]`
                  );

                if (!element) {
                  throw new Error(
                    "The page scroll container changed during capture."
                  );
                }

                const previousBehavior =
                  element.style
                    .scrollBehavior;

                element.style
                  .scrollBehavior =
                  "auto";

                element.scrollTop =
                  targetTop;

                await waitFrames();

                element.style
                  .scrollBehavior =
                  previousBehavior;

                const rect =
                  element
                    .getBoundingClientRect();

                return {
                  scrollTop:
                    element.scrollTop,

                  viewportWidth:
                    element.clientWidth,

                  viewportHeight:
                    element.clientHeight,

                  windowWidth:
                    window.innerWidth,

                  windowHeight:
                    window.innerHeight,

                  rect: {
                    left:
                      rect.left,

                    top:
                      rect.top,

                    width:
                      rect.width,

                    height:
                      rect.height
                  }
                };
              },

            args: [
              metrics.mode,
              marker,
              top
            ]
          });

        const view =
          scrollResult?.[0]
            ?.result;

        if (!view) {
          continue;
        }

        await sleep(
          index === 0
            ? 180
            : 450
        );

        if (index > 0) {
          await chrome.scripting.executeScript({
            target: {
              tabId:
                tab.id
            },

            func:
              (
                markerValue
              ) => {
                const hiddenAttr =
                  "data-clipnest-full-page-hidden";

                const oldVisibilityAttr =
                  "data-clipnest-old-visibility";

                const oldPriorityAttr =
                  "data-clipnest-old-visibility-priority";

                const viewportArea =
                  Math.max(
                    1,
                    window.innerWidth *
                      window.innerHeight
                  );

                for (
                  const element of
                    document.querySelectorAll(
                      "*"
                    )
                ) {
                  if (
                    element ===
                      document.documentElement ||
                    element ===
                      document.body ||
                    element.hasAttribute(
                      "data-clipnest-full-page-scroll"
                    ) ||
                    element.getAttribute(
                      hiddenAttr
                    ) === markerValue
                  ) {
                    continue;
                  }

                  const style =
                    getComputedStyle(
                      element
                    );

                  if (
                    style.display ===
                      "none" ||
                    style.visibility ===
                      "hidden"
                  ) {
                    continue;
                  }

                  if (
                    style.position !==
                      "fixed" &&
                    style.position !==
                      "sticky"
                  ) {
                    continue;
                  }

                  const rect =
                    element
                      .getBoundingClientRect();

                  if (
                    rect.width < 4 ||
                    rect.height < 4 ||
                    rect.bottom <= 0 ||
                    rect.right <= 0 ||
                    rect.top >=
                      window.innerHeight ||
                    rect.left >=
                      window.innerWidth
                  ) {
                    continue;
                  }

                  const areaRatio =
                    (
                      rect.width *
                      rect.height
                    ) /
                    viewportArea;

                  const edgeDistance =
                    Math.min(
                      Math.abs(
                        rect.top
                      ),

                      Math.abs(
                        window.innerHeight -
                          rect.bottom
                      ),

                      Math.abs(
                        rect.left
                      ),

                      Math.abs(
                        window.innerWidth -
                          rect.right
                      )
                    );

                  const smallOverlay =
                    areaRatio <=
                      .35;

                  const edgeAnchored =
                    edgeDistance <=
                      24;

                  const shouldHide =
                    style.position ===
                      "fixed"
                      ? (
                          smallOverlay ||
                          edgeAnchored
                        )
                      : (
                          smallOverlay &&
                          edgeAnchored
                        );

                  if (!shouldHide) {
                    continue;
                  }

                  element.setAttribute(
                    hiddenAttr,
                    markerValue
                  );

                  element.setAttribute(
                    oldVisibilityAttr,
                    element.style
                      .getPropertyValue(
                        "visibility"
                      )
                  );

                  element.setAttribute(
                    oldPriorityAttr,
                    element.style
                      .getPropertyPriority(
                        "visibility"
                      )
                  );

                  element.style.setProperty(
                    "visibility",
                    "hidden",
                    "important"
                  );
                }
              },

            args: [
              marker
            ]
          });

          await sleep(
            50
          );
        }

        const shotUrl =
          await chrome.tabs.captureVisibleTab(
            tab.windowId,
            {
              format:
                "jpeg",

              quality:
                90
            }
          );

        const shot =
          await loadImage(
            shotUrl
          );

        const sourceX =
          Math.max(
            0,
            Math.round(
              (
                view.rect.left /
                view.windowWidth
              ) *
                shot.naturalWidth
            )
          );

        const sourceY =
          Math.max(
            0,
            Math.round(
              (
                view.rect.top /
                view.windowHeight
              ) *
                shot.naturalHeight
            )
          );

        const sourceWidth =
          Math.min(
            shot.naturalWidth -
              sourceX,
            Math.max(
              1,
              Math.round(
                (
                  view.rect.width /
                  view.windowWidth
                ) *
                  shot.naturalWidth
              )
            )
          );

        const sourceHeight =
          Math.min(
            shot.naturalHeight -
              sourceY,
            Math.max(
              1,
              Math.round(
                (
                  view.rect.height /
                  view.windowHeight
                ) *
                  shot.naturalHeight
              )
            )
          );

        /*
         * Every tile except the first overlaps the
         * previous capture. Remove that overlap from
         * the source before drawing it to the canvas.
         */
        /*
         * Use the ACTUAL overlap between captures,
         * not the requested scroll step. Browsers
         * may clamp or slightly alter scrollTop.
         */
        const currentTopCss =
          Number(
            view.scrollTop ||
            0
          );

        const currentViewportHeightCss =
          Number(
            view.viewportHeight ||
            0
          );

        const currentBottomCss =
          currentTopCss +
          currentViewportHeightCss;

        const actualOverlapCss =
          previousCapturedBottomCss ===
            null
            ? 0
            : Math.max(
                0,
                previousCapturedBottomCss -
                  currentTopCss
              );

        const cropTopCss =
          index === 0
            ? 0
            : Math.min(
                actualOverlapCss,
                Math.max(
                  0,
                  currentViewportHeightCss -
                    1
                )
              );

        /*
         * Chrome/pages can paint a scrollbar,
         * shadow, or other viewport-edge artifact
         * at the bottom of each screenshot.
         *
         * Discard a narrow strip from every tile
         * except the last one. The existing overlap
         * lets the following tile provide the same
         * page content without losing anything.
         */
        const seamGuardCss =
          index <
            uniquePositions.length -
              1
            ? Math.min(
                24,
                Math.max(
                  0,
                  overlapCss -
                    4
                ),
                Math.max(
                  0,
                  currentViewportHeightCss -
                    cropTopCss -
                    1
                )
              )
            : 0;

        const sourceCropTop =
          Math.min(
            sourceHeight -
              1,
            Math.max(
              0,
              Math.round(
                (
                  cropTopCss /
                  view.viewportHeight
                ) *
                  sourceHeight
              )
            )
          );

        const sourceCropBottom =
          Math.min(
            Math.max(
              0,
              sourceHeight -
                sourceCropTop -
                1
            ),
            Math.max(
              0,
              Math.round(
                (
                  seamGuardCss /
                  view.viewportHeight
                ) *
                  sourceHeight
              )
            )
          );

        const croppedSourceY =
          sourceY +
          sourceCropTop;

        const croppedSourceHeight =
          Math.max(
            1,
            sourceHeight -
              sourceCropTop -
              sourceCropBottom
          );

        const drawableBottomCss =
          currentBottomCss -
          seamGuardCss;

        /*
         * Round destination EDGES, not position and
         * height independently. Independent rounding
         * can leave a one-pixel gap between adjacent
         * stitched tiles.
         */
        const destinationY =
          Math.max(
            0,
            Math.round(
              (
                currentTopCss +
                cropTopCss
              ) *
                outputScale
            )
          );

        const destinationEnd =
          Math.min(
            canvas.height,
            Math.max(
              destinationY,
              Math.round(
                drawableBottomCss *
                  outputScale
              )
            )
          );

        const destinationHeight =
          destinationEnd -
          destinationY;

        if (
          destinationHeight <=
            0
        ) {
          continue;
        }

        context.drawImage(
          shot,
          sourceX,
          croppedSourceY,
          sourceWidth,
          croppedSourceHeight,
          0,
          destinationY,
          canvas.width,
          destinationHeight
        );

        previousCapturedBottomCss =
          previousCapturedBottomCss ===
            null
            ? drawableBottomCss
            : Math.max(
                previousCapturedBottomCss,
                drawableBottomCss
              );
      }
    } finally {
      try {
        await chrome.scripting.executeScript({
          target: {
            tabId:
              tab.id
          },

          func:
            (
              mode,
              markerValue,
              originalX,
              originalY
            ) => {
              const hiddenAttr =
                "data-clipnest-full-page-hidden";

              const oldVisibilityAttr =
                "data-clipnest-old-visibility";

              const oldPriorityAttr =
                "data-clipnest-old-visibility-priority";

              const scrollbarStyleAttr =
                "data-clipnest-full-page-scrollbar-style";

              document
                .querySelectorAll(
                  `[${scrollbarStyleAttr}="${markerValue}"]`
                )
                .forEach(
                  (
                    element
                  ) =>
                    element.remove()
                );

              document
                .querySelectorAll(
                  `[${hiddenAttr}="${markerValue}"]`
                )
                .forEach(
                  (
                    element
                  ) => {
                    const oldVisibility =
                      element.getAttribute(
                        oldVisibilityAttr
                      ) ||
                      "";

                    const oldPriority =
                      element.getAttribute(
                        oldPriorityAttr
                      ) ||
                      "";

                    if (oldVisibility) {
                      element.style.setProperty(
                        "visibility",
                        oldVisibility,
                        oldPriority
                      );
                    } else {
                      element.style.removeProperty(
                        "visibility"
                      );
                    }

                    element.removeAttribute(
                      hiddenAttr
                    );

                    element.removeAttribute(
                      oldVisibilityAttr
                    );

                    element.removeAttribute(
                      oldPriorityAttr
                    );
                  }
                );

              if (
                mode ===
                  "document"
              ) {
                window.scrollTo(
                  originalX,
                  originalY
                );

                return;
              }

              const element =
                document.querySelector(
                  `[data-clipnest-full-page-scroll="${markerValue}"]`
                );

              if (!element) {
                return;
              }

              element.scrollLeft =
                originalX;

              element.scrollTop =
                originalY;

              element.removeAttribute(
                "data-clipnest-full-page-scroll"
              );
            },

          args: [
            metrics.mode,
            marker,
            metrics.originalX,
            metrics.originalY
          ]
        });
      } catch {
      }
    }

    const dataUrl =
      encodeGeneratedCanvas(
        canvas,
        outputFormat,
        .90
      );

    await addItem({
      kind:
        "data",

      dataUrl,

      mimeType:
        generatedImageMimeType(
          outputFormat
        ),

      filename:
        `clipnest-full-page-${Date.now()}${generatedImageExtension(
          outputFormat
        )}`,

      label:
        "Entire page"
    });
  }

  async function startAreaCapture() {
    const tab =
      await getActiveTab();

    await globalThis
      .ClipNestContentScopeResume
      ?.snapshot?.(
        String(
          tab.url ||
          ""
        )
      );



    await writeDraft();


    const resumePresetId =
      String(
        document
          .getElementById(
            "notionPresetSelect"
          )
          ?.value ||
        ""
      ).trim();


    if (resumePresetId) {
      const resume =
        globalThis
          .ClipNestNotionCaptureResume
          ?.snapshot?.(
            resumePresetId,
            String(
              tab.url ||
              ""
            )
          ) ||
        {
          presetId:
            resumePresetId,

          pageUrl:
            String(
              tab.url ||
              ""
            ),

          includePageContent:
            document
              .getElementById(
                "notionIncludePageContent"
              )
              ?.checked !==
                false,

          createdAt:
            Date.now()
        };

      await chrome.storage.local.set({
        clipnestNotionCaptureResume:
          resume
      });

    } else {
    }

    await chrome.storage.local.set({
      clipnestBodyAreaContext: {
        tabId:
          tab.id,

        windowId:
          tab.windowId,

        pageUrl:
          String(
            tab.url ||
            ""
          ),

        startedAt:
          Date.now()
      }
    });

    await chrome.scripting.executeScript({
      target: {
        tabId:
          tab.id
      },

      func: () => {
        window
          .__clipnestBodyAreaCleanup
          ?.();

        const overlay =
          document.createElement(
            "div"
          );

        const selection =
          document.createElement(
            "div"
          );

        const tip =
          document.createElement(
            "div"
          );

        Object.assign(
          overlay.style,
          {
            position:
              "fixed",

            inset:
              "0",

            zIndex:
              "2147483645",

            cursor:
              "crosshair",

            background:
              "rgba(0,0,0,.04)",

            userSelect:
              "none"
          }
        );

        Object.assign(
          selection.style,
          {
            position:
              "fixed",

            zIndex:
              "2147483646",

            display:
              "none",

            pointerEvents:
              "none",

            boxSizing:
              "border-box",

            border:
              "2px solid #db5b27",

            background:
              "rgba(219,91,39,.10)"
          }
        );

        tip.textContent =
          "Drag to capture · Esc cancel";

        Object.assign(
          tip.style,
          {
            position:
              "fixed",

            zIndex:
              "2147483647",

            top:
              "14px",

            left:
              "50%",

            transform:
              "translateX(-50%)",

            padding:
              "9px 13px",

            borderRadius:
              "9px",

            background:
              "rgba(20,20,20,.95)",

            color:
              "#fff",

            pointerEvents:
              "none",

            font:
              "600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
          }
        );

        document.documentElement.append(
          overlay,
          selection,
          tip
        );

        let startX =
          null;

        let startY =
          null;

        let dragging =
          false;

        const draw =
          (
            currentX,
            currentY
          ) => {
            if (!dragging) {
              return;
            }

            const left =
              Math.min(
                startX,
                currentX
              );

            const top =
              Math.min(
                startY,
                currentY
              );

            const width =
              Math.abs(
                currentX -
                startX
              );

            const height =
              Math.abs(
                currentY -
                startY
              );

            Object.assign(
              selection.style,
              {
                display:
                  "block",

                left:
                  `${left}px`,

                top:
                  `${top}px`,

                width:
                  `${width}px`,

                height:
                  `${height}px`
              }
            );
          };

        const cleanup =
          () => {
            window.removeEventListener(
              "mousedown",
              onMouseDown,
              true
            );

            window.removeEventListener(
              "mousemove",
              onMouseMove,
              true
            );

            window.removeEventListener(
              "mouseup",
              onMouseUp,
              true
            );

            window.removeEventListener(
              "keydown",
              onKeyDown,
              true
            );

            overlay.remove();
            selection.remove();
            tip.remove();

            delete window
              .__clipnestBodyAreaCleanup;
          };

        const onMouseDown =
          (
            event
          ) => {
            if (
              event.button !==
                0
            ) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            dragging =
              true;

            startX =
              event.clientX;

            startY =
              event.clientY;

            draw(
              event.clientX,
              event.clientY
            );
          };

        const onMouseMove =
          (
            event
          ) => {
            if (!dragging) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            draw(
              event.clientX,
              event.clientY
            );
          };

        const onMouseUp =
          async (
            event
          ) => {
            if (
              !dragging
            ) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            dragging =
              false;

            const left =
              Math.min(
                startX,
                event.clientX
              );

            const top =
              Math.min(
                startY,
                event.clientY
              );

            const width =
              Math.abs(
                event.clientX -
                startX
              );

            const height =
              Math.abs(
                event.clientY -
                startY
              );

            const pending = {
              type:
                "clipnest.bodyAreaPicked",

              pageUrl:
                location.href,

              capturedAt:
                Date.now(),

              viewportWidth:
                window.innerWidth,

              viewportHeight:
                window.innerHeight,

              rect: {
                x:
                  left,

                y:
                  top,

                width,

                height
              }
            };

            /*
             * Remove ClipNest's capture UI before the
             * browser takes the screenshot, then wait
             * for Chrome to composite a clean frame.
             */
            overlay.style.display =
              "none";

            selection.style.display =
              "none";

            tip.style.display =
              "none";

            cleanup();

            if (
              width < 8 ||
              height < 8
            ) {
              return;
            }

            await new Promise(
              (resolve) =>
                requestAnimationFrame(
                  () =>
                    requestAnimationFrame(
                      resolve
                    )
                )
            );

            void chrome.runtime
              .sendMessage(
                pending
              )
              .catch(
                (error) =>
                  console.error(
                    "ClipNest area handoff failed:",
                    error
                  )
              );
          };

        const onKeyDown =
          (
            event
          ) => {
            if (
              event.key !==
                "Escape"
            ) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            cleanup();

            void chrome.storage.local.remove([
                  "clipnestBodyAreaContext"
            ]);
          };

        window.addEventListener(
          "mousedown",
          onMouseDown,
          true
        );

        window.addEventListener(
          "mousemove",
          onMouseMove,
          true
        );

        window.addEventListener(
          "mouseup",
          onMouseUp,
          true
        );

        window.addEventListener(
          "keydown",
          onKeyDown,
          true
        );

        window
          .__clipnestBodyAreaCleanup =
          cleanup;
      }
    });

    window.close();
  }

  async function startImageSelection() {

    if (
      !globalThis
        .ClipNestImagePicker
        ?.startPageSelection
    ) {
      throw new Error(
        "Page image selection is unavailable."
      );
    }

    const tab =
      await getActiveTab();

    await globalThis
      .ClipNestContentScopeResume
      ?.snapshot?.(
        String(
          tab.url ||
          ""
        )
      );



    await writeDraft();


    const resumePresetId =
      String(
        document
          .getElementById(
            "notionPresetSelect"
          )
          ?.value ||
        ""
      ).trim();


    if (resumePresetId) {
      const resume =
        globalThis
          .ClipNestNotionCaptureResume
          ?.snapshot?.(
            resumePresetId,
            String(
              tab.url ||
              ""
            )
          ) ||
        {
          presetId:
            resumePresetId,

          pageUrl:
            String(
              tab.url ||
              ""
            ),

          includePageContent:
            document
              .getElementById(
                "notionIncludePageContent"
              )
              ?.checked !==
                false,

          createdAt:
            Date.now()
        };

      await chrome.storage.local.set({
        clipnestNotionCaptureResume:
          resume
      });

    } else {
    }

    const pickerPurpose =
      document.body
        ?.dataset
        ?.destination ===
          "obsidian"
        ? "body-obsidian"
        : "body";


    await globalThis
      .ClipNestImagePicker
      .startPageSelection(
        pickerPurpose
      );


    window.close();
  }

  async function runAction(
    action,
    loadingText,
    {
      disableSave =
        false
    } = {}
  ) {
    if (busy) {
      return;
    }

    const saveButton =
      disableSave
        ? document.getElementById(
            "saveButton"
          )
        : null;

    const saveWasDisabled =
      Boolean(
        saveButton?.disabled
      );

    setBusy(
      true
    );

    if (saveButton) {
      saveButton.disabled =
        true;
    }

    setLocalStatus(
      loadingText
    );

    try {
      await action();

      menu?.classList.add(
        "hidden"
      );

      setLocalStatus(
        ""
      );
    } catch (error) {
      setLocalStatus(
        error?.message ||
        String(error),
        true
      );
    } finally {
      setBusy(
        false
      );

      if (saveButton) {
        saveButton.disabled =
          saveWasDisabled;
      }

      render();
    }
  }

  function createCaptureMenuIcon(
    iconName
  ) {
    const namespace =
      "http://www.w3.org/2000/svg";

    const svg =
      document.createElementNS(
        namespace,
        "svg"
      );

    svg.classList.add(
      "notion-body-media-menu-icon-svg"
    );

    svg.setAttribute(
      "viewBox",
      "0 0 24 24"
    );

    svg.setAttribute(
      "aria-hidden",
      "true"
    );

    svg.setAttribute(
      "focusable",
      "false"
    );

    const definitions = {
      visible: [
        [
          "rect",
          {
            x: "3",
            y: "5",
            width: "18",
            height: "13",
            rx: "2"
          }
        ],
        [
          "path",
          {
            d: "M8 21h8"
          }
        ],
        [
          "path",
          {
            d: "M12 18v3"
          }
        ]
      ],

      area: [
        [
          "path",
          {
            d: "M8 3H3v5"
          }
        ],
        [
          "path",
          {
            d: "M16 3h5v5"
          }
        ],
        [
          "path",
          {
            d: "M21 16v5h-5"
          }
        ],
        [
          "path",
          {
            d: "M8 21H3v-5"
          }
        ],
        [
          "rect",
          {
            x: "8",
            y: "8",
            width: "8",
            height: "8",
            rx: "1"
          }
        ]
      ],

      page: [
        [
          "path",
          {
            d: "M6 3h8l4 4v14H6z"
          }
        ],
        [
          "path",
          {
            d: "M14 3v5h5"
          }
        ],
        [
          "path",
          {
            d: "M9 12h6"
          }
        ],
        [
          "path",
          {
            d: "M9 16h6"
          }
        ]
      ],

      image: [
        [
          "rect",
          {
            x: "3",
            y: "5",
            width: "18",
            height: "14",
            rx: "2"
          }
        ],
        [
          "circle",
          {
            cx: "9",
            cy: "10",
            r: "1.5"
          }
        ],
        [
          "path",
          {
            d: "M5 17l4-4 3 3 2-2 5 5"
          }
        ]
      ]
    };

    const definition =
      definitions[
        iconName
      ] ||
      [];

    for (
      const [
        tag,
        attributes
      ] of definition
    ) {
      const element =
        document.createElementNS(
          namespace,
          tag
        );

      for (
        const [
          name,
          value
        ] of Object.entries(
          attributes
        )
      ) {
        element.setAttribute(
          name,
          value
        );
      }

      svg.append(
        element
      );
    }

    const wrapper =
      document.createElement(
        "span"
      );

    wrapper.className =
      "notion-body-media-menu-icon";

    wrapper.setAttribute(
      "aria-hidden",
      "true"
    );

    wrapper.append(
      svg
    );

    return wrapper;
  }

  function createMenuButton(
    label,
    iconName,
    handler
  ) {
    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "notion-body-media-menu-button";

    const icon =
      createCaptureMenuIcon(
        iconName
      );

    const copy =
      document.createElement(
        "span"
      );

    copy.className =
      "notion-body-media-menu-copy";

    copy.textContent =
      label;

    button.append(
      icon,
      copy
    );

    button.addEventListener(
      "click",
      () => {
        menu?.classList.add(
          "hidden"
        );

        addButton?.setAttribute(
          "aria-expanded",
          "false"
        );

        handler();
      }
    );

    menuButtons.push(
      button
    );

    return button;
  }

  function mount() {
    if (root) {
      return root;
    }

    const anchor =
      document.getElementById(
        "notesCompact"
      );

    if (!anchor) {
      return null;
    }

    root =
      document.createElement(
        "section"
      );

    root.id =
      "notionBodyMedia";

    root.className =
      "notion-body-media hidden";

    const label =
      document.createElement(
        "div"
      );

    label.className =
      "notion-body-media-label";

    label.textContent =
      "";

    const labelText =
      document.createElement(
        "span"
      );

    labelText.textContent =
      "Page body";

    const includeContentToggle =
      document.createElement(
        "label"
      );

    includeContentToggle.className =
      "notion-body-content-toggle";

    includeContentToggle.title =
      "Include page text in the saved note";

    const includeContentText =
      document.createElement(
        "span"
      );

    includeContentText.className =
      "notion-body-content-toggle-text";

    includeContentText.textContent =
      "Include page text";

    const includeContentInput =
      document.createElement(
        "input"
      );

    includeContentInput.id =
      "notionIncludePageContent";

    includeContentInput.type =
      "checkbox";

    includeContentInput.checked =
      true;

    const includeContentTrack =
      document.createElement(
        "span"
      );

    includeContentTrack.className =
      "notion-body-content-toggle-track";

    includeContentToggle.append(
      includeContentText,
      includeContentInput,
      includeContentTrack
    );

    includeContentInput.addEventListener(
      "change",
      async () => {
        await chrome.storage.local.set({
          clipnestNotionIncludePageContent:
            includeContentInput.checked
        });

        document.dispatchEvent(
          new CustomEvent(
            "clipnest:notion-page-content-change"
          )
        );
      }
    );

    label.append(
      labelText
    );

    void chrome.storage.local
      .get(
        "clipnestNotionIncludePageContent"
      )
      .then(
        (
          stored
        ) => {
          const remembered =
            stored
              .clipnestNotionIncludePageContent;

          includeContentInput.checked =
            typeof remembered ===
              "boolean"
              ? remembered
              : true;

          document.dispatchEvent(
            new CustomEvent(
              "clipnest:notion-page-content-change"
            )
          );
        }
      );

    previews =
      document.createElement(
        "div"
      );

    previews.className =
      "notion-body-media-previews hidden";

    addButton =
      document.createElement(
        "button"
      );

    addButton.type =
      "button";

    addButton.className =
      "notion-body-media-add";

    addButton.textContent =
      "+ Capture image";

    addButton.setAttribute(
      "aria-expanded",
      "false"
    );

    addButton.setAttribute(
      "aria-controls",
      "clipnestBodyMediaMenu"
    );

    menu =
      document.createElement(
        "div"
      );

    menu.className =
      "notion-body-media-menu hidden";

    menu.id =
      "clipnestBodyMediaMenu";

    menu.setAttribute(
      "role",
      "menu"
    );

    const selectImage =
      createMenuButton(
        "Select image from page",
        "image",
        () =>
          runAction(
            startImageSelection,
            "Starting image picker…"
          )
      );

    const visibleArea =
      createMenuButton(
        "Visible area",
        "visible",
        () =>
          runAction(
            captureVisibleArea,
            "Capturing visible area…"
          )
      );

    const selectArea =
      createMenuButton(
        "Select area",
        "area",
        () =>
          runAction(
            startAreaCapture,
            "Starting area selection…"
          )
      );

    const entirePage =
      createMenuButton(
        "Capture whole page",
        "page",
        () =>
          runAction(
            captureEntirePage,
            "Capturing entire page…",
            {
              disableSave:
                true
            }
          )
      );

    /*
     * CAPTURE MENU ORDER - 1.9.31
     *
     * Keep the most immediate and targeted capture choices
     * together, with whole-page capture last.
     *
     * Visible area
     * Select area
     * Select image from page
     * Capture whole page
     */
    menu.append(
      visibleArea,
      selectArea,
      selectImage,
      entirePage
    );

    const actionWrap =
      document.createElement(
        "div"
      );

    actionWrap.className =
      "notion-body-media-action-wrap";

    actionWrap.append(
      addButton,
      menu
    );

    status =
      document.createElement(
        "div"
      );

    status.className =
      "notion-body-media-status hidden";

    const setMenuOpen = (
      open
    ) => {
      const next =
        Boolean(open);

      menu.classList.remove(
        "open-up"
      );

      menu.classList.toggle(
        "hidden",
        !next
      );

      addButton.setAttribute(
        "aria-expanded",
        next
          ? "true"
          : "false"
      );

      if (!next) {
        return;
      }

      const buttonRect =
        addButton.getBoundingClientRect();

      const menuHeight =
        menu.getBoundingClientRect()
          .height;

      const viewportHeight =
        document.documentElement
          .clientHeight;

      const spaceBelow =
        viewportHeight -
        buttonRect.bottom -
        12;

      const spaceAbove =
        buttonRect.top -
        12;

      if (
        menuHeight > spaceBelow &&
        spaceAbove > spaceBelow
      ) {
        menu.classList.add(
          "open-up"
        );
      }
    };

    addButton.addEventListener(
      "click",
      () => {
        const open =
          addButton.getAttribute(
            "aria-expanded"
          ) ===
            "true";

        setMenuOpen(
          !open
        );

        setLocalStatus(
          ""
        );
      }
    );

    document.addEventListener(
      "click",
      (event) => {
        if (
          menu.classList.contains(
            "hidden"
          ) ||
          actionWrap.contains(
            event.target
          )
        ) {
          return;
        }

        setMenuOpen(
          false
        );
      }
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key !==
            "Escape" ||
          menu.classList.contains(
            "hidden"
          )
        ) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        setMenuOpen(
          false
        );

        addButton.focus();
      },
      true
    );

    root.append(
      label,
      includeContentToggle,
      previews,
      actionWrap,
      status
    );

    anchor.parentNode
      .insertBefore(
        root,
        anchor
      );

    render();

    void pruneDrafts()
      .catch(
        () => {}
      );

    return root;
  }

  async function restorePending(
    pageUrl
  ) {
    mount();

    currentPageUrl =
      String(
        pageUrl ||
        ""
      );

    items =
      [];

    currentNotionPresetId =
      "";

    if (
      currentPageUrl
    ) {
      try {
        const draft =
          await readDraft(
            currentPageUrl
          );

        if (
          draft &&
          Date.now() -
            Number(
              draft.updatedAt ||
              0
            ) <
              DRAFT_TTL &&
          Array.isArray(
            draft.items
          )
        ) {
          items =
            draft.items
              .map(
                normalizeItem
              )
              .filter(Boolean)
              .slice(
                0,
                MAX_ITEMS
              );

          currentNotionPresetId =
            String(
              draft.notionPresetId ||
              ""
            ).trim();
        }
      } catch {
      }
    }

    const stored =
      await chrome.storage.local
        .get([
          "clipnestPickedBodyImage",
          "clipnestPickedBodyArea",
          "clipnestBodyAreaError",
          "clipnestNotionCaptureResume"
        ]);

    const notionCaptureResume =
      stored
        .clipnestNotionCaptureResume;


    if (
      document.body
        ?.dataset
        ?.destination ===
          "notion" &&
      notionCaptureResume &&
      typeof notionCaptureResume ===
        "object"
    ) {
      const resumePresetId =
        String(
          notionCaptureResume
            .presetId ||
          ""
        ).trim();

      if (resumePresetId) {
        currentNotionPresetId =
          resumePresetId;
      }
    }

    const areaError =
      stored
        .clipnestBodyAreaError;

    if (
      areaError &&
      Date.now() -
        Number(
          areaError.capturedAt ||
          0
        ) <
          5 * 60 * 1000
    ) {
      setLocalStatus(
        String(
          areaError.message ||
          "Could not capture the selected area."
        ),
        true
      );

      await chrome.storage.local
        .remove(
          "clipnestBodyAreaError"
        );
    }

    const outputFormat =
      await getGeneratedImageFormat();

    const pickedImage =
      stored
        .clipnestPickedBodyImage;

    if (
      pickedImage &&
      Date.now() -
        Number(
          pickedImage
            .capturedAt ||
          0
        ) <
          5 * 60 * 1000 &&
      (
        !pickedImage.pageUrl ||
        !currentPageUrl ||
        pickedImage.pageUrl ===
          currentPageUrl
      )
    ) {
      if (
        /^data:image\//i.test(
          String(
            pickedImage.dataUrl ||
            ""
          )
        )
      ) {
        const cropped =
          await cropScreenshot(
            pickedImage.dataUrl,
            pickedImage,
            outputFormat
          );

        await addItem({
          kind:
            "data",

          dataUrl:
            cropped,

          mimeType:
            generatedImageMimeType(
              outputFormat
            ),

          filename:
            `clipnest-image-${Date.now()}${generatedImageExtension(
              outputFormat
            )}`,

          label:
            "Selected image"
        });
      } else {
        await addItem({
          kind:
            "external",

          url:
            pickedImage.url,

          filename:
            filenameFromUrl(
              pickedImage.url
            ),

          label:
            "Selected image"
        });
      }

      await chrome.storage.local
        .remove(
          "clipnestPickedBodyImage"
        );
    }

    const pickedArea =
      stored
        .clipnestPickedBodyArea;

    if (
      pickedArea &&
      Date.now() -
        Number(
          pickedArea
            .capturedAt ||
          0
        ) <
          5 * 60 * 1000 &&
      (
        !pickedArea.pageUrl ||
        !currentPageUrl ||
        pickedArea.pageUrl ===
          currentPageUrl
      )
    ) {
      const cropped =
        await cropScreenshot(
          pickedArea.dataUrl,
          pickedArea,
          outputFormat
        );

      await addItem({
        kind:
          "data",

        dataUrl:
          cropped,

        mimeType:
          generatedImageMimeType(
            outputFormat
          ),

        filename:
          `clipnest-area-${Date.now()}${generatedImageExtension(
            outputFormat
          )}`,

        label:
          "Selected area"
      });

      await chrome.storage.local
        .remove(
          "clipnestPickedBodyArea"
        );
    }

    render();

    try {
      await writeDraft();
    } catch {
    }
  }

  function setVisible(
    visible
  ) {
    mount();

    root?.classList.toggle(
      "hidden",
      !visible
    );

    if (!visible) {
      menu?.classList.add(
        "hidden"
      );
    }
  }

  function getItems() {
    return items
      .slice(
        0,
        MAX_ITEMS
      )
      .map(
        (item) => {
          if (
            item.kind ===
              "external"
          ) {
            return {
              kind:
                "external",

              url:
                item.url,

              filename:
                item.filename,

              label:
                item.label
            };
          }

          return {
            kind:
              "data",

            dataUrl:
              item.dataUrl,

            mimeType:
              item.mimeType,

            filename:
              item.filename,

            label:
              item.label
          };
        }
      );
  }

  /*
   * AUTHORITATIVE NOTION PRESET OWNER - 1.9.11
   *
   * The visible Notion preset screen is the authoritative
   * source of body-media draft ownership.
   *
   * Previously currentNotionPresetId was only populated by
   * restorePending() from an older IndexedDB draft or from a
   * temporary capture-resume token. On a fresh page this left
   * the first body-media draft with notionPresetId: "".
   *
   * showNotionPresetClip() now explicitly supplies the real
   * open preset ID here.
   */
  async function setNotionPresetId(
    presetId
  ) {
    const normalizedPresetId =
      String(
        presetId ||
        ""
      ).trim();

    if (!normalizedPresetId) {
      return;
    }

    currentNotionPresetId =
      normalizedPresetId;

    /*
     * No media yet means there is no IndexedDB draft to update.
     * Keep the owner in memory and addItem() will persist it
     * together with the first captured image.
     */
    if (
      !items.length ||
      !currentPageUrl
    ) {
      return;
    }

    /*
     * Media already exists. This also repairs older drafts that
     * contain images but were persisted without a preset owner.
     */
    try {
      await writeDraft();
    } catch {
    }
  }

  function getPendingNotionPresetId() {
    if (
      !items.length
    ) {
      return "";
    }

    return String(
      currentNotionPresetId ||
      ""
    ).trim();
  }

  async function clear() {
    const pageUrl =
      currentPageUrl;

    items =
      [];

    currentNotionPresetId =
      "";

    render();

    await Promise.allSettled([
      deleteDraft(
        pageUrl
      ),

      chrome.storage.local
        .remove([
          "clipnestPickedBodyImage",
          "clipnestPickedBodyArea",
          "clipnestBodyAreaContext",
          "clipnestBodyAreaError"
        ])
    ]);
  }

  mount();

  const api =
    Object.freeze({
      setVisible,
      restorePending,
      setNotionPresetId,
      getItems,
      getPendingNotionPresetId,
      clear
    });

  globalThis
    .ClipNestBodyMedia =
    api;

  globalThis
    .ClipNestNotionBodyMedia =
    api;
})();
