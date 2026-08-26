(() => {
  "use strict";

  let pageCandidatesPromise =
    null;

  function normalizeImageUrl(
    value
  ) {
    const raw =
      String(
        value ||
        ""
      ).trim();

    if (
      !/^https?:\/\//i.test(
        raw
      )
    ) {
      return "";
    }

    try {
      const url =
        new URL(raw);

      if (
        url.protocol !==
          "http:" &&
        url.protocol !==
          "https:"
      ) {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  async function collectPageImages() {
    if (
      pageCandidatesPromise
    ) {
      return pageCandidatesPromise;
    }

    pageCandidatesPromise =
      (async () => {
        try {
          const tabs =
            await chrome.tabs.query({
              active:
                true,

              currentWindow:
                true
            });

          const tabId =
            tabs?.[0]?.id;

          if (
            !Number.isInteger(
              tabId
            )
          ) {
            return [];
          }

          const result =
            await chrome.scripting
              .executeScript({
                target: {
                  tabId
                },

                func: () => {
                  const found =
                    [];

                  const seen =
                    new Set();

                  const add = (
                    raw,
                    score = 0,
                    label = ""
                  ) => {
                    const source =
                      String(
                        raw ||
                        ""
                      ).trim();

                    if (!source) {
                      return;
                    }

                    let url;

                    try {
                      url =
                        new URL(
                          source,
                          document.baseURI
                        );
                    } catch {
                      return;
                    }

                    if (
                      url.protocol !==
                        "http:" &&
                      url.protocol !==
                        "https:"
                    ) {
                      return;
                    }

                    const value =
                      url.href;

                    if (
                      seen.has(
                        value
                      )
                    ) {
                      return;
                    }

                    seen.add(
                      value
                    );

                    found.push({
                      url:
                        value,

                      score:
                        Number(
                          score
                        ) || 0,

                      label:
                        String(
                          label ||
                          ""
                        ).trim()
                    });
                  };

                  const metaSelectors = [
                    'meta[property="og:image"]',
                    'meta[property="og:image:url"]',
                    'meta[property="og:image:secure_url"]',
                    'meta[name="twitter:image"]',
                    'meta[name="twitter:image:src"]',
                    'meta[itemprop="image"]'
                  ];

                  metaSelectors
                    .forEach(
                      (
                        selector,
                        index
                      ) => {
                        document
                          .querySelectorAll(
                            selector
                          )
                          .forEach(
                            (
                              node,
                              itemIndex
                            ) => {
                              add(
                                node.content,
                                1_000_000_000 -
                                  index *
                                    10_000 -
                                  itemIndex,
                                "Page image"
                              );
                            }
                          );
                      }
                    );

                  [
                    ...document.images
                  ].forEach(
                    (
                      image,
                      index
                    ) => {
                      const rect =
                        image
                          .getBoundingClientRect();

                      const width =
                        Math.max(
                          Number(
                            image.naturalWidth ||
                            0
                          ),
                          Number(
                            rect.width ||
                            0
                          )
                        );

                      const height =
                        Math.max(
                          Number(
                            image.naturalHeight ||
                            0
                          ),
                          Number(
                            rect.height ||
                            0
                          )
                        );

                      if (
                        width < 90 ||
                        height < 90
                      ) {
                        return;
                      }

                      const area =
                        width *
                        height;

                      add(
                        image.currentSrc ||
                          image.src,
                        area -
                          index,
                        image.alt
                      );
                    }
                  );

                  return found
                    .sort(
                      (a, b) =>
                        b.score -
                        a.score
                    )
                    .slice(
                      0,
                      40
                    );
                }
              });

          const values =
            Array.isArray(
              result?.[0]?.result
            )
              ? result[0].result
              : [];

          return values
            .map(
              (item) => ({
                url:
                  normalizeImageUrl(
                    item?.url
                  ),

                label:
                  String(
                    item?.label ||
                    ""
                  ).trim()
              })
            )
            .filter(
              (item) =>
                item.url
            );
        } catch (
          error
        ) {
          console.warn(
            "ClipNest could not scan page images:",
            error
          );

          return [];
        }
      })();

    return pageCandidatesPromise;
  }


  async function captureVisibleImagePreview(
    targetUrl
  ) {
    const normalized =
      normalizeImageUrl(
        targetUrl
      );

    if (!normalized) {
      return "";
    }

    try {
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
        )
      ) {
        return "";
      }

      const rectResult =
        await chrome.scripting
          .executeScript({
            target: {
              tabId:
                tab.id
            },

            func: (
              wantedUrl
            ) => {
              const normalize =
                (raw) => {
                  try {
                    const url =
                      new URL(
                        raw,
                        document.baseURI
                      );

                    const path =
                      url.pathname
                        .replace(
                          /\._[^/]*_\.(?=[A-Za-z0-9]+$)/g,
                          "."
                        );

                    return {
                      href:
                        url.href,

                      key:
                        url.hostname +
                        path
                    };
                  } catch {
                    return {
                      href:
                        "",

                      key:
                        ""
                    };
                  }
                };

              const wanted =
                normalize(
                  wantedUrl
                );

              const viewportWidth =
                window.innerWidth;

              const viewportHeight =
                window.innerHeight;

              const candidates =
                [
                  ...document.images
                ]
                  .map(
                    (
                      image,
                      index
                    ) => {
                      const rect =
                        image
                          .getBoundingClientRect();

                      const width =
                        Math.max(
                          0,
                          Math.min(
                            rect.right,
                            viewportWidth
                          ) -
                          Math.max(
                            rect.left,
                            0
                          )
                        );

                      const height =
                        Math.max(
                          0,
                          Math.min(
                            rect.bottom,
                            viewportHeight
                          ) -
                          Math.max(
                            rect.top,
                            0
                          )
                        );

                      if (
                        width < 60 ||
                        height < 60
                      ) {
                        return null;
                      }

                      const src =
                        normalize(
                          image.currentSrc ||
                          image.src
                        );

                      const ratio =
                        width /
                        Math.max(
                          height,
                          1
                        );

                      const shapePenalty =
                        ratio > 3 ||
                        ratio < .25
                          ? .15
                          : 1;

                      return {
                        index,

                        href:
                          src.href,

                        key:
                          src.key,

                        x:
                          Math.max(
                            rect.left,
                            0
                          ),

                        y:
                          Math.max(
                            rect.top,
                            0
                          ),

                        width,

                        height,

                        score:
                          width *
                          height *
                          shapePenalty
                      };
                    }
                  )
                  .filter(Boolean);

              let selected =
                candidates.find(
                  (candidate) =>
                    candidate.href ===
                    wanted.href
                );

              if (
                !selected &&
                wanted.key
              ) {
                selected =
                  candidates.find(
                    (candidate) =>
                      candidate.key ===
                      wanted.key
                  );
              }

              if (!selected) {
                selected =
                  [...candidates]
                    .sort(
                      (a, b) =>
                        b.score -
                        a.score
                    )[0] ||
                  null;
              }

              if (!selected) {
                return null;
              }

              return {
                x:
                  selected.x,

                y:
                  selected.y,

                width:
                  selected.width,

                height:
                  selected.height,

                viewportWidth,

                viewportHeight
              };
            },

            args: [
              normalized
            ]
          });

      const info =
        rectResult?.[0]?.result;

      if (
        !info ||
        !info.width ||
        !info.height ||
        !info.viewportWidth ||
        !info.viewportHeight
      ) {
        return "";
      }

      const screenshot =
        await chrome.tabs
          .captureVisibleTab(
            tab.windowId,
            {
              format:
                "jpeg",

              quality:
                86
            }
          );

      if (!screenshot) {
        return "";
      }

      const shot =
        document.createElement(
          "img"
        );

      await new Promise(
        (
          resolve,
          reject
        ) => {
          shot.onload =
            resolve;

          shot.onerror =
            reject;

          shot.src =
            screenshot;
        }
      );

      const scaleX =
        shot.naturalWidth /
        info.viewportWidth;

      const scaleY =
        shot.naturalHeight /
        info.viewportHeight;

      const sourceX =
        Math.max(
          0,
          Math.round(
            info.x *
            scaleX
          )
        );

      const sourceY =
        Math.max(
          0,
          Math.round(
            info.y *
            scaleY
          )
        );

      const sourceWidth =
        Math.min(
          shot.naturalWidth -
            sourceX,
          Math.max(
            1,
            Math.round(
              info.width *
              scaleX
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
              info.height *
              scaleY
            )
          )
        );

      if (
        sourceWidth < 20 ||
        sourceHeight < 20
      ) {
        return "";
      }

      const maxSize =
        360;

      const outputScale =
        Math.min(
          1,
          maxSize /
            sourceWidth,
          maxSize /
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
        return "";
      }

      context.drawImage(
        shot,
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
        .86
      );
    } catch (
      error
    ) {
      console.warn(
        "ClipNest could not create a local image preview:",
        error
      );

      return "";
    }
  }

  function create({
    detectedImage = "",
    initialValue = "",
    onChange =
      () => {}
  } = {}) {
    const control =
      document.createElement(
        "div"
      );

    control.className =
      "notion-image-picker";

    let selected =
      normalizeImageUrl(
        initialValue
      ) ||
      normalizeImageUrl(
        detectedImage
      );

    const row =
      document.createElement(
        "div"
      );

    row.className =
      "notion-image-picker-row";

    const preview =
      document.createElement(
        "button"
      );

    preview.type =
      "button";

    preview.className =
      "notion-image-selected";

    preview.title =
      "Choose another image";

    const add =
      document.createElement(
        "button"
      );

    add.type =
      "button";

    add.className =
      "notion-image-add";

    add.textContent =
      "+";

    add.title =
      "Choose image";

    add.setAttribute(
      "aria-label",
      "Choose image"
    );

    const clear =
      document.createElement(
        "button"
      );

    clear.type =
      "button";

    clear.className =
      "notion-image-clear";

    clear.textContent =
      "×";

    clear.title =
      "Remove image";

    clear.setAttribute(
      "aria-label",
      "Remove image"
    );

    const menu =
      document.createElement(
        "div"
      );

    menu.className =
      "notion-image-menu hidden";

    const header =
      document.createElement(
        "div"
      );

    header.className =
      "notion-image-menu-header";

    const heading =
      document.createElement(
        "strong"
      );

    heading.textContent =
      "Choose image";

    const close =
      document.createElement(
        "button"
      );

    close.type =
      "button";

    close.className =
      "notion-image-menu-close";

    close.textContent =
      "×";

    close.setAttribute(
      "aria-label",
      "Close image picker"
    );

    header.append(
      heading,
      close
    );

    const gallery =
      document.createElement(
        "div"
      );

    gallery.className =
      "notion-image-gallery";

    menu.append(
      header,
      gallery
    );

    function notify() {
      onChange(
        selected
      );
    }

    function renderPreview() {
      preview.replaceChildren();

      clear.hidden =
        !selected;

      if (!selected) {
        const empty =
          document.createElement(
            "span"
          );

        empty.className =
          "notion-image-empty";

        empty.textContent =
          "No image";

        preview.append(
          empty
        );

        return;
      }

      const image =
        document.createElement(
          "img"
        );

      image.src =
        selected;

      image.alt =
        "Selected image";

      image.referrerPolicy =
        "no-referrer";

      image.addEventListener(
        "error",
        async () => {
          const requestedUrl =
            selected;

          preview.classList.add(
            "image-error"
          );

          const fallback =
            await captureVisibleImagePreview(
              requestedUrl
            );

          if (
            requestedUrl !==
              selected
          ) {
            return;
          }

          if (fallback) {
            const localImage =
              document.createElement(
                "img"
              );

            localImage.src =
              fallback;

            localImage.alt =
              "Selected image";

            preview.replaceChildren(
              localImage
            );

            preview.classList.remove(
              "image-error"
            );

            return;
          }

          const status =
            document.createElement(
              "span"
            );

          status.className =
            "notion-image-empty";

          status.textContent =
            "Image detected";

          preview.replaceChildren(
            status
          );
        },
        {
          once:
            true
        }
      );

      image.addEventListener(
        "load",
        () => {
          preview.classList.remove(
            "image-error"
          );
        }
      );

      preview.append(
        image
      );
    }

    function choose(
      value
    ) {
      selected =
        normalizeImageUrl(
          value
        );

      notify();
      renderPreview();

      menu.classList.add(
        "hidden"
      );
    }

    async function renderGallery() {
      gallery.replaceChildren();

      const loading =
        document.createElement(
          "div"
        );

      loading.className =
        "notion-image-gallery-status";

      loading.textContent =
        "Finding images…";

      gallery.append(
        loading
      );

      const detected =
        normalizeImageUrl(
          detectedImage
        );

      const pageImages =
        await collectPageImages();

      const candidates =
        [];

      const seen =
        new Set();

      const append = (
        url,
        label = ""
      ) => {
        const normalized =
          normalizeImageUrl(
            url
          );

        if (
          !normalized ||
          seen.has(
            normalized
          )
        ) {
          return;
        }

        seen.add(
          normalized
        );

        candidates.push({
          url:
            normalized,

          label:
            String(
              label ||
              ""
            ).trim()
        });
      };

      append(
        selected,
        "Selected image"
      );

      append(
        detected,
        "Detected page image"
      );

      pageImages
        .forEach(
          (item) => {
            append(
              item.url,
              item.label
            );
          }
        );

      gallery.replaceChildren();

      if (
        !candidates.length
      ) {
        const empty =
          document.createElement(
            "div"
          );

        empty.className =
          "notion-image-gallery-status";

        empty.textContent =
          "No usable images found on this page.";

        gallery.append(
          empty
        );

        return;
      }

      for (
        const [
          index,
          candidate
        ] of
          candidates.entries()
      ) {
        const tile =
          document.createElement(
            "button"
          );

        tile.type =
          "button";

        tile.className =
          "notion-image-option";

        tile.classList.toggle(
          "selected",
          candidate.url ===
            selected
        );

        tile.title =
          candidate.label ||
          `Image ${index + 1}`;

        const image =
          document.createElement(
            "img"
          );

        image.src =
          candidate.url;

        image.alt =
          candidate.label ||
          "";

        image.referrerPolicy =
          "no-referrer";

        image.addEventListener(
          "error",
          () => {
            tile.remove();
          },
          {
            once:
              true
          }
        );

        tile.append(
          image
        );

        tile.addEventListener(
          "click",
          () => {
            choose(
              candidate.url
            );
          }
        );

        gallery.append(
          tile
        );
      }
    }

    function openMenu() {
      const opening =
        menu.classList.contains(
          "hidden"
        );

      if (!opening) {
        menu.classList.add(
          "hidden"
        );

        return;
      }

      menu.classList.remove(
        "hidden"
      );

      void renderGallery();
    }

    preview.addEventListener(
      "click",
      openMenu
    );

    add.addEventListener(
      "click",
      openMenu
    );

    clear.addEventListener(
      "click",
      () => {
        choose(
          ""
        );
      }
    );

    close.addEventListener(
      "click",
      () => {
        menu.classList.add(
          "hidden"
        );
      }
    );

    document.addEventListener(
      "click",
      (event) => {
        if (
          !control.contains(
            event.target
          )
        ) {
          menu.classList.add(
            "hidden"
          );
        }
      }
    );

    row.append(
      preview,
      add,
      clear
    );

    control.append(
      row,
      menu
    );

    renderPreview();
    notify();

    return control;
  }

  globalThis
    .ClipNestNotionImagePicker =
    Object.freeze({
      create
    });
})();
