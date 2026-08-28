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

  async function cropScreenshot(
    dataUrl,
    info
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

    return canvas.toDataURL(
      "image/jpeg",
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

    const dataUrl =
      await chrome.tabs
        .captureVisibleTab(
          tab.windowId,
          {
            format:
              "jpeg",

            quality:
              92
          }
        );

    if (!dataUrl) {
      throw new Error(
        "Could not capture the visible page."
      );
    }

    await addItem({
      kind:
        "data",

      dataUrl,

      mimeType:
        "image/jpeg",

      filename:
        `clipnest-visible-${Date.now()}.jpg`,

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
                  window.innerHeight
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
                  window.innerHeight
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

    const outputWidth =
      Math.min(
        metrics.pageWidth,
        1200
      );

    const outputScale =
      outputWidth /
      metrics.pageWidth;

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
      canvas.toDataURL(
        "image/jpeg",
        .90
      );

    await addItem({
      kind:
        "data",

      dataUrl,

      mimeType:
        "image/jpeg",

      filename:
        `clipnest-full-page-${Date.now()}.jpg`,

      label:
        "Entire page"
    });
  }

  async function startAreaCapture() {
    const tab =
      await getActiveTab();

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
      await chrome.storage.local.set({
        clipnestNotionCaptureResume: {
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
        }
      });
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
          (
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

            cleanup();

            if (
              width < 8 ||
              height < 8
            ) {
              return;
            }

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
        .ClipNestNotionImagePicker
        ?.startPageSelection
    ) {
      throw new Error(
        "Page image selection is unavailable."
      );
    }

    const tab =
      await getActiveTab();

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
      await chrome.storage.local.set({
        clipnestNotionCaptureResume: {
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
        }
      });
    }

    await globalThis
      .ClipNestNotionImagePicker
      .startPageSelection(
        "body"
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

  function createMenuButton(
    label,
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

    const copy =
      document.createElement(
        "span"
      );

    copy.textContent =
      label;

    button.append(
      copy
    );

    button.addEventListener(
      "click",
      handler
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
      "Include the clipped article text in the Notion page body";

    const includeContentText =
      document.createElement(
        "span"
      );

    includeContentText.className =
      "notion-body-content-toggle-text";

    includeContentText.textContent =
      "Include clipped page text";

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

    menu =
      document.createElement(
        "div"
      );

    menu.className =
      "notion-body-media-menu hidden";

    const selectImage =
      createMenuButton(
        "Select Image",
        () =>
          runAction(
            startImageSelection,
            "Starting image picker…"
          )
      );

    const visibleArea =
      createMenuButton(
        "Capture Visible Area",
        () =>
          runAction(
            captureVisibleArea,
            "Capturing visible area…"
          )
      );

    const selectArea =
      createMenuButton(
        "Select Area to Capture",
        () =>
          runAction(
            startAreaCapture,
            "Starting area selection…"
          )
      );

    const entirePage =
      createMenuButton(
        "Capture Entire Page",
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

    menu.append(
      selectImage,
      visibleArea,
      selectArea,
      entirePage
    );

    status =
      document.createElement(
        "div"
      );

    status.className =
      "notion-body-media-status hidden";

    addButton.addEventListener(
      "click",
      () => {
        menu.classList.toggle(
          "hidden"
        );

        setLocalStatus(
          ""
        );
      }
    );

    root.append(
      label,
      includeContentToggle,
      previews,
      addButton,
      menu,
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
        }
      } catch {
      }
    }

    const stored =
      await chrome.storage.local
        .get([
          "clipnestPickedBodyImage",
          "clipnestPickedBodyArea",
          "clipnestBodyAreaError"
        ]);

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
          pickedArea
        );

      await addItem({
        kind:
          "data",

        dataUrl:
          cropped,

        mimeType:
          "image/jpeg",

        filename:
          `clipnest-area-${Date.now()}.jpg`,

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

  async function clear() {
    const pageUrl =
      currentPageUrl;

    items =
      [];

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

  globalThis
    .ClipNestNotionBodyMedia =
    Object.freeze({
      setVisible,
      restorePending,
      getItems,
      clear
    });
})();
