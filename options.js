const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  for (const id of [
    "defaultDestination",
    "notionConnectionTitle",
    "notionConnectionStatus",
    "connectNotion",
    "disconnectNotion",
    "notionPresetSelect",
    "newNotionPreset",
    "removeNotionPreset",
    "notionPresetName",
    "notionDataSourceId",
    "notionDataSourceHelp",
    "notionTitleProperty",
    "notionUrlProperty",
    "testNotion",
    "notionStatus",
    "chooseVault",
    "vaultSelect",
    "vaultName",
    "obsidianSubfolder",
    "obsidianDefaultTags",
    "disconnectVault",
    "obsidianStatus",
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

  els.testNotion.addEventListener(
    "click",
    testNotion
  );

  els.connectNotion.addEventListener(
    "click",
    connectNotion
  );

  els.disconnectNotion.addEventListener(
    "click",
    disconnectNotion
  );

  els.newNotionPreset.addEventListener(
    "click",
    createNotionPreset
  );

  els.removeNotionPreset.addEventListener(
    "click",
    removeNotionPreset
  );

  els.notionPresetSelect.addEventListener(
    "change",
    switchNotionPreset
  );

  els.notionDataSourceId.addEventListener(
    "change",
    handleNotionDataSourceChange
  );

  els.chooseVault.addEventListener(
    "click",
    chooseVault
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
}

async function loadSettings() {
  const settings =
    await chrome.storage.local.get([
      "defaultDestination",
      "obsidianSubfolder",
      "obsidianDefaultTags"
    ]);

  els.defaultDestination.value =
    settings.defaultDestination ||
    "obsidian";

  els.obsidianSubfolder.value =
    settings.obsidianSubfolder ||
    "";

  els.obsidianDefaultTags.value =
    settings.obsidianDefaultTags ||
    "";

  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  els.notionPresetName.value =
    preset?.name ||
    "";

  els.notionDataSourceId.value =
    preset?.dataSourceId ||
    "";

  els.notionTitleProperty.value =
    preset?.titleProperty ||
    "Name";

  els.notionUrlProperty.value =
    preset?.urlProperty ||
    "";

  const disabled =
    !preset;

  els.notionPresetName.disabled =
    disabled;

  els.notionDataSourceId.disabled =
    disabled;

  els.notionTitleProperty.disabled =
    disabled;

  els.notionUrlProperty.disabled =
    disabled;

  els.testNotion.disabled =
    disabled;

  els.removeNotionPreset.disabled =
    disabled;

  await refreshNotionConnectionStatus();
  await refreshNotionDataSources(
    preset?.dataSourceId || ""
  );
}

async function saveSettings() {
  const obsidianConfig = {
    subfolder:
      els.obsidianSubfolder.value.trim(),

    defaultTags:
      els.obsidianDefaultTags.value.trim()
  };

  await chrome.storage.local.set({
    defaultDestination:
      els.defaultDestination.value,

    obsidianSubfolder:
      obsidianConfig.subfolder,

    obsidianDefaultTags:
      obsidianConfig.defaultTags
  });

  await ClipNestVaultStore
    .updateActiveConfig(
      obsidianConfig
    );

  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  if (preset) {
    await ClipNestNotionStore
      .updateActivePreset({
        name:
          els.notionPresetName.value,

        dataSourceId:
          els.notionDataSourceId.value,

        titleProperty:
          els.notionTitleProperty.value,

        urlProperty:
          els.notionUrlProperty.value
      });

    await refreshNotionPresetList();
  }

  showStatus(
    els.saveStatus,
    "Saved.",
    "success"
  );
}

async function refreshNotionConnectionStatus() {
  const status =
    await ClipNestNotionOAuth
      .getStatus();

  if (status.connected) {
    els.notionConnectionTitle.textContent =
      "Connected to Notion";

    els.notionConnectionStatus.textContent =
      status.workspaceName
        ? `Workspace: ${status.workspaceName}`
        : "OAuth connection active.";

    els.connectNotion.textContent =
      "Reconnect";

    els.disconnectNotion.style.display =
      "";
  } else {
    els.notionConnectionTitle.textContent =
      "Not connected";

    els.notionConnectionStatus.textContent =
      "Connect ClipNest to Notion with OAuth.";

    els.connectNotion.textContent =
      "Connect to Notion";

    els.disconnectNotion.style.display =
      "none";
  }
}

async function connectNotion() {
  els.connectNotion.disabled =
    true;

  els.disconnectNotion.disabled =
    true;

  showStatus(
    els.notionStatus,
    "Opening Notion…"
  );

  try {
    const result =
      await ClipNestNotionOAuth
        .connect();

    await refreshNotionConnectionStatus();
    await refreshNotionDataSources();

    showStatus(
      els.notionStatus,
      result.workspaceName
        ? `Connected to ${result.workspaceName}.`
        : "Connected to Notion.",
      "success"
    );
  } catch (error) {
    showStatus(
      els.notionStatus,
      error.message ||
        String(error),
      "error"
    );
  } finally {
    els.connectNotion.disabled =
      false;

    els.disconnectNotion.disabled =
      false;
  }
}

async function disconnectNotion() {
  const confirmed =
    window.confirm(
      "Disconnect ClipNest from Notion?\n\n" +
      "Your Notion presets will stay in ClipNest."
    );

  if (!confirmed) {
    return;
  }

  await ClipNestNotionOAuth
    .disconnect();

  await refreshNotionConnectionStatus();

  showStatus(
    els.notionStatus,
    "Disconnected from Notion.",
    "success"
  );
}

let notionDataSourceCache =
  [];

async function notionApiRequest(
  path,
  options = {}
) {
  const stored =
    await chrome.storage.local.get([
      "notionToken"
    ]);

  const token =
    String(
      stored.notionToken ||
      ""
    ).trim();

  if (!token) {
    throw new Error(
      "Connect ClipNest to Notion first."
    );
  }

  const response =
    await fetch(
      `https://api.notion.com/v1${path}`,
      {
        ...options,

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Notion-Version":
            "2026-03-11",

          "Content-Type":
            "application/json",

          ...(
            options.headers ||
            {}
          )
        }
      }
    );

  let data;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      `Notion returned HTTP ${response.status}.`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.code ||
      `Notion returned HTTP ${response.status}.`
    );
  }

  return data;
}

function notionRichTextPlainText(
  value
) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map(
      (item) =>
        item?.plain_text ||
        item?.text?.content ||
        ""
    )
    .join("")
    .trim();
}

function notionDataSourceName(
  dataSource
) {
  const title =
    notionRichTextPlainText(
      dataSource?.title
    );

  if (title) {
    return title;
  }

  const parentTitle =
    notionRichTextPlainText(
      dataSource?.parent?.title
    );

  if (parentTitle) {
    return parentTitle;
  }

  return "Untitled database";
}

async function fetchNotionDataSources() {
  const results =
    [];

  let cursor =
    null;

  for (
    let page = 0;
    page < 10;
    page += 1
  ) {
    const body = {
      page_size:
        100,

      filter: {
        property:
          "object",

        value:
          "data_source"
      }
    };

    if (cursor) {
      body.start_cursor =
        cursor;
    }

    const data =
      await notionApiRequest(
        "/search",
        {
          method:
            "POST",

          body:
            JSON.stringify(
              body
            )
        }
      );

    for (
      const item of
        data.results || []
    ) {
      if (
        item?.object ===
        "data_source"
      ) {
        results.push(
          item
        );
      }
    }

    if (
      !data.has_more ||
      !data.next_cursor
    ) {
      break;
    }

    cursor =
      data.next_cursor;
  }

  return results;
}

function detectNotionProperties(
  dataSource
) {
  const entries =
    Object.entries(
      dataSource?.properties ||
      {}
    );

  const titleProperties =
    entries.filter(
      ([, property]) =>
        property?.type ===
        "title"
    );

  const urlProperties =
    entries.filter(
      ([, property]) =>
        property?.type ===
        "url"
    );

  return {
    titleProperty:
      titleProperties.length === 1
        ? titleProperties[0][0]
        : "",

    urlProperty:
      urlProperties.length === 1
        ? urlProperties[0][0]
        : ""
  };
}

async function refreshNotionDataSources(
  preferredId = ""
) {
  if (
    !els.notionDataSourceId
  ) {
    return;
  }

  const connection =
    await ClipNestNotionOAuth
      .getStatus();

  const currentValue =
    preferredId ||
    els.notionDataSourceId.value ||
    "";

  els.notionDataSourceId
    .replaceChildren();

  const placeholder =
    document.createElement(
      "option"
    );

  placeholder.value = "";
  placeholder.textContent =
    connection.connected
      ? "Loading databases…"
      : "Connect to Notion first";

  els.notionDataSourceId.append(
    placeholder
  );

  if (!connection.connected) {
    notionDataSourceCache =
      [];

    els.notionDataSourceHelp.textContent =
      "Connect ClipNest to Notion first.";

    return;
  }

  try {
    notionDataSourceCache =
      await fetchNotionDataSources();

    els.notionDataSourceId
      .replaceChildren();

    const empty =
      document.createElement(
        "option"
      );

    empty.value = "";

    empty.textContent =
      notionDataSourceCache.length
        ? "Select a Notion database…"
        : "No shared databases found";

    els.notionDataSourceId.append(
      empty
    );

    const sorted = [
      ...notionDataSourceCache
    ].sort(
      (a, b) =>
        notionDataSourceName(a)
          .localeCompare(
            notionDataSourceName(b)
          )
    );

    for (
      const dataSource of sorted
    ) {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        dataSource.id;

      option.textContent =
        notionDataSourceName(
          dataSource
        );

      els.notionDataSourceId.append(
        option
      );
    }

    if (
      currentValue &&
      !notionDataSourceCache.some(
        (item) =>
          item.id ===
          currentValue
      )
    ) {
      const unavailable =
        document.createElement(
          "option"
        );

      unavailable.value =
        currentValue;

      unavailable.textContent =
        "Previously selected database";

      els.notionDataSourceId.append(
        unavailable
      );
    }

    els.notionDataSourceId.value =
      currentValue;

    els.notionDataSourceHelp.textContent =
      notionDataSourceCache.length
        ? `${notionDataSourceCache.length} shared database${
            notionDataSourceCache.length === 1
              ? ""
              : "s"
          } available.`
        : "No databases are currently shared with ClipNest. Reconnect and grant access to a database.";
  } catch (error) {
    notionDataSourceCache =
      [];

    els.notionDataSourceId
      .replaceChildren();

    const failed =
      document.createElement(
        "option"
      );

    failed.value =
      currentValue;

    failed.textContent =
      currentValue
        ? "Previously selected database"
        : "Could not load databases";

    els.notionDataSourceId.append(
      failed
    );

    els.notionDataSourceId.value =
      currentValue;

    els.notionDataSourceHelp.textContent =
      error.message ||
      String(error);
  }
}

async function handleNotionDataSourceChange() {
  const id =
    els.notionDataSourceId.value;

  if (!id) {
    return;
  }

  const dataSource =
    notionDataSourceCache.find(
      (item) =>
        item.id === id
    );

  if (!dataSource) {
    return;
  }

  const detected =
    detectNotionProperties(
      dataSource
    );

  if (detected.titleProperty) {
    els.notionTitleProperty.value =
      detected.titleProperty;
  }

  if (detected.urlProperty) {
    els.notionUrlProperty.value =
      detected.urlProperty;
  }

  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  if (preset) {
    await ClipNestNotionStore
      .updateActivePreset({
        dataSourceId:
          id,

        titleProperty:
          els.notionTitleProperty.value,

        urlProperty:
          els.notionUrlProperty.value
      });
  }

  showStatus(
    els.notionStatus,
    `Database selected: ${notionDataSourceName(dataSource)}.`,
    "success"
  );
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
    .createPreset(name);

  await refreshNotionPresetList();
  await loadSettings();

  await refreshNotionDataSources();

  els.notionDataSourceId.focus();

  showStatus(
    els.notionStatus,
    "Preset created. Add its data source ID, test it, then Save Settings.",
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

async function testNotion() {
  showStatus(els.notionStatus, "Testing…");
  els.testNotion.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "notion.test",
      payload: {
        token:
          (
            await chrome.storage.local.get(
              "notionToken"
            )
          ).notionToken || "",
        dataSourceId: els.notionDataSourceId.value.trim()
      }
    });

    if (!response?.ok) throw new Error(response?.error?.message || "Connection failed.");

    const titleProps = response.result.properties.filter((property) => property.type === "title");
    const urlProps = response.result.properties.filter((property) => property.type === "url");

    if (titleProps.length === 1) {
      els.notionTitleProperty.value =
        titleProps[0].name;
    }

    if (
      !els.notionUrlProperty.value &&
      urlProps.length === 1
    ) {
      els.notionUrlProperty.value =
        urlProps[0].name;
    }

    const activePreset =
      await ClipNestNotionStore
        .getActivePreset();

    if (activePreset) {
      await ClipNestNotionStore
        .updateActivePreset({
          name:
            els.notionPresetName.value,

          dataSourceId:
            els.notionDataSourceId.value,

          titleProperty:
            els.notionTitleProperty.value,

          urlProperty:
            els.notionUrlProperty.value
        });

      await refreshNotionPresetList();
    }

    const propertySummary = response.result.properties
      .slice(0, 8)
      .map((property) => `${property.name} (${property.type})`)
      .join(", ");

    showStatus(
      els.notionStatus,
      `Connected. ${response.result.properties.length} properties found${propertySummary ? `: ${propertySummary}` : ""}.`,
      "success"
    );
  } catch (error) {
    showStatus(els.notionStatus, error.message || String(error), "error");
  } finally {
    els.testNotion.disabled = false;
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
      `${vault.name} connected.`,
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

  await refreshVaultName();
}

function showStatus(element, message, kind = "") {
  element.textContent = message || "";
  element.className = `status ${kind}`.trim();
}
