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

      /*
       * A product page is not an image.
       * This previously allowed URLs such as
       * amazon.com/dp/B08H7Y414K to reach Notion.
       */
      if (
        /(^|\.)amazon\./i.test(
          url.hostname
        ) &&
        /^\/(?:dp|gp\/product)\//i.test(
          url.pathname
        )
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

                  const bestImageSource = (
                    image
                  ) => {
                    if (!image) {
                      return "";
                    }

                    const highResolution =
                      String(
                        image.getAttribute(
                          "data-old-hires"
                        ) ||
                        ""
                      ).trim();

                    if (highResolution) {
                      return highResolution;
                    }

                    const dynamic =
                      String(
                        image.getAttribute(
                          "data-a-dynamic-image"
                        ) ||
                        ""
                      ).trim();

                    if (dynamic) {
                      try {
                        const parsed =
                          JSON.parse(
                            dynamic
                          );

                        const candidates =
                          Object.entries(
                            parsed
                          )
                            .map(
                              ([
                                url,
                                dimensions
                              ]) => ({
                                url,

                                area:
                                  Number(
                                    dimensions?.[0] ||
                                    0
                                  ) *
                                  Number(
                                    dimensions?.[1] ||
                                    0
                                  )
                              })
                            )
                            .sort(
                              (a, b) =>
                                b.area -
                                a.area
                            );

                        if (
                          candidates[0]
                            ?.url
                        ) {
                          return candidates[0]
                            .url;
                        }
                      } catch {
                      }
                    }

                    return (
                      image.currentSrc ||
                      image.src ||
                      image.getAttribute(
                        "src"
                      ) ||
                      ""
                    );
                  };

                  /*
                   * Amazon uses product-specific image
                   * elements instead of relying on useful
                   * Open Graph metadata consistently.
                   */
                  if (
                    /(^|\\.)amazon\\./i.test(
                      location.hostname
                    )
                  ) {
                    [
                      "#ebooksImgBlkFront",
                      "#imgBlkFront",
                      "#landingImage",
                      "#imgTagWrapperId img",
                      "#main-image-container img"
                    ].forEach(
                      (
                        selector,
                        index
                      ) => {
                        const image =
                          document.querySelector(
                            selector
                          );

                        if (!image) {
                          return;
                        }

                        add(
                          bestImageSource(
                            image
                          ),
                          4_000_000_000 -
                            index *
                              10_000,
                          "Amazon product image"
                        );
                      }
                    );
                  }

                  /*
                   * Product pages need stronger ranking than
                   * generic image area.
                   *
                   * Amazon in particular can expose many large
                   * recommendation/product images while the
                   * actual book/product image is smaller.
                   */
                  const preferredImageSource = (
                    image
                  ) => {
                    if (!image) {
                      return "";
                    }

                    const oldHires =
                      String(
                        image.getAttribute(
                          "data-old-hires"
                        ) ||
                        ""
                      ).trim();

                    if (oldHires) {
                      return oldHires;
                    }

                    const dynamic =
                      String(
                        image.getAttribute(
                          "data-a-dynamic-image"
                        ) ||
                        ""
                      ).trim();

                    if (dynamic) {
                      try {
                        const parsed =
                          JSON.parse(
                            dynamic
                          );

                        const candidates =
                          Object.entries(
                            parsed
                          )
                            .map(
                              ([url, size]) => ({
                                url,

                                area:
                                  Array.isArray(
                                    size
                                  )
                                    ? (
                                        Number(
                                          size[0]
                                        ) || 0
                                      ) *
                                      (
                                        Number(
                                          size[1]
                                        ) || 0
                                      )
                                    : 0
                              })
                            )
                            .sort(
                              (a, b) =>
                                b.area -
                                a.area
                            );

                        if (
                          candidates[0]
                            ?.url
                        ) {
                          return (
                            candidates[0]
                              .url
                          );
                        }
                      } catch {
                        // Fall through.
                      }
                    }

                    return (
                      image.currentSrc ||
                      image.src ||
                      image.getAttribute(
                        "data-src"
                      ) ||
                      ""
                    );
                  };

                  const host =
                    location.hostname
                      .toLowerCase();

                  const isAmazon =
                    host ===
                      "amazon.com" ||
                    host.endsWith(
                      ".amazon.com"
                    );

                  if (isAmazon) {
                    const productSelectors = [
                      "#landingImage",
                      "#ebooksImgBlkFront",
                      "#imgBlkFront",
                      "#imgTagWrapperId img",
                      "#main-image-container img",
                      "#imageBlock img"
                    ];

                    productSelectors.forEach(
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
                              image,
                              imageIndex
                            ) => {
                              add(
                                preferredImageSource(
                                  image
                                ),
                                3_000_000_000 -
                                  index *
                                    10_000 -
                                  imageIndex,
                                image.alt ||
                                  "Product image"
                              );
                            }
                          );
                      }
                    );

                    /*
                     * Kindle/Amazon layouts vary.
                     * If the canonical selectors miss,
                     * strongly prefer an image whose alt
                     * text resembles the actual product title.
                     */
                    const productTitle =
                      String(
                        document
                          .querySelector(
                            "#productTitle, #ebooksProductTitle"
                          )
                          ?.textContent ||
                        ""
                      )
                        .replace(
                          /\s+/g,
                          " "
                        )
                        .trim()
                        .toLowerCase();

                    const titleWords =
                      new Set(
                        productTitle
                          .split(
                            /[^a-z0-9]+/i
                          )
                          .filter(
                            (word) =>
                              word.length >=
                                3
                          )
                      );

                    if (
                      titleWords.size >=
                        3
                    ) {
                      [
                        ...document.images
                      ].forEach(
                        (
                          image,
                          index
                        ) => {
                          const alt =
                            String(
                              image.alt ||
                              ""
                            )
                              .replace(
                                /\s+/g,
                                " "
                              )
                              .trim()
                              .toLowerCase();

                          if (!alt) {
                            return;
                          }

                          const altWords =
                            new Set(
                              alt
                                .split(
                                  /[^a-z0-9]+/i
                                )
                                .filter(
                                  (word) =>
                                    word.length >=
                                      3
                                )
                            );

                          let matches =
                            0;

                          for (
                            const word of
                              titleWords
                          ) {
                            if (
                              altWords.has(
                                word
                              )
                            ) {
                              matches +=
                                1;
                            }
                          }

                          const overlap =
                            matches /
                            Math.max(
                              1,
                              Math.min(
                                titleWords.size,
                                12
                              )
                            );

                          if (
                            matches >=
                              3 &&
                            overlap >=
                              .35
                          ) {
                            add(
                              preferredImageSource(
                                image
                              ),
                              2_500_000_000 +
                                matches *
                                  100_000 -
                                index,
                              image.alt
                            );
                          }
                        }
                      );
                    }
                  }

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
                        bestImageSource(
                          image
                        ),
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

  async function startClipNestPageImageSelection(purpose = "property") {
    const tabs =
      await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

    const tab =
      tabs?.[0];

    if (
      !Number.isInteger(
        tab?.id
      )
    ) {
      throw new Error(
        "Could not access the current webpage."
      );
    }

    await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },

      func: (pickerPurpose) => {
        if (
          window
            .__clipnestImagePickerCleanup
        ) {
          window
            .__clipnestImagePickerCleanup();
        }

        const OVERLAY_ID =
          "__clipnestImagePickerOverlay";

        const TIP_ID =
          "__clipnestImagePickerTip";

        document
          .getElementById(
            OVERLAY_ID
          )
          ?.remove();

        document
          .getElementById(
            TIP_ID
          )
          ?.remove();

        const overlay =
          document.createElement(
            "div"
          );

        overlay.id =
          OVERLAY_ID;

        Object.assign(
          overlay.style,
          {
            position: "fixed",
            zIndex: "2147483646",
            pointerEvents: "none",
            border:
              "3px solid #db5b27",
            background:
              "rgba(219,91,39,.10)",
            borderRadius: "6px",
            boxSizing: "border-box",
            display: "none"
          }
        );

        const tip =
          document.createElement(
            "div"
          );

        tip.id =
          TIP_ID;

        tip.textContent =
          "Click an image · Esc cancel";

        Object.assign(
          tip.style,
          {
            position: "fixed",
            zIndex: "2147483647",
            top: "14px",
            left: "50%",
            transform:
              "translateX(-50%)",
            pointerEvents: "none",
            padding: "9px 13px",
            borderRadius: "9px",
            background:
              "rgba(20,20,20,.95)",
            color: "#fff",
            font:
              "600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
            boxShadow:
              "0 5px 22px rgba(0,0,0,.30)"
          }
        );

        document
          .documentElement
          .append(
            overlay,
            tip
          );

        const parseSrcset = (
          value
        ) => {
          const raw =
            String(
              value || ""
            ).trim();

          if (!raw) {
            return "";
          }

          const candidates =
            raw
              .split(",")
              .map(
                (item) => {
                  const parts =
                    item
                      .trim()
                      .split(
                        /\s+/
                      );

                  const url =
                    parts[0] || "";

                  const descriptor =
                    parts[1] || "";

                  let score = 1;

                  if (
                    descriptor.endsWith(
                      "w"
                    )
                  ) {
                    score =
                      Number(
                        descriptor.slice(
                          0,
                          -1
                        )
                      ) || 1;
                  } else if (
                    descriptor.endsWith(
                      "x"
                    )
                  ) {
                    score =
                      (
                        Number(
                          descriptor.slice(
                            0,
                            -1
                          )
                        ) || 1
                      ) * 1000;
                  }

                  return {
                    url,
                    score
                  };
                }
              )
              .filter(
                (item) =>
                  item.url
              )
              .sort(
                (a, b) =>
                  b.score -
                  a.score
              );

          return (
            candidates[0]?.url ||
            ""
          );
        };

        const bestImageUrl = (
          image
        ) => {
          if (!image) {
            return "";
          }

          const oldHires =
            String(
              image.getAttribute?.(
                "data-old-hires"
              ) ||
              ""
            ).trim();

          if (oldHires) {
            return oldHires;
          }

          const dynamic =
            String(
              image.getAttribute?.(
                "data-a-dynamic-image"
              ) ||
              ""
            ).trim();

          if (dynamic) {
            try {
              const parsed =
                JSON.parse(
                  dynamic
                );

              const candidates =
                Object.entries(
                  parsed
                )
                  .map(
                    ([
                      url,
                      dimensions
                    ]) => ({
                      url,

                      area:
                        Number(
                          dimensions?.[0] ||
                          0
                        ) *
                        Number(
                          dimensions?.[1] ||
                          0
                        )
                    })
                  )
                  .sort(
                    (a, b) =>
                      b.area -
                      a.area
                  );

              if (
                candidates[0]?.url
              ) {
                return candidates[0]
                  .url;
              }
            } catch {
            }
          }

          const picture =
            image.closest?.(
              "picture"
            );

          if (picture) {
            const sources =
              [
                ...picture
                  .querySelectorAll(
                    "source[srcset]"
                  )
              ];

            for (
              const source of
                sources
            ) {
              const candidate =
                parseSrcset(
                  source.getAttribute(
                    "srcset"
                  )
                );

              if (candidate) {
                return candidate;
              }
            }
          }

          const srcset =
            parseSrcset(
              image.getAttribute?.(
                "srcset"
              )
            );

          if (srcset) {
            return srcset;
          }

          return (
            image.currentSrc ||
            image.src ||
            image.getAttribute?.(
              "data-src"
            ) ||
            image.getAttribute?.(
              "src"
            ) ||
            ""
          );
        };

        const backgroundUrl = (
          element
        ) => {
          if (
            !element ||
            !(element instanceof Element)
          ) {
            return "";
          }

          const value =
            getComputedStyle(
              element
            ).backgroundImage || "";

          const match =
            value.match(
              /url\((?:"|')?(.+?)(?:"|')?\)/
            );

          return (
            match?.[1] ||
            ""
          );
        };

        const resolveTarget = (
          rawTarget
        ) => {
          if (
            !(rawTarget instanceof Element)
          ) {
            return null;
          }

          if (
            rawTarget instanceof
              HTMLImageElement
          ) {
            return {
              element:
                rawTarget,

              url:
                bestImageUrl(
                  rawTarget
                )
            };
          }

          const pictureImage =
            rawTarget
              .closest?.(
                "picture"
              )
              ?.querySelector?.(
                "img"
              );

          if (pictureImage) {
            return {
              element:
                pictureImage,

              url:
                bestImageUrl(
                  pictureImage
                )
            };
          }

          const childImage =
            rawTarget
              .querySelector?.(
                "img"
              );

          if (childImage) {
            return {
              element:
                childImage,

              url:
                bestImageUrl(
                  childImage
                )
            };
          }

          let current =
            rawTarget;

          for (
            let depth = 0;
            current &&
            depth < 4;
            depth += 1
          ) {
            const url =
              backgroundUrl(
                current
              );

            if (url) {
              return {
                element:
                  current,
                url
              };
            }

            current =
              current.parentElement;
          }

          return null;
        };

        const absoluteUrl = (
          raw
        ) => {
          try {
            const value =
              new URL(
                raw,
                document.baseURI
              );

            if (
              value.protocol !==
                "http:" &&
              value.protocol !==
                "https:"
            ) {
              return "";
            }

            return value.href;
          } catch {
            return "";
          }
        };

        let active =
          null;

        const draw = (
          element
        ) => {
          if (!element) {
            overlay.style.display =
              "none";

            return;
          }

          const rect =
            element
              .getBoundingClientRect();

          if (
            rect.width < 8 ||
            rect.height < 8
          ) {
            overlay.style.display =
              "none";

            return;
          }

          const left =
            Math.max(
              0,
              rect.left
            );

          const top =
            Math.max(
              0,
              rect.top
            );

          const width =
            Math.max(
              0,
              Math.min(
                rect.right,
                innerWidth
              ) -
              left
            );

          const height =
            Math.max(
              0,
              Math.min(
                rect.bottom,
                innerHeight
              ) -
              top
            );

          Object.assign(
            overlay.style,
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

        const cleanup = () => {
          document
            .removeEventListener(
              "pointermove",
              onMove,
              true
            );

          document
            .removeEventListener(
              "click",
              onClick,
              true
            );

          document
            .removeEventListener(
              "keydown",
              onKeyDown,
              true
            );

          overlay.remove();
          tip.remove();

          delete window
            .__clipnestImagePickerCleanup;
        };

        const onMove = (
          event
        ) => {
          const candidate =
            resolveTarget(
              event.target
            );

          if (
            !candidate?.url
          ) {
            active =
              null;

            draw(
              null
            );

            return;
          }

          const url =
            absoluteUrl(
              candidate.url
            );

          if (!url) {
            active =
              null;

            draw(
              null
            );

            return;
          }

          active = {
            ...candidate,
            url
          };

          draw(
            active.element
          );
        };

        const onClick = (
          event
        ) => {
          if (
            !active?.url
          ) {
            tip.textContent =
              "Move over an image first";

            return;
          }

          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          const picked =
            active.url;

          const selectedRect =
            active.element
              ?.getBoundingClientRect?.();

          const left =
            selectedRect
              ? Math.max(
                  0,
                  selectedRect.left
                )
              : 0;

          const top =
            selectedRect
              ? Math.max(
                  0,
                  selectedRect.top
                )
              : 0;

          const right =
            selectedRect
              ? Math.min(
                  innerWidth,
                  selectedRect.right
                )
              : 0;

          const bottom =
            selectedRect
              ? Math.min(
                  innerHeight,
                  selectedRect.bottom
                )
              : 0;

          const rect = {
            x:
              left,

            y:
              top,

            width:
              Math.max(
                0,
                right -
                  left
              ),

            height:
              Math.max(
                0,
                bottom -
                  top
              )
          };

          cleanup();

          void chrome.runtime
            .sendMessage({
              type:
                "clipnest.imagePicked",

              url:
                picked,

              pageUrl:
                location.href,

              capturedAt:
                Date.now(),

              purpose:
                pickerPurpose,

              rect,

              viewportWidth:
                innerWidth,

              viewportHeight:
                innerHeight
            });
        };

        const onKeyDown = (
          event
        ) => {
          if (
            event.key !==
              "Escape"
          ) {
            return;
          }

          event.preventDefault();
          cleanup();
        };

        window
          .__clipnestImagePickerCleanup =
          cleanup;

        document
          .addEventListener(
            "pointermove",
            onMove,
            true
          );

        document
          .addEventListener(
            "click",
            onClick,
            true
          );

        document
          .addEventListener(
            "keydown",
            onKeyDown,
            true
          );
      },

      args: [
        String(
          purpose ||
          "property"
        )
      ]
    });
  }

  function create({
    detectedImage = "",
    initialValue = "",
    propertyId = "",
    onChange =
      () => {}
  } = {}) {
    const control =
      document.createElement(
        "div"
      );

    control.className =
      "notion-image-picker";

    /*
     * detectedImage is a suggestion only.
     * Files & media remains empty until the
     * user explicitly chooses an image.
     */
    let selected =
      normalizeImageUrl(
        initialValue
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

    const previewWrap =
      document.createElement(
        "div"
      );

    previewWrap.className =
      "notion-image-preview-wrap";

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

    const pageSelect =
      document.createElement(
        "button"
      );

    pageSelect.type =
      "button";

    pageSelect.className =
      "notion-image-page-select";

    pageSelect.textContent =
      "Select image from page";

    pageSelect.addEventListener(
      "click",
      async () => {
        pageSelect.disabled =
          true;

        pageSelect.textContent =
          "Starting picker…";

        try {

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
            /*
             * Preserve every other in-progress Notion
             * field. Exclude this Files & media property
             * because the image the user is about to pick
             * must replace its previous value.
             */
            const resume =
              globalThis
                .ClipNestNotionCaptureResume
                ?.snapshot?.(
                  resumePresetId,
                  "",
                  {
                    excludePropertyId:
                      propertyId
                  }
                ) ||
              {
                presetId:
                  resumePresetId,

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

          await startClipNestPageImageSelection();

          menu.classList.add(
            "hidden"
          );

          /*
           * A normal extension popup closes when
           * the webpage is clicked. Close it now
           * so the user can immediately pick.
           */
          window.close();
        } catch (error) {
          pageSelect.disabled =
            false;

          pageSelect.textContent =
            "Select image from page";

          console.error(
            "Could not start image picker:",
            error
          );
        }
      }
    );

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
      pageSelect,
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
          "Click to add image";

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
            "Image unavailable";

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

    previewWrap.append(
      preview,
      clear
    );

    row.append(
      previewWrap
    );

    control.append(
      row,
      menu
    );

    renderPreview();
    notify();

    return control;
  }

  const api =
    Object.freeze({
      create,
      collectPageImages,

      startPageSelection:
        startClipNestPageImageSelection
    });

  globalThis
    .ClipNestImagePicker =
    api;

  globalThis
    .ClipNestNotionImagePicker =
    api;
})();
