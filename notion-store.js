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

  const SYNC_META_KEY =
    "clipnestNotionSyncMetaV1";

  const SYNC_CHUNK_PREFIX =
    "clipnestNotionSyncChunkV1_";

  const SYNC_PAYLOAD_VERSION = 1;

  const SYNC_ITEM_TARGET_BYTES = 7600;

  const LOCAL_SYNC_META_KEY =
    "clipnestNotionLocalSyncMetaV1";

  let syncHydrationPromise =
    null;

  let syncListenerInstalled =
    false;

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

      presetIcon:
        cleanText(
          raw.presetIcon
        ),

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

  function buildSyncPayload(
    presets,
    activePresetId,
    updatedAt =
      Date.now()
  ) {
    const timestamp =
      Math.max(
        0,
        Number(
          updatedAt
        ) ||
        0
      ) ||
      Date.now();

    return {
      version:
        SYNC_PAYLOAD_VERSION,

      updatedAt:
        timestamp,

      presets:
        normalizePresets(
          presets
        ),

      activePresetId:
        cleanText(
          activePresetId
        )
    };
  }

  function splitSyncPayload(
    payload
  ) {
    const serialized =
      JSON.stringify(
        payload
      );

    const characters =
      Array.from(
        serialized
      );

    const encoder =
      new TextEncoder();

    const chunks =
      [];

    let start =
      0;

    while (
      start <
      characters.length
    ) {
      const key =
        SYNC_CHUNK_PREFIX +
        chunks.length;

      let low =
        start + 1;

      let high =
        characters.length;

      let best =
        start;

      while (
        low <= high
      ) {
        const middle =
          Math.floor(
            (
              low +
              high
            ) /
            2
          );

        const candidate =
          characters
            .slice(
              start,
              middle
            )
            .join("");

        const bytes =
          encoder.encode(
            key
          ).byteLength +
          encoder.encode(
            JSON.stringify(
              candidate
            )
          ).byteLength;

        if (
          bytes <=
          SYNC_ITEM_TARGET_BYTES
        ) {
          best =
            middle;

          low =
            middle + 1;
        } else {
          high =
            middle - 1;
        }
      }

      if (
        best === start
      ) {
        throw new Error(
          "ClipNest could not create a safe Notion sync chunk."
        );
      }

      chunks.push(
        characters
          .slice(
            start,
            best
          )
          .join("")
      );

      start =
        best;
    }

    return chunks;
  }

  async function readSyncPayload() {
    try {
      const metaResult =
        await chrome.storage.sync.get(
          SYNC_META_KEY
        );

      const meta =
        metaResult[
          SYNC_META_KEY
        ];

      if (!meta) {
        return {
          status:
            "missing",

          payload:
            null
        };
      }

      if (
        typeof meta !==
          "object" ||
        Number(
          meta.version
        ) !==
          SYNC_PAYLOAD_VERSION
      ) {
        console.warn(
          "ClipNest found invalid Notion sync metadata."
        );

        return {
          status:
            "error",

          payload:
            null
        };
      }

      const chunkCount =
        Number(
          meta.chunkCount
        );

      if (
        !Number.isInteger(
          chunkCount
        ) ||
        chunkCount < 1 ||
        chunkCount > 500
      ) {
        console.warn(
          "ClipNest found an invalid Notion sync chunk count."
        );

        return {
          status:
            "error",

          payload:
            null
        };
      }

      const keys =
        Array.from(
          {
            length:
              chunkCount
          },
          (_, index) =>
            SYNC_CHUNK_PREFIX +
            index
        );

      const stored =
        await chrome.storage.sync.get(
          keys
        );

      const incomplete =
        keys.some(
          (key) =>
            typeof stored[
              key
            ] !==
              "string"
        );

      if (incomplete) {
        console.warn(
          "ClipNest Notion sync is waiting for remaining chunks."
        );

        return {
          status:
            "error",

          payload:
            null
        };
      }

      const serialized =
        keys
          .map(
            (key) =>
              stored[
                key
              ]
          )
          .join("");

      if (!serialized) {
        return {
          status:
            "error",

          payload:
            null
        };
      }

      const parsed =
        JSON.parse(
          serialized
        );

      if (
        !parsed ||
        typeof parsed !==
          "object" ||
        Number(
          parsed.version
        ) !==
          SYNC_PAYLOAD_VERSION ||
        !Array.isArray(
          parsed.presets
        )
      ) {
        console.warn(
          "ClipNest found invalid synced Notion preset data."
        );

        return {
          status:
            "error",

          payload:
            null
        };
      }

      return {
        status:
          "ok",

        payload: {
          version:
            SYNC_PAYLOAD_VERSION,

          updatedAt:
            Number(
              parsed.updatedAt ||
              meta.updatedAt ||
              0
            ),

          presets:
            normalizePresets(
              parsed.presets
            ),

          activePresetId:
            cleanText(
              parsed.activePresetId
            )
        }
      };
    } catch (error) {
      console.warn(
        "ClipNest could not read synced Notion presets:",
        error
      );

      return {
        status:
          "error",

        payload:
          null
      };
    }
  }

  async function writeSyncPayload(
    presets,
    activePresetId,
    updatedAt =
      Date.now()
  ) {
    try {
      const payload =
        buildSyncPayload(
          presets,
          activePresetId,
          updatedAt
        );

      const chunks =
        splitSyncPayload(
          payload
        );

      const previous =
        await chrome.storage.sync.get(
          SYNC_META_KEY
        );

      const previousCount =
        Number(
          previous[
            SYNC_META_KEY
          ]?.chunkCount ||
          0
        );

      const values = {
        [SYNC_META_KEY]: {
          version:
            SYNC_PAYLOAD_VERSION,

          updatedAt:
            payload.updatedAt,

          chunkCount:
            chunks.length
        }
      };

      chunks.forEach(
        (
          chunk,
          index
        ) => {
          values[
            SYNC_CHUNK_PREFIX +
            index
          ] =
            chunk;
        }
      );

      await chrome.storage.sync.set(
        values
      );

      if (
        previousCount >
        chunks.length
      ) {
        const staleKeys =
          [];

        for (
          let index =
            chunks.length;
          index <
          previousCount;
          index += 1
        ) {
          staleKeys.push(
            SYNC_CHUNK_PREFIX +
              index
          );
        }

        if (
          staleKeys.length
        ) {
          await chrome.storage.sync.remove(
            staleKeys
          );
        }
      }

      return true;
    } catch (error) {
      console.warn(
        "ClipNest could not sync Notion presets:",
        error
      );

      return false;
    }
  }

  async function writeLocalState(
    presets,
    activePresetId = "",
    updatedAt = 0
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

    const timestamp =
      Math.max(
        0,
        Number(
          updatedAt
        ) ||
        0
      );

    await chrome.storage.local.set({
      [PRESETS_KEY]:
        normalized,

      [ACTIVE_KEY]:
        activeId,

      [STORE_VERSION_KEY]:
        STORE_VERSION,

      [LOCAL_SYNC_META_KEY]: {
        version:
          SYNC_PAYLOAD_VERSION,

        updatedAt:
          timestamp
      }
    });

    await mirrorPreset(
      activePreset
    );

    return {
      presets:
        normalized,

      activePresetId:
        activeId,

      activePreset,

      updatedAt:
        timestamp
    };
  }

  async function hydrateFromSync() {
    if (
      syncHydrationPromise
    ) {
      return syncHydrationPromise;
    }

    syncHydrationPromise =
      (
        async () => {
          const result =
            await readSyncPayload();

          if (
            result.status !==
              "ok" ||
            !result.payload
          ) {
            return null;
          }

          const local =
            await chrome.storage.local.get([
              PRESETS_KEY,
              ACTIVE_KEY,
              LOCAL_SYNC_META_KEY
            ]);

          const hasLocal =
            Array.isArray(
              local[
                PRESETS_KEY
              ]
            );

          const localUpdatedAt =
            Math.max(
              0,
              Number(
                local[
                  LOCAL_SYNC_META_KEY
                ]?.updatedAt ||
                0
              )
            );

          const syncUpdatedAt =
            Math.max(
              0,
              Number(
                result
                  .payload
                  .updatedAt ||
                0
              )
            );

          if (
            hasLocal &&
            localUpdatedAt >
              syncUpdatedAt
          ) {
            const state =
              await writeLocalState(
                local[
                  PRESETS_KEY
                ],
                local[
                  ACTIVE_KEY
                ],
                localUpdatedAt
              );

            await writeSyncPayload(
              state.presets,
              state.activePresetId,
              localUpdatedAt
            );

            return state;
          }

          return writeLocalState(
            result.payload.presets,
            result.payload.activePresetId,
            syncUpdatedAt
          );
        }
      )();

    try {
      return await syncHydrationPromise;
    } finally {
      syncHydrationPromise =
        null;
    }
  }

  function installSyncListener() {
    if (
      syncListenerInstalled
    ) {
      return;
    }

    syncListenerInstalled =
      true;

    chrome.storage.onChanged.addListener(
      (
        changes,
        areaName
      ) => {
        if (
          areaName !==
            "sync"
        ) {
          return;
        }

        const relevant =
          Boolean(
            changes[
              SYNC_META_KEY
            ]
          ) ||
          Object.keys(
            changes
          ).some(
            (key) =>
              key.startsWith(
                SYNC_CHUNK_PREFIX
              )
          );

        if (!relevant) {
          return;
        }

        void hydrateFromSync();
      }
    );
  }

  async function writeState(
    presets,
    activePresetId = ""
  ) {
    const updatedAt =
      Date.now();

    const state =
      await writeLocalState(
        presets,
        activePresetId,
        updatedAt
      );

    await writeSyncPayload(
      state.presets,
      state.activePresetId,
      updatedAt
    );

    return state;
  }

  async function migrateLegacy() {
    installSyncListener();

    const syncResult =
      await readSyncPayload();

    const data =
      await chrome.storage.local.get([
        PRESETS_KEY,
        ACTIVE_KEY,
        LOCAL_SYNC_META_KEY,
        "notionDataSourceId",
        "notionTitleProperty",
        "notionUrlProperty",
        "notionWorkspaceId",
        "notionWorkspaceName",
        "notionWorkspaceUserId",
        "notionWorkspaceSpaceViewIds"
      ]);

    const hasLocalPresets =
      Array.isArray(
        data[
          PRESETS_KEY
        ]
      );

    const localUpdatedAt =
      Math.max(
        0,
        Number(
          data[
            LOCAL_SYNC_META_KEY
          ]?.updatedAt ||
          0
        )
      );

    if (
      syncResult.status ===
        "ok" &&
      syncResult.payload
    ) {
      const syncUpdatedAt =
        Math.max(
          0,
          Number(
            syncResult
              .payload
              .updatedAt ||
            0
          )
        );

      if (
        hasLocalPresets &&
        localUpdatedAt >
          syncUpdatedAt
      ) {
        const state =
          await writeLocalState(
            data[
              PRESETS_KEY
            ],
            data[
              ACTIVE_KEY
            ],
            localUpdatedAt
          );

        await writeSyncPayload(
          state.presets,
          state.activePresetId,
          localUpdatedAt
        );

        return state;
      }

      return writeLocalState(
        syncResult.payload.presets,
        syncResult.payload.activePresetId,
        syncUpdatedAt
      );
    }

    if (
      hasLocalPresets
    ) {
      if (
        syncResult.status ===
          "error"
      ) {
        return writeLocalState(
          data[
            PRESETS_KEY
          ],
          data[
            ACTIVE_KEY
          ],
          localUpdatedAt
        );
      }

      return writeState(
        data[
          PRESETS_KEY
        ],
        data[
          ACTIVE_KEY
        ]
      );
    }

    const hasLegacyDestination =
      Boolean(
        cleanText(
          data.notionDataSourceId
        )
      );

    if (!hasLegacyDestination) {
      if (
        syncResult.status ===
          "error"
      ) {
        return writeLocalState(
          [],
          "",
          0
        );
      }

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

    if (
      syncResult.status ===
        "error"
    ) {
      return writeLocalState(
        [
          preset
        ],
        preset.id,
        0
      );
    }

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

  async function replacePresets(
    presets,
    activePresetId = ""
  ) {
    if (
      !Array.isArray(
        presets
      )
    ) {
      throw new Error(
        "Imported Notion presets are invalid."
      );
    }

    return writeState(
      presets,
      activePresetId
    );
  }

  globalThis.ClipNestNotionStore =
    Object.freeze({
      migrateLegacy,
      listPresets,
      replacePresets,
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
