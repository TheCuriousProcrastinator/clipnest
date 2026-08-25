/*
 * ClipNest Notion Presets
 *
 * A Preset now owns its Notion workspace context.
 *
 * The old mirrored Notion keys remain temporarily so
 * the existing popup/background code keeps working
 * while the Notion save path is migrated.
 */

(() => {
  "use strict";

  const PRESETS_KEY =
    "notionPresets";

  const ACTIVE_KEY =
    "notionActivePresetId";

  const STORE_VERSION_KEY =
    "notionPresetStoreVersion";

  const STORE_VERSION = 2;

  function createId() {
    if (
      globalThis.crypto
        ?.randomUUID
    ) {
      return crypto.randomUUID();
    }

    return (
      `notion-${Date.now()}-` +
      Math.random()
        .toString(16)
        .slice(2)
    );
  }

  function cleanText(
    value
  ) {
    return String(
      value || ""
    ).trim();
  }

  function cleanStringArray(
    value
  ) {
    if (!Array.isArray(value)) {
      return [];
    }

    return [
      ...new Set(
        value
          .map(cleanText)
          .filter(Boolean)
      )
    ];
  }

  function normalizePresetField(
    field,
    fallbackOrder = 0
  ) {
    if (
      !field ||
      typeof field !==
        "object"
    ) {
      return null;
    }

    const propertyId =
      cleanText(
        field.propertyId
      );

    if (!propertyId) {
      return null;
    }

    const propertyType =
      cleanText(
        field.propertyType
      );

    const propertyName =
      cleanText(
        field.propertyName ||
        field.label
      );

    const label =
      cleanText(
        field.label ||
        propertyName
      ) ||
      "Field";

    const rawOrder =
      Number(
        field.order
      );

    const order =
      Number.isFinite(
        rawOrder
      )
        ? rawOrder
        : fallbackOrder;

    let defaultValue;

    if (
      Object.prototype
        .hasOwnProperty.call(
          field,
          "defaultValue"
        )
    ) {
      defaultValue =
        Array.isArray(
          field.defaultValue
        )
          ? [
              ...field.defaultValue
            ]
          : field.defaultValue;
    } else {
      defaultValue =
        propertyType ===
          "multi_select"
          ? []
          : "";
    }

    return {
      ...field,

      propertyId,

      propertyName,

      propertyType,

      label,

      order,

      visible:
        field.visible !==
          false,

      source:
        cleanText(
          field.source
        ) ||
        "manual",

      required:
        field.required ===
          true,

      defaultValue
    };
  }

  function deriveLegacyPresetFields(
    raw,
    {
      titleProperty = "Name",
      urlProperty = "",
      tagsProperty = ""
    } = {}
  ) {
    const propertyIds =
      raw?.propertyIds &&
      typeof raw.propertyIds ===
        "object"
        ? raw.propertyIds
        : {};

    const fields =
      [];

    const titleId =
      cleanText(
        propertyIds.title
      );

    if (titleId) {
      fields.push({
        propertyId:
          titleId,

        propertyName:
          cleanText(
            titleProperty
          ) ||
          "Name",

        propertyType:
          "title",

        label:
          "Title",

        order:
          fields.length,

        visible:
          true,

        source:
          "page_title",

        required:
          true,

        defaultValue:
          ""
      });
    }

    const tagsId =
      cleanText(
        propertyIds.tags
      );

    if (tagsId) {
      fields.push({
        propertyId:
          tagsId,

        propertyName:
          cleanText(
            tagsProperty
          ) ||
          "Tags",

        propertyType:
          "multi_select",

        label:
          "Tags",

        order:
          fields.length,

        visible:
          true,

        source:
          "manual",

        required:
          false,

        defaultValue:
          []
      });
    }

    const urlId =
      cleanText(
        propertyIds.url
      );

    if (urlId) {
      fields.push({
        propertyId:
          urlId,

        propertyName:
          cleanText(
            urlProperty
          ) ||
          "URL",

        propertyType:
          "url",

        label:
          "URL",

        order:
          fields.length,

        visible:
          false,

        source:
          "page_url",

        required:
          false,

        defaultValue:
          ""
      });
    }

    return fields;
  }

  function normalizePresetFields(
    raw,
    names = {}
  ) {
    const fieldsConfigured =
      raw?.fieldsConfigured ===
        true;

    /*
     * During migration, old property mappings remain
     * authoritative. This also keeps the existing
     * Settings editor safe while the new preset editor
     * is still being built.
     */
    const source =
      fieldsConfigured &&
      Array.isArray(
        raw?.fields
      )
        ? raw.fields
        : deriveLegacyPresetFields(
            raw,
            names
          );

    return source
      .map(
        (
          field,
          index
        ) =>
          normalizePresetField(
            field,
            index
          )
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.order -
          b.order
      )
      .map(
        (
          field,
          index
        ) => ({
          ...field,

          order:
            index
        })
      );
  }

  function normalizePreset(
    raw = {},
    index = 0
  ) {
    const mappings =
      raw.propertyMappings &&
      typeof raw.propertyMappings ===
        "object"
        ? raw.propertyMappings
        : {};

    const defaults =
      raw.propertyDefaults &&
      typeof raw.propertyDefaults ===
        "object" &&
      !Array.isArray(
        raw.propertyDefaults
      )
        ? raw.propertyDefaults
        : {};

    const titleProperty =
      cleanText(
        raw.titleProperty ??
        mappings.title
      ) ||
      "Name";

    const urlProperty =
      cleanText(
        raw.urlProperty ??
        mappings.url
      );

    const tagsProperty =
      cleanText(
        raw.tagsProperty ??
        mappings.tags
      );

    const fieldsConfigured =
      raw.fieldsConfigured ===
        true;

    const fields =
      normalizePresetFields(
        raw,
        {
          titleProperty,
          urlProperty,
          tagsProperty
        }
      );

    return {
      id:
        cleanText(
          raw.id
        ) ||
        createId(),

      name:
        cleanText(
          raw.name
        ) ||
        `Notion preset ${index + 1}`,

      workspaceId:
        cleanText(
          raw.workspaceId
        ),

      workspaceName:
        cleanText(
          raw.workspaceName
        ),

      workspaceUserId:
        cleanText(
          raw.workspaceUserId
        ),

      workspaceSpaceViewIds:
        cleanStringArray(
          raw.workspaceSpaceViewIds
        ),

      dataSourceId:
        cleanText(
          raw.dataSourceId
        ),

      destinationType:
        cleanText(
          raw.destinationType
        ),

      destinationId:
        cleanText(
          raw.destinationId
        ),

      destinationName:
        cleanText(
          raw.destinationName
        ),

      destinationIcon:
        raw.destinationIcon ??
        "",

      destinationParents:
        Array.isArray(
          raw.destinationParents
        )
          ? raw.destinationParents
          : [],

      destinationParentId:
        cleanText(
          raw.destinationParentId
        ),

      destinationParentTable:
        cleanText(
          raw.destinationParentTable
        ),

      fieldsConfigured,

      fields,

      propertyIds: {
        title:
          cleanText(
            raw.propertyIds
              ?.title
          ),

        url:
          cleanText(
            raw.propertyIds
              ?.url
          ),

        tags:
          cleanText(
            raw.propertyIds
              ?.tags
          )
      },

      titleProperty,

      urlProperty,

      tagsProperty,

      propertyMappings: {
        ...mappings,

        title:
          titleProperty,

        url:
          urlProperty,

        tags:
          tagsProperty
      },

      propertyDefaults: {
        ...defaults
      },

      popupProperties:
        cleanStringArray(
          raw.popupProperties
        )
    };
  }

  function normalizePresets(
    value
  ) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map(
      normalizePreset
    );
  }

  async function mirrorPreset(
    preset
  ) {
    if (!preset) {
      await chrome.storage.local.set({
        notionDataSourceId:
          "",

        notionTitleProperty:
          "Name",

        notionUrlProperty:
          "",

        notionWorkspaceId:
          "",

        notionWorkspaceName:
          "",

        notionWorkspaceUserId:
          "",

        notionWorkspaceSpaceViewIds:
          []
      });

      return;
    }

    const normalized =
      normalizePreset(
        preset
      );

    await chrome.storage.local.set({
      notionDataSourceId:
        normalized.dataSourceId,

      notionTitleProperty:
        normalized.titleProperty,

      notionUrlProperty:
        normalized.urlProperty,

      notionWorkspaceId:
        normalized.workspaceId,

      notionWorkspaceName:
        normalized.workspaceName,

      notionWorkspaceUserId:
        normalized.workspaceUserId,

      notionWorkspaceSpaceViewIds:
        normalized
          .workspaceSpaceViewIds
    });
  }

  async function writeState(
    presets,
    activePresetId = ""
  ) {
    const normalized =
      normalizePresets(
        presets
      );

    let activeId =
      cleanText(
        activePresetId
      );

    if (
      !normalized.some(
        (preset) =>
          preset.id ===
          activeId
      )
    ) {
      activeId =
        normalized[0]
          ?.id ||
        "";
    }

    const activePreset =
      normalized.find(
        (preset) =>
          preset.id ===
          activeId
      ) ||
      null;

    await chrome.storage.local.set({
      [PRESETS_KEY]:
        normalized,

      [ACTIVE_KEY]:
        activeId,

      [STORE_VERSION_KEY]:
        STORE_VERSION
    });

    await mirrorPreset(
      activePreset
    );

    return {
      presets:
        normalized,

      activePresetId:
        activeId,

      activePreset
    };
  }

  async function migrateLegacy() {
    const data =
      await chrome.storage.local.get([
        PRESETS_KEY,
        ACTIVE_KEY,
        "notionDataSourceId",
        "notionTitleProperty",
        "notionUrlProperty",
        "notionWorkspaceId",
        "notionWorkspaceName",
        "notionWorkspaceUserId",
        "notionWorkspaceSpaceViewIds"
      ]);

    if (
      Array.isArray(
        data[PRESETS_KEY]
      )
    ) {
      return writeState(
        data[PRESETS_KEY],
        data[ACTIVE_KEY]
      );
    }

    const hasLegacyDestination =
      Boolean(
        cleanText(
          data.notionDataSourceId
        )
      );

    if (!hasLegacyDestination) {
      return writeState(
        [],
        ""
      );
    }

    const preset =
      normalizePreset({
        name:
          "Default",

        workspaceId:
          data.notionWorkspaceId ||
          "",

        workspaceName:
          data.notionWorkspaceName ||
          "",

        workspaceUserId:
          data.notionWorkspaceUserId ||
          "",

        workspaceSpaceViewIds:
          data
            .notionWorkspaceSpaceViewIds ||
          [],

        dataSourceId:
          data.notionDataSourceId ||
          "",

        titleProperty:
          data.notionTitleProperty ||
          "Name",

        urlProperty:
          data.notionUrlProperty ||
          ""
      });

    return writeState(
      [
        preset
      ],
      preset.id
    );
  }

  async function getState() {
    await migrateLegacy();

    const data =
      await chrome.storage.local.get([
        PRESETS_KEY,
        ACTIVE_KEY
      ]);

    const presets =
      normalizePresets(
        data[PRESETS_KEY]
      );

    let activePresetId =
      cleanText(
        data[ACTIVE_KEY]
      );

    if (
      !presets.some(
        (preset) =>
          preset.id ===
          activePresetId
      )
    ) {
      activePresetId =
        presets[0]
          ?.id ||
        "";
    }

    return {
      presets,

      activePresetId,

      activePreset:
        presets.find(
          (preset) =>
            preset.id ===
            activePresetId
        ) ||
        null
    };
  }

  async function listPresets() {
    const state =
      await getState();

    return {
      presets:
        state.presets,

      activePresetId:
        state.activePresetId
    };
  }

  async function getActivePreset() {
    return (
      await getState()
    ).activePreset;
  }

  async function setActivePreset(
    id
  ) {
    const state =
      await getState();

    const target =
      state.presets.find(
        (preset) =>
          preset.id ===
          id
      );

    if (!target) {
      throw new Error(
        "That Notion preset no longer exists."
      );
    }

    await writeState(
      state.presets,
      target.id
    );

    return target;
  }

  async function createPreset(
    initial = {}
  ) {
    const state =
      await getState();

    const raw =
      typeof initial ===
        "string"
        ? {
            name:
              initial
          }
        : {
            ...initial
          };

    const preset =
      normalizePreset({
        name:
          "New preset",

        workspaceId:
          "",

        workspaceName:
          "",

        workspaceUserId:
          "",

        workspaceSpaceViewIds:
          [],

        dataSourceId:
          "",

        destinationType:
          "",

        destinationId:
          "",

        destinationName:
          "",

        destinationIcon:
          "",

        destinationParents:
          [],

        destinationParentId:
          "",

        destinationParentTable:
          "",

        propertyIds: {
          title:
            "",

          url:
            "",

          tags:
            ""
        },

        titleProperty:
          "Name",

        urlProperty:
          "",

        tagsProperty:
          "",

        propertyDefaults:
          {},

        popupProperties:
          [],

        ...raw,

        id:
          createId()
      });

    await writeState(
      [
        ...state.presets,
        preset
      ],
      preset.id
    );

    return preset;
  }

  async function updatePreset(
    id,
    patch = {}
  ) {
    const state =
      await getState();

    const index =
      state.presets.findIndex(
        (preset) =>
          preset.id ===
          id
      );

    if (index < 0) {
      throw new Error(
        "That Notion preset no longer exists."
      );
    }

    const current =
      state.presets[
        index
      ];

    const next =
      normalizePreset({
        ...current,
        ...patch,

        id:
          current.id,

        propertyMappings: {
          ...current
            .propertyMappings,

          ...(
            patch.propertyMappings &&
            typeof patch.propertyMappings ===
              "object"
              ? patch.propertyMappings
              : {}
          )
        },

        propertyIds: {
          ...current.propertyIds,

          ...(
            patch.propertyIds &&
            typeof patch.propertyIds ===
              "object"
              ? patch.propertyIds
              : {}
          )
        },

        propertyDefaults:
          patch.propertyDefaults ??
          current.propertyDefaults,

        popupProperties:
          patch.popupProperties ??
          current.popupProperties
      });

    const presets = [
      ...state.presets
    ];

    presets[index] =
      next;

    await writeState(
      presets,
      state.activePresetId
    );

    return next;
  }

  async function updateActivePreset(
    patch = {}
  ) {
    const active =
      await getActivePreset();

    if (!active) {
      throw new Error(
        "Create a Notion preset first."
      );
    }

    return updatePreset(
      active.id,
      patch
    );
  }

  async function removePreset(
    id
  ) {
    const state =
      await getState();

    const exists =
      state.presets.some(
        (preset) =>
          preset.id ===
          id
      );

    if (!exists) {
      throw new Error(
        "That Notion preset no longer exists."
      );
    }

    const presets =
      state.presets.filter(
        (preset) =>
          preset.id !==
          id
      );

    const activePresetId =
      state.activePresetId ===
        id
        ? (
            presets[0]
              ?.id ||
            ""
          )
        : state.activePresetId;

    return writeState(
      presets,
      activePresetId
    );
  }

  globalThis.ClipNestNotionStore =
    Object.freeze({
      migrateLegacy,
      listPresets,
      getActivePreset,
      setActivePreset,
      activatePreset:
        setActivePreset,
      createPreset,
      updatePreset,
      updateActivePreset,
      removePreset
    });
})();
