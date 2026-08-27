/*
 * ClipNest multi-vault storage.
 *
 * Directory handles stay in IndexedDB.
 * Lightweight vault metadata and per-vault settings
 * live in chrome.storage.local.
 */

(() => {
  "use strict";

  const DB_NAME =
    "clip-to-notion-obsidian";

  const DB_VERSION = 1;

  const STORE_NAME =
    "handles";

  const LEGACY_VAULT_KEY =
    "obsidian-vault";

  const VAULT_KEY_PREFIX =
    "obsidian-vault:";

  const VAULTS_STORAGE_KEY =
    "obsidianVaults";

  const ACTIVE_STORAGE_KEY =
    "obsidianActiveVaultId";

  const CONFIGS_STORAGE_KEY =
    "obsidianVaultConfigs";

  const CACHE_KEYS = [
    "obsidianTagCache",
    "obsidianTagCacheUpdatedAt",
    "obsidianTagCacheFileCount",
    "obsidianTemplateCache",
    "obsidianTemplateCacheUpdatedAt",
    "obsidianTemplateFolders"
  ];

  function openDb() {
    return new Promise(
      (resolve, reject) => {
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

  async function getHandleByKey(
    key
  ) {
    const db =
      await openDb();

    try {
      return await new Promise(
        (resolve, reject) => {
          const tx =
            db.transaction(
              STORE_NAME,
              "readonly"
            );

          const request =
            tx.objectStore(
              STORE_NAME
            ).get(key);

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

  async function putHandleByKey(
    key,
    handle
  ) {
    const db =
      await openDb();

    try {
      await new Promise(
        (resolve, reject) => {
          const tx =
            db.transaction(
              STORE_NAME,
              "readwrite"
            );

          tx.objectStore(
            STORE_NAME
          ).put(
            handle,
            key
          );

          tx.oncomplete =
            () => resolve();

          tx.onerror =
            () =>
              reject(
                tx.error
              );
        }
      );
    } finally {
      db.close();
    }
  }

  async function deleteHandleByKey(
    key
  ) {
    const db =
      await openDb();

    try {
      await new Promise(
        (resolve, reject) => {
          const tx =
            db.transaction(
              STORE_NAME,
              "readwrite"
            );

          tx.objectStore(
            STORE_NAME
          ).delete(key);

          tx.oncomplete =
            () => resolve();

          tx.onerror =
            () =>
              reject(
                tx.error
              );
        }
      );
    } finally {
      db.close();
    }
  }

  function createVaultId() {
    if (
      globalThis.crypto
        ?.randomUUID
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

  function normalizeVaults(value) {
    return Array.isArray(value)
      ? value
          .filter(
            (item) =>
              item &&
              typeof item.id ===
                "string"
          )
          .map(
            (item) => ({
              id: item.id,
              name:
                String(
                  item.name ||
                  "Obsidian Vault"
                )
            })
          )
      : [];
  }

  function normalizeConfigs(value) {
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
        ? value
        : {}
    );
  }

  async function clearCaches() {
    await chrome.storage.local.remove(
      CACHE_KEYS
    );
  }

  async function readGlobalConfig() {
    const data =
      await chrome.storage.local.get([
        "obsidianSubfolder",
        "obsidianDefaultTags",
        "obsidianDefaultTemplatePath",
        "obsidianOpenAfterSave"
      ]);

    return {
      subfolder:
        String(
          data.obsidianSubfolder ||
          ""
        ),

      defaultTags:
        String(
          data.obsidianDefaultTags ||
          ""
        ),

      defaultTemplatePath:
        String(
          data.obsidianDefaultTemplatePath ||
          ""
        ),

      openAfterSave:
        data.obsidianOpenAfterSave ===
        true
    };
  }

  async function applyConfig(config) {
    const value =
      config || {};

    await chrome.storage.local.set({
      obsidianSubfolder:
        String(
          value.subfolder ||
          ""
        ),

      obsidianDefaultTags:
        String(
          value.defaultTags ||
          ""
        ),

      obsidianDefaultTemplatePath:
        String(
          value.defaultTemplatePath ||
          ""
        ),

      obsidianOpenAfterSave:
        value.openAfterSave ===
        true
    });
  }

  async function migrateLegacy() {
    const stored =
      await chrome.storage.local.get([
        VAULTS_STORAGE_KEY,
        ACTIVE_STORAGE_KEY,
        CONFIGS_STORAGE_KEY
      ]);

    const existing =
      normalizeVaults(
        stored[
          VAULTS_STORAGE_KEY
        ]
      );

    if (existing.length) {
      const active =
        existing.some(
          (vault) =>
            vault.id ===
            stored[
              ACTIVE_STORAGE_KEY
            ]
        )
          ? stored[
              ACTIVE_STORAGE_KEY
            ]
          : existing[0].id;

      if (
        active !==
        stored[
          ACTIVE_STORAGE_KEY
        ]
      ) {
        await chrome.storage.local.set({
          [ACTIVE_STORAGE_KEY]:
            active
        });
      }

      return {
        vaults: existing,
        activeVaultId: active,
        configs:
          normalizeConfigs(
            stored[
              CONFIGS_STORAGE_KEY
            ]
          )
      };
    }

    const legacyHandle =
      await getHandleByKey(
        LEGACY_VAULT_KEY
      );

    if (!legacyHandle) {
      return {
        vaults: [],
        activeVaultId: "",
        configs: {}
      };
    }

    const id =
      createVaultId();

    await putHandleByKey(
      VAULT_KEY_PREFIX + id,
      legacyHandle
    );

    const config =
      await readGlobalConfig();

    const vaults = [
      {
        id,
        name:
          legacyHandle.name ||
          "Obsidian Vault"
      }
    ];

    const configs = {
      [id]: config
    };

    await chrome.storage.local.set({
      [VAULTS_STORAGE_KEY]:
        vaults,

      [ACTIVE_STORAGE_KEY]:
        id,

      [CONFIGS_STORAGE_KEY]:
        configs
    });

    /*
     * Intentionally keep the legacy IDB entry.
     * That makes rollback to v0.6.4 safe.
     */

    return {
      vaults,
      activeVaultId: id,
      configs
    };
  }

  async function listVaults() {
    return migrateLegacy();
  }

  async function getActiveVaultId() {
    const info =
      await migrateLegacy();

    return (
      info.activeVaultId ||
      ""
    );
  }

  async function saveCurrentConfig() {
    const info =
      await migrateLegacy();

    if (!info.activeVaultId) {
      return;
    }

    const configs = {
      ...normalizeConfigs(
        info.configs
      )
    };

    configs[
      info.activeVaultId
    ] =
      await readGlobalConfig();

    await chrome.storage.local.set({
      [CONFIGS_STORAGE_KEY]:
        configs
    });
  }

  async function updateActiveConfig(
    partial = {}
  ) {
    const info =
      await migrateLegacy();

    const id =
      info.activeVaultId;

    if (!id) {
      return;
    }

    const configs = {
      ...normalizeConfigs(
        info.configs
      )
    };

    const previous =
      configs[id] || {};

    configs[id] = {
      ...previous,
      ...partial
    };

    await chrome.storage.local.set({
      [CONFIGS_STORAGE_KEY]:
        configs
    });
  }

  async function activateVault(
    id
  ) {
    const info =
      await migrateLegacy();

    const target =
      info.vaults.find(
        (vault) =>
          vault.id === id
      );

    if (!target) {
      throw new Error(
        "That Obsidian vault is no longer connected."
      );
    }

    if (
      info.activeVaultId === id
    ) {
      return target;
    }

    if (info.activeVaultId) {
      await saveCurrentConfig();
    }

    const refreshed =
      await chrome.storage.local.get([
        CONFIGS_STORAGE_KEY
      ]);

    const configs =
      normalizeConfigs(
        refreshed[
          CONFIGS_STORAGE_KEY
        ]
      );

    await chrome.storage.local.set({
      [ACTIVE_STORAGE_KEY]:
        id
    });

    await applyConfig(
      configs[id] || {}
    );

    await clearCaches();

    return target;
  }

  async function getVaultHandle(
    id = ""
  ) {
    const info =
      await migrateLegacy();

    const vaultId =
      id ||
      info.activeVaultId;

    if (!vaultId) {
      return null;
    }

    return getHandleByKey(
      VAULT_KEY_PREFIX +
        vaultId
    );
  }

  async function addVault(
    handle
  ) {
    if (!handle) {
      throw new Error(
        "No vault folder selected."
      );
    }

    const info =
      await migrateLegacy();

    for (
      const vault of
        info.vaults
    ) {
      const existing =
        await getHandleByKey(
          VAULT_KEY_PREFIX +
            vault.id
        );

      if (
        existing &&
        typeof existing.isSameEntry ===
          "function"
      ) {
        try {
          if (
            await existing.isSameEntry(
              handle
            )
          ) {
            await activateVault(
              vault.id
            );

            return vault;
          }
        } catch {
        }
      }
    }

    const id =
      createVaultId();

    await putHandleByKey(
      VAULT_KEY_PREFIX + id,
      handle
    );

    const vault = {
      id,
      name:
        handle.name ||
        "Obsidian Vault"
    };

    const vaults = [
      ...info.vaults,
      vault
    ];

    const configs = {
      ...normalizeConfigs(
        info.configs
      ),

      [id]: {
        subfolder: "",
        defaultTags: "",
        defaultTemplatePath: "",
        openAfterSave: false
      }
    };

    await chrome.storage.local.set({
      [VAULTS_STORAGE_KEY]:
        vaults,

      [CONFIGS_STORAGE_KEY]:
        configs
    });

    await activateVault(id);

    return vault;
  }

  async function removeVault(
    id
  ) {
    const info =
      await migrateLegacy();

    if (!id) {
      return;
    }

    await deleteHandleByKey(
      VAULT_KEY_PREFIX + id
    );

    const vaults =
      info.vaults.filter(
        (vault) =>
          vault.id !== id
      );

    const configs = {
      ...normalizeConfigs(
        info.configs
      )
    };

    delete configs[id];

    const nextActive =
      info.activeVaultId === id
        ? (
            vaults[0]?.id ||
            ""
          )
        : info.activeVaultId;

    await chrome.storage.local.set({
      [VAULTS_STORAGE_KEY]:
        vaults,

      [ACTIVE_STORAGE_KEY]:
        nextActive,

      [CONFIGS_STORAGE_KEY]:
        configs
    });

    if (nextActive) {
      await applyConfig(
        configs[
          nextActive
        ] || {}
      );
    } else {
      await applyConfig({});
    }

    await clearCaches();
  }

  globalThis.ClipNestVaultStore =
    Object.freeze({
      migrateLegacy,
      listVaults,
      getActiveVaultId,
      getVaultHandle,
      addVault,
      activateVault,
      removeVault,
      saveCurrentConfig,
      updateActiveConfig
    });
})();
