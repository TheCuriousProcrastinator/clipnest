(() => {
  "use strict";

  const STORAGE_KEY =
    "clipnestTheme";

  const DEFAULT_THEME =
    "night-shift";

  const THEMES =
    Object.freeze([
      {
        id:
          "night-shift",
        name:
          "Night Shift",
        mode:
          "dark"
      },
      {
        id:
          "rose-milk",
        name:
          "Rose Milk",
        mode:
          "light"
      },
      {
        id:
          "cherry-cola",
        name:
          "Cherry Cola",
        mode:
          "dark"
      },
      {
        id:
          "lavender-blush",
        name:
          "Lavender Blush",
        mode:
          "light"
      },
      {
        id:
          "strawberry-cream",
        name:
          "Strawberry Cream",
        mode:
          "light"
      },
      {
        id:
          "berry-night",
        name:
          "Berry Night",
        mode:
          "dark"
      },
      {
        id:
          "mint-candy",
        name:
          "Mint Candy",
        mode:
          "light"
      },
      {
        id:
          "night-signal",
        name:
          "Night Signal",
        mode:
          "dark"
      }

    ]);

  const byId =
    new Map(
      THEMES.map(
        (theme) => [
          theme.id,
          theme
        ]
      )
    );

  function normalizeTheme(
    value
  ) {
    const id =
      String(
        value ||
        ""
      ).trim();

    return byId.has(id)
      ? id
      : DEFAULT_THEME;
  }

  function updatePicker(
    themeId
  ) {
    document
      .querySelectorAll(
        "[data-clipnest-theme-option]"
      )
      .forEach(
        (button) => {
          const selected =
            button.dataset
              .clipnestThemeOption ===
            themeId;

          button.setAttribute(
            "aria-pressed",
            selected
              ? "true"
              : "false"
          );

          button.classList.toggle(
            "selected",
            selected
          );
        }
      );
  }

  function applyTheme(
    value
  ) {
    const id =
      normalizeTheme(
        value
      );

    const theme =
      byId.get(id);

    document.documentElement
      .dataset.clipnestTheme =
      id;

    document.documentElement
      .style.colorScheme =
      theme?.mode ===
        "light"
        ? "light"
        : "dark";

    updatePicker(
      id
    );

    return id;
  }

  async function readTheme() {
    try {
      const stored =
        await chrome.storage.local.get([
          STORAGE_KEY
        ]);

      return applyTheme(
        stored[
          STORAGE_KEY
        ]
      );
    } catch (error) {
      console.warn(
        "ClipNest could not load the theme:",
        error
      );

      return applyTheme(
        DEFAULT_THEME
      );
    }
  }

  async function setTheme(
    value
  ) {
    const id =
      applyTheme(
        value
      );

    await chrome.storage.local.set({
      [STORAGE_KEY]:
        id
    });

    return id;
  }

  function setupPicker() {
    document
      .querySelectorAll(
        "[data-clipnest-theme-option]"
      )
      .forEach(
        (button) => {
          if (
            button.dataset
              .clipnestThemeReady ===
            "true"
          ) {
            return;
          }

          button.dataset
            .clipnestThemeReady =
            "true";

          button.addEventListener(
            "click",
            () => {
              void setTheme(
                button.dataset
                  .clipnestThemeOption
              );
            }
          );
        }
      );

    updatePicker(
      document
        .documentElement
        .dataset
        .clipnestTheme ||
      DEFAULT_THEME
    );
  }

  /*
   * Night Shift is the exact legacy/default route.
   * Apply it synchronously before the document paints.
   */
  applyTheme(
    DEFAULT_THEME
  );

  const ready =
    readTheme();

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      setupPicker();

      void ready.then(
        (themeId) => {
          updatePicker(
            themeId
          );
        }
      );
    }
  );

  chrome.storage.onChanged
    .addListener(
      (
        changes,
        areaName
      ) => {
        if (
          areaName !==
            "local" ||
          !changes[
            STORAGE_KEY
          ]
        ) {
          return;
        }

        applyTheme(
          changes[
            STORAGE_KEY
          ].newValue
        );
      }
    );

  globalThis.ClipNestThemes =
    Object.freeze({
      STORAGE_KEY,
      DEFAULT_THEME,
      THEMES,
      normalizeTheme,
      applyTheme,
      readTheme,
      setTheme
    });
})();
