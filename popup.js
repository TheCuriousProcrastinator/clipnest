const state = {
  capture: null,
  destination: "notion",
  saving: false
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  els.siteLabel = document.getElementById("siteLabel");
  els.settingsButton = document.getElementById("settingsButton");
  els.titleInput = document.getElementById("titleInput");
  els.tagsInput = document.getElementById("tagsInput");
  els.templateField = document.getElementById("templateField");
  els.templateSelect = document.getElementById("templateSelect");
  els.templateMeta = document.getElementById("templateMeta");
  els.notionPresetField = document.getElementById("notionPresetField");
  els.notionPresetSelect = document.getElementById("notionPresetSelect");
  els.tagsField = document.getElementById("tagsField");
  els.vaultField = document.getElementById("vaultField");
  els.vaultSelect = document.getElementById("vaultSelect");
  els.folderField = document.getElementById("folderField");
  els.folderSelect = document.getElementById("folderSelect");
  els.notesField = document.getElementById("notesField");
  els.toggleNotes = document.getElementById("toggleNotes");
  els.notesInput = document.getElementById("notesInput");

  setupObsidianTagAutocomplete();
  els.selectAreaButton = document.getElementById("selectAreaButton");
  els.selectedTextModeRow = document.getElementById("selectedTextModeRow");
  els.contentModeInputs = [...document.querySelectorAll('input[name="contentMode"]')];
  els.saveButton = document.getElementById("saveButton");
  els.status = document.getElementById("status");
  els.destinationButtons = [...document.querySelectorAll(".destination-button")];

  els.settingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  els.saveButton.addEventListener("click", save);
  els.selectAreaButton.addEventListener("click", startAreaSelection);
  els.contentModeInputs.forEach((input) =>
    input.addEventListener("change", updateContentModeUI)
  );
  els.destinationButtons.forEach((button) => {
    button.addEventListener("click", () => setDestination(button.dataset.destination));
  });

  els.notionPresetSelect?.addEventListener(
    "change",
    handleNotionPresetChange
  );

  els.vaultSelect?.addEventListener(
    "change",
    handleVaultPickerChange
  );

  els.folderSelect?.addEventListener(
    "change",
    handleFolderPickerChange
  );

  els.folderSelect?.addEventListener(
    "focus",
    () => {
      void loadObsidianFolders(
        els.folderSelect.value || ""
      );
    }
  );

  els.toggleNotes?.addEventListener(
    "click",
    () => {
      setNotesExpanded(
        els.notesField?.classList.contains(
          "hidden"
        )
      );
    }
  );

  await ClipNestVaultStore.migrateLegacy();
  await ClipNestNotionStore.migrateLegacy();

  await Promise.all([
    loadVaultPicker(),
    loadNotionPresetPicker()
  ]);

  const settings = await chrome.storage.local.get([
    "defaultDestination",
    "obsidianDefaultTags",
    "obsidianDefaultTemplatePath",
    "obsidianSubfolder"
  ]);

  els.tagsInput.value =
    settings.defaultDestination ===
      "notion"
      ? ""
      : (
          settings.obsidianDefaultTags ||
          ""
        );

  setDestination(
    settings.defaultDestination ===
      "notion"
      ? "notion"
      : "obsidian"
  );

  setContentMode("article");

  els.templateSelect?.addEventListener("change", async () => {
    const value =
      els.templateSelect.value || "";

    await chrome.storage.local.set({
      obsidianDefaultTemplatePath:
        value
    });

    await ClipNestVaultStore.updateActiveConfig({
      defaultTemplatePath:
        value
    });
  });

  const defaultTemplatePath =
    settings.obsidianDefaultTemplatePath || "";

  const defaultSubfolder =
    settings.obsidianSubfolder || "";

  void loadObsidianFolders(
    defaultSubfolder
  );

  // Page capture is the primary popup task.
  // Never block it on vault/template scanning.
  await captureCurrentPage();

  // Templates may appear a moment later without
  // preventing the user from using the clipper.
  void loadObsidianTemplates(
    defaultTemplatePath
  );
}

function setDestination(destination) {
  state.destination =
    destination;

  document.body.dataset.destination =
    destination;

  els.destinationButtons?.forEach(
    (button) => {
      button.classList.toggle(
        "active",
        button.dataset.destination ===
          destination
      );
    }
  );

  els.vaultField?.classList.toggle(
    "hidden",
    destination !==
      "obsidian"
  );

  els.folderField?.classList.toggle(
    "hidden",
    destination !==
      "obsidian"
  );

  els.notionPresetField?.classList.toggle(
    "hidden",
    destination !==
      "notion"
  );

  els.tagSuggestions?.classList.add(
    "hidden"
  );

  if (
    destination ===
      "notion"
  ) {
    void loadNotionTagOptions();
  } else {
    notionTagOptions =
      [];

    void loadObsidianTags();
  }
}

async function loadNotionPresetPicker() {
  if (
    !els.notionPresetSelect
  ) {
    return;
  }

  const info =
    await ClipNestNotionStore
      .listPresets();

  els.notionPresetSelect
    .replaceChildren();

  if (!info.presets.length) {
    const empty =
      document.createElement(
        "option"
      );

    empty.value = "";

    empty.textContent =
      "No presets configured";

    els.notionPresetSelect.append(
      empty
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
  }

  const manage =
    document.createElement(
      "option"
    );

  manage.value =
    "__manage__";

  manage.textContent =
    "Manage presets…";

  els.notionPresetSelect.append(
    manage
  );

  els.notionPresetSelect.value =
    info.activePresetId ||
    "";
}

async function handleNotionPresetChange() {
  const value =
    els.notionPresetSelect?.value ||
    "";

  if (
    value === "__manage__"
  ) {
    await loadNotionPresetPicker();

    chrome.runtime.openOptionsPage();

    return;
  }

  if (!value) {
    return;
  }

  try {
    await ClipNestNotionStore
      .setActivePreset(
        value
      );

    if (els.tagsInput) {
      els.tagsInput.value =
        "";
    }

    await loadNotionPresetPicker();

    await loadNotionTagOptions();

    setStatus("");
  } catch (error) {
    setStatus(
      error.message ||
        String(error),
      "error"
    );

    await loadNotionPresetPicker();
  }
}

function setNotesExpanded(expanded) {
  els.notesField?.classList.toggle(
    "hidden",
    !expanded
  );

  if (els.toggleNotes) {
    els.toggleNotes.textContent =
      expanded
        ? "− Hide note"
        : "+ Add note";
  }

  if (expanded) {
    setTimeout(
      () =>
        els.notesInput?.focus(),
      0
    );
  }
}

async function loadVaultPicker() {
  if (!els.vaultSelect) {
    return;
  }

  const info =
    await ClipNestVaultStore.listVaults();

  els.vaultSelect.replaceChildren();

  if (!info.vaults.length) {
    const empty =
      document.createElement(
        "option"
      );

    empty.value = "";
    empty.textContent =
      "No vault connected";

    els.vaultSelect.append(empty);
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
  }

  const connect =
    document.createElement(
      "option"
    );

  connect.value =
    "__connect__";

  connect.textContent =
    "Connect another vault…";

  els.vaultSelect.append(
    connect
  );

  els.vaultSelect.value =
    info.activeVaultId ||
    "";
}

async function handleVaultPickerChange() {
  const value =
    els.vaultSelect?.value ||
    "";

  if (
    value === "__connect__"
  ) {
    await connectVaultFromPopup();
    return;
  }

  if (!value) {
    return;
  }

  try {
    await ClipNestVaultStore
      .activateVault(value);

    await refreshPopupVaultContext();
  } catch (error) {
    setStatus(
      error.message ||
        String(error),
      "error"
    );

    await loadVaultPicker();
  }
}

async function connectVaultFromPopup() {
  if (
    !(
      "showDirectoryPicker" in
      window
    )
  ) {
    chrome.runtime.openOptionsPage();
    return;
  }

  try {
    const handle =
      await window.showDirectoryPicker({
        mode: "readwrite"
      });

    await ClipNestVaultStore
      .addVault(handle);

    await refreshPopupVaultContext();
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      await loadVaultPicker();
      return;
    }

    setStatus(
      error.message ||
        String(error),
      "error"
    );

    await loadVaultPicker();
  }
}

async function refreshPopupVaultContext() {
  await loadVaultPicker();

  const settings =
    await chrome.storage.local.get([
      "obsidianDefaultTags",
      "obsidianDefaultTemplatePath",
      "obsidianSubfolder"
    ]);

  els.tagsInput.value =
    settings.obsidianDefaultTags ||
    "";

  state.obsidianTags = [];
  state.obsidianTemplates = [];

  els.templateField?.classList.add(
    "hidden"
  );

  if (els.tagSyncMeta) {
    els.tagSyncMeta.textContent =
      "Loading Obsidian tags…";
  }

  await Promise.all([
    loadObsidianTags(),
    loadObsidianTemplates(
      settings.obsidianDefaultTemplatePath ||
      ""
    ),
    loadObsidianFolders(
      settings.obsidianSubfolder ||
      "",
      true
    )
  ]);
}

async function captureCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");

    if (!/^https?:/i.test(tab.url || "")) {
      throw new Error("Open a normal webpage first. Chrome internal pages cannot be captured.");
    }

    await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      files: [
        "article-capture.js"
      ]
    });

    const results =
      await chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        func: () => {
          const capture =
            window.__clipnestPageCapture ||
            null;

          const error =
            window.__clipnestPageCaptureError ||
            "";

          delete window.__clipnestPageCapture;
          delete window.__clipnestPageCaptureError;

          return {
            capture,
            error
          };
        }
      });

    const pageResult =
      results?.[0]?.result;

    if (pageResult?.error) {
      throw new Error(
        pageResult.error
      );
    }

    const capture =
      pageResult?.capture;
    if (!capture) throw new Error("Could not read this page.");

    state.capture = capture;
    els.titleInput.value = capture.title || "Untitled";
    els.siteLabel.textContent = capture.siteName || capture.hostname || "Webpage";

    // Smart Article parsing can be expensive on complex pages.
    // Do not run it merely because the popup opened.
    // It will run only if the user actually saves Article mode.
    state.articleEnhancementTab = tab;
    state.articleEnhancementPromise = null;
    state.articleEnhancementDone = false;

    const hasTextSelection =
      Boolean(String(capture.selection || "").trim());

    els.selectedTextModeRow?.classList.toggle(
      "hidden",
      !hasTextSelection
    );

    if (hasTextSelection) {
      setContentMode("text");
    }

    await restoreQuickClipDraft(tab, capture);
    await restoreAreaSelection(tab, capture);

    els.saveButton.disabled = false;

    await maybeAutoSaveQuickClip(tab, capture);
    setStatus("");
  } catch (error) {
    setStatus(error.message || String(error), "error");
    els.saveButton.disabled = true;
  }
}

function articleProseStats(markdown) {
  const source =
    String(markdown || "")
      .replace(
        /!\[[^\]]*\]\([^)]+\)/g,
        ""
      )
      .replace(
        /\[([^\]]+)\]\([^)]+\)/g,
        "$1"
      );

  const blocks =
    source
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean);

  let proseBlocks = 0;
  let proseWords = 0;

  for (const block of blocks) {
    /*
     * Ignore obvious structural Markdown.
     * We are looking for real prose paragraphs.
     */
    if (
      /^(?:#{1,6}\s|[-*+]\s|\d+\.\s|\|)/.test(
        block
      )
    ) {
      continue;
    }

    const words =
      block
        .replace(
          /[`*_>#~]/g,
          " "
        )
        .split(/\s+/)
        .filter(Boolean);

    if (words.length >= 10) {
      proseBlocks += 1;
      proseWords += words.length;
    }
  }

  return {
    proseBlocks,
    proseWords
  };
}

function shouldPreferStructuredArticle(
  capture,
  result
) {
  if (
    !result?.markdown ||
    result.type !== "repeated-records"
  ) {
    return false;
  }

  const rowCount =
    Number(result.rowCount || 0);

  const coverage =
    Number(result.coverage || 0);

  const semanticHeaderRatio =
    Number(
      result.semanticHeaderRatio || 0
    );

  if (rowCount < 3) {
    return false;
  }

  const {
    proseBlocks,
    proseWords
  } = articleProseStats(
    capture?.markdown || ""
  );

  const substantialProse =
    proseBlocks >= 4 &&
    proseWords >= 120;

  /*
   * Case 1:
   * A strong semantic dataset.
   *
   * Find-a-Grave-style tables have meaningful
   * columns rather than "Field 2 / Field 3".
   */
  if (
    semanticHeaderRatio >= 0.70 &&
    rowCount >= 5 &&
    coverage >= 0.25
  ) {
    return true;
  }

  /*
   * Case 2:
   * Repeated records dominate the actual page.
   */
  if (
    coverage >= 0.58 &&
    rowCount >= 4
  ) {
    return true;
  }

  /*
   * Case 3:
   * There is little real article prose and a
   * substantial structured section exists.
   */
  if (
    !substantialProse &&
    coverage >= 0.34 &&
    rowCount >= 5
  ) {
    return true;
  }

  /*
   * Otherwise the table is probably secondary:
   * related posts, recommendations, cards, etc.
   */
  return false;
}

async function enhanceStructuredArticleCapture(
  tab,
  capture
) {
  try {
    if (!tab?.id || !capture) {
      return;
    }

    await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      func: () => {
        window.__clipperWholePageMode = true;
        delete window.__clipperWholePageResult;
      }
    });

    await chrome.scripting.executeScript({
      target: {
        tabId: tab.id
      },
      files: [
        "selector.js"
      ]
    });

    const results =
      await chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        func: () => {
          const result =
            window.__clipperWholePageResult ||
            null;

          delete window.__clipperWholePageResult;
          delete window.__clipperWholePageMode;

          return result;
        }
      });

    const result =
      results?.[0]?.result;

    delete capture.structuredMarkdown;

    if (
      ClipNestArticleEngine.shouldPreferStructuredArticle(
        capture,
        result
      )
    ) {
      capture.structuredMarkdown =
        result.markdown;
    }
  } catch {
    /*
     * Smart detection is an enhancement, not a requirement.
     * The existing Article extractor remains the fallback.
     */
  }
}

async function save() {
  if (!state.capture || state.saving) return;

  state.saving = true;
  els.saveButton.disabled = true;
  els.saveButton.textContent = "Saving…";
  setStatus("");

  try {
    if (
      getContentMode() === "article" &&
      !state.articleEnhancementDone
    ) {
      state.articleEnhancementPromise =
        enhanceStructuredArticleCapture(
          state.articleEnhancementTab,
          state.capture
        );

      await state.articleEnhancementPromise;

      state.articleEnhancementDone = true;
    }

    const payload = buildPayload();

    if (state.destination === "notion") {
      const response = await chrome.runtime.sendMessage({ type: "notion.save", payload });
      if (!response?.ok) throw new Error(response?.error?.message || "Notion save failed.");
      setStatus("Saved to Notion.", "success");
    } else {
      const filename = await saveToObsidian(payload);

      try {
        const tagResponse =
          await chrome.runtime.sendMessage({
            type: "obsidian.tags.remember",
            tags: payload.tags
          });

        if (tagResponse?.ok) {
          state.obsidianTags =
            tagResponse.tags || [];
        }
      } catch {
        // Tag-cache update is non-critical.
      }

      setStatus(`Saved to Obsidian as ${filename}.`, "success");
    }

    if (payload.contentMode === "selection") {
      const { pendingQuickClipDraft } =
        await chrome.storage.local.get("pendingQuickClipDraft");

      await chrome.storage.local.remove([
        "pendingAreaSelection",
        "pendingQuickClipDraft",
        "pendingQuickSave"
      ]);

      if (Number.isInteger(pendingQuickClipDraft?.tabId)) {
        try {
          await chrome.tabs.sendMessage(
            pendingQuickClipDraft.tabId,
            {
              type: "clipper.quickSaveComplete",
              destination: state.destination
            }
          );
        } catch {
          // Save succeeded even if selector is already gone.
        }
      }
    }

    setTimeout(() => window.close(), 450);
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    state.saving = false;
    els.saveButton.disabled = false;
    updateUxSaveButtonLabel();
  }
}

function buildPayload() {
  const title = els.titleInput.value.trim() || state.capture.title || "Untitled";
  const tags = parseTags(els.tagsInput.value);
  const notes = els.notesInput.value.trim();
  const contentMode = getContentMode();

  const sections = [];

  if (notes) {
    sections.push(`## Notes\n\n${notes}`);
  }

  if (contentMode === "article") {
    const articleMarkdown =
      ClipNestArticleEngine.cleanArticleMarkdown(
        state.capture.structuredMarkdown ||
          state.capture.markdown ||
          "",
        title
      );

    if (articleMarkdown) {
      sections.push(
        `## Article\n\n${articleMarkdown}`
      );
    }
  }

  if (contentMode === "text") {
    const selectedText =
      String(state.capture.selection || "").trim();

    if (!selectedText) {
      throw new Error(
        "Select some text on the webpage first."
      );
    }

    sections.push(
      `## Selected text\n\n${quoteMarkdown(selectedText)}`
    );
  }

  if (contentMode === "selection") {
    if (!state.areaSelection?.markdown) {
      throw new Error("Choose an area from the page first.");
    }

    sections.push(`## Clipped content\n\n${state.areaSelection.markdown}`);
  }

  const sourceLine =
    state.destination === "notion"
      ? `[Source](${state.capture.url})`
      : "";

  const markdown = [sourceLine, ...sections]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const templatePath =
    els.templateSelect?.value || "";

  const template =
    Array.isArray(state.obsidianTemplates)
      ? state.obsidianTemplates.find(
          (item) => item.path === templatePath
        ) || null
      : null;

  return {
    title,
    url: state.capture.url,
    hostname: state.capture.hostname,
    siteName: state.capture.siteName,
    author: state.capture.author,
    description: state.capture.description,
    image: state.capture.image,
    tags,
    notes,
    contentMode,
    markdown,
    template
  };
}

function normalizeClipHeading(value) {
  return String(value || "")
    .replace(
      /!\[[^\]]*\]\([^)]+\)/g,
      ""
    )
    .replace(
      /\[([^\]]+)\]\([^)]+\)/g,
      "$1"
    )
    .replace(/[`*_~#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function repairClipSpacing(source) {
  let text =
    String(source || "");

  /*
   * Protect raw URLs before inserting missing
   * punctuation spaces.
   */
  const urls = [];

  text = text.replace(
    /https?:\/\/[^\s)]+/g,
    (url) => {
      const token =
        `CLIPPER_URL_${urls.length}_TOKEN`;

      urls.push(url);

      return token;
    }
  );

  const months =
    "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";

  /*
   * Tom OrbachAug 24, 2026
   *          ->
   * Tom Orbach
   *
   * Aug 24, 2026
   */
  text = text.replace(
    new RegExp(
      `([A-Za-zÀ-ÿ])(${months}\\\\s+\\\\d{1,2},\\\\s+\\\\d{4})`,
      "g"
    ),
    "$1\n\n$2"
  );

  /*
   * Aug 24, 2026∙PaidHey
   */
  text = text.replace(
    /(\d{4})\s*∙\s*(Paid|Free)\s*/gi,
    "$1\n\n$2\n\n"
  );

  /*
   * A sentence ending and the next sentence
   * accidentally touching.
   */
  text = text.replace(
    /([.!?]["”’]?)(?=[A-Z][a-z])/g,
    "$1 "
  );

  /*
   * (h/tArvid Kahl)
   */
  text = text.replace(
    /\(h\/t\s*([A-Z])/g,
    "(h/t $1"
  );

  for (
    let index = 0;
    index < urls.length;
    index += 1
  ) {
    text = text.replaceAll(
      `CLIPPER_URL_${index}_TOKEN`,
      urls[index]
    );
  }

  /*
   * Markdown link followed immediately by prose.
   */
  text = text.replace(
    /\)(?=[A-Z][a-z])/g,
    ") "
  );

  return text;
}

function cleanSharedClipMarkdown(markdown) {
  let text =
    String(markdown || "")
      .replace(/\r\n?/g, "\n");

  /*
   * Profile/reaction avatars are presentation UI,
   * not useful article content.
   */
  text = text.replace(
    /^!\[[^\]]*(?:avatar|profile picture|profile photo)[^\]]*\]\([^)]+\)\s*$/gim,
    ""
  );

  /*
   * Standalone engagement counters.
   */
  text = text.replace(
    /^\s*\d+\s+(?:Likes?|Restacks?|Comments?)(?:\s*∙\s*\d+\s+(?:Likes?|Restacks?|Comments?))*\s*$/gim,
    ""
  );

  text =
    repairClipSpacing(text);

  /*
   * Repair linked images whose inner closing bracket
   * was incorrectly escaped:
   *
   * [![alt\](image)](link)
   * ->
   * [![alt](image)](link)
   */
  text = text.replace(
    /!\[([^\n]*?)\\\]\(([^)\n]+)\)/g,
    "![$1]($2)"
  );

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanArticleMarkdown(
  markdown,
  title = ""
) {
  let text =
    cleanSharedClipMarkdown(
      markdown
    );

  if (!text) {
    return "";
  }

  /*
   * We already create the note H1 ourselves.
   * Drop a duplicate leading article H1.
   */
  const firstHeading =
    text.match(
      /^\s*#\s+([^\n]+)\n+/
    );

  if (
    firstHeading &&
    normalizeClipHeading(
      firstHeading[1]
    ) ===
      normalizeClipHeading(title)
  ) {
    text =
      text.slice(
        firstHeading[0].length
      );
  }

  /*
   * Strong article-end markers.
   * These should never become part of the article.
   */
  const strongStops = [
    /#{1,6}\s+Discussion about this post\b/i,
    /\nDiscussion about this post\b/i
  ];

  let stopAt = -1;

  for (const pattern of strongStops) {
    const match =
      pattern.exec(text);

    if (
      match &&
      (
        stopAt < 0 ||
        match.index < stopAt
      )
    ) {
      stopAt =
        match.index;
    }
  }

  /*
   * Generic related/recommendation headings are
   * only accepted as stop markers after a substantial
   * amount of content, avoiding accidental truncation.
   */
  const genericStop =
    /(?:^|\n)#{1,6}\s+(?:Recommended|Recommendations|More from .+|Keep reading|Related posts?|You might also like|Comments?)\s*$/im.exec(
      text
    );

  if (
    genericStop &&
    genericStop.index > 800 &&
    (
      stopAt < 0 ||
      genericStop.index < stopAt
    )
  ) {
    stopAt =
      genericStop.index;
  }

  if (stopAt >= 0) {
    text =
      text.slice(
        0,
        stopAt
      );
  }

  /*
   * Remove an engagement counter that was glued
   * directly onto a section heading before trimming.
   */
  text = text.replace(
    /\s*\d+\s+Likes?\s*∙\s*\d+\s+Restacks?\s*$/i,
    ""
  );

  return text
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function quoteMarkdown(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function setContentMode(mode) {
  const allowed = new Set(["article", "text", "selection"]);
  const next = allowed.has(mode) ? mode : "article";

  for (const input of els.contentModeInputs || []) {
    input.checked = input.value === next;
  }

  updateContentModeUI();
}

function getContentMode() {
  return (
    els.contentModeInputs?.find((input) => input.checked)?.value ||
    "article"
  );
}

function updateContentModeUI() {
  const mode = getContentMode();
  const isSelection = mode === "selection";

  els.selectAreaButton?.classList.toggle(
    "hidden",
    !isSelection
  );

  els.saveButton?.classList.toggle(
    "hidden",
    isSelection
  );

  if (isSelection && state.areaSelection?.markdown) {
    els.selectAreaButton.textContent = "Choose a different area";
  } else if (els.selectAreaButton) {
    els.selectAreaButton.textContent = "Pick area on page";
  }
}

async function restoreAreaSelection(tab, capture) {
  const { pendingAreaSelection } =
    await chrome.storage.local.get("pendingAreaSelection");

  if (!pendingAreaSelection) return;

  const isCurrentPage =
    pendingAreaSelection.tabId === tab.id &&
    pendingAreaSelection.url === capture.url;

  const isFresh =
    Date.now() - Number(pendingAreaSelection.capturedAt || 0) <
    2 * 60 * 60 * 1000;

  if (!isCurrentPage || !isFresh) {
    if (!isFresh) {
      await chrome.storage.local.remove("pendingAreaSelection");
    }
    return;
  }

  state.areaSelection = pendingAreaSelection;

  setContentMode("selection");
}

async function restoreQuickClipDraft(tab, capture) {
  const { pendingQuickClipDraft } =
    await chrome.storage.local.get("pendingQuickClipDraft");

  if (!pendingQuickClipDraft) return;

  const samePage =
    pendingQuickClipDraft.tabId === tab.id &&
    pendingQuickClipDraft.url === capture.url;

  const fresh =
    Date.now() - Number(pendingQuickClipDraft.capturedAt || 0) <
    2 * 60 * 60 * 1000;

  if (!samePage || !fresh) return;

  if (typeof pendingQuickClipDraft.title === "string") {
    els.titleInput.value = pendingQuickClipDraft.title;
  }

  if (typeof pendingQuickClipDraft.tags === "string") {
    els.tagsInput.value = pendingQuickClipDraft.tags;
  }

  if (typeof pendingQuickClipDraft.notes === "string") {
    els.notesInput.value =
      pendingQuickClipDraft.notes;

    if (
      pendingQuickClipDraft.notes.trim()
    ) {
      setNotesExpanded(true);
    }
  }

  if (
    pendingQuickClipDraft.destination === "obsidian" ||
    pendingQuickClipDraft.destination === "notion"
  ) {
    setDestination(pendingQuickClipDraft.destination);
  }
}

async function maybeAutoSaveQuickClip(tab, capture) {
  const { pendingQuickSave } =
    await chrome.storage.local.get("pendingQuickSave");

  if (!pendingQuickSave) return;

  const samePage =
    pendingQuickSave.url === capture.url;

  const fresh =
    Date.now() - Number(pendingQuickSave.capturedAt || 0) <
    5 * 60 * 1000;

  if (!samePage || !fresh || !state.areaSelection?.markdown) {
    await chrome.storage.local.remove("pendingQuickSave");
    return;
  }

  await chrome.storage.local.remove("pendingQuickSave");

  setStatus("Saving selected area…");
  await save();
}

async function startAreaSelection() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id || !/^https?:/i.test(tab.url || "")) {
      throw new Error("Open a normal webpage first.");
    }

    await chrome.storage.local.set({
      pendingQuickClipDraft: {
        tabId: tab.id,
        url: tab.url || "",
        title: els.titleInput.value,
        tags: els.tagsInput.value,
        notes: els.notesInput.value,
        templatePath: els.templateSelect?.value || "",
        destination: state.destination,
        capturedAt: Date.now()
      }
    });

    await chrome.storage.local.remove("pendingQuickSave");

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["selector.js"]
    });

    setStatus(
      "Click the part of the webpage you want to clip. Press Esc to cancel."
    );

    setTimeout(() => window.close(), 180);
  } catch (error) {
    setStatus(error.message || String(error), "error");
  }
}

async function loadObsidianFolders(
  defaultPath = "",
  forceRefresh = false
) {
  if (!els.folderSelect) {
    return;
  }

  const previous =
    String(
      defaultPath ||
      els.folderSelect.value ||
      ""
    );

  try {
    const response =
      await chrome.runtime.sendMessage({
        type:
          forceRefresh
            ? "obsidian.folders.refresh"
            : "obsidian.folders.get"
      });

    if (!response?.ok) {
      throw new Error(
        response?.error?.message ||
        "Could not read vault folders."
      );
    }

    const folders =
      Array.isArray(response.folders)
        ? response.folders
        : [];

    els.folderSelect.replaceChildren();

    const root =
      document.createElement(
        "option"
      );

    root.value = "";
    root.textContent =
      "Vault root";

    els.folderSelect.append(
      root
    );

    for (
      const path of folders
    ) {
      const option =
        document.createElement(
          "option"
        );

      option.value = path;
      option.textContent = path;

      els.folderSelect.append(
        option
      );
    }

    if (
      previous &&
      !folders.includes(previous)
    ) {
      const current =
        document.createElement(
          "option"
        );

      current.value =
        previous;

      current.textContent =
        `${previous} · current`;

      els.folderSelect.append(
        current
      );
    }

    const separator =
      document.createElement(
        "option"
      );

    separator.disabled = true;
    separator.textContent =
      "──────────";

    els.folderSelect.append(
      separator
    );

    const refresh =
      document.createElement(
        "option"
      );

    refresh.value =
      "__refresh__";

    refresh.textContent =
      "Refresh folders…";

    els.folderSelect.append(
      refresh
    );

    els.folderSelect.value =
      previous;
  } catch (error) {
    setStatus(
      error.message ||
        String(error),
      "error"
    );
  }
}

async function handleFolderPickerChange() {
  if (!els.folderSelect) {
    return;
  }

  const value =
    els.folderSelect.value;

  if (
    value === "__refresh__"
  ) {
    const settings =
      await chrome.storage.local.get([
        "obsidianSubfolder"
      ]);

    await loadObsidianFolders(
      settings.obsidianSubfolder ||
        "",
      true
    );

    return;
  }

  await chrome.storage.local.set({
    obsidianSubfolder:
      value || ""
  });

  await ClipNestVaultStore
    .updateActiveConfig({
      subfolder:
        value || ""
    });
}

async function loadObsidianTemplates(
  defaultPath = ""
) {
  if (
    !els.templateSelect ||
    !els.templateField
  ) {
    return;
  }

  try {
    let response =
      await chrome.runtime.sendMessage({
        type: "obsidian.templates.get"
      });

    if (
      response?.ok &&
      response.stale
    ) {
      const refreshed =
        await chrome.runtime.sendMessage({
          type: "obsidian.templates.refresh"
        });

      if (refreshed?.ok) {
        response = refreshed;
      }
    }

    if (!response?.ok) {
      els.templateField.classList.add(
        "hidden"
      );
      return;
    }

    const templates =
      Array.isArray(response.templates)
        ? response.templates
        : [];

    state.obsidianTemplates =
      templates;

    els.templateSelect.replaceChildren();

    const none =
      document.createElement("option");

    none.value = "";
    none.textContent = "None";

    els.templateSelect.append(none);

    for (const item of templates) {
      const option =
        document.createElement("option");

      option.value =
        item.path;

      option.textContent =
        item.source
          ? `${item.name} · ${item.source}`
          : item.name;

      els.templateSelect.append(
        option
      );
    }

    if (!templates.length) {
      els.templateField.classList.add(
        "hidden"
      );
      return;
    }

    els.templateField.classList.remove(
      "hidden"
    );

    const exists =
      templates.some(
        (item) =>
          item.path === defaultPath
      );

    els.templateSelect.value =
      exists
        ? defaultPath
        : "";

    const folders =
      Array.isArray(response.folders)
        ? response.folders
        : [];

    els.templateMeta.textContent =
      folders.length
        ? `Auto-detected from ${folders.join(", ")}`
        : `${templates.length} templates found`;
  } catch {
    els.templateField.classList.add(
      "hidden"
    );
  }
}

let notionTagOptions =
  [];

async function loadNotionTagOptions() {
  notionTagOptions =
    [];

  if (
    state.destination !==
      "notion"
  ) {
    return;
  }

  if (els.tagSyncMeta) {
    els.tagSyncMeta.textContent =
      "Loading Notion tags…";
  }

  try {
    const response =
      await chrome.runtime.sendMessage({
        type:
          "notion.tags.options"
      });

    if (!response?.ok) {
      throw new Error(
        response?.error?.message ||
        "Could not load Notion tags."
      );
    }

    notionTagOptions =
      Array.isArray(
        response.options
      )
        ? response.options
        : [];

    if (els.tagSyncMeta) {
      els.tagSyncMeta.textContent =
        notionTagOptions.length
          ? `${notionTagOptions.length} Notion tag${
              notionTagOptions.length === 1
                ? ""
                : "s"
            } available`
          : "No existing Notion tags";
    }

    renderObsidianTagSuggestions();
  } catch (error) {
    notionTagOptions =
      [];

    els.tagSuggestions?.classList.add(
      "hidden"
    );

    if (els.tagSyncMeta) {
      els.tagSyncMeta.textContent =
        error?.message ||
        String(error);
    }
  }
}

function setupObsidianTagAutocomplete() {
  const field =
    els.tagsInput?.closest(".field");

  if (!field) {
    return;
  }

  field.classList.add(
    "tags-autocomplete-field"
  );

  const suggestions =
    document.createElement("div");

  suggestions.id =
    "obsidianTagSuggestions";

  suggestions.className =
    "tag-suggestions hidden";

  field.append(suggestions);

  const meta =
    document.createElement("small");

  meta.id =
    "obsidianTagSyncMeta";

  meta.className =
    "tag-sync-meta";

  meta.textContent =
    "Loading Obsidian tags…";

  suggestions.insertAdjacentElement(
    "afterend",
    meta
  );

  els.tagSuggestions =
    suggestions;

  els.tagSyncMeta =
    meta;

  els.tagsInput.addEventListener(
    "input",
    renderObsidianTagSuggestions
  );

  els.tagsInput.addEventListener(
    "focus",
    renderObsidianTagSuggestions
  );

  els.tagsInput.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        els.tagSuggestions
      ) {
        els.tagSuggestions.classList.add(
          "hidden"
        );
      }
    }
  );

  els.tagsInput.addEventListener(
    "blur",
    () => {
      setTimeout(() => {
        els.tagSuggestions?.classList.add(
          "hidden"
        );
      }, 120);
    }
  );
}

async function loadObsidianTags() {
  try {
    const response =
      await chrome.runtime.sendMessage({
        type: "obsidian.tags.get"
      });

    if (!response?.ok) {
      return;
    }

    state.obsidianTags =
      response.tags || [];

    updateTagSyncMeta(
      response
    );

    if (response.stale) {
      const refreshed =
        await chrome.runtime.sendMessage({
          type: "obsidian.tags.refresh"
        });

      if (refreshed?.ok) {
        state.obsidianTags =
          refreshed.tags || [];

        updateTagSyncMeta({
          ...refreshed,
          stale: false
        });

        if (
          document.activeElement ===
          els.tagsInput
        ) {
          renderObsidianTagSuggestions();
        }
      }
    }
  } catch {
    if (els.tagSyncMeta) {
      els.tagSyncMeta.textContent =
        "Could not sync Obsidian tags";
    }
  }
}

function updateTagSyncMeta(info) {
  if (!els.tagSyncMeta) {
    return;
  }

  const count =
    Array.isArray(info.tags)
      ? info.tags.length
      : 0;

  if (!count) {
    els.tagSyncMeta.textContent =
      "No existing Obsidian tags found";
    return;
  }

  els.tagSyncMeta.textContent =
    `${count} Obsidian tags`;
}

function normalizeNotionTagColor(
  value
) {
  const color =
    String(
      value ||
      "default"
    )
      .trim()
      .toLowerCase();

  const allowed =
    new Set([
      "default",
      "gray",
      "brown",
      "orange",
      "yellow",
      "green",
      "blue",
      "purple",
      "pink",
      "red"
    ]);

  return allowed.has(color)
    ? color
    : "default";
}

function renderObsidianTagSuggestions() {
  const container =
    els.tagSuggestions;

  if (!container) {
    return;
  }

  const all =
    state.destination ===
      "notion"
      ? notionTagOptions
      : (
          Array.isArray(
            state.obsidianTags
          )
            ? state.obsidianTags
            : []
        );

  if (!all.length) {
    container.classList.add(
      "hidden"
    );

    return;
  }

  const raw =
    String(
      els.tagsInput.value ||
      ""
    );

  const pieces =
    raw.split(",");

  const query =
    String(
      pieces[
        pieces.length - 1
      ] ||
      ""
    )
      .trim()
      .replace(
        /^#/,
        ""
      )
      .toLowerCase();

  const selected =
    new Set(
      pieces
        .slice(
          0,
          -1
        )
        .map(
          (tag) =>
            tag
              .trim()
              .replace(
                /^#/,
                ""
              )
              .toLowerCase()
        )
        .filter(Boolean)
    );

  const matches =
    all
      .filter(
        (item) => {
          const tag =
            String(
              item.tag ||
              ""
            );

          if (!tag) {
            return false;
          }

          if (
            selected.has(
              tag.toLowerCase()
            )
          ) {
            return false;
          }

          return (
            !query ||
            tag
              .toLowerCase()
              .includes(
                query
              )
          );
        }
      )
      .slice(
        0,
        8
      );

  container.replaceChildren();

  if (!matches.length) {
    container.classList.add(
      "hidden"
    );

    return;
  }

  for (const item of matches) {
    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "tag-suggestion";

    const label =
      document.createElement(
        "span"
      );

    label.textContent =
      item.tag;

    if (
      state.destination ===
        "notion"
    ) {
      label.classList.add(
        "notion-tag-pill"
      );

      label.dataset.notionColor =
        normalizeNotionTagColor(
          item.color
        );
    }

    const count =
      document.createElement(
        "small"
      );

    count.textContent =
      state.destination ===
        "notion"
        ? ""
        : String(
            item.count ||
            ""
          );

    button.append(
      label,
      count
    );

    button.addEventListener(
      "mousedown",
      (event) => {
        event.preventDefault();

        chooseObsidianTag(
          item.tag
        );
      }
    );

    container.append(
      button
    );
  }

  container.classList.remove(
    "hidden"
  );
}

function chooseObsidianTag(tag) {
  const pieces =
    String(
      els.tagsInput.value || ""
    ).split(",");

  pieces.pop();

  const existing =
    pieces
      .map((value) =>
        value.trim()
      )
      .filter(Boolean);

  existing.push(tag);

  els.tagsInput.value =
    `${existing.join(", ")}, `;

  els.tagsInput.focus();

  renderObsidianTagSuggestions();
}

function parseTags(value) {
  return [...new Set(
    String(value || "")
      .split(",")
      .map((tag) => tag.trim().replace(/^#/, ""))
      .filter(Boolean)
  )];
}

async function saveToObsidian(payload) {
  const handle = await getVaultHandle();
  if (!handle) {
    throw new Error("No Obsidian vault is connected. Open Settings and choose your vault folder.");
  }

  const permission = await ensureWritePermission(handle);
  if (!permission) {
    throw new Error("Chrome no longer has permission to write to the vault. Reconnect it in Settings.");
  }

  const settings = await chrome.storage.local.get(["obsidianSubfolder"]);
  const directory = await getSubfolder(handle, settings.obsidianSubfolder || "");
  const baseName = sanitizeFilename(payload.title) || "Untitled";
  const filename = await findAvailableFilename(directory, baseName, ".md");
  const fileHandle = await directory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(
    buildObsidianMarkdown(payload)
  );
  await writable.close();
  return filename;
}

async function ensureWritePermission(handle) {
  const options = { mode: "readwrite" };
  if ((await handle.queryPermission(options)) === "granted") return true;

  try {
    return (await handle.requestPermission(options)) === "granted";
  } catch {
    return false;
  }
}

async function getSubfolder(root, rawPath) {
  const parts = String(rawPath || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== "." && part !== "..");

  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  return current;
}

async function findAvailableFilename(directory, baseName, extension) {
  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? "" : ` (${index})`;
    const candidate = `${baseName}${suffix}${extension}`;
    try {
      await directory.getFileHandle(candidate, { create: false });
    } catch (error) {
      if (error?.name === "NotFoundError") return candidate;
      throw error;
    }
  }
  throw new Error("Could not create a unique note filename.");
}

function buildObsidianMarkdown(payload) {
  if (payload.template?.content) {
    return applyObsidianTemplate(
      payload.template.content,
      payload
    );
  }

  const tags =
    Array.isArray(payload.tags)
      ? payload.tags
      : [];

  const frontmatter = [
    "---",
    "aliases: []",
    tags.length ? "tags:" : "tags: []",
    ...tags.map(
      (tag) => `  - ${yamlString(tag)}`
    ),
    `source: ${yamlString(payload.url)}`,
    "---"
  ].join("\n");

  return (
    `${frontmatter}\n\n` +
    `# ${payload.title}\n\n` +
    `${payload.markdown}\n`
  );
}

function applyObsidianTemplate(
  templateContent,
  payload
) {
  let output =
    String(templateContent || "")
      .replace(/^\uFEFF/, "");

  const now = new Date();

  const pad = (value) =>
    String(value).padStart(2, "0");

  const date =
    `${now.getFullYear()}-` +
    `${pad(now.getMonth() + 1)}-` +
    `${pad(now.getDate())}`;

  const time =
    `${pad(now.getHours())}:` +
    `${pad(now.getMinutes())}`;

  const hadContentToken =
    output.includes("{{content}}");

  const replacements = new Map([
    ["{{title}}", payload.title || ""],
    ["{{source}}", payload.url || ""],
    ["{{url}}", payload.url || ""],
    ["{{date}}", date],
    ["{{time}}", time],
    ["{{content}}", payload.markdown || ""]
  ]);

  for (const [token, value] of replacements) {
    output = output.split(token).join(value);
  }

  output = mergeTemplateFrontmatter(
    output,
    payload
  );

  if (
    !hadContentToken &&
    payload.markdown
  ) {
    output =
      insertClipBeforeTemplateBody(
        output,
        payload
      );
  }

  const bodyStart =
    output.startsWith("---")
      ? output.indexOf("\n---", 3)
      : -1;

  const finalBody =
    bodyStart >= 0
      ? output.slice(bodyStart + 4).trim()
      : output.trim();

  if (
    !finalBody.match(/^#\s+/m) &&
    !output.includes(`# ${payload.title}`)
  ) {
    if (output.startsWith("---")) {
      const end =
        output.indexOf("\n---", 3);

      if (end >= 0) {
        const before =
          output.slice(0, end + 4);

        const after =
          output.slice(end + 4)
            .replace(/^\s+/, "");

        output =
          `${before}\n\n` +
          `# ${payload.title}\n\n` +
          `${after}`;
      }
    } else {
      output =
        `# ${payload.title}\n\n` +
        output;
    }
  }

  return output.trimEnd() + "\n";
}

function insertClipBeforeTemplateBody(
  source,
  payload
) {
  const clip =
    String(payload.markdown || "").trim();

  if (!clip) {
    return source;
  }

  let frontmatter = "";
  let body = source;

  if (source.startsWith("---")) {
    const end =
      source.indexOf("\n---", 3);

    if (end >= 0) {
      frontmatter =
        source.slice(0, end + 4);

      body =
        source.slice(end + 4)
          .replace(/^\s+/, "");
    }
  }

  const h1 =
    body.match(/^#\s+.*$/m);

  if (h1 && Number.isInteger(h1.index)) {
    const split =
      h1.index + h1[0].length;

    const before =
      body.slice(0, split)
        .trimEnd();

    const after =
      body.slice(split)
        .replace(/^\s+/, "");

    body =
      `${before}\n\n` +
      `${clip}` +
      (after
        ? `\n\n${after}`
        : "");
  } else {
    body =
      `# ${payload.title}\n\n` +
      `${clip}` +
      (body.trim()
        ? `\n\n${body.trimStart()}`
        : "");
  }

  return frontmatter
    ? `${frontmatter}\n\n${body}`
    : body;
}

function mergeTemplateFrontmatter(
  source,
  payload
) {
  const tags =
    Array.isArray(payload.tags)
      ? payload.tags
      : [];

  if (!source.startsWith("---")) {
    const frontmatter = [
      "---",
      "aliases: []",
      tags.length ? "tags:" : "tags: []",
      ...tags.map(
        (tag) => `  - ${yamlString(tag)}`
      ),
      `source: ${yamlString(payload.url)}`,
      "---"
    ].join("\n");

    return `${frontmatter}\n\n${source}`;
  }

  const end =
    source.indexOf("\n---", 3);

  if (end < 0) {
    return source;
  }

  const yaml =
    source.slice(3, end)
      .split(/\r?\n/);

  const result = [];
  let foundSource = false;
  let foundTags = false;

  for (
    let index = 0;
    index < yaml.length;
    index += 1
  ) {
    const line = yaml[index];

    if (/^source\s*:/i.test(line)) {
      result.push(
        `source: ${yamlString(payload.url)}`
      );
      foundSource = true;
      continue;
    }

    if (/^tags\s*:/i.test(line)) {
      foundTags = true;

      result.push(
        tags.length
          ? "tags:"
          : "tags: []"
      );

      for (const tag of tags) {
        result.push(
          `  - ${yamlString(tag)}`
        );
      }

      while (
        index + 1 < yaml.length &&
        /^\s*-\s+/.test(yaml[index + 1])
      ) {
        index += 1;
      }

      continue;
    }

    result.push(line);
  }

  if (!foundSource) {
    result.push(
      `source: ${yamlString(payload.url)}`
    );
  }

  if (!foundTags) {
    result.push(
      tags.length
        ? "tags:"
        : "tags: []"
    );

    for (const tag of tags) {
      result.push(
        `  - ${yamlString(tag)}`
      );
    }
  }

  const frontmatter =
    `---${result.join("\n")}\n---`;

  return (
    frontmatter +
    source.slice(end + 4)
  );
}

function yamlString(value) {
  return JSON.stringify(String(value || ""));
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 140);
}

function setStatus(message, kind = "") {
  els.status.textContent = message || "";
  els.status.className = `status ${kind}`.trim();
}

/* UX PASS 1 - V0.5.0 */

function getUxContentModeInputs() {
  const fromState =
    els?.contentModeInputs
      ? [...els.contentModeInputs]
      : [];

  const candidates =
    fromState.length
      ? fromState
      : [
          ...document.querySelectorAll(
            'input[type="radio"]'
          )
        ];

  return candidates.filter((input) => {
    const value =
      String(input.value || "")
        .toLowerCase();

    const label =
      getUxInputLabel(input)
        .toLowerCase();

    return (
      value === "article" ||
      value === "selection" ||
      value.includes("selected") ||
      value.includes("text") ||
      label.includes("article") ||
      label.includes("selected text") ||
      label.includes("select from page")
    );
  });
}

function getUxInputLabel(input) {
  const wrappingLabel =
    input.closest("label");

  if (wrappingLabel) {
    return wrappingLabel.textContent || "";
  }

  if (input.id) {
    const label =
      document.querySelector(
        `label[for="${CSS.escape(input.id)}"]`
      );

    if (label) {
      return label.textContent || "";
    }
  }

  return "";
}

function getUxModeKind(input) {
  if (!input) {
    return "";
  }

  const value =
    String(input.value || "")
      .toLowerCase();

  const label =
    getUxInputLabel(input)
      .toLowerCase();

  if (
    value === "article" ||
    label.includes("article")
  ) {
    return "article";
  }

  if (
    value === "selection" ||
    label.includes("select from page") ||
    label.includes("pick area") ||
    label.trim() === "area"
  ) {
    return "area";
  }

  if (
    value.includes("selected") ||
    value.includes("text") ||
    label.includes("selected text")
  ) {
    return "text";
  }

  return "";
}

function getUxCurrentModeKind() {
  const inputs =
    getUxContentModeInputs();

  const checked =
    inputs.find(
      (input) => input.checked
    );

  return getUxModeKind(checked);
}

function hideUxLegacyModeOption(input) {
  input.classList.add(
    "clipper-ux-native-mode-input"
  );

  const label =
    input.closest("label") ||
    (
      input.id
        ? document.querySelector(
            `label[for="${CSS.escape(input.id)}"]`
          )
        : null
    );

  if (label) {
    label.classList.add(
      "clipper-ux-native-mode-option"
    );
  }
}

function hideUxLegacyAreaButton() {
  const buttons =
    [...document.querySelectorAll("button")];

  for (const button of buttons) {
    const text =
      String(
        button.textContent || ""
      )
        .trim()
        .toLowerCase();

    if (
      text === "pick area on page" ||
      text === "select from page"
    ) {
      button.classList.add(
        "clipper-ux-legacy-area-button"
      );
    }
  }
}

function ensureUxModeSegmented() {
  let segmented =
    document.getElementById(
      "clipperUxModeSegmented"
    );

  if (segmented) {
    return segmented;
  }

  const inputs =
    getUxContentModeInputs();

  if (!inputs.length) {
    return null;
  }

  const uniqueKinds = new Set();

  segmented =
    document.createElement("div");

  segmented.id =
    "clipperUxModeSegmented";

  segmented.className =
    "clipper-ux-mode-segmented";

  segmented.setAttribute(
    "role",
    "group"
  );

  segmented.setAttribute(
    "aria-label",
    "Clip mode"
  );

  let firstNativeNode = null;

  for (const input of inputs) {
    const kind =
      getUxModeKind(input);

    if (
      !kind ||
      uniqueKinds.has(kind)
    ) {
      continue;
    }

    uniqueKinds.add(kind);

    hideUxLegacyModeOption(input);

    const button =
      document.createElement("button");

    button.type = "button";
    button.className =
      "clipper-ux-mode-button";

    button.dataset.modeKind =
      kind;

    button.dataset.modeValue =
      input.value;

    button.textContent =
      kind === "article"
        ? "Article"
        : kind === "text"
          ? "Text"
          : "Area";

    button.addEventListener(
      "click",
      async () => {
        if (state?.saving) {
          return;
        }

        input.checked = true;

        input.dispatchEvent(
          new Event(
            "change",
            {
              bubbles: true
            }
          )
        );

        refreshUxPass1();

        if (kind === "area") {
          button.disabled = true;

          try {
            await startAreaSelection();
          } finally {
            button.disabled = false;
          }
        }
      }
    );

    segmented.appendChild(
      button
    );

    if (!firstNativeNode) {
      firstNativeNode =
        input.closest("label") ||
        input;
    }
  }

  if (
    !segmented.children.length ||
    !firstNativeNode?.parentNode
  ) {
    return null;
  }

  firstNativeNode.parentNode.insertBefore(
    segmented,
    firstNativeNode
  );

  return segmented;
}

function refreshUxModeButtons() {
  const segmented =
    ensureUxModeSegmented();

  if (!segmented) {
    return;
  }

  const inputs =
    getUxContentModeInputs();

  const hasSelectedText =
    Boolean(
      String(
        state?.capture?.selection || ""
      ).trim()
    );

  for (
    const button of
      segmented.querySelectorAll(
        ".clipper-ux-mode-button"
      )
  ) {
    const value =
      button.dataset.modeValue;

    const kind =
      button.dataset.modeKind;

    const input =
      inputs.find(
        (candidate) =>
          String(candidate.value) ===
          String(value)
      );

    const active =
      Boolean(input?.checked);

    button.classList.toggle(
      "active",
      active
    );

    button.setAttribute(
      "aria-pressed",
      active ? "true" : "false"
    );

    if (kind === "text") {
      button.hidden =
        !hasSelectedText;
    }
  }
}

function updateUxSaveButtonLabel() {
  if (
    !els?.saveButton ||
    state?.saving
  ) {
    return;
  }

  const kind =
    getUxCurrentModeKind();

  let label = "Save";

  if (kind === "article") {
    label = "Save article";
  } else if (kind === "text") {
    label = "Save selected text";
  } else if (kind === "area") {
    label = "Save area";
  }

  els.saveButton.textContent =
    label;

  els.saveButton.title =
    "Save - ⌘ Enter";
}

function refreshUxMainSaveVisibility() {
  if (!els?.saveButton) {
    return;
  }

  const kind =
    getUxCurrentModeKind();

  els.saveButton.classList.toggle(
    "clipper-ux-area-main-save-hidden",
    kind === "area"
  );
}

function refreshUxPass1() {
  ensureUxModeSegmented();
  hideUxLegacyAreaButton();
  refreshUxModeButtons();
  refreshUxMainSaveVisibility();
  updateUxSaveButtonLabel();
}

async function handleUxAreaShortcut() {
  const inputs =
    getUxContentModeInputs();

  const areaInput =
    inputs.find(
      (input) =>
        getUxModeKind(input) ===
        "area"
    );

  if (!areaInput) {
    return;
  }

  areaInput.checked = true;

  areaInput.dispatchEvent(
    new Event(
      "change",
      {
        bubbles: true
      }
    )
  );

  refreshUxPass1();

  await startAreaSelection();
}

function installUxPass1() {
  refreshUxPass1();

  /*
   * Page capture is asynchronous. Refresh a few
   * times so Selected Text appears as soon as the
   * capture discovers an existing selection.
   */
  for (
    const delay of
      [50, 150, 300, 600, 1000, 1800]
  ) {
    setTimeout(
      refreshUxPass1,
      delay
    );
  }

  document.addEventListener(
    "change",
    (event) => {
      if (
        event.target instanceof
          HTMLInputElement &&
        getUxContentModeInputs()
          .includes(event.target)
      ) {
        queueMicrotask(
          refreshUxPass1
        );
      }
    }
  );

  document.addEventListener(
    "click",
    (event) => {
      const destination =
        event.target.closest?.(
          "[data-destination]"
        );

      if (destination) {
        queueMicrotask(
          refreshUxPass1
        );
      }
    }
  );

  document.addEventListener(
    "keydown",
    async (event) => {
      if (
        event.isComposing
      ) {
        return;
      }

      const saveShortcut =
        event.key === "Enter" &&
        (event.metaKey ||
          event.ctrlKey);

      if (saveShortcut) {
        event.preventDefault();

        if (
          getUxCurrentModeKind() ===
          "area"
        ) {
          await handleUxAreaShortcut();
        } else {
          await save();
        }

        return;
      }

      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !state?.saving
      ) {
        window.close();
      }
    }
  );

  // No MutationObserver here.
  // refreshUxPass1() changes class/hidden attributes itself,
  // so observing those attributes can create a refresh loop.
}

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    installUxPass1,
    {
      once: true
    }
  );
} else {
  installUxPass1();
}
