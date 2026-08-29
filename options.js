const els = {};

const NOTION_OPTIONS_INTENT_KEY =
  "clipnestNotionOptionsIntent";

const SETTINGS_EXPORT_FORMAT =
  "clipnest-settings";

const SETTINGS_EXPORT_VERSION =
  1;

const NOTION_FIELD_MEMORY_KEY =
  "clipnestNotionFieldMemoryV1";

let notionOptionsReady =
  false;

let notionOptionsIntentHandling =
  false;

let settingsDirty =
  false;

let settingsSaveHideTimer =
  null;

document.addEventListener(
  "DOMContentLoaded",
  init
);

chrome.storage.onChanged.addListener(
  (
    changes,
    areaName
  ) => {
    if (
      areaName !==
        "local" ||
      !notionOptionsReady ||
      !changes[
        NOTION_OPTIONS_INTENT_KEY
      ]?.newValue
    ) {
      return;
    }

    void handleNotionOptionsIntent();
  }
);

async function init() {
  for (const id of [
    "defaultDestination",
    "quickClipNotionPresetField",
    "quickClipNotionPresetId",
    "notionConnectionTitle",
    "notionConnectionStatus",
    "refreshNotionWorkspaces",
    "notionPresetSelect",
    "newNotionPreset",
    "removeNotionPreset",
    "notionPresetName",
    "notionWorkspaceSelect",
    "notionWorkspacePickerButton",
    "notionWorkspacePickerIcon",
    "notionWorkspacePickerLabel",
    "notionWorkspacePickerMenu",
    "notionWorkspaceHelp",
    "notionDestinationSearch",
    "notionDestinationResults",
    "notionDataSourceId",
    "notionDataSourceHelp",
    "notionTitleProperty",
    "notionUrlProperty",
    "notionTagsProperty",
    "notionStatus",
    "chooseVault",
    "enableQuickClipAccess",
    "vaultSelect",
    "vaultName",
    "disconnectVault",
    "obsidianStatus",
    "exportSettings",
    "importSettings",
    "importSettingsFile",
    "settingsBackupStatus",
    "settingsSavebar",
    "saveSettings",
    "saveStatus"
  ]) {
    els[id] =
      document.getElementById(id);
  }

  els.saveSettings.addEventListener(
    "click",
    saveSettings
  );

  for (
    const field of [
      els.defaultDestination,
      els.quickClipNotionPresetId,
      els.notionPresetName
    ]
  ) {
    field.addEventListener(
      "input",
      markSettingsDirty
    );

    field.addEventListener(
      "change",
      markSettingsDirty
    );
  }

  els.defaultDestination.addEventListener(
    "change",
    updateQuickClipPresetVisibility
  );

  els.exportSettings.addEventListener(
    "click",
    () => {
      void exportSettingsBackup();
    }
  );

  els.importSettings.addEventListener(
    "click",
    () => {
      els.importSettingsFile.value =
        "";

      els.importSettingsFile.click();
    }
  );

  els.importSettingsFile.addEventListener(
    "change",
    () => {
      void importSettingsBackup();
    }
  );

  els.refreshNotionWorkspaces.addEventListener(
    "click",
    async () => {
      const preset =
        await ClipNestNotionStore
          .getActivePreset();

      await refreshNotionWorkspacePicker({
        preferredWorkspaceId:
          preset?.workspaceId ||
          "",

        requestPermission:
          true
      });
    }
  );

  els.notionPresetSelect.addEventListener(
    "change",
    switchNotionPreset
  );

  els.newNotionPreset.addEventListener(
    "click",
    createNotionPreset
  );

  els.removeNotionPreset.addEventListener(
    "click",
    removeNotionPreset
  );

  els.notionWorkspaceSelect.addEventListener(
    "change",
    handleNotionWorkspaceChange
  );

  els.notionDataSourceId.addEventListener(
    "change",
    handleNotionDataSourceChange
  );

  els.notionDestinationSearch.addEventListener(
    "focus",
    openNotionDestinationResults
  );

  els.notionDestinationSearch.addEventListener(
    "input",
    () => {
      openNotionDestinationResults();
      clearTimeout(
        notionDestinationSearchTimer
      );

      notionDestinationSearchTimer =
        setTimeout(
          () => {
            void refreshNotionDataSources(
              els.notionDestinationSearch.value
            );
          },
          300
        );
    }
  );

  for (
    const select of [
      els.notionTitleProperty,
      els.notionUrlProperty,
      els.notionTagsProperty
    ]
  ) {
    select.addEventListener(
      "change",
      handleNotionPropertyMappingChange
    );
  }

  els.notionWorkspacePickerButton.addEventListener(
    "click",
    toggleNotionWorkspacePicker
  );

  document.addEventListener(
    "click",
    (event) => {
      if (
        !event.target.closest(
          ".notion-workspace-picker"
        )
      ) {
        closeNotionWorkspacePicker();
      }
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closeNotionWorkspacePicker();
      }
    }
  );

  els.chooseVault.addEventListener(
    "click",
    chooseVault
  );

  els.enableQuickClipAccess.addEventListener(
    "click",
    enableQuickClipAccess
  );

  els.disconnectVault.addEventListener(
    "click",
    disconnectVault
  );

  els.vaultSelect.addEventListener(
    "change",
    async () => {
      const id =
        els.vaultSelect.value;

      if (!id) {
        return;
      }

      await ClipNestVaultStore
        .activateVault(id);

      await loadSettings();
      await refreshVaultList();

      showStatus(
        els.obsidianStatus,
        "Active vault changed.",
        "success"
      );
    }
  );

  await Promise.all([
    ClipNestVaultStore.migrateLegacy(),
    ClipNestNotionStore.migrateLegacy()
  ]);

  await refreshVaultList();
  await refreshNotionPresetList();
  await loadSettings();

  setupNotionFieldEditor();

  notionOptionsReady =
    true;

  await preparePendingQuickClipAccessInSettings();

  await handleNotionOptionsIntent();
}

function updateQuickClipPresetVisibility() {
  els.quickClipNotionPresetField.hidden =
    els.defaultDestination.value !==
      "notion";
}

async function refreshQuickClipPresetList(
  preferredId = ""
) {
  const info =
    await ClipNestNotionStore
      .listPresets();

  const presets =
    Array.isArray(
      info.presets
    )
      ? info.presets
      : [];

  els.quickClipNotionPresetId
    .replaceChildren();

  if (!presets.length) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      "";

    option.textContent =
      "No presets configured";

    els.quickClipNotionPresetId
      .append(
        option
      );

    els.quickClipNotionPresetId.disabled =
      true;

    return "";
  }

  els.quickClipNotionPresetId.disabled =
    false;

  for (const preset of presets) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      preset.id;

    option.textContent =
      preset.name ||
      "Untitled preset";

    els.quickClipNotionPresetId
      .append(
        option
      );
  }

  const requestedId =
    String(
      preferredId || ""
    ).trim();

  let selectedId =
    presets.some(
      (preset) =>
        preset.id ===
        requestedId
    )
      ? requestedId
      : "";

  if (!selectedId) {
    selectedId =
      presets.some(
        (preset) =>
          preset.id ===
          info.activePresetId
      )
        ? info.activePresetId
        : presets[0].id;
  }

  els.quickClipNotionPresetId.value =
    selectedId;

  return selectedId;
}

async function loadSettings() {
  const settings =
    await chrome.storage.local.get([
      "defaultDestination",
      "quickClipNotionPresetId"
    ]);

  els.defaultDestination.value =
    settings.defaultDestination ||
    "obsidian";


  const quickClipPresetId =
    await refreshQuickClipPresetList(
      settings.quickClipNotionPresetId ||
      ""
    );

  if (
    quickClipPresetId !==
      String(
        settings.quickClipNotionPresetId ||
        ""
      )
  ) {
    await chrome.storage.local.set({
      quickClipNotionPresetId
    });
  }

  updateQuickClipPresetVisibility();

  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  els.notionPresetName.value =
    preset?.name ||
    "";

  const disabled =
    !preset;

  els.notionPresetName.disabled =
    disabled;

  els.notionWorkspaceSelect.disabled =
    disabled;

  els.notionWorkspacePickerButton.disabled =
    disabled;

  els.removeNotionPreset.disabled =
    disabled;

  await refreshNotionWorkspacePicker({
    preferredWorkspaceId:
      preset?.workspaceId ||
      "",

    requestPermission:
      false
  });

  prepareNotionDestinationField(
    preset
  );

  if (
    preset?.workspaceId
  ) {
    await refreshNotionDataSources(
      ""
    );
  }

  const refreshedPreset =
    await ClipNestNotionStore
      .getActivePreset();

  if (
    refreshedPreset
      ?.destinationType ===
        "collection"
  ) {
    try {
      const result =
        await loadNotionDatabaseSchemaForPreset(
          refreshedPreset
        );

      const preview =
        result.database.properties
          .slice(0, 8)
          .map(
            (property) =>
              `${property.name} (${property.type})`
          )
          .join(", ");

      els.notionDataSourceHelp.textContent =
        `${result.database.properties.length} properties found${
          preview
            ? `: ${preview}`
            : ""
        }.`;
    } catch (error) {
      setNotionPropertySelectorsUnavailable(
        "Could not load properties"
      );

      els.notionDataSourceHelp.textContent =
        error.message ||
        String(error);
    }
  } else {
    renderNotionPropertySelectors(
      refreshedPreset,
      []
    );
  }

  clearSettingsDirty();
}

async function saveSettings() {
  await chrome.storage.local.set({
    defaultDestination:
      els.defaultDestination.value,

    quickClipNotionPresetId:
      els.quickClipNotionPresetId.value ||
      ""
  });

  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  if (preset) {
    await ClipNestNotionStore
      .updateActivePreset({
        name:
          els.notionPresetName.value
      });

    await refreshNotionPresetList();
  }

  showSettingsSaved();
}

function markSettingsDirty() {
  settingsDirty =
    true;

  clearTimeout(
    settingsSaveHideTimer
  );

  settingsSaveHideTimer =
    null;

  els.settingsSavebar.hidden =
    false;

  document
    .querySelector(
      ".page"
    )
    ?.classList.add(
      "settings-dirty"
    );

  els.saveStatus.textContent =
    "";

  els.saveStatus.className =
    "status";
}

function clearSettingsDirty() {
  settingsDirty =
    false;

  clearTimeout(
    settingsSaveHideTimer
  );

  settingsSaveHideTimer =
    null;

  els.settingsSavebar.hidden =
    true;

  document
    .querySelector(
      ".page"
    )
    ?.classList.remove(
      "settings-dirty"
    );

  els.saveStatus.textContent =
    "";

  els.saveStatus.className =
    "status";
}

function showSettingsSaved() {
  settingsDirty =
    false;

  clearTimeout(
    settingsSaveHideTimer
  );

  els.settingsSavebar.hidden =
    false;

  document
    .querySelector(
      ".page"
    )
    ?.classList.add(
      "settings-dirty"
    );

  showStatus(
    els.saveStatus,
    "Saved.",
    "success"
  );

  settingsSaveHideTimer =
    setTimeout(
      () => {
        if (settingsDirty) {
          return;
        }

        els.settingsSavebar.hidden =
          true;

        document
          .querySelector(
            ".page"
          )
          ?.classList.remove(
            "settings-dirty"
          );
      },
      900
    );
}

function portableObject(
  value
) {
  return (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  )
    ? value
    : {};
}

function sanitizeNotionFieldMemory(
  presets,
  memory
) {
  const source =
    portableObject(
      memory
    );

  const allowed =
    new Set();

  for (
    const preset of
      Array.isArray(
        presets
      )
        ? presets
        : []
  ) {
    const presetId =
      String(
        preset?.id ||
        ""
      ).trim();

    if (!presetId) {
      continue;
    }

    for (
      const field of
        Array.isArray(
          preset?.fields
        )
          ? preset.fields
          : []
    ) {
      const type =
        String(
          field?.propertyType ||
          ""
        );

      if (
        type !== "select" &&
        type !== "status"
      ) {
        continue;
      }

      const propertyId =
        String(
          field?.propertyId ||
          ""
        );

      if (!propertyId) {
        continue;
      }

      allowed.add(
        `${presetId}::${propertyId}`
      );
    }
  }

  const result =
    {};

  for (
    const [
      key,
      value
    ] of Object.entries(
      source
    )
  ) {
    if (
      !allowed.has(
        key
      ) ||
      typeof value !==
        "string"
    ) {
      continue;
    }

    result[key] =
      value;
  }

  return result;
}

async function exportSettingsBackup() {
  try {
    const notion =
      await ClipNestNotionStore
        .listPresets();

    const local =
      await chrome.storage.local.get([
        "defaultDestination",
        "quickClipNotionPresetId",
        NOTION_FIELD_MEMORY_KEY
      ]);

    const backup = {
      format:
        SETTINGS_EXPORT_FORMAT,

      version:
        SETTINGS_EXPORT_VERSION,

      exportedAt:
        new Date().toISOString(),

      settings: {
        defaultDestination:
          local.defaultDestination ===
            "notion"
            ? "notion"
            : "obsidian",

        quickClipNotionPresetId:
          String(
            local.quickClipNotionPresetId ||
            ""
          ),

        notion: {
          presets:
            Array.isArray(
              notion.presets
            )
              ? notion.presets
              : [],

          activePresetId:
            String(
              notion.activePresetId ||
              ""
            )
        },

        notionFieldMemory:
          sanitizeNotionFieldMemory(
            notion.presets,
            local[
              NOTION_FIELD_MEMORY_KEY
            ]
          )
      }
    };

    const json =
      JSON.stringify(
        backup,
        null,
        2
      ) +
      "\n";

    const blob =
      new Blob(
        [
          json
        ],
        {
          type:
            "application/json"
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    const date =
      new Date()
        .toISOString()
        .slice(
          0,
          10
        );

    link.href =
      url;

    link.download =
      `clipnest-settings-${date}.json`;

    link.style.display =
      "none";

    document.body.append(
      link
    );

    link.click();
    link.remove();

    setTimeout(
      () => {
        URL.revokeObjectURL(
          url
        );
      },
      1000
    );

    showStatus(
      els.settingsBackupStatus,
      "Settings exported.",
      "success"
    );
  } catch (error) {
    showStatus(
      els.settingsBackupStatus,
      error?.message ||
        String(error),
      "error"
    );
  }
}

function validateSettingsBackup(
  raw
) {
  if (
    !raw ||
    typeof raw !==
      "object" ||
    Array.isArray(
      raw
    )
  ) {
    throw new Error(
      "This is not a valid ClipNest settings file."
    );
  }

  if (
    raw.format !==
      SETTINGS_EXPORT_FORMAT
  ) {
    throw new Error(
      "This file is not a ClipNest settings backup."
    );
  }

  if (
    Number(
      raw.version
    ) !==
      SETTINGS_EXPORT_VERSION
  ) {
    throw new Error(
      "This ClipNest settings backup version is not supported."
    );
  }

  const settings =
    raw.settings;

  if (
    !settings ||
    typeof settings !==
      "object" ||
    Array.isArray(
      settings
    )
  ) {
    throw new Error(
      "The ClipNest settings backup is incomplete."
    );
  }

  if (
    ![
      "obsidian",
      "notion"
    ].includes(
      settings.defaultDestination
    )
  ) {
    throw new Error(
      "The backup has an invalid default destination."
    );
  }

  const notion =
    settings.notion;

  if (
    !notion ||
    typeof notion !==
      "object" ||
    Array.isArray(
      notion
    ) ||
    !Array.isArray(
      notion.presets
    )
  ) {
    throw new Error(
      "The backup has invalid Notion preset data."
    );
  }

  const ids =
    new Set();

  for (
    const preset of
      notion.presets
  ) {
    if (
      !preset ||
      typeof preset !==
        "object" ||
      Array.isArray(
        preset
      )
    ) {
      throw new Error(
        "The backup contains an invalid Notion preset."
      );
    }

    const id =
      String(
        preset.id ||
        ""
      ).trim();

    if (!id) {
      throw new Error(
        "A Notion preset in the backup has no ID."
      );
    }

    if (
      ids.has(
        id
      )
    ) {
      throw new Error(
        "The backup contains duplicate Notion preset IDs."
      );
    }

    ids.add(
      id
    );
  }

  const activePresetId =
    String(
      notion.activePresetId ||
      ""
    ).trim();

  if (
    activePresetId &&
    !ids.has(
      activePresetId
    )
  ) {
    throw new Error(
      "The active Notion preset is missing from the backup."
    );
  }

  const quickClipNotionPresetId =
    String(
      settings.quickClipNotionPresetId ||
      ""
    ).trim();

  if (
    quickClipNotionPresetId &&
    !ids.has(
      quickClipNotionPresetId
    )
  ) {
    throw new Error(
      "The Quick Clip Notion preset is missing from the backup."
    );
  }

  const notionFieldMemory =
    settings.notionFieldMemory ??
    {};

  if (
    !notionFieldMemory ||
    typeof notionFieldMemory !==
      "object" ||
    Array.isArray(
      notionFieldMemory
    )
  ) {
    throw new Error(
      "The backup has invalid remembered Notion field values."
    );
  }

  return {
    defaultDestination:
      settings.defaultDestination,

    quickClipNotionPresetId,

    notion: {
      presets:
        notion.presets,

      activePresetId
    },

    notionFieldMemory
  };
}

async function importSettingsBackup() {
  const input =
    els.importSettingsFile;

  const file =
    input.files?.[
      0
    ];

  if (!file) {
    return;
  }

  try {
    if (
      file.size >
      2 * 1024 * 1024
    ) {
      throw new Error(
        "This settings file is unexpectedly large."
      );
    }

    const raw =
      JSON.parse(
        await file.text()
      );

    const settings =
      validateSettingsBackup(
        raw
      );

    const confirmed =
      window.confirm(
        "Import this ClipNest backup?\n\n" +
        "This will replace your current Notion presets and update Chrome Sync. " +
        "Obsidian vaults and your Notion login will not be changed."
      );

    if (!confirmed) {
      showStatus(
        els.settingsBackupStatus,
        "Import cancelled.",
        ""
      );

      return;
    }

    await ClipNestNotionStore
      .replacePresets(
        settings.notion.presets,
        settings.notion.activePresetId
      );

    await chrome.storage.local.set({
      defaultDestination:
        settings.defaultDestination,

      quickClipNotionPresetId:
        settings.quickClipNotionPresetId,

      [NOTION_FIELD_MEMORY_KEY]:
        sanitizeNotionFieldMemory(
          settings.notion.presets,
          settings.notionFieldMemory
        )
    });

    await refreshNotionPresetList();
    await loadSettings();

    showStatus(
      els.settingsBackupStatus,
      "Settings imported.",
      "success"
    );
  } catch (error) {
    showStatus(
      els.settingsBackupStatus,
      error?.message ||
        String(error),
      "error"
    );
  } finally {
    input.value =
      "";
  }
}

let notionWorkspaceCache =
  [];

let notionDestinationCache =
  [];

let notionDestinationSearchTimer =
  null;

let notionSchemaProperties =
  [];

function notionWorkspaceIconValue(
  workspace
) {
  const icon =
    workspace?.icon;

  if (!icon) {
    return {
      type:
        "fallback",

      value:
        String(
          workspace?.name ||
          "N"
        )
          .trim()
          .charAt(0)
          .toUpperCase() ||
        "N"
    };
  }

  if (
    typeof icon ===
      "string"
  ) {
    const value =
      icon.trim();

    if (
      /^https?:\/\//i.test(
        value
      ) ||
      /^data:/i.test(
        value
      )
    ) {
      return {
        type:
          "image",

        value
      };
    }

    if (
      value.startsWith(
        "/"
      )
    ) {
      return {
        type:
          "image",

        value:
          `https://app.notion.com${value}`
      };
    }

    return {
      type:
        "emoji",

      value
    };
  }

  if (
    typeof icon ===
      "object"
  ) {
    const url =
      icon.url ||
      icon.external?.url ||
      icon.file?.url ||
      icon.file_upload?.url ||
      "";

    if (url) {
      return {
        type:
          "image",

        value:
          url
      };
    }

    const emoji =
      icon.emoji ||
      icon.value ||
      "";

    if (emoji) {
      return {
        type:
          "emoji",

        value:
          emoji
      };
    }
  }

  return {
    type:
      "fallback",

    value:
      String(
        workspace?.name ||
        "N"
      )
        .trim()
        .charAt(0)
        .toUpperCase() ||
      "N"
  };
}

function fillNotionWorkspaceAvatar(
  container,
  workspace
) {
  container.replaceChildren();

  container.classList.remove(
    "notion-workspace-avatar-fallback"
  );

  const icon =
    notionWorkspaceIconValue(
      workspace
    );

  if (
    icon.type ===
      "image"
  ) {
    const image =
      document.createElement(
        "img"
      );

    image.alt = "";

    image.src =
      icon.value;

    image.addEventListener(
      "error",
      () => {
        container.replaceChildren();

        container.classList.add(
          "notion-workspace-avatar-fallback"
        );

        container.textContent =
          String(
            workspace?.name ||
            "N"
          )
            .trim()
            .charAt(0)
            .toUpperCase() ||
          "N";
      },
      {
        once:
          true
      }
    );

    container.append(
      image
    );

    return;
  }

  container.textContent =
    icon.value;

  if (
    icon.type ===
      "fallback"
  ) {
    container.classList.add(
      "notion-workspace-avatar-fallback"
    );
  }
}

function notionWorkspaceMeta(
  workspace
) {
  const user =
    getNotionWorkspaceUser(
      workspace
    );

  const identity =
    user?.email ||
    user?.name ||
    "";

  const plan =
    workspace?.planInfo ||
    "";

  if (
    identity &&
    plan
  ) {
    return (
      `${identity} · ${plan}`
    );
  }

  return (
    identity ||
    plan ||
    ""
  );
}

function renderNotionWorkspacePicker() {
  const selectedId =
    els.notionWorkspaceSelect
      .value ||
    "";

  const selected =
    notionWorkspaceCache.find(
      (workspace) =>
        workspace.id ===
        selectedId
    );

  els.notionWorkspacePickerMenu
    .replaceChildren();

  for (
    const workspace of
      notionWorkspaceCache
  ) {
    const item =
      document.createElement(
        "button"
      );

    item.type =
      "button";

    item.className =
      "notion-workspace-picker-item";

    item.setAttribute(
      "role",
      "option"
    );

    item.setAttribute(
      "aria-selected",
      workspace.id ===
        selectedId
        ? "true"
        : "false"
    );

    const avatar =
      document.createElement(
        "span"
      );

    avatar.className =
      "notion-workspace-avatar";

    fillNotionWorkspaceAvatar(
      avatar,
      workspace
    );

    const copy =
      document.createElement(
        "span"
      );

    copy.className =
      "notion-workspace-picker-item-copy";

    const name =
      document.createElement(
        "span"
      );

    name.className =
      "notion-workspace-picker-item-name";

    name.textContent =
      workspace.name;

    const meta =
      document.createElement(
        "span"
      );

    meta.className =
      "notion-workspace-picker-item-meta";

    meta.textContent =
      notionWorkspaceMeta(
        workspace
      );

    copy.append(
      name,
      meta
    );

    const check =
      document.createElement(
        "span"
      );

    check.className =
      "notion-workspace-picker-check";

    check.textContent =
      workspace.id ===
        selectedId
        ? "✓"
        : "";

    item.append(
      avatar,
      copy,
      check
    );

    item.addEventListener(
      "click",
      async () => {
        els.notionWorkspaceSelect.value =
          workspace.id;

        closeNotionWorkspacePicker();

        await handleNotionWorkspaceChange();

        renderNotionWorkspacePicker();
      }
    );

    els.notionWorkspacePickerMenu.append(
      item
    );
  }

  if (selected) {
    els.notionWorkspacePickerLabel.textContent =
      selected.name;

    fillNotionWorkspaceAvatar(
      els.notionWorkspacePickerIcon,
      selected
    );
  } else {
    els.notionWorkspacePickerLabel.textContent =
      "Choose a Notion workspace…";

    els.notionWorkspacePickerIcon
      .replaceChildren();

    els.notionWorkspacePickerIcon
      .classList.add(
        "notion-workspace-avatar-fallback"
      );

    els.notionWorkspacePickerIcon.textContent =
      "N";
  }
}

function openNotionWorkspacePicker() {
  if (
    els.notionWorkspacePickerButton
      .disabled
  ) {
    return;
  }

  renderNotionWorkspacePicker();

  els.notionWorkspacePickerMenu
    .classList.remove(
      "hidden"
    );

  els.notionWorkspacePickerButton
    .setAttribute(
      "aria-expanded",
      "true"
    );
}

function closeNotionWorkspacePicker() {
  els.notionWorkspacePickerMenu
    .classList.add(
      "hidden"
    );

  els.notionWorkspacePickerButton
    .setAttribute(
      "aria-expanded",
      "false"
    );
}

function toggleNotionWorkspacePicker() {
  const isOpen =
    !els.notionWorkspacePickerMenu
      .classList.contains(
        "hidden"
      );

  if (isOpen) {
    closeNotionWorkspacePicker();
  } else {
    openNotionWorkspacePicker();
  }
}

function getNotionWorkspaceUser(
  workspace
) {
  const users =
    Array.isArray(
      workspace?.linkedUsers
    )
      ? workspace.linkedUsers
      : [];

  return (
    users.find(
      (user) =>
        user.membershipType ===
          "owner"
    ) ||
    users.find(
      (user) =>
        user.membershipType ===
          "member"
    ) ||
    users[0] ||
    null
  );
}

function notionDestinationIconDescriptor(
  destination,
  preset
) {
  let raw =
    destination?.icon;

  if (
    raw &&
    typeof raw ===
      "object"
  ) {
    raw =
      raw.url ||
      raw.external?.url ||
      raw.file?.url ||
      raw.emoji ||
      raw.value ||
      "";
  }

  const fallback = {
    type:
      "fallback",

    value:
      destination?.type ===
        "collection"
        ? "▤"
        : "□"
  };

  if (
    typeof raw !==
      "string"
  ) {
    return fallback;
  }

  const icon =
    raw.trim();

  if (!icon) {
    return fallback;
  }

  if (
    /\p{Extended_Pictographic}/u.test(
      icon
    )
  ) {
    return {
      type:
        "emoji",

      value:
        icon
    };
  }

  if (
    /^https?:\/\//i.test(
      icon
    ) ||
    /^data:/i.test(
      icon
    )
  ) {
    return {
      type:
        "image",

      value:
        icon
    };
  }

  if (
    icon.startsWith(
      "/icons/"
    ) ||
    icon.startsWith(
      "/images/"
    )
  ) {
    return {
      type:
        "image",

      value:
        `https://app.notion.com${icon}`
    };
  }

  if (
    icon.startsWith(
      "/"
    )
  ) {
    return {
      type:
        "image",

      value:
        `https://app.notion.com${icon}`
    };
  }

  if (
    icon.startsWith(
      "notion://"
    ) ||
    icon.startsWith(
      "attachment:"
    ) ||
    icon.includes(
      "amazonaws.com"
    )
  ) {
    const params =
      new URLSearchParams({
        table:
          destination?.type ===
            "collection"
            ? "collection"
            : "block",

        id:
          destination?.id ||
          "",

        spaceId:
          preset?.workspaceId ||
          "",

        userId:
          preset?.workspaceUserId ||
          "",

        cache:
          "v2"
      });

    return {
      type:
        "image",

      value:
        `https://app.notion.com/image/${
          encodeURIComponent(
            icon
          )
        }?${params.toString()}`
    };
  }

  return {
    type:
      "image",

    value:
      `https://app.notion.com/icons/${
        encodeURIComponent(
          icon
        )
      }`
  };
}

function fillNotionDestinationIcon(
  container,
  destination,
  preset
) {
  container.replaceChildren();

  container.classList.remove(
    "fallback"
  );

  const descriptor =
    notionDestinationIconDescriptor(
      destination,
      preset
    );

  if (
    descriptor.type ===
      "image"
  ) {
    const image =
      document.createElement(
        "img"
      );

    image.alt =
      "";

    image.src =
      descriptor.value;

    image.addEventListener(
      "error",
      () => {
        container.replaceChildren();

        container.classList.add(
          "fallback"
        );

        container.textContent =
          destination?.type ===
            "collection"
            ? "▤"
            : "□";
      },
      {
        once:
          true
      }
    );

    container.append(
      image
    );

    return;
  }

  container.textContent =
    descriptor.value;

  if (
    descriptor.type ===
      "fallback"
  ) {
    container.classList.add(
      "fallback"
    );
  }
}

function openNotionDestinationResults() {
  els.notionDestinationResults
    ?.classList.remove(
      "hidden"
    );
}

function closeNotionDestinationResults() {
  els.notionDestinationResults
    ?.classList.add(
      "hidden"
    );
}

function renderNotionDestinationResults(
  preset
) {
  const root =
    els.notionDestinationResults;

  root.replaceChildren();

  if (
    !preset?.workspaceId
  ) {
    return;
  }

  if (
    !notionDestinationCache.length
  ) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "notion-destination-placeholder";

    empty.textContent =
      els.notionDestinationSearch
        .value
        .trim()
        ? "No matching pages or databases."
        : "No pages or databases found.";

    root.append(
      empty
    );

    return;
  }

  const selectedValue =
    notionDestinationValue({
      type:
        preset.destinationType,

      id:
        preset.destinationId
    });

  for (
    const group of [
      {
        type:
          "collection",

        title:
          "Databases"
      },
      {
        type:
          "page",

        title:
          "Pages"
      }
    ]
  ) {
    const destinations =
      notionDestinationCache.filter(
        (destination) =>
          destination.type ===
          group.type
      );

    if (!destinations.length) {
      continue;
    }

    const section =
      document.createElement(
        "div"
      );

    section.className =
      "notion-destination-group";

    const heading =
      document.createElement(
        "div"
      );

    heading.className =
      "notion-destination-group-title";

    heading.textContent =
      group.title;

    section.append(
      heading
    );

    for (
      const destination of
        destinations
    ) {
      const value =
        notionDestinationValue(
          destination
        );

      const item =
        document.createElement(
          "button"
        );

      item.type =
        "button";

      item.className =
        "notion-destination-item";

      if (
        value ===
          selectedValue
      ) {
        item.classList.add(
          "selected"
        );
      }

      const icon =
        document.createElement(
          "span"
        );

      icon.className =
        "notion-destination-icon";

      fillNotionDestinationIcon(
        icon,
        destination,
        preset
      );

      const copy =
        document.createElement(
          "span"
        );

      copy.className =
        "notion-destination-copy";

      const name =
        document.createElement(
          "div"
        );

      name.className =
        "notion-destination-name";

      name.textContent =
        destination.name ||
        (
          destination.type ===
            "collection"
            ? "Untitled database"
            : "Untitled"
        );

      const breadcrumb =
        document.createElement(
          "div"
        );

      breadcrumb.className =
        "notion-destination-breadcrumb";

      breadcrumb.textContent =
        destination.breadcrumb ||
        (
          destination.type ===
            "collection"
            ? "Database"
            : "Page"
        );

      copy.append(
        name,
        breadcrumb
      );

      const check =
        document.createElement(
          "span"
        );

      check.className =
        "notion-destination-check";

      check.textContent =
        value ===
          selectedValue
          ? "✓"
          : "";

      item.append(
        icon,
        copy,
        check
      );

      item.addEventListener(
        "click",
        async () => {
          els.notionDataSourceId.value =
            value;

          await handleNotionDataSourceChange();
        }
      );

      section.append(
        item
      );
    }

    root.append(
      section
    );
  }
}

function findNotionSchemaProperty(
  id
) {
  return (
    notionSchemaProperties.find(
      (property) =>
        property.id ===
        id
    ) ||
    null
  );
}

function findNotionSchemaPropertyByName(
  name,
  type
) {
  const target =
    String(
      name ||
      ""
    )
      .trim()
      .toLowerCase();

  if (!target) {
    return null;
  }

  return (
    notionSchemaProperties.find(
      (property) =>
        property.type ===
          type &&
        property.name
          .trim()
          .toLowerCase() ===
          target
    ) ||
    null
  );
}

function fillNotionPropertySelect(
  select,
  properties,
  {
    selectedId = "",
    optional = false,
    emptyLabel = "None"
  } = {}
) {
  select.replaceChildren();

  if (
    optional ||
    properties.length !==
      1
  ) {
    const empty =
      document.createElement(
        "option"
      );

    empty.value =
      "";

    empty.textContent =
      optional
        ? emptyLabel
        : "Choose a property…";

    select.append(
      empty
    );
  }

  for (
    const property of
      properties
  ) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      property.id;

    option.textContent =
      property.name;

    select.append(
      option
    );
  }

  if (
    selectedId &&
    properties.some(
      (property) =>
        property.id ===
        selectedId
    )
  ) {
    select.value =
      selectedId;
  } else if (
    properties.length ===
      1
  ) {
    select.value =
      properties[0].id;
  } else {
    select.value =
      "";
  }

  select.disabled =
    properties.length ===
      0;
}

function setNotionPropertySelectorsUnavailable(
  message
) {
  notionSchemaProperties =
    [];

  for (
    const select of [
      els.notionTitleProperty,
      els.notionUrlProperty,
      els.notionTagsProperty
    ]
  ) {
    select.replaceChildren();

    const option =
      document.createElement(
        "option"
      );

    option.value =
      "";

    option.textContent =
      message;

    select.append(
      option
    );

    select.disabled =
      true;
  }
}

function resolveNotionPropertyIds(
  preset
) {
  const titleProperties =
    notionSchemaProperties.filter(
      (property) =>
        property.type ===
        "title"
    );

  const urlProperties =
    notionSchemaProperties.filter(
      (property) =>
        property.type ===
        "url"
    );

  const tagsProperties =
    notionSchemaProperties.filter(
      (property) =>
        property.type ===
        "multi_select"
    );

  let titleId =
    preset?.propertyIds
      ?.title ||
    "";

  let urlId =
    preset?.propertyIds
      ?.url ||
    "";

  let tagsId =
    preset?.propertyIds
      ?.tags ||
    "";

  if (
    !titleProperties.some(
      (property) =>
        property.id ===
        titleId
    )
  ) {
    titleId =
      findNotionSchemaPropertyByName(
        preset?.titleProperty,
        "title"
      )?.id ||
      (
        titleProperties.length ===
          1
          ? titleProperties[0].id
          : ""
      );
  }

  if (
    !urlProperties.some(
      (property) =>
        property.id ===
        urlId
    )
  ) {
    urlId =
      findNotionSchemaPropertyByName(
        preset?.urlProperty,
        "url"
      )?.id ||
      (
        urlProperties.length ===
          1
          ? urlProperties[0].id
          : ""
      );
  }

  if (
    !tagsProperties.some(
      (property) =>
        property.id ===
        tagsId
    )
  ) {
    tagsId =
      findNotionSchemaPropertyByName(
        preset?.tagsProperty ||
        preset?.propertyMappings
          ?.tags,
        "multi_select"
      )?.id ||
      (
        tagsProperties.length ===
          1
          ? tagsProperties[0].id
          : ""
      );
  }

  return {
    titleProperties,
    urlProperties,
    tagsProperties,
    titleId,
    urlId,
    tagsId
  };
}

let notionRenderedSchemaProperties =
  [];

function notionPropertyTypeLabel(
  type
) {
  const labels = {
    title:
      "Title",

    url:
      "URL",

    multi_select:
      "Multi-select",

    select:
      "Select",

    status:
      "Status",

    text:
      "Text",

    rich_text:
      "Rich text",

    checkbox:
      "Checkbox",

    date:
      "Date",

    number:
      "Number",

    person:
      "Person",

    people:
      "People",

    relation:
      "Relation",

    file:
      "Files",

    files:
      "Files"
  };

  return labels[
    String(
      type ||
      ""
    )
  ] ||
  String(
    type ||
    "unknown"
  )
    .replaceAll(
      "_",
      " "
    );
}

function notionSchemaFieldIsSupported(
  property
) {
  return [
    "title",
    "url",
    "multi_select",
    "select",
    "status",
    "text",
    "rich_text"
  ].includes(
    String(
      property?.type ||
      ""
    )
  );
}

function notionSchemaOptionLabel(
  option
) {
  return String(
    option?.value ||
    option?.name ||
    option?.label ||
    option?.id ||
    ""
  ).trim();
}

function findConfiguredNotionFieldByPropertyId(
  preset,
  propertyId
) {
  const id =
    String(
      propertyId ||
      ""
    ).trim();

  if (!id) {
    return null;
  }

  return (
    Array.isArray(
      preset?.fields
    )
      ? preset.fields
      : []
  ).find(
    (field) =>
      String(
        field?.propertyId ||
        ""
      ).trim() ===
        id
  ) ||
  null;
}

function makeNotionSchemaFieldRow(
  preset,
  property
) {
  const row =
    document.createElement(
      "div"
    );

  row.className =
    "notion-schema-field-row";

  row.dataset.propertyId =
    property.id ||
    "";

  row.dataset.propertyType =
    property.type ||
    "";

  const copy =
    document.createElement(
      "div"
    );

  copy.className =
    "notion-field-config-copy";

  const name =
    document.createElement(
      "strong"
    );

  name.textContent =
    property.name ||
    "Untitled property";

  const description =
    document.createElement(
      "small"
    );

  const type =
    String(
      property.type ||
      ""
    );

  if (type === "title") {
    description.textContent =
      "Filled from the current webpage title.";
  } else if (type === "url") {
    description.textContent =
      "Can receive the current webpage URL.";
  } else if (type === "multi_select") {
    description.textContent =
      "Can be used as the preset's tag field.";
  } else if (
    type === "select" ||
    type === "status"
  ) {
    description.textContent =
      "Choose a Notion value while clipping.";
  } else if (
    type === "text" ||
    type === "rich_text"
  ) {
    description.textContent =
      "Enter text while clipping.";
  } else {
    description.textContent =
      "This property type is not supported by ClipNest yet.";
  }

  copy.append(
    name,
    description
  );

  const badge =
    document.createElement(
      "span"
    );

  badge.className =
    "notion-field-type-badge";

  badge.textContent =
    notionPropertyTypeLabel(
      property.type
    );

  const action =
    document.createElement(
      "div"
    );

  action.className =
    "notion-schema-field-action";

  const propertyId =
    String(
      property.id ||
      ""
    );

  const mappedTitle =
    String(
      els.notionTitleProperty
        ?.value ||
      ""
    );

  const mappedUrl =
    String(
      els.notionUrlProperty
        ?.value ||
      ""
    );

  const mappedTags =
    String(
      els.notionTagsProperty
        ?.value ||
      ""
    );

  if (type === "title") {
    const label =
      document.createElement(
        "label"
      );

    label.className =
      "notion-field-visibility";

    const input =
      document.createElement(
        "input"
      );

    input.type =
      "checkbox";

    input.id =
      "notionTitleVisible";

    input.dataset.notionFieldAction =
      "title-visible";

    const configured =
      findConfiguredNotionField(
        preset,
        "title"
      );

    input.checked =
      configured
        ? configured.visible !==
            false
        : true;

    const labelText =
      document.createElement(
        "span"
      );

    labelText.textContent =
      "Show in clipper";

    label.append(
      input,
      labelText
    );

    action.append(
      label
    );
  } else if (type === "url") {
    const label =
      document.createElement(
        "label"
      );

    label.className =
      "notion-field-visibility";

    const input =
      document.createElement(
        "input"
      );

    input.type =
      "checkbox";

    input.dataset.notionFieldAction =
      "url";

    input.dataset.propertyId =
      propertyId;

    input.checked =
      mappedUrl ===
        propertyId;

    const labelText =
      document.createElement(
        "span"
      );

    labelText.textContent =
      "Save page URL";

    label.append(
      input,
      labelText
    );

    action.append(
      label
    );
  } else if (
    type === "multi_select"
  ) {
    const label =
      document.createElement(
        "label"
      );

    label.className =
      "notion-field-visibility";

    const input =
      document.createElement(
        "input"
      );

    input.type =
      "checkbox";

    input.dataset.notionFieldAction =
      "tags";

    input.dataset.propertyId =
      propertyId;

    input.checked =
      mappedTags ===
        propertyId;

    if (input.checked) {
      input.id =
        "notionTagsVisible";
    }

    const labelText =
      document.createElement(
        "span"
      );

    labelText.textContent =
      "Use as Tags";

    label.append(
      input,
      labelText
    );

    action.append(
      label
    );
  } else if (
    [
      "select",
      "status",
      "text",
      "rich_text"
    ].includes(
      type
    )
  ) {
    const label =
      document.createElement(
        "label"
      );

    label.className =
      "notion-field-visibility";

    const input =
      document.createElement(
        "input"
      );

    input.type =
      "checkbox";

    input.dataset.notionFieldAction =
      "custom-visible";

    input.dataset.propertyId =
      propertyId;

    const configured =
      findConfiguredNotionFieldByPropertyId(
        preset,
        propertyId
      );

    input.checked =
      Boolean(
        configured &&
        configured.visible !==
          false
      );

    const labelText =
      document.createElement(
        "span"
      );

    labelText.textContent =
      "Show in clipper";

    label.append(
      input,
      labelText
    );

    action.append(
      label
    );
  } else {
    const unsupported =
      document.createElement(
        "span"
      );

    unsupported.className =
      "notion-field-not-supported";

    unsupported.textContent =
      "Not supported yet";

    action.append(
      unsupported
    );
  }

  if (
    type === "title" &&
    mappedTitle &&
    mappedTitle !==
      propertyId
  ) {
    row.classList.add(
      "notion-schema-field-warning"
    );
  }

  row.append(
    copy,
    badge,
    action
  );

  return row;
}

function renderNotionDestinationFields(
  preset,
  properties = []
) {
  const help =
    document.getElementById(
      "notionFieldsEditorHelp"
    );

  const pagePanel =
    document.getElementById(
      "notionPageFieldsPanel"
    );

  const databasePanel =
    document.getElementById(
      "notionDatabaseFieldsPanel"
    );

  const schemaFields =
    document.getElementById(
      "notionSchemaFields"
    );

  if (
    !pagePanel ||
    !databasePanel ||
    !schemaFields
  ) {
    return;
  }

  pagePanel.classList.add(
    "hidden"
  );

  databasePanel.classList.add(
    "hidden"
  );

  schemaFields.replaceChildren();

  notionRenderedSchemaProperties =
    Array.isArray(
      properties
    )
      ? [
          ...properties
        ]
      : [];

  if (
    !preset?.destinationId
  ) {
    if (help) {
      help.textContent =
        "Choose a destination to configure its fields.";
    }

    return;
  }

  if (
    preset.destinationType ===
      "page"
  ) {
    if (help) {
      help.textContent =
        "This preset saves child pages beneath a Notion page.";
    }

    pagePanel.classList.remove(
      "hidden"
    );

    return;
  }

  if (
    preset.destinationType !==
      "collection"
  ) {
    return;
  }

  if (help) {
    help.textContent =
      "Fields are read directly from this Notion database.";
  }

  databasePanel.classList.remove(
    "hidden"
  );

  if (
    !notionRenderedSchemaProperties
      .length
  ) {
    const loading =
      document.createElement(
        "div"
      );

    loading.className =
      "notion-schema-fields-empty";

    loading.textContent =
      "Reading database properties…";

    schemaFields.append(
      loading
    );

    return;
  }

  for (
    const property of
      notionRenderedSchemaProperties
  ) {
    schemaFields.append(
      makeNotionSchemaFieldRow(
        preset,
        property
      )
    );
  }
}

async function configureNotionPageDestinationPreset(
  preset
) {
  if (
    !preset ||
    preset.destinationType !==
      "page"
  ) {
    return preset;
  }

  const currentFields =
    Array.isArray(
      preset.fields
    )
      ? preset.fields
      : [];

  const alreadyConfigured =
    preset.fieldsConfigured ===
      true &&
    currentFields.length ===
      1 &&
    currentFields[0]
      ?.propertyId ===
      "__clipnest_page_title__" &&
    currentFields[0]
      ?.propertyType ===
      "title";

  if (alreadyConfigured) {
    return preset;
  }

  return ClipNestNotionStore
    .updateActivePreset({
      fieldsConfigured:
        true,

      fields: [
        {
          role:
            "title",

          propertyId:
            "__clipnest_page_title__",

          propertyName:
            "Title",

          propertyType:
            "title",

          label:
            "Title",

          order:
            0,

          visible:
            true,

          source:
            "page_title",

          required:
            true,

          defaultValue:
            ""
        }
      ],

      popupProperties: [
        "__clipnest_page_title__"
      ],

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

      propertyMappings: {
        title:
          "Name",

        url:
          "",

        tags:
          ""
      }
    });
}

async function handleNotionSchemaFieldChange(
  event
) {
  const input =
    event.target;

  if (
    !(input instanceof HTMLInputElement)
  ) {
    return;
  }

  const action =
    input.dataset
      .notionFieldAction ||
    "";

  if (!action) {
    return;
  }

  if (
    action ===
      "url"
  ) {
    const urlInputs =
      document.querySelectorAll(
        '[data-notion-field-action="url"]'
      );

    if (input.checked) {
      for (
        const candidate of
          urlInputs
      ) {
        if (
          candidate !==
            input
        ) {
          candidate.checked =
            false;
        }
      }

      els.notionUrlProperty.value =
        input.dataset
          .propertyId ||
        "";
    } else {
      els.notionUrlProperty.value =
        "";
    }
  }

  if (
    action ===
      "tags"
  ) {
    const tagInputs =
      document.querySelectorAll(
        '[data-notion-field-action="tags"]'
      );

    if (input.checked) {
      for (
        const candidate of
          tagInputs
      ) {
        if (
          candidate !==
            input
        ) {
          candidate.checked =
            false;
        }
      }

      els.notionTagsProperty.value =
        input.dataset
          .propertyId ||
        "";
    } else {
      els.notionTagsProperty.value =
        "";
    }
  }

  try {
    const updated =
      await saveNotionPropertyMappings();

    renderNotionDestinationFields(
      updated,
      notionRenderedSchemaProperties
    );

    showStatus(
      els.notionStatus,
      "Preset fields updated.",
      "success"
    );
  } catch (error) {
    showStatus(
      els.notionStatus,
      error?.message ||
      String(error),
      "error"
    );
  }
}

function notionFieldEditorControls() {
  return {
    title:
      document.getElementById(
        "notionTitleVisible"
      ),

    tags:
      document.getElementById(
        "notionTagsVisible"
      )
  };
}

function findConfiguredNotionField(
  preset,
  role
) {
  const fields =
    Array.isArray(
      preset?.fields
    )
      ? preset.fields
      : [];

  const direct =
    fields.find(
      (field) =>
        field?.role ===
          role
    );

  if (direct) {
    return direct;
  }

  if (role === "title") {
    return fields.find(
      (field) =>
        field?.propertyType ===
          "title" ||
        field?.source ===
          "page_title"
    ) ||
    null;
  }

  if (role === "url") {
    return fields.find(
      (field) =>
        field?.propertyType ===
          "url" ||
        field?.source ===
          "page_url"
    ) ||
    null;
  }

  if (role === "tags") {
    const tagsId =
      String(
        preset?.propertyIds
          ?.tags ||
        ""
      ).trim();

    return fields.find(
      (field) =>
        (
          tagsId &&
          field?.propertyId ===
            tagsId
        ) ||
        (
          field?.propertyType ===
            "multi_select" &&
          field?.source ===
            "manual"
        )
    ) ||
    null;
  }

  return null;
}

function syncNotionFieldEditor(
  preset
) {
  const controls =
    notionFieldEditorControls();

  const titleField =
    findConfiguredNotionField(
      preset,
      "title"
    );

  const tagsField =
    findConfiguredNotionField(
      preset,
      "tags"
    );

  if (controls.title) {
    controls.title.checked =
      titleField
        ? titleField.visible !==
            false
        : true;

    controls.title.disabled =
      !els.notionTitleProperty
        ?.value;
  }

  if (controls.tags) {
    controls.tags.checked =
      tagsField
        ? tagsField.visible !==
            false
        : true;

    controls.tags.disabled =
      !els.notionTagsProperty
        ?.value;
  }
}

function copyNotionFieldDefault(
  preset,
  role,
  fallback
) {
  const field =
    findConfiguredNotionField(
      preset,
      role
    );

  if (
    field &&
    Object.prototype
      .hasOwnProperty.call(
        field,
        "defaultValue"
      )
  ) {
    return Array.isArray(
      field.defaultValue
    )
      ? [
          ...field.defaultValue
        ]
      : field.defaultValue;
  }

  return fallback;
}

function buildConfiguredNotionFields(
  preset,
  {
    title,
    url,
    tags
  }
) {
  const controls =
    notionFieldEditorControls();

  const fields =
    [];

  if (title) {
    fields.push({
      role:
        "title",

      propertyId:
        title.id,

      propertyName:
        title.name,

      propertyType:
        title.type ||
        "title",

      label:
        "Title",

      order:
        fields.length,

      visible:
        controls.title
          ?.checked !==
            false,

      source:
        "page_title",

      required:
        true,

      defaultValue:
        copyNotionFieldDefault(
          preset,
          "title",
          ""
        )
    });
  }

  if (url) {
    fields.push({
      role:
        "url",

      propertyId:
        url.id,

      propertyName:
        url.name,

      propertyType:
        url.type ||
        "url",

      label:
        url.name ||
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
        copyNotionFieldDefault(
          preset,
          "url",
          ""
        )
    });
  }

  if (tags) {
    fields.push({
      role:
        "tags",

      propertyId:
        tags.id,

      propertyName:
        tags.name,

      propertyType:
        tags.type ||
        "multi_select",

      label:
        tags.name ||
        "Tags",

      order:
        fields.length,

      visible:
        controls.tags
          ?.checked !==
            false,

      source:
        "manual",

      required:
        false,

      defaultValue:
        copyNotionFieldDefault(
          preset,
          "tags",
          []
        )
    });
  }

  const customInputs =
    [
      ...document.querySelectorAll(
        '[data-notion-field-action="custom-visible"]'
      )
    ];

  for (
    const property of
      notionRenderedSchemaProperties
  ) {
    const type =
      String(
        property?.type ||
        ""
      );

    if (
      ![
        "select",
        "status",
        "text",
        "rich_text"
      ].includes(
        type
      )
    ) {
      continue;
    }

    const input =
      customInputs.find(
        (candidate) =>
          candidate.dataset
            .propertyId ===
          String(
            property.id ||
            ""
          )
      );

    if (
      !input ||
      !input.checked
    ) {
      continue;
    }

    const existing =
      findConfiguredNotionFieldByPropertyId(
        preset,
        property.id
      );

    fields.push({
      role:
        "custom",

      propertyId:
        property.id,

      propertyName:
        property.name,

      propertyType:
        type,

      label:
        property.name,

      order:
        fields.length,

      visible:
        true,

      source:
        "manual",

      required:
        false,

      defaultValue:
        existing?.defaultValue ??
        "",

      options:
        Array.isArray(
          property.options
        )
          ? property.options.map(
              (option) => ({
                id:
                  String(
                    option?.id ||
                    ""
                  ),

                value:
                  notionSchemaOptionLabel(
                    option
                  ),

                color:
                  String(
                    option?.color ||
                    ""
                  )
              })
            )
          : []
    });
  }

  return fields;
}

function setupNotionFieldEditor() {
  const schemaFields =
    document.getElementById(
      "notionSchemaFields"
    );

  if (!schemaFields) {
    return;
  }

  schemaFields.addEventListener(
    "change",
    (event) => {
      void handleNotionSchemaFieldChange(
        event
      );
    }
  );
}

function renderNotionPropertySelectors(
  preset,
  properties
) {
  notionSchemaProperties =
    Array.isArray(
      properties
    )
      ? properties
      : [];

  if (
    preset?.destinationType !==
      "collection"
  ) {
    setNotionPropertySelectorsUnavailable(
      preset?.destinationType ===
        "page"
        ? "Not used for page destinations"
        : "Choose a database first"
    );

    return;
  }

  if (!notionSchemaProperties.length) {
    setNotionPropertySelectorsUnavailable(
      "Loading database properties…"
    );

    return;
  }

  const mapping =
    resolveNotionPropertyIds(
      preset
    );

  fillNotionPropertySelect(
    els.notionTitleProperty,
    mapping.titleProperties,
    {
      selectedId:
        mapping.titleId
    }
  );

  fillNotionPropertySelect(
    els.notionUrlProperty,
    mapping.urlProperties,
    {
      selectedId:
        mapping.urlId,

      optional:
        true
    }
  );

  fillNotionPropertySelect(
    els.notionTagsProperty,
    mapping.tagsProperties,
    {
      selectedId:
        mapping.tagsId,

      optional:
        true
    }
  );

  syncNotionFieldEditor(
    preset
  );
}

async function saveNotionPropertyMappings() {
  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  if (!preset) {
    throw new Error(
      "No Notion preset is selected."
    );
  }

  const title =
    findNotionSchemaProperty(
      els.notionTitleProperty.value
    );

  const url =
    findNotionSchemaProperty(
      els.notionUrlProperty.value
    );

  const tags =
    findNotionSchemaProperty(
      els.notionTagsProperty.value
    );

  const fields =
    buildConfiguredNotionFields(
      preset,
      {
        title,
        url,
        tags
      }
    );

  const updated =
    await ClipNestNotionStore
      .updateActivePreset({
        fieldsConfigured:
          true,

        fields,

        popupProperties:
          fields
            .filter(
              (field) =>
                field.visible !==
                  false
            )
            .map(
              (field) =>
                field.propertyId
            ),

        propertyIds: {
          title:
            title?.id ||
            "",

          url:
            url?.id ||
            "",

          tags:
            tags?.id ||
            ""
        },

        titleProperty:
          title?.name ||
          "Name",

        urlProperty:
          url?.name ||
          "",

        tagsProperty:
          tags?.name ||
          "",

        propertyMappings: {
          title:
            title?.name ||
            "Name",

          url:
            url?.name ||
            "",

          tags:
            tags?.name ||
            ""
        }
      });

  syncNotionFieldEditor(
    updated
  );

  return updated;
}

async function applyNotionDatabaseSchema(
  preset,
  database
) {
  const properties =
    Array.isArray(
      database?.properties
    )
      ? database.properties
      : [];

  renderNotionPropertySelectors(
    preset,
    properties
  );

  renderNotionDestinationFields(
    preset,
    properties
  );

  const updated =
    await saveNotionPropertyMappings();

  renderNotionDestinationFields(
    updated,
    properties
  );

  return updated;
}

async function loadNotionDatabaseSchemaForPreset(
  preset
) {
  if (!preset) {
    renderNotionPropertySelectors(
      preset,
      []
    );

    renderNotionDestinationFields(
      preset,
      []
    );

    return preset;
  }

  if (
    preset.destinationType ===
      "page" &&
    preset.destinationId
  ) {
    renderNotionPropertySelectors(
      preset,
      []
    );

    const updated =
      await configureNotionPageDestinationPreset(
        preset
      );

    renderNotionDestinationFields(
      updated,
      []
    );

    return updated;
  }

  if (
    preset.destinationType !==
      "collection" ||
    !preset.destinationId
  ) {
    renderNotionPropertySelectors(
      preset,
      []
    );

    renderNotionDestinationFields(
      preset,
      []
    );

    return preset;
  }

  renderNotionPropertySelectors(
    preset,
    []
  );

  renderNotionDestinationFields(
    preset,
    []
  );

  const destination =
    notionDestinationCache.find(
      (candidate) =>
        candidate.type ===
          "collection" &&
        candidate.id ===
          preset.destinationId
    );

  const parentPageId =
    destination?.parentId ||
    preset.destinationParentId ||
    "";

  if (!parentPageId) {
    throw new Error(
      "ClipNest could not determine this database's parent page."
    );
  }

  const database =
    await ClipNestNotionSession
      .getDatabaseSchema({
        workspaceId:
          preset.workspaceId,

        userId:
          preset.workspaceUserId,

        collectionId:
          preset.destinationId,

        parentPageId
      });

  const updated =
    await applyNotionDatabaseSchema(
      preset,
      database
    );

  return {
    preset:
      updated,

    database
  };
}

async function handleNotionPropertyMappingChange() {
  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  if (
    preset?.destinationType !==
      "collection"
  ) {
    return;
  }

  await saveNotionPropertyMappings();

  showStatus(
    els.notionStatus,
    "Notion property mapping saved.",
    "success"
  );
}

function notionDestinationValue(
  destination
) {
  if (
    !destination?.type ||
    !destination?.id
  ) {
    return "";
  }

  return (
    `${destination.type}:` +
    destination.id
  );
}

function notionDestinationLabel(
  destination
) {
  const kind =
    destination.type ===
      "collection"
      ? "Database"
      : "Page";

  const breadcrumb =
    (
      destination.parents ||
      []
    )
      .map(
        (parent) =>
          parent.name
      )
      .filter(Boolean)
      .join(" / ");

  return (
    `${kind} · ${
      destination.name ||
      "Untitled"
    }${
      breadcrumb
        ? ` — ${breadcrumb}`
        : ""
    }`
  );
}

function prepareNotionDestinationField(
  preset
) {
  notionDestinationCache =
    [];

  els.notionDestinationResults
    .replaceChildren();

  els.notionDataSourceId
    .replaceChildren();

  const placeholder =
    document.createElement(
      "option"
    );

  placeholder.value =
    "";

  if (!preset) {
    placeholder.textContent =
      "Create a preset first";

    els.notionDestinationSearch.disabled =
      true;

    els.notionDataSourceId.disabled =
      true;

    els.notionDataSourceHelp.textContent =
      "Create a preset, then choose its workspace.";
  } else if (
    !preset.workspaceId
  ) {
    placeholder.textContent =
      "Choose a workspace first";

    els.notionDestinationSearch.disabled =
      true;

    els.notionDataSourceId.disabled =
      true;

    els.notionDataSourceHelp.textContent =
      "Choose the workspace this preset belongs to.";
  } else {
    placeholder.textContent =
      "Search or choose a destination…";

    els.notionDestinationSearch.disabled =
      false;

    els.notionDataSourceId.disabled =
      false;

    els.notionDataSourceHelp.textContent =
      "Search this workspace for a page or database.";
  }

  els.notionDataSourceId.append(
    placeholder
  );

  if (
    preset?.destinationType &&
    preset?.destinationId
  ) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      notionDestinationValue({
        type:
          preset.destinationType,

        id:
          preset.destinationId
      });

    option.textContent =
      notionDestinationLabel({
        type:
          preset.destinationType,

        id:
          preset.destinationId,

        name:
          preset.destinationName ||
          "Untitled",

        parents:
          preset.destinationParents ||
          []
      });

    els.notionDataSourceId.append(
      option
    );

    els.notionDataSourceId.value =
      option.value;
  }

  els.notionDestinationSearch.value =
    "";

  renderNotionPropertySelectors(
    preset,
    []
  );

}

async function refreshNotionWorkspacePicker({
  preferredWorkspaceId = "",
  requestPermission = false
} = {}) {
  els.notionWorkspaceSelect
    .replaceChildren();

  const loading =
    document.createElement(
      "option"
    );

  loading.value = "";

  loading.textContent =
    "Checking Notion…";

  els.notionWorkspaceSelect.append(
    loading
  );

  els.notionWorkspaceSelect.disabled =
    true;

  els.refreshNotionWorkspaces.disabled =
    true;

  try {
    const hasPermission =
      await ClipNestNotionSession
        .hasPermission();

    if (
      !hasPermission &&
      !requestPermission
    ) {
      notionWorkspaceCache =
        [];

      loading.textContent =
        "Connect Notion browser session";

      els.notionConnectionTitle.textContent =
        "Notion browser access not enabled";

      els.notionConnectionStatus.textContent =
        "Click Connect Notion to allow ClipNest to use your existing Notion browser session.";

      els.refreshNotionWorkspaces.textContent =
        "Connect Notion";

      els.notionWorkspaceHelp.textContent =
        "ClipNest only asks Chrome for access to Notion websites.";

      els.notionWorkspacePickerButton.disabled =
        true;

      renderNotionWorkspacePicker();

      return;
    }

    const result =
      await ClipNestNotionSession
        .getWorkspaces({
          requestPermission
        });

    notionWorkspaceCache =
      result.workspaces ||
      [];

    els.notionWorkspaceSelect
      .replaceChildren();

    const placeholder =
      document.createElement(
        "option"
      );

    placeholder.value = "";

    placeholder.textContent =
      notionWorkspaceCache.length
        ? "Choose a Notion workspace…"
        : "No Notion workspaces found";

    els.notionWorkspaceSelect.append(
      placeholder
    );

    for (
      const workspace of
        notionWorkspaceCache
    ) {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        workspace.id;

      option.textContent =
        workspace.name;

      els.notionWorkspaceSelect.append(
        option
      );
    }

    if (
      preferredWorkspaceId &&
      notionWorkspaceCache.some(
        (workspace) =>
          workspace.id ===
          preferredWorkspaceId
      )
    ) {
      els.notionWorkspaceSelect.value =
        preferredWorkspaceId;
    }

    renderNotionWorkspacePicker();

    els.notionConnectionTitle.textContent =
      "Notion browser session detected";

    els.notionConnectionStatus.textContent =
      `${notionWorkspaceCache.length} workspace${
        notionWorkspaceCache.length === 1
          ? ""
          : "s"
      } available.`;

    els.refreshNotionWorkspaces.textContent =
      "Refresh workspaces";

    els.notionWorkspaceHelp.textContent =
      "Each preset can use a different workspace.";

    const hasActivePreset =
      Boolean(
        await ClipNestNotionStore
          .getActivePreset()
      );

    els.notionWorkspaceSelect.disabled =
      !hasActivePreset;

    els.notionWorkspacePickerButton.disabled =
      !hasActivePreset;

    renderNotionWorkspacePicker();
  } catch (error) {
    notionWorkspaceCache =
      [];

    els.notionWorkspaceSelect
      .replaceChildren();

    const failed =
      document.createElement(
        "option"
      );

    failed.value = "";

    failed.textContent =
      "Could not read Notion workspaces";

    els.notionWorkspaceSelect.append(
      failed
    );

    els.notionConnectionTitle.textContent =
      "Notion session unavailable";

    els.notionConnectionStatus.textContent =
      error.message ||
      String(error);

    els.refreshNotionWorkspaces.textContent =
      "Try again";

    els.notionWorkspaceHelp.textContent =
      "Open Notion in Chrome and make sure you are signed in.";
  } finally {
    els.refreshNotionWorkspaces.disabled =
      false;
  }
}

async function handleNotionWorkspaceChange() {
  const workspaceId =
    els.notionWorkspaceSelect.value;

  if (!workspaceId) {
    return;
  }

  const workspace =
    notionWorkspaceCache.find(
      (candidate) =>
        candidate.id ===
        workspaceId
    );

  if (!workspace) {
    showStatus(
      els.notionStatus,
      "That Notion workspace is no longer available.",
      "error"
    );

    return;
  }

  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  if (!preset) {
    return;
  }

  const user =
    getNotionWorkspaceUser(
      workspace
    );

  const workspaceChanged =
    preset.workspaceId !==
      workspace.id;

  const patch = {
    workspaceId:
      workspace.id,

    workspaceName:
      workspace.name,

    workspaceUserId:
      user?.id ||
      "",

    workspaceSpaceViewIds:
      Array.isArray(
        workspace.spaceViewIds
      )
        ? workspace.spaceViewIds
        : []
  };

  if (workspaceChanged) {
    patch.dataSourceId =
      "";

    patch.destinationType =
      "";

    patch.destinationId =
      "";

    patch.destinationName =
      "";

    patch.destinationIcon =
      "";

    patch.destinationParents =
      [];

    patch.destinationParentId =
      "";

    patch.destinationParentTable =
      "";

    patch.propertyIds = {
      title:
        "",

      url:
        "",

      tags:
        ""
    };

    patch.fieldsConfigured =
      false;

    patch.fields =
      [];

    patch.popupProperties =
      [];

    patch.tagsProperty =
      "";

    patch.titleProperty =
      "Name";

    patch.urlProperty =
      "";
  }

  const updated =
    await ClipNestNotionStore
      .updateActivePreset(
        patch
      );

  prepareNotionDestinationField(
    updated
  );

  await refreshNotionDataSources(
    ""
  );

  showStatus(
    els.notionStatus,
    `Workspace selected: ${workspace.name}.`,
    "success"
  );
}

async function refreshNotionConnectionStatus() {
  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  await refreshNotionWorkspacePicker({
    preferredWorkspaceId:
      preset?.workspaceId ||
      "",

    requestPermission:
      false
  });
}

async function refreshNotionDataSources(
  query = ""
) {
  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  if (
    !preset ||
    !preset.workspaceId
  ) {
    prepareNotionDestinationField(
      preset
    );

    return;
  }

  const searchText =
    String(
      query ||
      ""
    ).trim();

  els.notionDestinationSearch.disabled =
    false;

  els.notionDataSourceId.disabled =
    true;

  els.notionDestinationResults
    .replaceChildren();

  const loading =
    document.createElement(
      "div"
    );

  loading.className =
    "notion-destination-placeholder";

  loading.textContent =
    searchText
      ? `Searching for "${searchText}"…`
      : "Loading pages and databases…";

  els.notionDestinationResults.append(
    loading
  );

  els.notionDataSourceId
    .replaceChildren();

  const loadingOption =
    document.createElement(
      "option"
    );

  loadingOption.value =
    "";

  loadingOption.textContent =
    "Searching Notion…";

  els.notionDataSourceId.append(
    loadingOption
  );

  try {
    const result =
      await ClipNestNotionSession
        .searchDestinations({
          workspaceId:
            preset.workspaceId,

          userId:
            preset.workspaceUserId,

          query:
            searchText
        });

    notionDestinationCache =
      result.destinations ||
      [];

    els.notionDataSourceId
      .replaceChildren();

    const placeholder =
      document.createElement(
        "option"
      );

    placeholder.value =
      "";

    placeholder.textContent =
      "Choose a destination…";

    els.notionDataSourceId.append(
      placeholder
    );

    for (
      const destination of
        notionDestinationCache
    ) {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        notionDestinationValue(
          destination
        );

      option.textContent =
        notionDestinationLabel(
          destination
        );

      els.notionDataSourceId.append(
        option
      );
    }

    const savedValue =
      notionDestinationValue({
        type:
          preset.destinationType,

        id:
          preset.destinationId
      });

    if (savedValue) {
      const exists =
        notionDestinationCache.some(
          (destination) =>
            notionDestinationValue(
              destination
            ) ===
            savedValue
        );

      if (!exists) {
        const saved =
          document.createElement(
            "option"
          );

        saved.value =
          savedValue;

        saved.textContent =
          preset.destinationName ||
          "Previously selected destination";

        els.notionDataSourceId.append(
          saved
        );
      }

      els.notionDataSourceId.value =
        savedValue;
    }

    els.notionDataSourceId.disabled =
      false;

    renderNotionDestinationResults(
      preset
    );

    const databaseCount =
      notionDestinationCache.filter(
        (destination) =>
          destination.type ===
          "collection"
      ).length;

    const pageCount =
      notionDestinationCache.filter(
        (destination) =>
          destination.type ===
          "page"
      ).length;

    els.notionDataSourceHelp.textContent =
      `${databaseCount} database${
        databaseCount === 1
          ? ""
          : "s"
      }, ${pageCount} page${
        pageCount === 1
          ? ""
          : "s"
      } shown.`;
  } catch (error) {
    notionDestinationCache =
      [];

    els.notionDestinationResults
      .replaceChildren();

    const failed =
      document.createElement(
        "div"
      );

    failed.className =
      "notion-destination-placeholder";

    failed.textContent =
      error.message ||
      String(error);

    els.notionDestinationResults.append(
      failed
    );

    els.notionDataSourceId.disabled =
      true;

    els.notionDataSourceHelp.textContent =
      error.message ||
      String(error);
  }
}

async function handleNotionDataSourceChange() {
  const value =
    els.notionDataSourceId.value ||
    "";

  if (!value) {
    return;
  }

  const destination =
    notionDestinationCache.find(
      (candidate) =>
        notionDestinationValue(
          candidate
        ) === value
    );

  if (!destination) {
    const preset =
      await ClipNestNotionStore
        .getActivePreset();

    const savedValue =
      notionDestinationValue({
        type:
          preset?.destinationType,

        id:
          preset?.destinationId
      });

    if (
      savedValue ===
        value
    ) {
      return;
    }

    showStatus(
      els.notionStatus,
      "That Notion destination is no longer available.",
      "error"
    );

    return;
  }

  const updated =
    await ClipNestNotionStore
      .updateActivePreset({
        destinationType:
          destination.type,

        destinationId:
          destination.id,

        destinationName:
          destination.name,

        destinationIcon:
          destination.icon ||
          "",

        destinationParents:
          destination.parents ||
          [],

        destinationParentId:
          destination.parentId ||
          "",

        destinationParentTable:
          destination.parentTable ||
          "",

        dataSourceId:
          ""
      });

  renderNotionDestinationResults(
    updated
  );

  closeNotionDestinationResults();

  els.notionDestinationSearch.value =
    updated.destinationName ||
    "";


  if (
    destination.type ===
      "collection"
  ) {
    els.notionDataSourceHelp.textContent =
      "Reading database properties…";

    try {
      const database =
        await ClipNestNotionSession
          .getDatabaseSchema({
            workspaceId:
              updated.workspaceId,

            userId:
              updated.workspaceUserId,

            collectionId:
              destination.id,

            parentPageId:
              destination.parentId
          });

      await applyNotionDatabaseSchema(
        updated,
        database
      );

      const preview =
        database.properties
          .slice(0, 8)
          .map(
            (property) =>
              `${property.name} (${property.type})`
          )
          .join(", ");

      els.notionDataSourceHelp.textContent =
        `${database.properties.length} properties found${
          preview
            ? `: ${preview}`
            : ""
        }.`;
    } catch (error) {
      els.notionDataSourceHelp.textContent =
        error.message ||
        String(error);
    }
  } else {
    renderNotionPropertySelectors(
      updated,
      []
    );

    const pagePreset =
      await configureNotionPageDestinationPreset(
        updated
      );

    renderNotionDestinationFields(
      pagePreset,
      []
    );

    els.notionDataSourceHelp.textContent =
      "Page selected. ClipNest will create a child page beneath it.";
  }

  showStatus(
    els.notionStatus,
    `Destination selected: ${
      updated.destinationName
    }.`,
    "success"
  );
}

function focusNotionPresetEditor(
  {
    selectName = false
  } = {}
) {
  const card =
    document.getElementById(
      "notionSettingsCard"
    );

  card?.scrollIntoView({
    behavior:
      "smooth",

    block:
      "start"
  });

  window.setTimeout(
    () => {
      if (selectName) {
        els.notionPresetName?.focus();
        els.notionPresetName?.select();

        return;
      }

      els.notionPresetName?.focus({
        preventScroll:
          true
      });

      els.notionPresetName?.blur();
    },
    80
  );
}

async function handleNotionOptionsIntent() {
  if (
    notionOptionsIntentHandling
  ) {
    return;
  }

  notionOptionsIntentHandling =
    true;

  try {
    const data =
      await chrome.storage.local.get(
        NOTION_OPTIONS_INTENT_KEY
      );

    const intent =
      data[
        NOTION_OPTIONS_INTENT_KEY
      ];

    if (
      !intent ||
      typeof intent !==
        "object"
    ) {
      return;
    }

    /*
     * Remove the intent before acting so the
     * storage listener cannot execute it twice.
     */
    await chrome.storage.local.remove(
      NOTION_OPTIONS_INTENT_KEY
    );

    const createdAt =
      Number(
        intent.createdAt ||
        0
      );

    const age =
      Date.now() -
      createdAt;

    if (
      !createdAt ||
      age < 0 ||
      age >
        5 * 60 * 1000
    ) {
      return;
    }

    if (
      intent.mode ===
        "new"
    ) {
      await ClipNestNotionStore
        .createPreset(
          "New preset"
        );

      await refreshNotionPresetList();
      await loadSettings();

      focusNotionPresetEditor({
        selectName:
          true
      });

      showStatus(
        els.notionStatus,
        "New preset created. Name it, then choose its workspace and destination.",
        "success"
      );

      return;
    }

    if (
      intent.mode ===
        "edit"
    ) {
      const presetId =
        String(
          intent.presetId ||
          ""
        ).trim();

      if (!presetId) {
        showStatus(
          els.notionStatus,
          "ClipNest could not determine which preset to edit.",
          "error"
        );

        focusNotionPresetEditor();

        return;
      }

      const info =
        await ClipNestNotionStore
          .listPresets();

      const preset =
        info.presets.find(
          (candidate) =>
            candidate.id ===
            presetId
        );

      if (!preset) {
        showStatus(
          els.notionStatus,
          "That Notion preset no longer exists.",
          "error"
        );

        focusNotionPresetEditor();

        return;
      }

      await ClipNestNotionStore
        .setActivePreset(
          preset.id
        );

      await refreshNotionPresetList();
      await loadSettings();

      focusNotionPresetEditor();

      showStatus(
        els.notionStatus,
        `Editing preset: ${preset.name}.`,
        "success"
      );
    }
  } catch (error) {
    console.error(
      "Could not open Notion preset editor:",
      error
    );

    showStatus(
      els.notionStatus,
      error?.message ||
      String(error),
      "error"
    );
  } finally {
    notionOptionsIntentHandling =
      false;
  }
}

async function refreshNotionPresetList() {
  const info =
    await ClipNestNotionStore
      .listPresets();

  els.notionPresetSelect
    .replaceChildren();

  if (!info.presets.length) {
    const option =
      document.createElement(
        "option"
      );

    option.value = "";

    option.textContent =
      "No presets configured";

    els.notionPresetSelect.append(
      option
    );
  } else {
    for (
      const preset of
        info.presets
    ) {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        preset.id;

      option.textContent =
        preset.name;

      els.notionPresetSelect.append(
        option
      );
    }

    els.notionPresetSelect.value =
      info.activePresetId;
  }
}

async function switchNotionPreset() {
  const id =
    els.notionPresetSelect.value;

  if (!id) {
    return;
  }

  await ClipNestNotionStore
    .setActivePreset(id);

  await loadSettings();

  showStatus(
    els.notionStatus,
    ""
  );
}

async function createNotionPreset() {
  const name =
    window.prompt(
      "Preset name:",
      "New preset"
    );

  if (name === null) {
    return;
  }

  await ClipNestNotionStore
    .createPreset(
      name
    );

  await refreshNotionPresetList();
  await loadSettings();

  els.notionWorkspacePickerButton.focus();

  showStatus(
    els.notionStatus,
    "Preset created. Choose its Notion workspace.",
    "success"
  );
}

async function removeNotionPreset() {
  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  if (!preset) {
    return;
  }

  const confirmed =
    window.confirm(
      `Remove "${preset.name}" from ClipNest?\n\n` +
      "Nothing will be removed from Notion."
    );

  if (!confirmed) {
    return;
  }

  await ClipNestNotionStore
    .removePreset(
      preset.id
    );

  await refreshNotionPresetList();
  await loadSettings();

  showStatus(
    els.notionStatus,
    `${preset.name} removed.`,
    "success"
  );
}


/*
 * QUICK CLIP SETTINGS HANDOFF - 1.9.35
 *
 * The action popup can detect that Quick Clip needs access,
 * but Chrome only exposes the persistent "Allow on every
 * visit" choice from the full extension Settings page.
 *
 * Preserve the original Quick Clip intent in session storage.
 * When Settings opens, highlight the persistent-access button.
 * After access is granted, resume the original clip through
 * the existing background handoff.
 */

const QUICK_CLIP_ACCESS_INTENT_KEY =
  "clipnestQuickClipAccessIntentV1";

const QUICK_CLIP_ACCESS_INTENT_TTL =
  5 * 60 * 1000;

function isFreshSettingsQuickClipIntent(
  intent
) {
  if (
    !intent ||
    typeof intent !== "object" ||
    !intent.id ||
    !intent.vaultId
  ) {
    return false;
  }

  const createdAt =
    Number(
      intent.createdAt ||
      0
    );

  return Boolean(
    createdAt &&
    (
      Date.now() -
      createdAt
    ) <
      QUICK_CLIP_ACCESS_INTENT_TTL
  );
}

async function getPendingQuickClipIntentForSettings() {
  const stored =
    await chrome.storage.session.get([
      QUICK_CLIP_ACCESS_INTENT_KEY
    ]);

  const intent =
    stored[
      QUICK_CLIP_ACCESS_INTENT_KEY
    ];

  if (
    !isFreshSettingsQuickClipIntent(
      intent
    )
  ) {
    if (intent) {
      await chrome.storage.session.remove([
        QUICK_CLIP_ACCESS_INTENT_KEY
      ]);
    }

    return null;
  }

  return intent;
}

async function preparePendingQuickClipAccessInSettings() {
  const intent =
    await getPendingQuickClipIntentForSettings();

  if (!intent) {
    return;
  }

  const info =
    await ClipNestVaultStore
      .listVaults();

  const vault =
    Array.isArray(
      info?.vaults
    )
      ? info.vaults.find(
          (candidate) =>
            candidate.id ===
            intent.vaultId
        )
      : null;

  if (!vault) {
    showStatus(
      els.obsidianStatus,
      "The vault for the pending Quick Clip is no longer connected.",
      "error"
    );

    return;
  }

  if (els.vaultSelect) {
    els.vaultSelect.value =
      intent.vaultId;
  }

  if (els.enableQuickClipAccess) {
    els.enableQuickClipAccess.textContent =
      "Allow Quick Clip access";
  }

  showStatus(
    els.obsidianStatus,
    `Quick Clip is waiting for access to "${vault.name}". Click Allow Quick Clip access and choose Allow on every visit.`,
    ""
  );

  setTimeout(
    () => {
      els.enableQuickClipAccess
        ?.scrollIntoView({
          behavior:
            "smooth",

          block:
            "center"
        });

      els.enableQuickClipAccess
        ?.focus({
          preventScroll:
            true
        });
    },
    80
  );
}


/*
 * PERSISTENT QUICK CLIP ACCESS - 1.9.33
 *
 * Chrome keeps ordinary File System Access grants active
 * only while the extension origin is active.
 *
 * Quick Clip runs from the background service worker, so
 * reliable one-click saving requires Chrome's extended
 * permission. The native restore prompt exposes this as
 * "Allow on every visit".
 *
 * queryPermission() reports "granted" for both an active
 * grant and an extended grant, so ClipNest must not claim
 * that "granted" alone proves persistence.
 */

async function enableQuickClipAccess() {
  showStatus(
    els.obsidianStatus,
    "Checking vault access…"
  );

  try {
    const pendingIntent =
      await getPendingQuickClipIntentForSettings();

    const activeVaultId =
      await ClipNestVaultStore
        .getActiveVaultId();

    const targetVaultId =
      String(
        pendingIntent?.vaultId ||
        activeVaultId ||
        ""
      );

    if (!targetVaultId) {
      throw new Error(
        "Connect an Obsidian vault first."
      );
    }

    const handle =
      await ClipNestVaultStore
        .getVaultHandle(
          targetVaultId
        );

    if (!handle) {
      throw new Error(
        "The stored vault connection is missing. Connect the vault again."
      );
    }

    const before =
      await handle.queryPermission({
        mode:
          "readwrite"
      });

    /*
     * If this Settings page was opened specifically for a
     * pending Quick Clip, it should normally arrive here in
     * "prompt" state.
     *
     * A plain "granted" result cannot prove that Chrome gave
     * persistent access, so do not pretend otherwise.
     */

    if (
      before ===
        "granted"
    ) {
      if (pendingIntent) {
        showStatus(
          els.obsidianStatus,
          "Chrome currently reports vault access as granted, so it cannot show the persistent-access choice right now. Close ClipNest Settings, wait a few seconds, and try Quick Clip again.",
          "error"
        );

        return;
      }

      showStatus(
        els.obsidianStatus,
        "Vault access is currently granted. If Quick Clip later asks again, use this button when Chrome's permission has returned to prompt state and choose Allow on every visit."
      );

      return;
    }

    if (
      typeof handle.requestPermission !==
        "function"
    ) {
      throw new Error(
        "This Chrome build cannot restore vault access from Settings."
      );
    }

    const requested =
      await handle.requestPermission({
        mode:
          "readwrite"
      });

    if (
      requested !==
        "granted"
    ) {
      throw new Error(
        "Vault access was not granted. For one-click Quick Clip, choose Allow on every visit in Chrome's permission dialog."
      );
    }

    if (!pendingIntent) {
      showStatus(
        els.obsidianStatus,
        "Vault access granted. If you chose Allow on every visit, Quick Clip will keep working when ClipNest is closed and after Chrome restarts.",
        "success"
      );

      return;
    }

    showStatus(
      els.obsidianStatus,
      "Access granted. Finishing your Quick Clip…",
      "success"
    );

    const response =
      await chrome.runtime.sendMessage({
        type:
          "obsidian.quickClipAccess.resume"
      });

    if (!response?.ok) {
      throw new Error(
        response?.error?.message ||
        "ClipNest could not finish the pending Quick Clip."
      );
    }

    els.enableQuickClipAccess.textContent =
      "Enable Quick Clip access";

    showStatus(
      els.obsidianStatus,
      "Quick Clip saved. If you chose Allow on every visit, future Quick Clips will stay silent.",
      "success"
    );
  } catch (error) {
    showStatus(
      els.obsidianStatus,
      error?.message ||
        String(error),
      "error"
    );
  }
}


async function chooseVault() {
  showStatus(
    els.obsidianStatus,
    ""
  );

  if (
    !(
      "showDirectoryPicker" in
      window
    )
  ) {
    showStatus(
      els.obsidianStatus,
      "This Chrome build does not expose the folder picker here.",
      "error"
    );

    return;
  }

  try {
    const handle =
      await window.showDirectoryPicker({
        mode: "readwrite"
      });

    const vault =
      await ClipNestVaultStore
        .addVault(handle);

    await refreshVaultList();
    await loadSettings();

    showStatus(
      els.obsidianStatus,
      `${vault.name} connected. Quick Clip will finish its access setup the first time Chrome requires it.`,
      "success"
    );
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      return;
    }

    showStatus(
      els.obsidianStatus,
      error.message ||
        String(error),
      "error"
    );
  }
}

async function disconnectVault() {
  const info =
    await ClipNestVaultStore
      .listVaults();

  const id =
    els.vaultSelect?.value ||
    info.activeVaultId ||
    "";

  const vault =
    info.vaults.find(
      (item) =>
        item.id === id
    );

  if (!vault) {
    return;
  }

  const confirmed =
    window.confirm(
      `Remove "${vault.name}" from ClipNest?\n\n` +
      "This only removes ClipNest's connection. " +
      "No files in the Obsidian vault will be deleted."
    );

  if (!confirmed) {
    return;
  }

  await ClipNestVaultStore
    .removeVault(id);

  await refreshVaultList();
  await loadSettings();

  showStatus(
    els.obsidianStatus,
    `${vault.name} removed from ClipNest.`,
    "success"
  );
}

async function refreshVaultName() {
  const info =
    await ClipNestVaultStore
      .listVaults();

  const active =
    info.vaults.find(
      (vault) =>
        vault.id ===
        info.activeVaultId
    );

  els.vaultName.textContent =
    active
      ? `Active: ${active.name}`
      : "No vault connected";
}

async function refreshVaultList() {
  const info =
    await ClipNestVaultStore
      .listVaults();

  els.vaultSelect.replaceChildren();

  if (!info.vaults.length) {
    const option =
      document.createElement(
        "option"
      );

    option.value = "";
    option.textContent =
      "No vault connected";

    els.vaultSelect.append(
      option
    );
  } else {
    for (
      const vault of
        info.vaults
    ) {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        vault.id;

      option.textContent =
        vault.name;

      els.vaultSelect.append(
        option
      );
    }

    els.vaultSelect.value =
      info.activeVaultId;
  }

  if (els.disconnectVault) {
    els.disconnectVault.disabled =
      !info.activeVaultId;
  }

  if (els.enableQuickClipAccess) {
    els.enableQuickClipAccess.disabled =
      !info.activeVaultId;
  }

  await refreshVaultName();
}

function showStatus(element, message, kind = "") {
  element.textContent = message || "";
  element.className = `status ${kind}`.trim();
}
