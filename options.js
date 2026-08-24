const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  for (const id of [
    "defaultDestination",
    "notionToken",
    "notionDataSourceId",
    "notionTitleProperty",
    "notionUrlProperty",
    "testNotion",
    "notionStatus",
    "chooseVault",
    "vaultName",
    "obsidianSubfolder",
    "obsidianDefaultTags",
    "disconnectVault",
    "obsidianStatus",
    "saveSettings",
    "saveStatus"
  ]) {
    els[id] = document.getElementById(id);
  }

  els.saveSettings.addEventListener("click", saveSettings);
  els.testNotion.addEventListener("click", testNotion);
  els.chooseVault.addEventListener("click", chooseVault);
  els.disconnectVault.addEventListener("click", disconnectVault);

  await loadSettings();
  await refreshVaultName();
}

async function loadSettings() {
  const settings = await chrome.storage.local.get([
    "defaultDestination",
    "notionToken",
    "notionDataSourceId",
    "notionTitleProperty",
    "notionUrlProperty",
    "obsidianSubfolder",
    "obsidianDefaultTags"
  ]);

  els.defaultDestination.value = settings.defaultDestination || "obsidian";
  els.notionToken.value = settings.notionToken || "";
  els.notionDataSourceId.value = settings.notionDataSourceId || "";
  els.notionTitleProperty.value = settings.notionTitleProperty || "Name";
  els.notionUrlProperty.value = settings.notionUrlProperty || "";
  els.obsidianSubfolder.value = settings.obsidianSubfolder || "";
  els.obsidianDefaultTags.value = settings.obsidianDefaultTags || "";
}

async function saveSettings() {
  await chrome.storage.local.set({
    defaultDestination: els.defaultDestination.value,
    notionToken: els.notionToken.value.trim(),
    notionDataSourceId: els.notionDataSourceId.value.trim(),
    notionTitleProperty: els.notionTitleProperty.value.trim() || "Name",
    notionUrlProperty: els.notionUrlProperty.value.trim(),
    obsidianSubfolder: els.obsidianSubfolder.value.trim(),
    obsidianDefaultTags: els.obsidianDefaultTags.value.trim()
  });

  showStatus(els.saveStatus, "Saved.", "success");
}

async function testNotion() {
  showStatus(els.notionStatus, "Testing…");
  els.testNotion.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: "notion.test",
      payload: {
        token: els.notionToken.value.trim(),
        dataSourceId: els.notionDataSourceId.value.trim()
      }
    });

    if (!response?.ok) throw new Error(response?.error?.message || "Connection failed.");

    const titleProps = response.result.properties.filter((property) => property.type === "title");
    const urlProps = response.result.properties.filter((property) => property.type === "url");

    if (titleProps.length === 1) els.notionTitleProperty.value = titleProps[0].name;
    if (!els.notionUrlProperty.value && urlProps.length === 1) els.notionUrlProperty.value = urlProps[0].name;

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
  showStatus(els.obsidianStatus, "");

  if (!("showDirectoryPicker" in window)) {
    showStatus(els.obsidianStatus, "This Chrome build does not expose the folder picker here.", "error");
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await setVaultHandle(handle);
    els.vaultName.textContent = handle.name;
    showStatus(els.obsidianStatus, "Vault connected.", "success");
  } catch (error) {
    if (error?.name === "AbortError") return;
    showStatus(els.obsidianStatus, error.message || String(error), "error");
  }
}

async function disconnectVault() {
  await clearVaultHandle();
  els.vaultName.textContent = "No vault connected";
  showStatus(els.obsidianStatus, "Vault disconnected.", "success");
}

async function refreshVaultName() {
  try {
    const handle = await getVaultHandle();
    els.vaultName.textContent = handle?.name || "No vault connected";
  } catch {
    els.vaultName.textContent = "No vault connected";
  }
}

function showStatus(element, message, kind = "") {
  element.textContent = message || "";
  element.className = `status ${kind}`.trim();
}
