/*
 * ClipNest Notion Presets
 *
 * The Notion integration token remains global.
 * Each preset stores its destination data source
 * and property mappings.
 *
 * The active preset is mirrored into ClipNest's
 * existing Notion storage keys so the existing
 * saveToNotion() and Quick Clip paths can continue
 * using the current save architecture.
 */

(() => {
  "use strict";

  const PRESETS_KEY =
    "notionPresets";

  const ACTIVE_KEY =
    "notionActivePresetId";

  function createId() {
    if (
      globalThis.crypto?.randomUUID
    ) {
      return crypto.randomUUID();
    }

    return (
      Date.now().toString(36) +
      "-" +
      Math.random()
        .toString(36)
        .slice(2)
    );
  }

  function normalizePresets(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(
        (item) =>
          item &&
          typeof item.id === "string"
      )
      .map(
        (item) => ({
          id:
            item.id,

          name:
            String(
              item.name ||
              "Notion preset"
            ),

          dataSourceId:
            String(
              item.dataSourceId ||
              ""
            ),

          titleProperty:
            String(
              item.titleProperty ||
              "Name"
            ),

          urlProperty:
            String(
              item.urlProperty ||
              ""
            )
        })
      );
  }

  async function mirrorPreset(
    preset
  ) {
    if (!preset) {
      await chrome.storage.local.set({
        notionDataSourceId: "",
        notionTitleProperty: "Name",
        notionUrlProperty: ""
      });

      return;
    }

    await chrome.storage.local.set({
      notionDataSourceId:
        preset.dataSourceId || "",

      notionTitleProperty:
        preset.titleProperty ||
        "Name",

      notionUrlProperty:
        preset.urlProperty || ""
    });
  }

  async function migrateLegacy() {
    const data =
      await chrome.storage.local.get([
        PRESETS_KEY,
        ACTIVE_KEY,
        "notionDataSourceId",
        "notionTitleProperty",
        "notionUrlProperty"
      ]);

    let presets =
      normalizePresets(
        data[PRESETS_KEY]
      );

    let activePresetId =
      String(
        data[ACTIVE_KEY] ||
        ""
      );

    if (!presets.length) {
      const dataSourceId =
        String(
          data.notionDataSourceId ||
          ""
        ).trim();

      if (dataSourceId) {
        const preset = {
          id:
            createId(),

          name:
            "Default",

          dataSourceId,

          titleProperty:
            String(
              data.notionTitleProperty ||
              "Name"
            ).trim() ||
            "Name",

          urlProperty:
            String(
              data.notionUrlProperty ||
              ""
            ).trim()
        };

        presets = [
          preset
        ];

        activePresetId =
          preset.id;

        await chrome.storage.local.set({
          [PRESETS_KEY]:
            presets,

          [ACTIVE_KEY]:
            activePresetId
        });
      }
    }

    if (
      presets.length &&
      !presets.some(
        (preset) =>
          preset.id ===
          activePresetId
      )
    ) {
      activePresetId =
        presets[0].id;

      await chrome.storage.local.set({
        [ACTIVE_KEY]:
          activePresetId
      });
    }

    const activePreset =
      presets.find(
        (preset) =>
          preset.id ===
          activePresetId
      ) || null;

    if (activePreset) {
      await mirrorPreset(
        activePreset
      );
    }

    return {
      presets,
      activePresetId
    };
  }

  async function listPresets() {
    return migrateLegacy();
  }

  async function getActivePreset() {
    const info =
      await migrateLegacy();

    return (
      info.presets.find(
        (preset) =>
          preset.id ===
          info.activePresetId
      ) || null
    );
  }

  async function setActivePreset(
    id
  ) {
    const info =
      await migrateLegacy();

    const preset =
      info.presets.find(
        (item) =>
          item.id === id
      );

    if (!preset) {
      throw new Error(
        "That Notion preset no longer exists."
      );
    }

    await chrome.storage.local.set({
      [ACTIVE_KEY]:
        preset.id
    });

    await mirrorPreset(
      preset
    );

    return preset;
  }

  async function createPreset(
    rawName = "New preset"
  ) {
    const info =
      await migrateLegacy();

    const preset = {
      id:
        createId(),

      name:
        String(
          rawName ||
          ""
        ).trim() ||
        "New preset",

      dataSourceId:
        "",

      titleProperty:
        "Name",

      urlProperty:
        ""
    };

    const presets = [
      ...info.presets,
      preset
    ];

    await chrome.storage.local.set({
      [PRESETS_KEY]:
        presets,

      [ACTIVE_KEY]:
        preset.id
    });

    await mirrorPreset(
      preset
    );

    return preset;
  }

  async function updatePreset(
    id,
    changes = {}
  ) {
    const info =
      await migrateLegacy();

    const index =
      info.presets.findIndex(
        (preset) =>
          preset.id === id
      );

    if (index < 0) {
      throw new Error(
        "That Notion preset no longer exists."
      );
    }

    const presets = [
      ...info.presets
    ];

    const previous =
      presets[index];

    const next = {
      ...previous,

      name:
        String(
          changes.name ??
          previous.name
        ).trim() ||
        "Notion preset",

      dataSourceId:
        String(
          changes.dataSourceId ??
          previous.dataSourceId
        ).trim(),

      titleProperty:
        String(
          changes.titleProperty ??
          previous.titleProperty
        ).trim() ||
        "Name",

      urlProperty:
        String(
          changes.urlProperty ??
          previous.urlProperty
        ).trim()
    };

    presets[index] =
      next;

    await chrome.storage.local.set({
      [PRESETS_KEY]:
        presets
    });

    if (
      id ===
      info.activePresetId
    ) {
      await mirrorPreset(
        next
      );
    }

    return next;
  }

  async function updateActivePreset(
    changes = {}
  ) {
    const preset =
      await getActivePreset();

    if (!preset) {
      throw new Error(
        "Create a Notion preset first."
      );
    }

    return updatePreset(
      preset.id,
      changes
    );
  }

  async function removePreset(
    id
  ) {
    const info =
      await migrateLegacy();

    const presets =
      info.presets.filter(
        (preset) =>
          preset.id !== id
      );

    let activePresetId =
      info.activePresetId;

    if (
      activePresetId === id ||
      !presets.some(
        (preset) =>
          preset.id ===
          activePresetId
      )
    ) {
      activePresetId =
        presets[0]?.id ||
        "";
    }

    await chrome.storage.local.set({
      [PRESETS_KEY]:
        presets,

      [ACTIVE_KEY]:
        activePresetId
    });

    const activePreset =
      presets.find(
        (preset) =>
          preset.id ===
          activePresetId
      ) || null;

    await mirrorPreset(
      activePreset
    );

    return {
      presets,
      activePresetId
    };
  }

  globalThis.ClipNestNotionStore =
    Object.freeze({
      migrateLegacy,
      listPresets,
      getActivePreset,
      setActivePreset,
      createPreset,
      updatePreset,
      updateActivePreset,
      removePreset
    });
})();
