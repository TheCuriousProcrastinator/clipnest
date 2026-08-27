const state = {
  capture: null,
  destination: "notion",
  saving: false
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

let notionPresetChooserEl =
  null;

let notionConnectionGateEl =
  null;

let notionConnectionVerified =
  false;

let notionClipHeaderEl =
  null;

let notionClipRangeNodes =
  [];

let notionPresetFieldRoot =
  null;

let notionOpenPresetId =
  "";

let notionPresetChooserRenderToken =
  0;

let notionDynamicFieldsHost =
  null;

let notionTitleFieldNode =
  null;

let notionTagsFieldNode =
  null;

let notionTitleFieldPlaceholder =
  null;

let notionTagsFieldPlaceholder =
  null;

let notionDynamicFieldValues =
  {};

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
  els.obsidianOpenAfterSave =
    document.getElementById(
      "obsidianOpenAfterSave"
    );
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

  setupNotionPresetNavigation();

  els.settingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  els.saveButton.addEventListener("click", save);
  els.selectAreaButton.addEventListener("click", startAreaSelection);
  els.contentModeInputs.forEach((input) =>
    input.addEventListener("change", updateContentModeUI)
  );
  els.destinationButtons.forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          void choosePopupDestination(
            button.dataset.destination
          );
        }
      );
    }
  );

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

  els.obsidianOpenAfterSave
    ?.addEventListener(
      "change",
      () => {
        void saveObsidianOpenAfterSave();
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
    "obsidianDefaultTemplatePath",
    "obsidianSubfolder",
    "obsidianOpenAfterSave",
    NOTION_PRESET_BUILDER_STATE_KEY,
    LAST_POPUP_DESTINATION_KEY
  ]);

  const savedNotionBuilderState =
    settings[
      NOTION_PRESET_BUILDER_STATE_KEY
    ] ||
    null;

  notionPresetBuilderResumePending =
    Boolean(
      savedNotionBuilderState
    );

  const rememberedDestination =
    settings[
      LAST_POPUP_DESTINATION_KEY
    ] ===
      "notion"
      ? "notion"
      : settings[
          LAST_POPUP_DESTINATION_KEY
        ] ===
          "obsidian"
        ? "obsidian"
        : "";

  const initialDestination =
    savedNotionBuilderState
      ? "notion"
      : rememberedDestination ||
        (
          settings.defaultDestination ===
            "notion"
            ? "notion"
            : "obsidian"
        );

  els.tagsInput.value =
    "";

  if (els.obsidianOpenAfterSave) {
    els.obsidianOpenAfterSave.checked =
      settings.obsidianOpenAfterSave ===
      true;
  }

  setDestination(
    initialDestination
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

  if (
    state.destination ===
      "notion"
  ) {
    const restored =
      await restoreNotionPresetBuilderState();

    notionPresetBuilderResumePending =
      false;

    if (!restored) {
      await showNotionPresetChooser();
    }
  } else {
    notionPresetBuilderResumePending =
      false;
  }

  // Templates may appear a moment later without
  // preventing the user from using the clipper.
  void loadObsidianTemplates(
    defaultTemplatePath
  );
}

function findCommonAncestor(
  first,
  second
) {
  let current =
    first;

  while (current) {
    if (
      current.contains(
        second
      )
    ) {
      return current;
    }

    current =
      current.parentElement;
  }

  return null;
}

function directChildUnder(
  ancestor,
  element
) {
  let current =
    element;

  while (
    current &&
    current.parentElement !==
      ancestor
  ) {
    current =
      current.parentElement;
  }

  return current;
}

function collectNotionClipRangeNodes() {
  const start =
    els.notionPresetField;

  const end =
    els.saveButton;

  if (
    !start ||
    !end
  ) {
    return [];
  }

  const ancestor =
    findCommonAncestor(
      start,
      end
    );

  if (!ancestor) {
    return [];
  }

  const startRoot =
    directChildUnder(
      ancestor,
      start
    );

  const endRoot =
    directChildUnder(
      ancestor,
      end
    );

  if (
    !startRoot ||
    !endRoot
  ) {
    return [];
  }

  const children =
    [...ancestor.children];

  const startIndex =
    children.indexOf(
      startRoot
    );

  const endIndex =
    children.indexOf(
      endRoot
    );

  if (
    startIndex < 0 ||
    endIndex < 0 ||
    endIndex < startIndex
  ) {
    return [];
  }

  notionPresetFieldRoot =
    startRoot;

  return children.slice(
    startIndex,
    endIndex + 1
  );
}

function setNotionClipRangeHidden(
  hidden
) {
  notionClipRangeNodes.forEach(
    (element) => {
      element.classList.toggle(
        "notion-navigation-hidden",
        hidden
      );
    }
  );
}

function hideNotionNavigationViews() {
  document.body.classList.remove(
    "notion-preset-open"
  );

  notionConnectionGateEl?.classList.add(
    "hidden"
  );

  notionPresetChooserEl?.classList.add(
    "hidden"
  );

  notionClipHeaderEl?.classList.add(
    "hidden"
  );

  document
    .getElementById(
      "notionDestinationPicker"
    )
    ?.classList.add(
      "hidden"
    );

  document
    .getElementById(
      "notionPresetConfigScreen"
    )
    ?.classList.add(
      "hidden"
    );
}

async function openNotionPresetEditor(
  mode,
  presetId = ""
) {
  const normalizedMode =
    mode ===
      "new"
      ? "new"
      : "edit";

  await chrome.storage.local.set({
    clipnestNotionOptionsIntent: {
      mode:
        normalizedMode,

      presetId:
        String(
          presetId ||
          ""
        ).trim(),

      createdAt:
        Date.now()
    }
  });

  await chrome.runtime
    .openOptionsPage();
}

function createNotionConnectionGate() {
  const section =
    document.createElement(
      "section"
    );

  section.id =
    "notionConnectionGate";

  section.className =
    "notion-connection-gate hidden";

  section.innerHTML = `
    <div class="notion-connection-icon">N</div>

    <h2 id="notionConnectionGateTitle">
      Connect Notion
    </h2>

    <p id="notionConnectionGateMessage">
      ClipNest uses the Notion account already signed in to this browser.
    </p>

    <div class="notion-connection-actions">
      <button
        id="notionConnectButton"
        class="notion-connection-primary"
        type="button"
      >
        Connect Notion
      </button>

      <button
        id="notionRetryButton"
        class="notion-connection-primary hidden"
        type="button"
      >
        Try again
      </button>

      <button
        id="notionOpenButton"
        class="notion-connection-secondary hidden"
        type="button"
      >
        Open Notion
      </button>
    </div>

    <div
      id="notionConnectionGateNote"
      class="notion-connection-note"
    >
      No API key or integration required.
    </div>

    <div
      id="notionConnectionGateDetail"
      class="notion-connection-detail hidden"
    ></div>
  `;

  section
    .querySelector(
      "#notionConnectButton"
    )
    ?.addEventListener(
      "click",
      () => {
        void connectNotionFromPopup();
      }
    );

  section
    .querySelector(
      "#notionRetryButton"
    )
    ?.addEventListener(
      "click",
      () => {
        void retryNotionConnectionFromPopup();
      }
    );

  section
    .querySelector(
      "#notionOpenButton"
    )
    ?.addEventListener(
      "click",
      () => {
        void chrome.tabs.create({
          url:
            "https://www.notion.so/"
        });
      }
    );

  return section;
}

function showNotionConnectionGate(
  mode,
  detail = ""
) {
  if (!notionConnectionGateEl) {
    return;
  }

  hideNotionNavigationViews();

  setNotionClipRangeHidden(
    true
  );

  notionConnectionGateEl
    .classList.remove(
      "hidden"
    );

  const title =
    notionConnectionGateEl
      .querySelector(
        "#notionConnectionGateTitle"
      );

  const message =
    notionConnectionGateEl
      .querySelector(
        "#notionConnectionGateMessage"
      );

  const note =
    notionConnectionGateEl
      .querySelector(
        "#notionConnectionGateNote"
      );

  const detailEl =
    notionConnectionGateEl
      .querySelector(
        "#notionConnectionGateDetail"
      );

  const connect =
    notionConnectionGateEl
      .querySelector(
        "#notionConnectButton"
      );

  const retry =
    notionConnectionGateEl
      .querySelector(
        "#notionRetryButton"
      );

  const open =
    notionConnectionGateEl
      .querySelector(
        "#notionOpenButton"
      );

  connect?.classList.add(
    "hidden"
  );

  retry?.classList.add(
    "hidden"
  );

  open?.classList.add(
    "hidden"
  );

  if (mode === "permission") {
    title.textContent =
      "Connect Notion";

    message.textContent =
      "ClipNest uses the Notion account already signed in to this browser.";

    note.textContent =
      "No API key or integration required.";

    connect?.classList.remove(
      "hidden"
    );
  } else if (
    mode === "checking"
  ) {
    title.textContent =
      "Checking Notion";

    message.textContent =
      "Looking for the Notion account signed in to this browser.";

    note.textContent =
      "This should only take a moment.";
  } else {
    title.textContent =
      "Sign in to Notion";

    message.textContent =
      "Open Notion in this browser, sign in, then try again.";

    note.textContent =
      "";

    retry?.classList.remove(
      "hidden"
    );

    open?.classList.remove(
      "hidden"
    );
  }

  const normalizedDetail =
    String(
      detail || ""
    ).trim();

  detailEl.textContent =
    normalizedDetail;

  detailEl.classList.toggle(
    "hidden",
    !normalizedDetail
  );
}

async function withNotionConnectionTimeout(
  promise,
  timeoutMs = 8000
) {
  let timer =
    null;

  try {
    return await Promise.race([
      promise,

      new Promise(
        (
          resolve,
          reject
        ) => {
          timer =
            setTimeout(
              () => {
                reject(
                  new Error(
                    "Notion did not respond in time."
                  )
                );
              },
              timeoutMs
            );
        }
      )
    ]);
  } finally {
    if (timer) {
      clearTimeout(
        timer
      );
    }
  }
}

async function ensureNotionConnectionForPopup() {
  if (
    state.destination !==
      "notion"
  ) {
    return false;
  }

  if (notionConnectionVerified) {
    return true;
  }

  if (
    !globalThis
      .ClipNestNotionSession
  ) {
    showNotionConnectionGate(
      "unavailable",
      "Notion session module did not load."
    );

    return false;
  }

  try {
    const hasPermission =
      await ClipNestNotionSession
        .hasPermission();

    if (!hasPermission) {
      showNotionConnectionGate(
        "permission"
      );

      return false;
    }

    showNotionConnectionGate(
      "checking"
    );

    const result =
      await withNotionConnectionTimeout(
        ClipNestNotionSession
          .getWorkspaces({
            requestPermission:
              false
          })
      );

    const workspaces =
      Array.isArray(
        result?.workspaces
      )
        ? result.workspaces
        : [];

    if (!workspaces.length) {
      showNotionConnectionGate(
        "unavailable",
        "No Notion workspaces were found."
      );

      return false;
    }

    notionConnectionVerified =
      true;

    notionConnectionGateEl
      ?.classList.add(
        "hidden"
      );

    return true;
  } catch (error) {
    showNotionConnectionGate(
      "unavailable",
      error?.message ||
        String(error)
    );

    return false;
  }
}

async function connectNotionFromPopup() {
  showNotionConnectionGate(
    "checking"
  );

  try {
    const granted =
      await ClipNestNotionSession
        .requestPermission();

    if (!granted) {
      showNotionConnectionGate(
        "permission",
        "Notion access was not granted."
      );

      return;
    }

    notionConnectionVerified =
      false;

    if (
      await ensureNotionConnectionForPopup()
    ) {
      await showNotionPresetChooser();
    }
  } catch (error) {
    showNotionConnectionGate(
      "unavailable",
      error?.message ||
        String(error)
    );
  }
}

async function retryNotionConnectionFromPopup() {
  notionConnectionVerified =
    false;

  if (
    await ensureNotionConnectionForPopup()
  ) {
    await showNotionPresetChooser();
  }
}

function createNotionPresetChooser() {
  const section =
    document.createElement(
      "section"
    );

  section.id =
    "notionPresetChooser";

  section.className =
    "notion-preset-chooser hidden";

  const heading =
    document.createElement(
      "div"
    );

  heading.className =
    "notion-preset-chooser-heading";

  const title =
    document.createElement(
      "h2"
    );

  title.textContent =
    "Choose preset";

  heading.append(
    title
  );

  const list =
    document.createElement(
      "div"
    );

  list.id =
    "notionPresetChooserList";

  list.className =
    "notion-preset-chooser-list";

  const newPreset =
    document.createElement(
      "button"
    );

  newPreset.type =
    "button";

  newPreset.className =
    "notion-new-preset-button";

  newPreset.innerHTML =
    '<span class="notion-new-preset-plus">+</span><span>New preset</span>';

  newPreset.addEventListener(
    "click",
    () => {
      void startNotionPresetBuilder();
    }
  );

  section.append(
    heading,
    list,
    newPreset
  );

  return section;
}

function createNotionClipHeader() {
  const header =
    document.createElement(
      "div"
    );

  header.id =
    "notionClipHeader";

  header.className =
    "notion-clip-header hidden";

  const back =
    document.createElement(
      "button"
    );

  back.type =
    "button";

  back.className =
    "notion-clip-back";

  back.setAttribute(
    "aria-label",
    "Back to presets"
  );

  back.title =
    "Back to presets";

  back.textContent =
    "‹";

  const title =
    document.createElement(
      "div"
    );

  title.id =
    "notionClipPresetName";

  title.className =
    "notion-clip-preset-name";

  const edit =
    document.createElement(
      "button"
    );

  edit.type =
    "button";

  edit.className =
    "notion-clip-edit";

  edit.setAttribute(
    "aria-label",
    "Edit preset"
  );

  edit.title =
    "Edit preset";

  edit.textContent =
    "⚙";

  back.addEventListener(
    "click",
    () => {
      void showNotionPresetChooser();
    }
  );

  edit.addEventListener(
    "click",
    () => {
      void openNotionPresetInBuilder(
        notionOpenPresetId
      );
    }
  );

  header.append(
    back,
    title,
    edit
  );

  return header;
}

function setupNotionPresetNavigation() {
  notionClipRangeNodes =
    collectNotionClipRangeNodes();

  if (
    !notionClipRangeNodes.length
  ) {
    console.warn(
      "ClipNest could not determine the Notion clip UI range."
    );

    return;
  }

  const first =
    notionClipRangeNodes[0];

  const parent =
    first.parentElement;

  if (!parent) {
    return;
  }

  notionConnectionGateEl =
    createNotionConnectionGate();

  notionPresetChooserEl =
    createNotionPresetChooser();

  notionClipHeaderEl =
    createNotionClipHeader();

  parent.insertBefore(
    notionConnectionGateEl,
    first
  );

  parent.insertBefore(
    notionPresetChooserEl,
    first
  );

  parent.insertBefore(
    notionClipHeaderEl,
    first
  );
}

const CLIPNEST_PRESET_ICON_PREFIX =
  "clipnest:";

const NOTION_PRESET_ICON_CHOICES = [
  {
    id: "inbox",
    label: "Inbox",
    legacy: "📥",
    primary: [
      "M4 13v6h16v-6",
      "M7 13l2 3h6l2-3"
    ],
    accent: [
      "M12 3v9",
      "M9 9l3 3 3-3"
    ]
  },
  {
    id: "reading",
    label: "Reading",
    legacy: "📚",
    primary: [
      "M4 5c3-1 5-.5 8 2v12c-3-2.5-5-2.5-8-2V5",
      "M20 5c-3-1-5-.5-8 2v12c3-2.5 5-2.5 8-2V5"
    ],
    accent: [
      "M12 7v12"
    ]
  },
  {
    id: "article",
    label: "Article",
    legacy: "📰",
    primary: [
      "M6 3h9l3 3v15H6z",
      "M15 3v4h4",
      "M9 11h6",
      "M9 15h6"
    ],
    accent: [
      "M9 7h3"
    ]
  },
  {
    id: "notes",
    label: "Notes",
    legacy: "✍️",
    primary: [
      "M5 19l1-4L16 5l3 3L9 18l-4 1z"
    ],
    accent: [
      "M14.5 6.5l3 3",
      "M5 19l4-1"
    ]
  },
  {
    id: "idea",
    label: "Ideas",
    legacy: "💡",
    primary: [
      "M12 3a6 6 0 0 0-3.5 10.9L10 16h4l1.5-2.1A6 6 0 0 0 12 3z",
      "M10 19h4",
      "M11 22h2"
    ],
    accent: [
      "M12 1v1",
      "M4.5 4.5l1.2 1.2",
      "M18.3 5.7l1.2-1.2"
    ]
  },
  {
    id: "tasks",
    label: "Tasks",
    legacy: "✅",
    primary: [
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"
    ],
    accent: [
      "M8 12l2.5 2.5L16.5 8.5"
    ]
  },
  {
    id: "pin",
    label: "Pin",
    legacy: "📌",
    primary: [
      "M9 3h6l-1 5 3 3v2H7v-2l3-3z"
    ],
    accent: [
      "M12 13v8"
    ]
  },
  {
    id: "projects",
    label: "Projects",
    legacy: "🗂️",
    primary: [
      "M3 7h7l2 2h9v10H3z"
    ],
    accent: [
      "M3 7V5h6l2 2"
    ]
  },
  {
    id: "knowledge",
    label: "Knowledge",
    legacy: "🧠",
    primary: [
      "M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5 3 3 0 0 0 3 4h1",
      "M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 1 5 3 3 0 0 1-3 4h-1",
      "M9 4v16",
      "M15 4v16"
    ],
    accent: [
      "M9 9h2",
      "M13 14h2"
    ]
  },
  {
    id: "bookmark",
    label: "Bookmark",
    legacy: "🔖",
    primary: [
      "M7 3h10v18l-5-3-5 3z"
    ],
    accent: [
      "M12 3v15"
    ]
  },
  {
    id: "favorites",
    label: "Favorites",
    legacy: "⭐",
    primary: [
      "M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"
    ],
    accent: [
      "M12 6v8"
    ]
  },
  {
    id: "launch",
    label: "Launch",
    legacy: "🚀",
    primary: [
      "M14 4c3-1 5-1 6-1 0 1 0 3-1 6l-7 7-4-4z",
      "M10 10l-4 1-3 3 6 1",
      "M14 14l-1 6-3 1-1-6"
    ],
    accent: [
      "M7 17l-3 3",
      "M10 18l-2 3"
    ]
  },
  {
    id: "goals",
    label: "Goals",
    legacy: "🎯",
    primary: [
      "M12 3a9 9 0 1 0 9 9",
      "M12 7a5 5 0 1 0 5 5",
      "M12 11a1 1 0 1 0 1 1"
    ],
    accent: [
      "M13 11l7-7",
      "M17 4h3v3"
    ]
  },
  {
    id: "calendar",
    label: "Calendar",
    legacy: "📅",
    primary: [
      "M4 6h16v14H4z",
      "M4 10h16"
    ],
    accent: [
      "M8 3v5",
      "M16 3v5",
      "M8 14h2",
      "M14 14h2"
    ]
  },
  {
    id: "people",
    label: "People",
    legacy: "👥",
    primary: [
      "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
      "M3 21v-2a6 6 0 0 1 12 0v2"
    ],
    accent: [
      "M17 11a3 3 0 1 0 0-6",
      "M17 15a5 5 0 0 1 4 5"
    ]
  },
  {
    id: "discussions",
    label: "Discussions",
    legacy: "💬",
    primary: [
      "M4 5h13v10H9l-5 4z"
    ],
    accent: [
      "M8 9h5",
      "M8 12h3",
      "M18 8h2v8l-3-2"
    ]
  },
  {
    id: "code",
    label: "Code",
    legacy: "🔧",
    primary: [
      "M8 7l-5 5 5 5",
      "M16 7l5 5-5 5"
    ],
    accent: [
      "M14 4l-4 16"
    ]
  },
  {
    id: "research",
    label: "Research",
    legacy: "🧪",
    primary: [
      "M9 3h6",
      "M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"
    ],
    accent: [
      "M7.5 16h9",
      "M9 13h6"
    ]
  },
  {
    id: "links",
    label: "Links",
    legacy: "🌐",
    primary: [
      "M9 15l-2 2a4 4 0 1 1-6-6l3-3a4 4 0 0 1 6 0",
      "M15 9l2-2a4 4 0 1 1 6 6l-3 3a4 4 0 0 1-6 0"
    ],
    accent: [
      "M8 12h8"
    ]
  },
  {
    id: "work",
    label: "Work",
    legacy: "💼",
    primary: [
      "M3 8h18v11H3z",
      "M8 8V5h8v3"
    ],
    accent: [
      "M3 12h18",
      "M10 12v2h4v-2"
    ]
  },
  {
    id: "finance",
    label: "Finance",
    legacy: "💰",
    primary: [
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"
    ],
    accent: [
      "M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9",
      "M12 6v12"
    ]
  },
  {
    id: "shopping",
    label: "Shopping",
    legacy: "🛒",
    primary: [
      "M3 4h2l2 11h10l3-7H7",
      "M9 20a1 1 0 1 0 0-2",
      "M17 20a1 1 0 1 0 0-2"
    ],
    accent: [
      "M9 11h8"
    ]
  },
  {
    id: "personal",
    label: "Personal",
    legacy: "❤️",
    primary: [
      "M12 20S4 15 4 9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 6-6 11-6 11z"
    ],
    accent: [
      "M8 9c0-1 1-2 2-2"
    ]
  },
  {
    id: "media",
    label: "Media",
    legacy: "🎬",
    primary: [
      "M4 7h16v12H4z",
      "M4 7l2-4h4l-2 4",
      "M12 7l2-4h4l-2 4"
    ],
    accent: [
      "M10 11l5 3-5 3z"
    ]
  },
  {
    id: "learning",
    label: "Learning",
    legacy: "🎓",
    primary: [
      "M3 9l9-5 9 5-9 5z",
      "M7 12v5c3 2 7 2 10 0v-5"
    ],
    accent: [
      "M21 9v6"
    ]
  },
  {
    id: "web",
    label: "Web",
    legacy: "🌍",
    primary: [
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
      "M3 12h18",
      "M12 3c3 3 4 6 4 9s-1 6-4 9",
      "M12 3c-3 3-4 6-4 9s1 6 4 9"
    ],
    accent: [
      "M5 7h14"
    ]
  },
  {
    id: "explore",
    label: "Explore",
    legacy: "🧭",
    primary: [
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
      "M15.5 8.5l-2 5-5 2 2-5z"
    ],
    accent: [
      "M12 6v1",
      "M12 17v1"
    ]
  },
  {
    id: "trending",
    label: "Trending",
    legacy: "🔥",
    primary: [
      "M12 21c-4 0-7-3-7-7 0-3 2-5 4-7 0 3 2 4 3 5 1-3 1-5 0-7 4 2 7 6 7 10 0 4-3 7-7 7z"
    ],
    accent: [
      "M12 17c-2 0-3-1-3-3 0-1 1-3 3-4 0 2 2 2 2 4 1-2 2-3 1-5 2 2 3 4 3 5 0 2-1 3-3 3z"
    ]
  }
];

const NOTION_PRESET_ICON_BY_ID =
  new Map(
    NOTION_PRESET_ICON_CHOICES.map(
      (icon) => [
        icon.id,
        icon
      ]
    )
  );

const NOTION_PRESET_ICON_LEGACY =
  new Map(
    NOTION_PRESET_ICON_CHOICES.map(
      (icon) => [
        icon.legacy,
        icon.id
      ]
    )
  );

function clipNestPresetIconValue(
  id
) {
  return (
    CLIPNEST_PRESET_ICON_PREFIX +
    id
  );
}

function resolveClipNestPresetIcon(
  value
) {
  const raw =
    String(
      value ||
      ""
    ).trim();

  if (!raw) {
    return null;
  }

  let id =
    "";

  if (
    raw.startsWith(
      CLIPNEST_PRESET_ICON_PREFIX
    )
  ) {
    id =
      raw.slice(
        CLIPNEST_PRESET_ICON_PREFIX
          .length
      );
  } else {
    id =
      NOTION_PRESET_ICON_LEGACY
        .get(raw) ||
      "";
  }

  return (
    NOTION_PRESET_ICON_BY_ID
      .get(id) ||
    null
  );
}

function normalizedClipNestPresetIconValue(
  value
) {
  const icon =
    resolveClipNestPresetIcon(
      value
    );

  if (icon) {
    return clipNestPresetIconValue(
      icon.id
    );
  }

  return String(
    value ||
    ""
  ).trim();
}

function appendClipNestPresetSvg(
  target,
  icon
) {
  const NS =
    "http://www.w3.org/2000/svg";

  const svg =
    document.createElementNS(
      NS,
      "svg"
    );

  svg.classList.add(
    "clipnest-preset-svg"
  );

  svg.setAttribute(
    "viewBox",
    "0 0 24 24"
  );

  svg.setAttribute(
    "fill",
    "none"
  );

  svg.setAttribute(
    "aria-hidden",
    "true"
  );

  const appendPaths = (
    paths,
    stroke
  ) => {
    for (
      const d of paths
    ) {
      const path =
        document.createElementNS(
          NS,
          "path"
        );

      path.setAttribute(
        "d",
        d
      );

      path.setAttribute(
        "stroke",
        stroke
      );

      path.setAttribute(
        "stroke-width",
        "1.9"
      );

      path.setAttribute(
        "stroke-linecap",
        "round"
      );

      path.setAttribute(
        "stroke-linejoin",
        "round"
      );

      svg.append(
        path
      );
    }
  };

  appendPaths(
    icon.primary,
    "#9027db"
  );

  appendPaths(
    icon.accent,
    "#db5b27"
  );

  target.append(
    svg
  );
}

function renderClipNestPresetIcon(
  target,
  value
) {
  const icon =
    resolveClipNestPresetIcon(
      value
    );

  if (!icon) {
    return false;
  }

  appendClipNestPresetSvg(
    target,
    icon
  );

  return true;
}


function renderNotionPresetDisplayIcon(
  target,
  preset
) {
  if (!target) {
    return;
  }

  target.replaceChildren();

  const custom =
    String(
      preset?.presetIcon ||
      ""
    ).trim();

  if (custom) {
    if (
      renderClipNestPresetIcon(
        target,
        custom
      )
    ) {
      return;
    }

    target.textContent =
      custom;

    return;
  }

  const rawIcon =
    preset?.destinationIcon ??
    preset?.destination?.icon ??
    "";

  let text =
    "";

  let url =
    "";

  if (
    typeof rawIcon ===
      "string"
  ) {
    const value =
      rawIcon.trim();

    if (
      value.startsWith(
        "/"
      )
    ) {
      url =
        "https://www.notion.so" +
        value;
    } else if (
      /^https?:\/\//i.test(
        value
      )
    ) {
      url =
        value;
    } else {
      text =
        value;
    }
  } else if (
    rawIcon &&
    typeof rawIcon ===
      "object"
  ) {
    text =
      String(
        rawIcon.emoji ||
        rawIcon.value ||
        rawIcon.text ||
        ""
      ).trim();

    url =
      String(
        rawIcon.url ||
        rawIcon.src ||
        ""
      ).trim();
  }

  if (
    !text &&
    /^https?:\/\//i.test(
      url
    )
  ) {
    const image =
      document.createElement(
        "img"
      );

    image.src =
      url;

    image.alt =
      "";

    image.referrerPolicy =
      "no-referrer";

    target.append(
      image
    );

    return;
  }

  target.textContent =
    text ||
    (
      preset?.destinationType ===
        "page" ||
      preset?.destination?.type ===
        "page"
        ? "↗"
        : "▣"
    );
}

function updateNotionBuilderIconButton() {
  const button =
    document.getElementById(
      "notionBuilderPresetIcon"
    );

  if (
    !button ||
    !notionPresetBuilderDraft
  ) {
    return;
  }

  const custom =
    String(
      notionPresetBuilderDraft
        .presetIcon ||
      ""
    ).trim();

  renderNotionPresetDisplayIcon(
    button,
    {
      presetIcon:
        custom,

      destinationIcon:
        notionPresetBuilderDraft
          .destination
          ?.icon ||
        "",

      destinationType:
        notionPresetBuilderDraft
          .destination
          ?.type ||
        ""
    }
  );

  button.title =
    custom
      ? "Change preset icon"
      : "Using Notion icon";

  const picker =
    document.getElementById(
      "notionBuilderIconPicker"
    );

  picker
    ?.querySelectorAll(
      "[data-preset-icon]"
    )
    .forEach(
      (option) => {
        const selected =
          normalizedClipNestPresetIconValue(
            option.dataset
              .presetIcon ||
            ""
          ) ===
          normalizedClipNestPresetIconValue(
            custom
          );

        option.classList.toggle(
          "selected",
          selected
        );

        option.setAttribute(
          "aria-pressed",
          String(
            selected
          )
        );
      }
    );
}

function createNotionBuilderIconPicker() {
  const picker =
    document.createElement(
      "div"
    );

  picker.id =
    "notionBuilderIconPicker";

  picker.className =
    "notion-builder-icon-picker hidden";

  const useNotion =
    document.createElement(
      "button"
    );

  useNotion.type =
    "button";

  useNotion.className =
    "notion-builder-icon-default";

  useNotion.dataset.presetIcon =
    "";

  useNotion.textContent =
    "Use Notion icon";

  const grid =
    document.createElement(
      "div"
    );

  grid.className =
    "notion-builder-icon-grid";

  const selectIcon =
    async (
      icon
    ) => {
      if (
        !notionPresetBuilderDraft
      ) {
        return;
      }

      notionPresetBuilderDraft
        .presetIcon =
        String(
          icon ||
          ""
        );

      updateNotionBuilderIconButton();

      picker.classList.add(
        "hidden"
      );

      await persistNotionPresetBuilderState(
        "config"
      );
    };

  useNotion.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      void selectIcon(
        ""
      );
    }
  );

  for (
    const icon of
      NOTION_PRESET_ICON_CHOICES
  ) {
    const option =
      document.createElement(
        "button"
      );

    option.type =
      "button";

    option.className =
      "notion-builder-icon-option";

    option.dataset.presetIcon =
      clipNestPresetIconValue(
        icon.id
      );

    option.title =
      icon.label;

    option.setAttribute(
      "aria-label",
      `Use ${icon.label} as preset icon`
    );

    appendClipNestPresetSvg(
      option,
      icon
    );

    option.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        void selectIcon(
          clipNestPresetIconValue(
            icon.id
          )
        );
      }
    );

    grid.append(
      option
    );
  }

  picker.append(
    useNotion,
    grid
  );

  return picker;
}

async function renderNotionPresetChooser() {
  const list =
    document.getElementById(
      "notionPresetChooserList"
    );

  if (!list) {
    return;
  }

  const renderToken =
    ++notionPresetChooserRenderToken;

  const info =
    await ClipNestNotionStore
      .listPresets();

  if (
    renderToken !==
      notionPresetChooserRenderToken
  ) {
    return;
  }

  list.replaceChildren();

  if (!info.presets.length) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "notion-preset-empty";

    empty.textContent =
      "No Notion presets yet.";

    list.append(
      empty
    );

    return;
  }

  for (
    const preset of
      info.presets
  ) {
    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "notion-preset-card";

    const icon =
      document.createElement(
        "span"
      );

    icon.className =
      "notion-preset-card-icon";

    renderNotionPresetDisplayIcon(
      icon,
      preset
    );

    const copy =
      document.createElement(
        "span"
      );

    copy.className =
      "notion-preset-card-copy";

    const name =
      document.createElement(
        "strong"
      );

    name.textContent =
      preset.name ||
      "Untitled preset";

    const meta =
      document.createElement(
        "small"
      );

    const destination =
      preset.destinationName ||
      (
        preset.destinationType ===
          "page"
          ? "Notion page"
          : "Notion database"
      );

    const workspace =
      preset.workspaceName ||
      "Notion";

    meta.textContent =
      `${destination} · ${workspace}`;

    copy.append(
      name,
      meta
    );

    const arrow =
      document.createElement(
        "span"
      );

    arrow.className =
      "notion-preset-card-arrow";

    arrow.textContent =
      "›";

    button.append(
      icon,
      copy,
      arrow
    );

    button.addEventListener(
      "click",
      async () => {
        button.disabled =
          true;

        try {
          await ClipNestNotionStore
            .setActivePreset(
              preset.id
            );

          await loadNotionPresetPicker();

          notionSelectedTags =
            [];

          if (els.tagsInput) {
            els.tagsInput.value =
              "";
          }

          renderNotionSelectedTags();

          await loadNotionTagOptions();

          showNotionPresetClip(
            preset
          );
        } catch (error) {
          setStatus(
            error?.message ||
            String(error),
            "error"
          );

          button.disabled =
            false;
        }
      }
    );

    list.append(
      button
    );
  }
}

function createNotionDestinationPicker() {
  const section =
    document.createElement(
      "section"
    );

  section.id =
    "notionDestinationPicker";

  section.className =
    "notion-destination-picker hidden";

  const header =
    document.createElement(
      "div"
    );

  header.className =
    "notion-builder-header";

  const back =
    document.createElement(
      "button"
    );

  back.type =
    "button";

  back.className =
    "notion-builder-back";

  back.textContent =
    "‹";

  back.setAttribute(
    "aria-label",
    "Back to presets"
  );

  const title =
    document.createElement(
      "strong"
    );

  title.textContent =
    "New preset";

  const spacer =
    document.createElement(
      "span"
    );

  spacer.className =
    "notion-builder-header-spacer";

  back.addEventListener(
    "click",
    () => {
      void cancelNotionPresetBuilder();
    }
  );

  header.append(
    back,
    title,
    spacer
  );

  const heading =
    document.createElement(
      "h2"
    );

  heading.textContent =
    "Choose destination";

  const body =
    document.createElement(
      "div"
    );

  body.id =
    "notionDestinationPickerBody";

  body.className =
    "notion-destination-picker-body";

  const workspaceField =
    document.createElement(
      "div"
    );

  workspaceField.className =
    "notion-builder-field";

  const workspaceText =
    document.createElement(
      "span"
    );

  workspaceText.textContent =
    "Workspace";

  const workspacePicker =
    document.createElement(
      "div"
    );

  workspacePicker.className =
    "notion-builder-workspace-picker";

  const workspaceButton =
    document.createElement(
      "button"
    );

  workspaceButton.id =
    "notionBuilderWorkspaceButton";

  workspaceButton.type =
    "button";

  workspaceButton.className =
    "notion-builder-workspace-button";

  workspaceButton.setAttribute(
    "aria-haspopup",
    "listbox"
  );

  workspaceButton.setAttribute(
    "aria-expanded",
    "false"
  );

  const workspaceAvatar =
    document.createElement(
      "span"
    );

  workspaceAvatar.id =
    "notionBuilderWorkspaceAvatar";

  workspaceAvatar.className =
    "notion-builder-workspace-avatar";

  const workspaceLabel =
    document.createElement(
      "span"
    );

  workspaceLabel.id =
    "notionBuilderWorkspaceLabel";

  workspaceLabel.className =
    "notion-builder-workspace-label";

  workspaceLabel.textContent =
    "Loading…";

  const workspaceChevron =
    document.createElement(
      "span"
    );

  workspaceChevron.className =
    "notion-builder-workspace-chevron";

  workspaceChevron.textContent =
    "⌄";

  workspaceButton.append(
    workspaceAvatar,
    workspaceLabel,
    workspaceChevron
  );

  const workspaceMenu =
    document.createElement(
      "div"
    );

  workspaceMenu.id =
    "notionBuilderWorkspaceMenu";

  workspaceMenu.className =
    "notion-builder-workspace-menu hidden";

  workspaceMenu.setAttribute(
    "role",
    "listbox"
  );

  const workspace =
    document.createElement(
      "select"
    );

  workspace.id =
    "notionBuilderWorkspace";

  workspace.className =
    "notion-builder-workspace-native";

  workspace.tabIndex =
    -1;

  workspace.setAttribute(
    "aria-hidden",
    "true"
  );

  workspace.disabled =
    true;

  workspaceButton.addEventListener(
    "click",
    () => {
      const opening =
        workspaceMenu.classList
          .contains(
            "hidden"
          );

      workspaceMenu.classList.toggle(
        "hidden",
        !opening
      );

      workspaceButton.setAttribute(
        "aria-expanded",
        String(
          opening
        )
      );
    }
  );

  workspacePicker.append(
    workspaceButton,
    workspaceMenu,
    workspace
  );

  workspaceField.append(
    workspaceText,
    workspacePicker
  );

  const search =
    document.createElement(
      "input"
    );

  search.id =
    "notionBuilderSearch";

  search.type =
    "search";

  search.autocomplete =
    "off";

  search.placeholder =
    "Search databases and pages";

  search.disabled =
    true;

  const filterRow =
    document.createElement(
      "label"
    );

  filterRow.className =
    "notion-builder-filter";

  const filterText =
    document.createElement(
      "span"
    );

  filterText.textContent =
    "Viewing";

  const filter =
    document.createElement(
      "select"
    );

  filter.id =
    "notionBuilderFilter";

  for (
    const [
      value,
      label
    ] of [
      [
        "all",
        "All"
      ],
      [
        "collection",
        "Databases"
      ],
      [
        "page",
        "Pages"
      ]
    ]
  ) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      value;

    option.textContent =
      label;

    filter.append(
      option
    );
  }

  filterRow.append(
    filterText,
    filter
  );

  const results =
    document.createElement(
      "div"
    );

  results.id =
    "notionBuilderResults";

  results.className =
    "notion-builder-results";

  const loading =
    document.createElement(
      "div"
    );

  loading.className =
    "notion-builder-placeholder";

  loading.textContent =
    "Loading Notion destinations…";

  results.append(
    loading
  );

  workspace.addEventListener(
    "change",
    () => {
      notionPresetBuilderDraft =
        null;

      void searchNotionBuilderDestinations();
    }
  );

  search.addEventListener(
    "input",
    () => {
      clearTimeout(
        notionPresetBuilderSearchTimer
      );

      notionPresetBuilderSearchTimer =
        setTimeout(
          () => {
            void searchNotionBuilderDestinations();
          },
          250
        );
    }
  );

  filter.addEventListener(
    "change",
    () => {
      renderNotionBuilderResults();
    }
  );

  body.append(
    workspaceField,
    search,
    filterRow,
    results
  );

  section.append(
    header,
    heading,
    body
  );

  return section;
}

let notionPresetBuilderWorkspaces =
  [];

let notionPresetBuilderUsers =
  [];

let notionPresetBuilderDestinations =
  [];

let notionPresetBuilderSearchTimer =
  null;

let notionPresetBuilderDraft =
  null;

let notionPresetBuilderEditingFieldId =
  "";

let notionPresetBuilderDraggedFieldId =
  "";

const NOTION_PRESET_BUILDER_STATE_KEY =
  "clipnestNotionPresetBuilderStateV1";

const LAST_POPUP_DESTINATION_KEY =
  "clipnestLastPopupDestination";

let notionPresetBuilderResumePending =
  false;

function notionBuilderWorkspaceUser(
  workspace
) {
  if (
    workspace?.user &&
    typeof workspace.user ===
      "object"
  ) {
    return workspace.user;
  }

  const linkedIds =
    Array.isArray(
      workspace?.linkedUserIds
    )
      ? workspace.linkedUserIds
      : [];

  for (
    const linkedId of
      linkedIds
  ) {
    const user =
      notionPresetBuilderUsers
        .find(
          (candidate) =>
            String(
              candidate?.id ||
              ""
            ) ===
            String(
              linkedId ||
              ""
            )
        );

    if (user) {
      return user;
    }
  }

  return (
    notionPresetBuilderUsers
      .find(
        (user) =>
          Array.isArray(
            user?.spaceIds
          ) &&
          user.spaceIds.includes(
            workspace?.id
          )
      ) ||
    null
  );
}

function notionBuilderWorkspaceIconValue(
  workspace
) {
  const user =
    notionBuilderWorkspaceUser(
      workspace
    );

  const values = [
    workspace?.icon,
    workspace?.avatar,
    workspace?.avatarUrl,
    user?.profile_photo,
    user?.profilePhoto,
    user?.avatar_url,
    user?.avatarUrl
  ];

  for (
    const value of
      values
  ) {
    const clean =
      String(
        value ||
        ""
      ).trim();

    if (clean) {
      return clean;
    }
  }

  return "";
}

function fillNotionBuilderWorkspaceAvatar(
  target,
  workspace
) {
  if (!target) {
    return;
  }

  target.replaceChildren();

  const icon =
    notionBuilderWorkspaceIconValue(
      workspace
    );

  if (
    icon &&
    (
      icon.startsWith(
        "http://"
      ) ||
      icon.startsWith(
        "https://"
      ) ||
      icon.startsWith(
        "data:"
      ) ||
      icon.startsWith(
        "blob:"
      ) ||
      icon.startsWith(
        "/"
      )
    )
  ) {
    const img =
      document.createElement(
        "img"
      );

    img.alt =
      "";

    img.src =
      icon.startsWith("/")
        ? `https://www.notion.so${icon}`
        : icon;

    img.addEventListener(
      "error",
      () => {
        target.replaceChildren();

        target.textContent =
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

    target.append(
      img
    );

    return;
  }

  target.textContent =
    icon ||
    String(
      workspace?.name ||
      "N"
    )
      .trim()
      .charAt(0)
      .toUpperCase() ||
    "N";
}

function syncNotionBuilderWorkspacePicker() {
  const select =
    document.getElementById(
      "notionBuilderWorkspace"
    );

  const label =
    document.getElementById(
      "notionBuilderWorkspaceLabel"
    );

  const avatar =
    document.getElementById(
      "notionBuilderWorkspaceAvatar"
    );

  const workspace =
    notionPresetBuilderWorkspaces
      .find(
        (candidate) =>
          candidate.id ===
          select?.value
      );

  if (label) {
    label.textContent =
      workspace?.name ||
      "Choose workspace";
  }

  fillNotionBuilderWorkspaceAvatar(
    avatar,
    workspace
  );
}

function closeNotionBuilderWorkspaceMenu() {
  document
    .getElementById(
      "notionBuilderWorkspaceMenu"
    )
    ?.classList.add(
      "hidden"
    );

  document
    .getElementById(
      "notionBuilderWorkspaceButton"
    )
    ?.setAttribute(
      "aria-expanded",
      "false"
    );
}

function notionBuilderWorkspaceUserId(
  workspace
) {
  return String(
    notionBuilderWorkspaceUser(
      workspace
    )?.id ||
    workspace?.userId ||
    ""
  ).trim();
}

function notionBuilderBreadcrumb(
  destination
) {
  const parents =
    Array.isArray(
      destination?.parents
    )
      ? destination.parents
      : [];

  return parents
    .map(
      (parent) => {
        if (
          typeof parent ===
            "string"
        ) {
          return parent.trim();
        }

        return String(
          parent?.name ||
          parent?.title ||
          ""
        ).trim();
      }
    )
    .filter(Boolean)
    .join(
      " / "
    );
}

function renderNotionBuilderWorkspaceOptions(
  preferredWorkspaceId =
    ""
) {
  const select =
    document.getElementById(
      "notionBuilderWorkspace"
    );

  const menu =
    document.getElementById(
      "notionBuilderWorkspaceMenu"
    );

  if (
    !select ||
    !menu
  ) {
    return;
  }

  select.replaceChildren();
  menu.replaceChildren();

  for (
    const workspace of
      notionPresetBuilderWorkspaces
  ) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      workspace.id;

    option.textContent =
      workspace.name ||
      "Untitled workspace";

    select.append(
      option
    );

    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "notion-builder-workspace-option";

    button.dataset.workspaceId =
      workspace.id;

    const avatar =
      document.createElement(
        "span"
      );

    avatar.className =
      "notion-builder-workspace-avatar";

    fillNotionBuilderWorkspaceAvatar(
      avatar,
      workspace
    );

    const copy =
      document.createElement(
        "span"
      );

    copy.className =
      "notion-builder-workspace-copy";

    const name =
      document.createElement(
        "strong"
      );

    name.textContent =
      workspace.name ||
      "Untitled workspace";

    const meta =
      document.createElement(
        "small"
      );

    meta.textContent =
      workspace.planInfo ||
      "";

    copy.append(
      name
    );

    if (meta.textContent) {
      copy.append(
        meta
      );
    }

    const check =
      document.createElement(
        "span"
      );

    check.className =
      "notion-builder-workspace-check";

    button.append(
      avatar,
      copy,
      check
    );

    button.addEventListener(
      "click",
      () => {
        select.value =
          workspace.id;

        syncNotionBuilderWorkspacePicker();

        for (
          const candidate of
            menu.querySelectorAll(
              ".notion-builder-workspace-option"
            )
        ) {
          candidate.classList.toggle(
            "selected",
            candidate.dataset
              .workspaceId ===
              workspace.id
          );
        }

        closeNotionBuilderWorkspaceMenu();

        select.dispatchEvent(
          new Event(
            "change"
          )
        );
      }
    );

    menu.append(
      button
    );
  }

  if (
    preferredWorkspaceId &&
    notionPresetBuilderWorkspaces
      .some(
        (workspace) =>
          workspace.id ===
          preferredWorkspaceId
      )
  ) {
    select.value =
      preferredWorkspaceId;
  } else {
    select.value =
      notionPresetBuilderWorkspaces[
        0
      ]?.id ||
      "";
  }

  select.disabled =
    !notionPresetBuilderWorkspaces
      .length;

  syncNotionBuilderWorkspacePicker();

  for (
    const button of
      menu.querySelectorAll(
        ".notion-builder-workspace-option"
      )
  ) {
    button.classList.toggle(
      "selected",
      button.dataset
        .workspaceId ===
        select.value
    );
  }
}

function fillNotionBuilderDestinationIcon(
  target,
  destination
) {
  if (!target) {
    return;
  }

  target.replaceChildren();

  const raw =
    String(
      destination?.icon ||
      ""
    ).trim();

  const fallback =
    destination?.type ===
      "collection"
      ? "▣"
      : "↗";

  if (!raw) {
    target.textContent =
      fallback;

    return;
  }

  const isImage =
    raw.startsWith("/") ||
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:");

  if (!isImage) {
    target.textContent =
      raw;

    return;
  }

  const img =
    document.createElement(
      "img"
    );

  img.alt =
    "";

  img.src =
    raw.startsWith("/")
      ? `https://www.notion.so${raw}`
      : raw;

  img.addEventListener(
    "error",
    () => {
      target.replaceChildren();

      target.textContent =
        fallback;
    },
    {
      once:
        true
    }
  );

  target.append(
    img
  );
}

function renderNotionBuilderResults() {
  const container =
    document.getElementById(
      "notionBuilderResults"
    );

  const filter =
    document.getElementById(
      "notionBuilderFilter"
    )?.value ||
    "all";

  if (!container) {
    return;
  }

  container.replaceChildren();

  const visible =
    notionPresetBuilderDestinations
      .filter(
        (destination) =>
          filter ===
            "all" ||
          destination.type ===
            filter
      );

  if (!visible.length) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "notion-builder-placeholder";

    empty.textContent =
      "No destinations found.";

    container.append(
      empty
    );

    return;
  }

  for (
    const [
      type,
      headingText
    ] of [
      [
        "collection",
        "Databases"
      ],
      [
        "page",
        "Pages"
      ]
    ]
  ) {
    const matches =
      visible.filter(
        (destination) =>
          destination.type ===
          type
      );

    if (!matches.length) {
      continue;
    }

    const group =
      document.createElement(
        "div"
      );

    group.className =
      "notion-builder-group";

    const heading =
      document.createElement(
        "div"
      );

    heading.className =
      "notion-builder-group-title";

    heading.textContent =
      headingText;

    group.append(
      heading
    );

    for (
      const destination of
        matches
    ) {
      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.className =
        "notion-builder-result";

      const icon =
        document.createElement(
          "span"
        );

      icon.className =
        "notion-builder-result-icon";

      fillNotionBuilderDestinationIcon(
        icon,
        destination
      );

      const copy =
        document.createElement(
          "span"
        );

      copy.className =
        "notion-builder-result-copy";

      const name =
        document.createElement(
          "strong"
        );

      name.textContent =
        destination.name ||
        "Untitled";

      const breadcrumb =
        notionBuilderBreadcrumb(
          destination
        );

      copy.append(
        name
      );

      if (breadcrumb) {
        const meta =
          document.createElement(
            "small"
          );

        meta.textContent =
          breadcrumb;

        copy.append(
          meta
        );
      }

      button.append(
        icon,
        copy
      );

      button.addEventListener(
        "click",
        async () => {
          const workspaceSelect =
            document.getElementById(
              "notionBuilderWorkspace"
            );

          const workspace =
            notionPresetBuilderWorkspaces
              .find(
                (candidate) =>
                  candidate.id ===
                  workspaceSelect?.value
              );

          notionPresetBuilderDraft = {
            mode:
              "create",

            editingPresetId:
              "",

            workspace:
              workspace ||
              null,

            userId:
              notionBuilderWorkspaceUserId(
                workspace
              ),

            destination,

            properties:
              [],

            configuredFields:
              [],

            presetName:
              destination.name ||
              "New preset",

            presetIcon:
              ""
          };

          await persistNotionPresetBuilderState(
            "config"
          );

          renderNotionPresetConfigScreen();
        }
      );

      group.append(
        button
      );
    }

    container.append(
      group
    );
  }
}

async function searchNotionBuilderDestinations() {
  const workspaceSelect =
    document.getElementById(
      "notionBuilderWorkspace"
    );

  const search =
    document.getElementById(
      "notionBuilderSearch"
    );

  const results =
    document.getElementById(
      "notionBuilderResults"
    );

  const workspace =
    notionPresetBuilderWorkspaces
      .find(
        (candidate) =>
          candidate.id ===
          workspaceSelect?.value
      );

  if (
    !workspace ||
    !results
  ) {
    return;
  }

  const userId =
    notionBuilderWorkspaceUserId(
      workspace
    );

  if (!userId) {
    results.innerHTML =
      '<div class="notion-builder-placeholder">Could not determine the Notion user for this workspace.</div>';

    return;
  }

  results.innerHTML =
    '<div class="notion-builder-placeholder">Searching Notion…</div>';

  try {
    const response =
      await withNotionConnectionTimeout(
        ClipNestNotionSession
          .searchDestinations({
            workspaceId:
              workspace.id,

            userId,

            query:
              String(
                search?.value ||
                ""
              ).trim()
          })
      );

    notionPresetBuilderDestinations =
      Array.isArray(
        response?.destinations
      )
        ? response.destinations
        : [];

    renderNotionBuilderResults();
  } catch (error) {
    notionPresetBuilderDestinations =
      [];

    results.replaceChildren();

    const failed =
      document.createElement(
        "div"
      );

    failed.className =
      "notion-builder-placeholder notion-builder-error";

    failed.textContent =
      error?.message ||
      String(error);

    results.append(
      failed
    );
  }
}

async function loadNotionDestinationPicker(
  savedState =
    null
) {
  const results =
    document.getElementById(
      "notionBuilderResults"
    );

  const search =
    document.getElementById(
      "notionBuilderSearch"
    );

  if (!results) {
    return;
  }

  results.innerHTML =
    '<div class="notion-builder-placeholder">Loading Notion workspaces…</div>';

  try {
    if (
      !globalThis
        .ClipNestNotionSession
    ) {
      throw new Error(
        "Notion session module did not load."
      );
    }

    const response =
      await withNotionConnectionTimeout(
        ClipNestNotionSession
          .getWorkspaces({
            requestPermission:
              false
          })
      );

    notionPresetBuilderWorkspaces =
      Array.isArray(
        response?.workspaces
      )
        ? response.workspaces
        : [];

    notionPresetBuilderUsers =
      Array.isArray(
        response?.users
      )
        ? response.users
        : [];

    if (
      !notionPresetBuilderWorkspaces
        .length
    ) {
      throw new Error(
        "No Notion workspaces found."
      );
    }

    const active =
      await ClipNestNotionStore
        .getActivePreset();

    const requestedWorkspaceId =
      String(
        savedState?.workspaceId ||
        ""
      );

    const preferredWorkspaceId =
      notionPresetBuilderWorkspaces
        .some(
          (workspace) =>
            workspace.id ===
            requestedWorkspaceId
        )
        ? requestedWorkspaceId
        : notionPresetBuilderWorkspaces
            .some(
              (workspace) =>
                workspace.id ===
                active?.workspaceId
            )
          ? active.workspaceId
          : notionPresetBuilderWorkspaces[
              0
            ].id;

    renderNotionBuilderWorkspaceOptions(
      preferredWorkspaceId
    );

    const filter =
      document.getElementById(
        "notionBuilderFilter"
      );

    if (search) {
      search.disabled =
        false;

      search.value =
        savedState?.search ||
        "";
    }

    if (
      filter &&
      [
        "all",
        "collection",
        "page"
      ].includes(
        savedState?.filter
      )
    ) {
      filter.value =
        savedState.filter;
    }

    await searchNotionBuilderDestinations();

    void persistNotionPresetBuilderState(
      "destination"
    );
  } catch (error) {
    notionPresetBuilderWorkspaces =
      [];

    notionPresetBuilderDestinations =
      [];

    results.replaceChildren();

    const failed =
      document.createElement(
        "div"
      );

    failed.className =
      "notion-builder-placeholder notion-builder-error";

    failed.textContent =
      error?.message ||
      String(error);

    results.append(
      failed
    );
  }
}

async function persistNotionPresetBuilderState(
  screen =
    "config"
) {
  const nameInput =
    document.getElementById(
      "notionBuilderPresetName"
    );

  const workspaceSelect =
    document.getElementById(
      "notionBuilderWorkspace"
    );

  const search =
    document.getElementById(
      "notionBuilderSearch"
    );

  const filter =
    document.getElementById(
      "notionBuilderFilter"
    );

  if (
    notionPresetBuilderDraft &&
    nameInput
  ) {
    notionPresetBuilderDraft
      .presetName =
      nameInput.value;
  }

  await chrome.storage.local.set({
    [NOTION_PRESET_BUILDER_STATE_KEY]: {
      screen,

      workspaceId:
        workspaceSelect?.value ||
        notionPresetBuilderDraft
          ?.workspace
          ?.id ||
        "",

      search:
        search?.value ||
        "",

      filter:
        filter?.value ||
        "all",

      draft:
        notionPresetBuilderDraft
          ? {
              workspace:
                notionPresetBuilderDraft
                  .workspace ||
                null,

              userId:
                notionPresetBuilderDraft
                  .userId ||
                "",

              destination:
                notionPresetBuilderDraft
                  .destination ||
                null,

              properties:
                Array.isArray(
                  notionPresetBuilderDraft
                    .properties
                )
                  ? notionPresetBuilderDraft
                      .properties
                  : [],

              configuredFields:
                Array.isArray(
                  notionPresetBuilderDraft
                    .configuredFields
                )
                  ? notionPresetBuilderDraft
                      .configuredFields
                  : [],

              presetName:
                notionPresetBuilderDraft
                  .presetName ||
                nameInput?.value ||
                "",

              presetIcon:
                notionPresetBuilderDraft
                  .presetIcon ||
                "",

              mode:
                notionPresetBuilderDraft
                  .mode ||
                "create",

              editingPresetId:
                notionPresetBuilderDraft
                  .editingPresetId ||
                ""
            }
          : null
    }
  });
}

async function clearNotionPresetBuilderState() {
  await chrome.storage.local.remove(
    NOTION_PRESET_BUILDER_STATE_KEY
  );
}

async function startNotionPresetBuilder() {
  notionPresetBuilderDraft =
    null;

  await clearNotionPresetBuilderState();

  showNotionDestinationPicker();
}

async function cancelNotionPresetBuilder() {
  notionPresetBuilderDraft =
    null;

  await clearNotionPresetBuilderState();

  await showNotionPresetChooser();
}

async function returnNotionBuilderToDestinationPicker() {
  const draft =
    notionPresetBuilderDraft;

  if (
    draft?.mode ===
      "edit" &&
    draft.editingPresetId
  ) {
    const preset =
      await getNotionPresetById(
        draft.editingPresetId
      );

    await clearNotionPresetBuilderState();

    notionPresetBuilderDraft =
      null;

    document
      .getElementById(
        "notionPresetConfigScreen"
      )
      ?.classList.add(
        "hidden"
      );

    if (preset) {
      showNotionPresetClip(
        preset
      );
    } else {
      await showNotionPresetChooser();
    }

    return;
  }

  const destinationsLoaded =
    notionPresetBuilderWorkspaces
      .length > 0;

  showNotionDestinationPicker(
    {
      workspaceId:
        draft?.workspace?.id ||
        ""
    },
    {
      reload:
        !destinationsLoaded
    }
  );

  await persistNotionPresetBuilderState(
    "destination"
  );
}

function notionBuilderPresetFieldsForStore() {
  const configured =
    Array.isArray(
      notionPresetBuilderDraft
        ?.configuredFields
    )
      ? notionPresetBuilderDraft
          .configuredFields
      : [];

  return configured.map(
    (
      field,
      index
    ) => {
      const type =
        String(
          field.propertyType ||
          ""
        );

      const mapping =
        String(
          field.mapping ||
          ""
        );

      let role =
        "custom";

      let source =
        "manual";

      let visible =
        true;

      let required =
        false;

      let defaultValue =
        type === "multi_select"
          ? []
          : type === "checkbox"
            ? false
            : "";

      if (
        type === "title"
      ) {
        role =
          "title";

        source =
          "page_title";

        required =
          true;
      } else if (
        type === "url" &&
        mapping ===
          "Page URL"
      ) {
        role =
          "url";

        source =
          "page_url";

        visible =
          false;
      } else if (
        type ===
          "multi_select" &&
        mapping ===
          "Tags"
      ) {
        role =
          "tags";

        source =
          "manual";

        defaultValue =
          [];
      } else if (
        notionBuilderIsAuthorProperty(
          field
        ) &&
        mapping ===
          "Page author"
      ) {
        source =
          "page_author";
      } else if (
        (
          type === "file" ||
          type === "files"
        ) &&
        mapping ===
          "Page image"
      ) {
        source =
          "page_image";
      } else if (
        notionBuilderFieldIsConfigurable(
          field
        ) &&
        mapping ===
          "Fixed value"
      ) {
        source =
          "fixed";

        visible =
          false;

        if (
          type ===
            "checkbox"
        ) {
          defaultValue =
            field.fixedValue ===
              true;
        } else {
          defaultValue =
            field.fixedValue ??
            "";
        }
      }

      return {
        role,

        propertyId:
          field.propertyId,

        propertyName:
          field.propertyName,

        propertyType:
          field.propertyType,

        numberFormat:
          String(
            field.numberFormat ||
            ""
          ),

        label:
          field.propertyName,

        order:
          index,

        visible,

        source,

        required,

        defaultValue,

        options:
          Array.isArray(
            field.options
          )
            ? field.options
            : []
      };
    }
  );
}

async function getNotionPresetById(
  presetId
) {
  const result =
    await ClipNestNotionStore
      .listPresets();

  const presets =
    Array.isArray(
      result
    )
      ? result
      : Array.isArray(
          result?.presets
        )
        ? result.presets
        : [];

  return presets.find(
    (preset) =>
      String(
        preset.id ||
        ""
      ) ===
      String(
        presetId ||
        ""
      )
  ) ||
  null;
}

function notionBuilderFieldFromStoredField(
  field,
  schemaProperty =
    null
) {
  const source =
    String(
      field?.source ||
      ""
    );

  const role =
    String(
      field?.role ||
      ""
    );

  const propertyType =
    field?.propertyType ||
    schemaProperty?.type ||
    "";

  let mapping =
    "Manual";

  if (
    role === "title" ||
    source ===
      "page_title"
  ) {
    mapping =
      "Page Title";
  } else if (
    role === "url" ||
    source ===
      "page_url"
  ) {
    mapping =
      "Page URL";
  } else if (
    role === "tags"
  ) {
    mapping =
      "Tags";
  } else if (
    source ===
      "page_author" ||
    (
      source !==
        "fixed" &&
      notionBuilderIsAuthorProperty({
        propertyType,
        propertyName:
          field?.propertyName ||
          schemaProperty?.name ||
          ""
      })
    )
  ) {
    mapping =
      "Page author";
  } else if (
    source ===
      "page_image"
  ) {
    mapping =
      "Page image";
  } else if (
    source === "fixed"
  ) {
    mapping =
      "Fixed value";
  }

  let fixedValue =
    "";

  if (
    source === "fixed"
  ) {
    if (
      propertyType ===
        "checkbox"
    ) {
      fixedValue =
        field.defaultValue ===
          true ||
        String(
          field.defaultValue ??
          ""
        )
          .trim()
          .toLowerCase() ===
          "true" ||
        String(
          field.defaultValue ??
          ""
        )
          .trim()
          .toLowerCase() ===
          "yes";
    } else {
      fixedValue =
        field.defaultValue ??
        "";
    }
  }

  return {
    propertyId:
      field.propertyId ||
      schemaProperty?.id ||
      "",

    propertyName:
      field.propertyName ||
      schemaProperty?.name ||
      "Untitled property",

    propertyType,

    numberFormat:
      String(
        field.numberFormat ||
        schemaProperty?.numberFormat ||
        schemaProperty?.number_format ||
        ""
      ),

    options:
      Array.isArray(
        schemaProperty?.options
      )
        ? schemaProperty.options
        : Array.isArray(
            field?.options
          )
          ? field.options
          : [],

    mapping,

    fixedValue
  };
}

async function openNotionPresetInBuilder(
  presetId
) {
  const preset =
    await getNotionPresetById(
      presetId
    );

  if (!preset) {
    setStatus(
      "That preset no longer exists.",
      "error"
    );

    return;
  }

  const workspace = {
    id:
      preset.workspaceId,

    name:
      preset.workspaceName ||
      "Notion",

    spaceViewIds:
      Array.isArray(
        preset.workspaceSpaceViewIds
      )
        ? preset.workspaceSpaceViewIds
        : []
  };

  const destination = {
    id:
      preset.destinationId,

    name:
      preset.destinationName ||
      "Untitled",

    type:
      preset.destinationType,

    icon:
      preset.destinationIcon ||
      "",

    parents:
      Array.isArray(
        preset.destinationParents
      )
        ? preset.destinationParents
        : [],

    parentId:
      preset.destinationParentId ||
      "",

    parentPageId:
      preset.destinationParentId ||
      "",

    parentTable:
      preset.destinationParentTable ||
      "",

    dataSourceId:
      preset.dataSourceId ||
      ""
  };

  notionPresetBuilderEditingFieldId =
    "";

  notionPresetBuilderDraggedFieldId =
    "";

  notionPresetBuilderDraft = {
    mode:
      "edit",

    editingPresetId:
      preset.id,

    workspace,

    userId:
      preset.workspaceUserId,

    destination,

    properties:
      [],

    configuredFields:
      [],

    presetName:
      preset.name ||
      "Untitled preset",

    presetIcon:
      preset.presetIcon ||
      ""
  };

  if (
    destination.type ===
      "page"
  ) {
    const property = {
      id:
        "__clipnest_page_title__",

      name:
        "Title",

      type:
        "title",

      options:
        []
    };

    notionPresetBuilderDraft
      .properties = [
        property
      ];

    const stored =
      Array.isArray(
        preset.fields
      )
        ? preset.fields
            .slice()
            .sort(
              (a, b) =>
                Number(
                  a?.order ||
                  0
                ) -
                Number(
                  b?.order ||
                  0
                )
            )
        : [];

    notionPresetBuilderDraft
      .configuredFields =
      stored.length
        ? stored.map(
            (field) =>
              notionBuilderFieldFromStoredField(
                field,
                property
              )
          )
        : [
            notionBuilderConfiguredField(
              property,
              "Page Title"
            )
          ];
  } else {
    const parentPageId =
      String(
        destination.parentId ||
        ""
      ).trim();

    if (!parentPageId) {
      setStatus(
        "This preset is missing its database parent page.",
        "error"
      );

      return;
    }

    try {
      const schema =
        await ClipNestNotionSession
          .getDatabaseSchema({
            workspaceId:
              workspace.id,

            userId:
              preset.workspaceUserId,

            collectionId:
              destination.id,

            parentPageId
          });

      const properties =
        Array.isArray(
          schema?.properties
        )
          ? schema.properties
          : [];

      notionPresetBuilderDraft
        .schema =
        schema;

      notionPresetBuilderDraft
        .properties =
        properties;

      const stored =
        Array.isArray(
          preset.fields
        )
          ? preset.fields
              .slice()
              .sort(
                (a, b) =>
                  Number(
                    a?.order ||
                    0
                  ) -
                  Number(
                    b?.order ||
                    0
                  )
              )
          : [];

      notionPresetBuilderDraft
        .configuredFields =
        stored.map(
          (field) => {
            const property =
              properties.find(
                (candidate) =>
                  String(
                    candidate.id ||
                    ""
                  ) ===
                  String(
                    field.propertyId ||
                    ""
                  )
              );

            return notionBuilderFieldFromStoredField(
              field,
              property
            );
          }
        );
    } catch (error) {
      setStatus(
        error?.message ||
        String(error),
        "error"
      );

      return;
    }
  }

  await persistNotionPresetBuilderState(
    "config"
  );

  renderNotionPresetConfigScreen({
    restore:
      true
  });
}

async function deleteNotionPresetFromBuilder() {
  const draft =
    notionPresetBuilderDraft;

  const button =
    document.getElementById(
      "notionBuilderDeletePreset"
    );

  if (
    draft?.mode !== "edit" ||
    !draft.editingPresetId ||
    !button
  ) {
    return;
  }

  if (
    button.dataset.confirm !==
      "true"
  ) {
    button.dataset.confirm =
      "true";

    button.textContent =
      "Click again to delete";

    button.classList.add(
      "confirming"
    );

    setTimeout(
      () => {
        if (
          button.dataset.confirm ===
            "true"
        ) {
          delete button.dataset.confirm;

          button.textContent =
            "Delete preset";

          button.classList.remove(
            "confirming"
          );
        }
      },
      3500
    );

    return;
  }

  button.disabled =
    true;

  button.textContent =
    "Deleting…";

  try {
    await ClipNestNotionStore
      .removePreset(
        draft.editingPresetId
      );

    await clearNotionPresetBuilderState();

    notionPresetBuilderDraft =
      null;

    notionPresetBuilderEditingFieldId =
      "";

    notionPresetBuilderDraggedFieldId =
      "";

    await loadNotionPresetPicker();

    document
      .getElementById(
        "notionPresetConfigScreen"
      )
      ?.classList.add(
        "hidden"
      );

    await showNotionPresetChooser();

    setStatus(
      "Preset deleted.",
      "success"
    );
  } catch (error) {
    button.disabled =
      false;

    delete button.dataset.confirm;

    button.textContent =
      "Delete preset";

    button.classList.remove(
      "confirming"
    );

    setStatus(
      error?.message ||
      String(error),
      "error"
    );
  }
}

async function createNotionPresetFromBuilder() {
  const draft =
    notionPresetBuilderDraft;

  const button =
    document.getElementById(
      "notionBuilderCreatePreset"
    );

  const nameInput =
    document.getElementById(
      "notionBuilderPresetName"
    );

  if (
    !draft?.workspace ||
    !draft?.destination ||
    !draft?.userId
  ) {
    setStatus(
      "Preset destination is incomplete.",
      "error"
    );

    return;
  }

  const isEdit =
    draft.mode ===
      "edit" &&
    Boolean(
      draft.editingPresetId
    );

  const name =
    String(
      nameInput?.value ||
      draft.destination.name ||
      "New preset"
    ).trim();

  if (!name) {
    setStatus(
      "Enter a preset name.",
      "error"
    );

    nameInput?.focus();

    return;
  }

  const fields =
    notionBuilderPresetFieldsForStore();

  const title =
    fields.find(
      (field) =>
        field.role ===
          "title"
    );

  if (!title) {
    setStatus(
      "A Title field is required.",
      "error"
    );

    return;
  }

  const url =
    fields.find(
      (field) =>
        field.role ===
          "url"
    );

  const tags =
    fields.find(
      (field) =>
        field.role ===
          "tags"
    );

  if (button) {
    button.disabled =
      true;

    button.textContent =
      isEdit
        ? "Saving…"
        : "Creating…";
  }

  try {
    const destination =
      draft.destination;

    const isPage =
      destination.type ===
        "page";

    const patch = {
      name,

      presetIcon:
        String(
          draft.presetIcon ||
          ""
        ).trim(),

      workspaceId:
        draft.workspace.id,

      workspaceName:
        draft.workspace.name ||
        "Notion",

      workspaceUserId:
        draft.userId,

      workspaceSpaceViewIds:
        Array.isArray(
          draft.workspace
            .spaceViewIds
        )
          ? draft.workspace
              .spaceViewIds
          : [],

      dataSourceId:
        destination.dataSourceId ||
        "",

      destinationType:
        destination.type,

      destinationId:
        destination.id,

      destinationName:
        destination.name ||
        "Untitled",

      destinationIcon:
        destination.icon ||
        "",

      destinationParents:
        Array.isArray(
          destination.parents
        )
          ? destination.parents
          : [],

      destinationParentId:
        destination.parentId ||
        destination.parentPageId ||
        "",

      destinationParentTable:
        destination.parentTable ||
        "",

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
          isPage
            ? ""
            : title.propertyId,

        url:
          url?.propertyId ||
          "",

        tags:
          tags?.propertyId ||
          ""
      },

      titleProperty:
        isPage
          ? "Name"
          : title.propertyName,

      urlProperty:
        url?.propertyName ||
        "",

      tagsProperty:
        tags?.propertyName ||
        "",

      propertyMappings: {
        title:
          isPage
            ? "Name"
            : title.propertyName,

        url:
          url?.propertyName ||
          "",

        tags:
          tags?.propertyName ||
          ""
      },

      propertyDefaults:
        {}
    };

    const preset =
      isEdit
        ? await ClipNestNotionStore
            .updatePreset(
              draft.editingPresetId,
              patch
            )
        : await ClipNestNotionStore
            .createPreset(
              patch
            );

    await ClipNestNotionStore
      .setActivePreset(
        preset.id
      );

    await clearNotionPresetBuilderState();

    await chrome.storage.local.set({
      [LAST_POPUP_DESTINATION_KEY]:
        "notion"
    });

    notionPresetBuilderDraft =
      null;

    notionPresetBuilderEditingFieldId =
      "";

    notionPresetBuilderDraggedFieldId =
      "";

    await loadNotionPresetPicker();

    notionSelectedTags =
      [];

    if (els.tagsInput) {
      els.tagsInput.value =
        "";
    }

    renderNotionSelectedTags();

    await loadNotionTagOptions();

    document
      .getElementById(
        "notionPresetConfigScreen"
      )
      ?.classList.add(
        "hidden"
      );

    showNotionPresetClip(
      preset
    );
  } catch (error) {
    setStatus(
      error?.message ||
      String(error),
      "error"
    );
  } finally {
    if (button) {
      const editing =
        notionPresetBuilderDraft
          ?.mode ===
          "edit";

      button.textContent =
        editing
          ? "Save changes"
          : "Create preset";

      button.disabled =
        false;
    }
  }
}

async function restoreNotionPresetBuilderState() {
  if (
    state.destination !==
      "notion"
  ) {
    return false;
  }

  if (
    !(await ensureNotionConnectionForPopup())
  ) {
    return false;
  }

  const stored =
    await chrome.storage.local.get(
      NOTION_PRESET_BUILDER_STATE_KEY
    );

  const saved =
    stored[
      NOTION_PRESET_BUILDER_STATE_KEY
    ];

  if (!saved) {
    return false;
  }

  if (
    saved.screen ===
      "config" &&
    saved.draft?.workspace &&
    saved.draft?.destination
  ) {
    notionPresetBuilderDraft = {
      ...saved.draft
    };

    renderNotionPresetConfigScreen(
      {
        restore:
          true
      }
    );

    return true;
  }

  if (
    saved.screen ===
      "destination"
  ) {
    showNotionDestinationPicker(
      saved
    );

    return true;
  }

  return false;
}

function createNotionPresetConfigScreen() {
  const section =
    document.createElement(
      "section"
    );

  section.id =
    "notionPresetConfigScreen";

  section.className =
    "notion-preset-config-screen hidden";

  const header =
    document.createElement(
      "div"
    );

  header.className =
    "notion-builder-header";

  const back =
    document.createElement(
      "button"
    );

  back.type =
    "button";

  back.className =
    "notion-builder-back";

  back.textContent =
    "‹";

  back.setAttribute(
    "aria-label",
    "Back to destinations"
  );

  const title =
    document.createElement(
      "strong"
    );

  title.id =
    "notionBuilderConfigTitle";

  title.textContent =
    "Create preset";

  const spacer =
    document.createElement(
      "span"
    );

  spacer.className =
    "notion-builder-header-spacer";

  back.addEventListener(
    "click",
    () => {
      returnNotionBuilderToDestinationPicker();
    }
  );

  header.append(
    back,
    title,
    spacer
  );

  const nameField =
    document.createElement(
      "label"
    );

  nameField.className =
    "notion-builder-field";

  const nameLabel =
    document.createElement(
      "span"
    );

  nameLabel.textContent =
    "Preset name";

  const nameInput =
    document.createElement(
      "input"
    );

  nameInput.id =
    "notionBuilderPresetName";

  nameInput.type =
    "text";

  nameInput.autocomplete =
    "off";

  const nameRow =
    document.createElement(
      "div"
    );

  nameRow.className =
    "notion-builder-name-row";

  const iconWrap =
    document.createElement(
      "div"
    );

  iconWrap.className =
    "notion-builder-icon-wrap";

  const iconButton =
    document.createElement(
      "button"
    );

  iconButton.id =
    "notionBuilderPresetIcon";

  iconButton.type =
    "button";

  iconButton.className =
    "notion-builder-icon-button";

  iconButton.setAttribute(
    "aria-label",
    "Choose preset icon"
  );

  const iconPicker =
    createNotionBuilderIconPicker();

  iconButton.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      iconPicker.classList.toggle(
        "hidden"
      );

      updateNotionBuilderIconButton();
    }
  );

  document.addEventListener(
    "click",
    (event) => {
      if (
        !iconWrap.contains(
          event.target
        )
      ) {
        iconPicker.classList.add(
          "hidden"
        );
      }
    }
  );

  iconWrap.append(
    iconButton,
    iconPicker
  );

  nameRow.append(
    iconWrap,
    nameInput
  );

  nameField.append(
    nameLabel,
    nameRow
  );

  const locationLabel =
    document.createElement(
      "div"
    );

  locationLabel.className =
    "notion-builder-section-label";

  locationLabel.textContent =
    "Save location";

  const location =
    document.createElement(
      "button"
    );

  location.id =
    "notionBuilderSaveLocation";

  location.type =
    "button";

  location.className =
    "notion-builder-save-location";

  location.addEventListener(
    "click",
    () => {
      returnNotionBuilderToDestinationPicker();
    }
  );

  const fieldsLabel =
    document.createElement(
      "div"
    );

  fieldsLabel.className =
    "notion-builder-section-label";

  fieldsLabel.textContent =
    "Fields";

  const fields =
    document.createElement(
      "div"
    );

  fields.id =
    "notionBuilderPresetFields";

  fields.className =
    "notion-builder-preset-fields";

  const create =
    document.createElement(
      "button"
    );

  create.id =
    "notionBuilderCreatePreset";

  create.type =
    "button";

  create.className =
    "primary notion-builder-create-button";

  create.textContent =
    "Create preset";

  create.disabled =
    true;

  const remove =
    document.createElement(
      "button"
    );

  remove.id =
    "notionBuilderDeletePreset";

  remove.type =
    "button";

  remove.className =
    "notion-builder-delete-preset hidden";

  remove.textContent =
    "Delete preset";

  remove.addEventListener(
    "click",
    () => {
      void deleteNotionPresetFromBuilder();
    }
  );


  nameInput.addEventListener(
    "input",
    async () => {
      if (
        notionPresetBuilderDraft
      ) {
        notionPresetBuilderDraft
          .presetName =
          nameInput.value;

        await persistNotionPresetBuilderState(
          "config"
        );
      }
    }
  );

  create.addEventListener(
    "click",
    () => {
      void createNotionPresetFromBuilder();
    }
  );

  section.append(
    header,
    nameField,
    locationLabel,
    location,
    fieldsLabel,
    fields,
    create,
    remove
  );

  return section;
}

function ensureNotionPresetConfigScreen() {
  let screen =
    document.getElementById(
      "notionPresetConfigScreen"
    );

  if (screen) {
    return screen;
  }

  screen =
    createNotionPresetConfigScreen();

  const picker =
    ensureNotionDestinationPicker();

  picker.after(
    screen
  );

  return screen;
}

function notionBuilderSupportedProperty(
  property
) {
  return [
    "title",
    "url",
    "multi_select",
    "select",
    "status",
    "text",
    "rich_text",
    "checkbox",
    "number",
    "date",
    "file",
    "files"
  ].includes(
    String(
      property?.type ||
      ""
    )
  );
}

function notionBuilderPropertyTypeLabel(
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

    number:
      "Number",

    date:
      "Date",

    file:
      "Files & media",

    files:
      "Files & media"
  };

  return labels[
    String(
      type ||
      ""
    )
  ] ||
  String(
    type ||
    ""
  );
}

function notionBuilderFieldIsConfigurable(
  field
) {
  return [
    "select",
    "status",
    "text",
    "rich_text",
    "checkbox",
    "number",
    "date"
  ].includes(
    String(
      field?.propertyType ||
      ""
    )
  );
}

function notionBuilderFieldMappingLabel(
  field
) {
  if (
    field?.mapping ===
      "Fixed value"
  ) {
    if (
      field.propertyType ===
        "checkbox"
    ) {
      return field.fixedValue ===
        true
        ? "Fixed: Checked"
        : "Fixed: Unchecked";
    }

    const value =
      String(
        field?.fixedValue ??
        ""
      ).trim();

    return value
      ? `Fixed: ${value}`
      : "Fixed value";
  }

  const mapping =
    field?.mapping ||
    notionBuilderDefaultMapping({
      type:
        field?.propertyType
    });

  return mapping ===
    "Manual"
      ? "Ask each time"
      : mapping;
}

function findNotionBuilderConfiguredField(
  propertyId
) {
  const id =
    String(
      propertyId ||
      ""
    );

  return (
    Array.isArray(
      notionPresetBuilderDraft
        ?.configuredFields
    )
      ? notionPresetBuilderDraft
          .configuredFields
      : []
  ).find(
    (field) =>
      String(
        field.propertyId ||
        ""
      ) ===
        id
  ) ||
  null;
}

async function removeNotionBuilderConfiguredField(
  propertyId
) {
  const draft =
    notionPresetBuilderDraft;

  if (!draft) {
    return;
  }

  draft.configuredFields =
    (
      Array.isArray(
        draft.configuredFields
      )
        ? draft.configuredFields
        : []
    ).filter(
      (field) =>
        String(
          field.propertyId ||
          ""
        ) !==
        String(
          propertyId ||
          ""
        )
    );

  notionPresetBuilderEditingFieldId =
    "";

  await persistNotionPresetBuilderState(
    "config"
  );

  renderNotionBuilderConfiguredFields();
}

function renderNotionBuilderFieldConfiguration(
  propertyId
) {
  const container =
    document.getElementById(
      "notionBuilderPresetFields"
    );

  const field =
    findNotionBuilderConfiguredField(
      propertyId
    );

  if (
    !container ||
    !field ||
    !notionBuilderFieldIsConfigurable(
      field
    )
  ) {
    return;
  }

  const editor =
    document.createElement(
      "div"
    );

  editor.className =
    "notion-builder-field-config";

  editor.dataset.propertyId =
    field.propertyId;

  const heading =
    document.createElement(
      "div"
    );

  heading.className =
    "notion-builder-field-config-header";

  const title =
    document.createElement(
      "strong"
    );

  title.textContent =
    field.propertyName;

  const close =
    document.createElement(
      "button"
    );

  close.type =
    "button";

  close.className =
    "notion-builder-field-config-close";

  close.textContent =
    "×";

  close.addEventListener(
    "click",
    () => {
      notionPresetBuilderEditingFieldId =
        "";

      renderNotionBuilderConfiguredFields();
    }
  );

  heading.append(
    title,
    close
  );

  const modes =
    document.createElement(
      "div"
    );

  modes.className =
    "notion-builder-field-config-modes";

  const mappingModes =
    notionBuilderIsAuthorProperty(
      field
    )
      ? [
          "Page author",
          "Fixed value"
        ]
      : [
          "Manual",
          "Fixed value"
        ];

  for (
    const mode of
      mappingModes
  ) {
    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "notion-builder-field-mode";

    button.classList.toggle(
      "active",
      field.mapping ===
        mode
    );

    button.textContent =
      mode ===
        "Manual"
        ? "Ask each time"
        : mode;

    button.addEventListener(
      "click",
      async () => {
        field.mapping =
          mode;

        if (
          mode ===
            "Manual"
        ) {
          field.fixedValue =
            field.propertyType ===
              "checkbox"
              ? false
              : "";
        } else if (
          field.propertyType ===
            "checkbox" &&
          typeof field.fixedValue !==
            "boolean"
        ) {
          field.fixedValue =
            false;
        }

        await persistNotionPresetBuilderState(
          "config"
        );

        renderNotionBuilderConfiguredFields();
      }
    );

    modes.append(
      button
    );
  }

  editor.append(
    heading,
    modes
  );

  if (
    field.mapping ===
      "Fixed value"
  ) {
    const fixed =
      document.createElement(
        "label"
      );

    fixed.className =
      "notion-builder-fixed-value";

    const label =
      document.createElement(
        "span"
      );

    label.textContent =
      "Value";

    fixed.append(
      label
    );

    if (
      field.propertyType ===
        "select" ||
      field.propertyType ===
        "status"
    ) {
      const select =
        document.createElement(
          "select"
        );

      const empty =
        document.createElement(
          "option"
        );

      empty.value =
        "";

      empty.textContent =
        "Choose value";

      select.append(
        empty
      );

      for (
        const option of
          (
            Array.isArray(
              field.options
            )
              ? field.options
              : []
          )
      ) {
        const value =
          notionPresetOptionLabel(
            option
          );

        if (!value) {
          continue;
        }

        const item =
          document.createElement(
            "option"
          );

        item.value =
          value;

        item.textContent =
          value;

        select.append(
          item
        );
      }

      select.value =
        String(
          field.fixedValue ??
          ""
        );

      select.addEventListener(
        "change",
        async () => {
          field.fixedValue =
            select.value;

          await persistNotionPresetBuilderState(
            "config"
          );

          renderNotionBuilderConfiguredFields();
        }
      );

      fixed.append(
        select
      );
    } else if (
      field.propertyType ===
        "checkbox"
    ) {
      const checkbox =
        document.createElement(
          "label"
        );

      checkbox.className =
        "notion-builder-checkbox-value";

      const input =
        document.createElement(
          "input"
        );

      input.type =
        "checkbox";

      input.checked =
        field.fixedValue ===
          true;

      const copy =
        document.createElement(
          "span"
        );

      copy.textContent =
        input.checked
          ? "Checked"
          : "Unchecked";

      input.addEventListener(
        "change",
        async () => {
          field.fixedValue =
            input.checked;

          await persistNotionPresetBuilderState(
            "config"
          );

          renderNotionBuilderConfiguredFields();
        }
      );

      checkbox.append(
        input,
        copy
      );

      fixed.append(
        checkbox
      );
    } else {
      const input =
        document.createElement(
          "input"
        );

      input.autocomplete =
        "off";

      if (
        field.propertyType ===
          "number"
      ) {
        input.type =
          "number";

        input.step =
          "any";

        input.inputMode =
          "decimal";
      } else if (
        field.propertyType ===
          "date"
      ) {
        input.type =
          "date";
      } else {
        input.type =
          "text";
      }

      input.value =
        String(
          field.fixedValue ??
          ""
        );

      input.addEventListener(
        "input",
        () => {
          field.fixedValue =
            input.value;

          void persistNotionPresetBuilderState(
            "config"
          );
        }
      );

      fixed.append(
        input
      );
    }

    editor.append(
      fixed
    );
  }

  const remove =
    document.createElement(
      "button"
    );

  remove.type =
    "button";

  remove.className =
    "notion-builder-remove-field";

  remove.textContent =
    "Remove field";

  remove.addEventListener(
    "click",
    () => {
      void removeNotionBuilderConfiguredField(
        field.propertyId
      );
    }
  );

  editor.append(
    remove
  );

  const row =
    container.querySelector(
      `.notion-builder-field-row[data-property-id="${CSS.escape(
        field.propertyId
      )}"]`
    );

  if (row) {
    row.after(
      editor
    );
  } else {
    container.append(
      editor
    );
  }
}

async function commitNotionBuilderFieldOrder() {
  const draft =
    notionPresetBuilderDraft;

  const container =
    document.getElementById(
      "notionBuilderPresetFields"
    );

  if (
    !draft ||
    !container ||
    !Array.isArray(
      draft.configuredFields
    )
  ) {
    return;
  }

  const order =
    [
      ...container.children
    ]
      .filter(
        (element) =>
          element.classList
            .contains(
              "notion-builder-field-row"
            )
      )
      .map(
        (element) =>
          String(
            element.dataset
              .propertyId ||
            ""
          )
      )
      .filter(Boolean);

  const byId =
    new Map(
      draft.configuredFields
        .map(
          (field) => [
            String(
              field.propertyId ||
              ""
            ),
            field
          ]
        )
    );

  const reordered =
    order
      .map(
        (id) =>
          byId.get(
            id
          )
      )
      .filter(Boolean);

  for (
    const field of
      draft.configuredFields
  ) {
    if (
      !order.includes(
        String(
          field.propertyId ||
          ""
        )
      )
    ) {
      reordered.push(
        field
      );
    }
  }

  draft.configuredFields =
    reordered;

  notionPresetBuilderDraggedFieldId =
    "";

  notionPresetBuilderEditingFieldId =
    "";

  await persistNotionPresetBuilderState(
    "config"
  );

  renderNotionBuilderConfiguredFields();
}

function setupNotionBuilderFieldDrag(
  row,
  handle,
  field
) {
  handle.draggable =
    true;

  let dragGhost =
    null;

  handle.addEventListener(
    "dragstart",
    (event) => {
      notionPresetBuilderDraggedFieldId =
        String(
          field.propertyId ||
          ""
        );

      notionPresetBuilderEditingFieldId =
        "";

      row.classList.add(
        "notion-builder-field-dragging"
      );

      if (
        event.dataTransfer
      ) {
        event.dataTransfer.effectAllowed =
          "move";

        event.dataTransfer.setData(
          "text/plain",
          notionPresetBuilderDraggedFieldId
        );

        dragGhost =
          document.createElement(
            "div"
          );

        dragGhost.className =
          "notion-builder-drag-ghost";

        const grip =
          document.createElement(
            "span"
          );

        grip.textContent =
          "⠿";

        const label =
          document.createElement(
            "strong"
          );

        label.textContent =
          field.propertyName ||
          "Field";

        dragGhost.append(
          grip,
          label
        );

        document.body.append(
          dragGhost
        );

        try {
          event.dataTransfer.setDragImage(
            dragGhost,
            14,
            20
          );
        } catch {
          // Fall back to Chrome's default drag image.
        }
      }
    }
  );

  row.addEventListener(
    "dragover",
    (event) => {
      if (
        !notionPresetBuilderDraggedFieldId
      ) {
        return;
      }

      const container =
        document.getElementById(
          "notionBuilderPresetFields"
        );

      const dragged =
        container?.querySelector(
          `.notion-builder-field-row[data-property-id="${CSS.escape(
            notionPresetBuilderDraggedFieldId
          )}"]`
        );

      if (
        !container ||
        !dragged ||
        dragged === row
      ) {
        return;
      }

      event.preventDefault();

      if (
        event.dataTransfer
      ) {
        event.dataTransfer.dropEffect =
          "move";
      }

      const rect =
        row.getBoundingClientRect();

      const insertAfter =
        event.clientY >
        rect.top +
          rect.height / 2;

      if (insertAfter) {
        row.after(
          dragged
        );
      } else {
        row.before(
          dragged
        );
      }
    }
  );

  row.addEventListener(
    "drop",
    (event) => {
      if (
        !notionPresetBuilderDraggedFieldId
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      void commitNotionBuilderFieldOrder();
    }
  );

  handle.addEventListener(
    "dragend",
    () => {
      row.classList.remove(
        "notion-builder-field-dragging"
      );

      dragGhost?.remove();
      dragGhost =
        null;

      if (
        notionPresetBuilderDraggedFieldId
      ) {
        void commitNotionBuilderFieldOrder();
      }
    }
  );
}

function createNotionBuilderConfiguredFieldRow(
  field
) {
  const row =
    document.createElement(
      "div"
    );

  row.className =
    "notion-builder-field-row";

  row.dataset.propertyId =
    field.propertyId ||
    "";

  row.dataset.propertyType =
    field.propertyType ||
    "";

  const handle =
    document.createElement(
      "button"
    );

  handle.type =
    "button";

  handle.className =
    "notion-builder-drag-handle";

  handle.textContent =
    "⠿";

  handle.setAttribute(
    "aria-label",
    `Drag ${field.propertyName || "field"} to reorder`
  );

  const copy =
    document.createElement(
      "div"
    );

  copy.className =
    "notion-builder-field-copy";

  const name =
    document.createElement(
      "strong"
    );

  name.textContent =
    field.propertyName ||
    "Untitled property";

  const type =
    document.createElement(
      "small"
    );

  type.textContent =
    notionBuilderPropertyTypeLabel(
      field.propertyType
    );

  copy.append(
    name,
    type
  );

  const actions =
    document.createElement(
      "div"
    );

  actions.className =
    "notion-builder-field-row-actions";

  if (
    notionBuilderFieldIsConfigurable(
      field
    )
  ) {
    const mapping =
      document.createElement(
        "button"
      );

    mapping.type =
      "button";

    mapping.className =
      "notion-builder-field-mapping-button";

    mapping.textContent =
      notionBuilderFieldMappingLabel(
        field
      );

    mapping.addEventListener(
      "click",
      () => {
        notionPresetBuilderEditingFieldId =
          field.propertyId;

        renderNotionBuilderConfiguredFields();
      }
    );

    actions.append(
      mapping
    );
  } else {
    const mapping =
      document.createElement(
        "span"
      );

    mapping.className =
      "notion-builder-field-mapping";

    mapping.textContent =
      notionBuilderFieldMappingLabel(
        field
      );

    actions.append(
      mapping
    );
  }

  if (
    field.propertyType !==
      "title"
  ) {
    const remove =
      document.createElement(
        "button"
      );

    remove.type =
      "button";

    remove.className =
      "notion-builder-field-remove-button";

    remove.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    remove.setAttribute(
      "aria-label",
      `Remove ${field.propertyName || "field"} from preset`
    );

    remove.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        void removeNotionBuilderConfiguredField(
          field.propertyId
        );
      }
    );

    actions.append(
      remove
    );
  }

  row.append(
    handle,
    copy,
    actions
  );

  setupNotionBuilderFieldDrag(
    row,
    handle,
    field
  );

  return row;
}
function notionBuilderPropertyCanBeAdded(
  property
) {
  return [
    "url",
    "multi_select",
    "select",
    "status",
    "text",
    "rich_text",
    "checkbox",
    "number",
    "date",
    "file",
    "files"
  ].includes(
    String(
      property?.type ||
      ""
    )
  );
}

function notionBuilderIsAuthorProperty(
  property
) {
  const type =
    String(
      property?.propertyType ||
      property?.type ||
      ""
    );

  const name =
    String(
      property?.propertyName ||
      property?.name ||
      ""
    )
      .trim()
      .toLowerCase();

  return (
    (
      type === "text" ||
      type === "rich_text"
    ) &&
    name === "author"
  );
}

function notionBuilderDefaultMapping(
  property
) {
  const type =
    String(
      property?.type ||
      ""
    );

  if (
    type === "title"
  ) {
    return "Page Title";
  }

  if (
    type === "url"
  ) {
    return "Page URL";
  }

  if (
    type === "multi_select"
  ) {
    return String(
      property?.name ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "tags"
        ? "Tags"
        : "Manual";
  }

  if (
    notionBuilderIsAuthorProperty(
      property
    )
  ) {
    return "Page author";
  }

  if (
    type === "file" ||
    type === "files"
  ) {
    return "Page image";
  }

  if (
    [
      "select",
      "status",
      "text",
      "rich_text",
      "checkbox",
      "number",
      "date"
    ].includes(
      type
    )
  ) {
    return "Manual";
  }

  return "";
}

function notionBuilderConfiguredField(
  property,
  mapping = ""
) {
  return {
    propertyId:
      property.id ||
      "",

    propertyName:
      property.name ||
      "Untitled property",

    propertyType:
      property.type ||
      "",

    numberFormat:
      String(
        property.numberFormat ||
        property.number_format ||
        ""
      ),

    options:
      Array.isArray(
        property.options
      )
        ? property.options
        : [],

    mapping:
      mapping ||
      notionBuilderDefaultMapping(
        property
      ),

    fixedValue:
      property.type ===
        "checkbox"
        ? false
        : ""
  };
}

function renderNotionBuilderConfiguredFields() {
  const draft =
    notionPresetBuilderDraft;

  const container =
    document.getElementById(
      "notionBuilderPresetFields"
    );

  const create =
    document.getElementById(
      "notionBuilderCreatePreset"
    );

  if (
    !draft ||
    !container ||
    !create
  ) {
    return;
  }

  container.replaceChildren();

  const configured =
    Array.isArray(
      draft.configuredFields
    )
      ? draft.configuredFields
      : [];

  for (
    const field of
      configured
  ) {
    container.append(
      createNotionBuilderConfiguredFieldRow(
        field
      )
    );

    if (
      notionPresetBuilderEditingFieldId ===
        field.propertyId
    ) {
      renderNotionBuilderFieldConfiguration(
        field.propertyId
      );
    }
  }

  const configuredIds =
    new Set(
      configured.map(
        (field) =>
          String(
            field.propertyId ||
            ""
          )
      )
    );

  const remaining =
    (
      Array.isArray(
        draft.properties
      )
        ? draft.properties
        : []
    ).filter(
      (property) =>
        !configuredIds.has(
          String(
            property.id ||
            ""
          )
        )
    );

  if (
    draft.destination?.type ===
      "collection" &&
    remaining.length
  ) {
    const add =
      document.createElement(
        "button"
      );

    add.type =
      "button";

    add.id =
      "notionBuilderAddField";

    add.className =
      "notion-builder-add-field";

    add.textContent =
      "+ Add field";

    add.addEventListener(
      "click",
      () => {
        notionPresetBuilderEditingFieldId =
          "";

        renderNotionBuilderAddFieldPicker();
      }
    );

    container.append(
      add
    );
  }

  const hasTitle =
    configured.some(
      (field) =>
        field.propertyType ===
          "title"
    );

  create.disabled =
    !hasTitle;

  void persistNotionPresetBuilderState(
    "config"
  );
}

function renderNotionBuilderAddFieldPicker(
  query = ""
) {
  const draft =
    notionPresetBuilderDraft;

  const container =
    document.getElementById(
      "notionBuilderPresetFields"
    );

  if (
    !draft ||
    !container
  ) {
    return;
  }

  container
    .querySelector(
      ".notion-builder-add-field-picker"
    )
    ?.remove();

  const configuredIds =
    new Set(
      (
        Array.isArray(
          draft.configuredFields
        )
          ? draft.configuredFields
          : []
      ).map(
        (field) =>
          String(
            field.propertyId ||
            ""
          )
      )
    );

  const hiddenReadOnlyTypes =
    new Set([
      "created_by",
      "created_time",
      "last_edited_by",
      "last_edited_time",
      "rollup",
      "unique_id"
    ]);

  const normalizedQuery =
    String(
      query ||
      ""
    )
      .trim()
      .toLowerCase();

  const properties =
    (
      Array.isArray(
        draft.properties
      )
        ? draft.properties
        : []
    )
      .filter(
        (property) =>
          !hiddenReadOnlyTypes.has(
            String(
              property?.type ||
              ""
            )
          )
      )
      .filter(
        (property) =>
          !configuredIds.has(
            String(
              property.id ||
              ""
            )
          )
      )
      .filter(
        (property) =>
          !normalizedQuery ||
          String(
            property.name ||
            ""
          )
            .toLowerCase()
            .includes(
              normalizedQuery
            )
      );

  const picker =
    document.createElement(
      "div"
    );

  picker.className =
    "notion-builder-add-field-picker";

  const header =
    document.createElement(
      "div"
    );

  header.className =
    "notion-builder-add-field-header";

  const title =
    document.createElement(
      "strong"
    );

  title.textContent =
    "Add fields";

  const close =
    document.createElement(
      "button"
    );

  close.type =
    "button";

  close.className =
    "notion-builder-add-field-close";

  close.textContent =
    "×";

  close.addEventListener(
    "click",
    () => {
      picker.remove();
    }
  );

  header.append(
    title,
    close
  );

  const search =
    document.createElement(
      "input"
    );

  search.type =
    "search";

  search.className =
    "notion-builder-add-field-search";

  search.placeholder =
    "Search properties";

  search.value =
    query;

  search.addEventListener(
    "input",
    () => {
      renderNotionBuilderAddFieldPicker(
        search.value
      );

      const next =
        container.querySelector(
          ".notion-builder-add-field-search"
        );

      if (next) {
        next.focus();

        next.setSelectionRange(
          next.value.length,
          next.value.length
        );
      }
    }
  );

  const list =
    document.createElement(
      "div"
    );

  list.className =
    "notion-builder-add-field-list";

  if (!properties.length) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "notion-builder-add-field-empty";

    empty.textContent =
      normalizedQuery
        ? "No matching properties."
        : "All available fields have been added.";

    list.append(
      empty
    );
  }

  for (
    const property of
      properties
  ) {
    const supported =
      notionBuilderPropertyCanBeAdded(
        property
      );

    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "notion-builder-property-option";

    button.disabled =
      !supported;

    const copy =
      document.createElement(
        "span"
      );

    copy.className =
      "notion-builder-property-copy";

    const name =
      document.createElement(
        "strong"
      );

    name.textContent =
      property.name ||
      "Untitled property";

    const type =
      document.createElement(
        "small"
      );

    type.textContent =
      notionBuilderPropertyTypeLabel(
        property.type
      );

    copy.append(
      name,
      type
    );

    const action =
      document.createElement(
        "span"
      );

    action.className =
      "notion-builder-property-action";

    action.textContent =
      supported
        ? "+"
        : "Not supported yet";

    button.append(
      copy,
      action
    );

    if (supported) {
      button.addEventListener(
        "click",
        async () => {
          const currentQuery =
            search.value;

          if (
            !Array.isArray(
              draft.configuredFields
            )
          ) {
            draft.configuredFields =
              [];
          }

          draft.configuredFields.push(
            notionBuilderConfiguredField(
              property
            )
          );

          await persistNotionPresetBuilderState(
            "config"
          );

          renderNotionBuilderConfiguredFields();

          renderNotionBuilderAddFieldPicker(
            currentQuery
          );
        }
      );
    }

    list.append(
      button
    );
  }

  picker.append(
    header,
    search,
    list
  );

  container.append(
    picker
  );

  search.focus();
}

async function loadNotionPresetConfigFields() {
  const draft =
    notionPresetBuilderDraft;

  const fields =
    document.getElementById(
      "notionBuilderPresetFields"
    );

  const create =
    document.getElementById(
      "notionBuilderCreatePreset"
    );

  if (
    !draft?.destination ||
    !draft?.workspace ||
    !fields ||
    !create
  ) {
    return;
  }

  fields.replaceChildren();

  create.disabled =
    true;

  if (
    draft.destination.type ===
      "page"
  ) {
    const property = {
      id:
        "__clipnest_page_title__",

      name:
        "Title",

      type:
        "title",

      options:
        []
    };

    draft.schema =
      null;

    draft.properties = [
      property
    ];

    draft.configuredFields = [
      notionBuilderConfiguredField(
        property,
        "Page Title"
      )
    ];

    renderNotionBuilderConfiguredFields();

    return;
  }

  const parentPageId =
    String(
      draft.destination.parentId ||
      draft.destination.parentPageId ||
      ""
    ).trim();

  if (!parentPageId) {
    fields.innerHTML =
      '<div class="notion-builder-placeholder notion-builder-error">Database parent page is missing.</div>';

    return;
  }

  fields.innerHTML =
    '<div class="notion-builder-placeholder">Loading database fields…</div>';

  try {
    const schema =
      await ClipNestNotionSession
        .getDatabaseSchema({
          workspaceId:
            draft.workspace.id,

          userId:
            draft.userId,

          collectionId:
            draft.destination.id,

          parentPageId
        });

    const properties =
      Array.isArray(
        schema?.properties
      )
        ? schema.properties
        : [];

    draft.schema =
      schema;

    draft.properties =
      properties;

    const title =
      properties.find(
        (property) =>
          property.type ===
          "title"
      );

    if (!title) {
      throw new Error(
        "This database has no Title property."
      );
    }

    const configured = [
      notionBuilderConfiguredField(
        title,
        "Page Title"
      )
    ];

    const url =
      properties.find(
        (property) =>
          property.type ===
          "url"
      );

    if (url) {
      configured.push(
        notionBuilderConfiguredField(
          url,
          "Page URL"
        )
      );
    }

    const author =
      properties.find(
        (property) =>
          notionBuilderIsAuthorProperty(
            property
          )
      );

    if (author) {
      configured.push(
        notionBuilderConfiguredField(
          author,
          "Page author"
        )
      );
    }

    const tags =
      properties.find(
        (property) =>
          property.type ===
            "multi_select" &&
          String(
            property.name ||
            ""
          )
            .trim()
            .toLowerCase() ===
            "tags"
      );

    if (tags) {
      configured.push(
        notionBuilderConfiguredField(
          tags,
          "Tags"
        )
      );
    }

    draft.configuredFields =
      configured;

    renderNotionBuilderConfiguredFields();
  } catch (error) {
    fields.replaceChildren();

    const failed =
      document.createElement(
        "div"
      );

    failed.className =
      "notion-builder-placeholder notion-builder-error";

    failed.textContent =
      error?.message ||
      String(error);

    fields.append(
      failed
    );

    create.disabled =
      true;
  }
}

function renderNotionPresetConfigScreen(
  {
    restore =
      false
  } = {}
) {
  const draft =
    notionPresetBuilderDraft;

  if (
    !draft?.workspace ||
    !draft?.destination
  ) {
    return;
  }

  const screen =
    ensureNotionPresetConfigScreen();

  const nameInput =
    document.getElementById(
      "notionBuilderPresetName"
    );

  const location =
    document.getElementById(
      "notionBuilderSaveLocation"
    );

  const fields =
    document.getElementById(
      "notionBuilderPresetFields"
    );

  const create =
    document.getElementById(
      "notionBuilderCreatePreset"
    );

  const configTitle =
    document.getElementById(
      "notionBuilderConfigTitle"
    );

  const remove =
    document.getElementById(
      "notionBuilderDeletePreset"
    );

  const isEdit =
    draft.mode ===
      "edit" &&
    Boolean(
      draft.editingPresetId
    );

  if (
    !nameInput ||
    !location ||
    !fields ||
    !create
  ) {
    return;
  }

  if (configTitle) {
    configTitle.textContent =
      isEdit
        ? "Edit preset"
        : "Create preset";
  }

  create.textContent =
    isEdit
      ? "Save changes"
      : "Create preset";

  if (remove) {
    remove.classList.toggle(
      "hidden",
      !isEdit
    );

    remove.disabled =
      false;

    delete remove.dataset.confirm;

    remove.textContent =
      "Delete preset";

    remove.classList.remove(
      "confirming"
    );
  }

  location.disabled =
    isEdit;

  nameInput.value =
    draft.presetName ||
    draft.destination.name ||
    "New preset";

  draft.presetName =
    nameInput.value;

  draft.presetIcon =
    String(
      draft.presetIcon ||
      ""
    ).trim();

  updateNotionBuilderIconButton();

  location.replaceChildren();

  const icon =
    document.createElement(
      "span"
    );

  icon.className =
    "notion-builder-result-icon";

  fillNotionBuilderDestinationIcon(
    icon,
    draft.destination
  );

  const copy =
    document.createElement(
      "span"
    );

  copy.className =
    "notion-builder-save-location-copy";

  const destinationName =
    document.createElement(
      "strong"
    );

  destinationName.textContent =
    draft.destination.name ||
    "Untitled";

  const meta =
    document.createElement(
      "small"
    );

  meta.textContent =
    `${draft.workspace.name || "Notion"} · ${
      draft.destination.type ===
        "collection"
        ? "Database"
        : "Page"
    }`;

  copy.append(
    destinationName,
    meta
  );

  const arrow =
    document.createElement(
      "span"
    );

  arrow.className =
    "notion-builder-save-location-arrow";

  arrow.textContent =
    "›";

  location.append(
    icon,
    copy,
    arrow
  );

  fields.replaceChildren();

  create.disabled =
    true;

  document
    .getElementById(
      "notionDestinationPicker"
    )
    ?.classList.add(
      "hidden"
    );

  notionPresetChooserEl
    ?.classList.add(
      "hidden"
    );

  notionClipHeaderEl
    ?.classList.add(
      "hidden"
    );

  setNotionClipRangeHidden(
    true
  );

  notionDynamicFieldsHost
    ?.classList.add(
      "hidden"
    );

  screen.classList.remove(
    "hidden"
  );

  if (
    restore &&
    Array.isArray(
      draft.configuredFields
    ) &&
    draft.configuredFields.length &&
    Array.isArray(
      draft.properties
    ) &&
    draft.properties.length
  ) {
    renderNotionBuilderConfiguredFields();

    void persistNotionPresetBuilderState(
      "config"
    );
  } else {
    void loadNotionPresetConfigFields();
  }

  nameInput.focus();

  if (!restore) {
    nameInput.select();
  }
}

function ensureNotionDestinationPicker() {
  let picker =
    document.getElementById(
      "notionDestinationPicker"
    );

  if (picker) {
    return picker;
  }

  picker =
    createNotionDestinationPicker();

  if (notionPresetChooserEl) {
    notionPresetChooserEl.after(
      picker
    );
  }

  return picker;
}

function showNotionDestinationPicker(
  savedState =
    null,
  {
    reload = true
  } = {}
) {
  if (
    state.destination !==
      "notion"
  ) {
    return;
  }

  const picker =
    ensureNotionDestinationPicker();

  notionPresetChooserEl?.classList.add(
    "hidden"
  );

  notionClipHeaderEl?.classList.add(
    "hidden"
  );

  document
    .getElementById(
      "notionPresetConfigScreen"
    )
    ?.classList.add(
      "hidden"
    );

  setNotionClipRangeHidden(
    true
  );

  notionDynamicFieldsHost?.classList.add(
    "hidden"
  );

  picker.classList.remove(
    "hidden"
  );

  if (reload) {
    void loadNotionDestinationPicker(
      savedState
    );
  }
}

async function showNotionPresetChooser() {
  if (
    state.destination !==
      "notion"
  ) {
    return;
  }

  if (
    !(await ensureNotionConnectionForPopup())
  ) {
    return;
  }

  notionClipHeaderEl?.classList.add(
    "hidden"
  );

  setNotionClipRangeHidden(
    true
  );

  notionDynamicFieldsHost?.classList.add(
    "hidden"
  );

  document
    .getElementById(
      "notionDestinationPicker"
    )
    ?.classList.add(
      "hidden"
    );

  notionPresetChooserEl?.classList.remove(
    "hidden"
  );

  await renderNotionPresetChooser();
}

function ensureNotionDynamicFieldsHost() {
  if (
    notionDynamicFieldsHost
  ) {
    return true;
  }

  notionTitleFieldNode =
    els.titleInput?.closest(
      ".field"
    ) ||
    null;

  notionTagsFieldNode =
    els.tagsField ||
    els.tagsInput?.closest(
      ".field"
    ) ||
    null;

  if (
    !notionTitleFieldNode ||
    !notionTagsFieldNode
  ) {
    console.warn(
      "ClipNest could not locate the shared Title/Tags fields."
    );

    return false;
  }

  const parent =
    notionTitleFieldNode
      .parentElement;

  if (
    !parent ||
    notionTagsFieldNode
      .parentElement !==
        parent
  ) {
    console.warn(
      "ClipNest expected Title and Tags to share a parent."
    );

    return false;
  }

  notionTitleFieldPlaceholder =
    document.createComment(
      "clipnest-title-field"
    );

  notionTagsFieldPlaceholder =
    document.createComment(
      "clipnest-tags-field"
    );

  parent.insertBefore(
    notionTitleFieldPlaceholder,
    notionTitleFieldNode
  );

  parent.insertBefore(
    notionTagsFieldPlaceholder,
    notionTagsFieldNode
  );

  notionDynamicFieldsHost =
    document.createElement(
      "div"
    );

  notionDynamicFieldsHost.id =
    "notionDynamicFields";

  notionDynamicFieldsHost.className =
    "notion-dynamic-fields hidden";

  parent.insertBefore(
    notionDynamicFieldsHost,
    notionTitleFieldNode
  );

  return true;
}

function setSharedFieldLabel(
  fieldNode,
  label
) {
  if (!fieldNode) {
    return;
  }

  const labelNode =
    fieldNode.querySelector(
      ":scope > span"
    );

  if (labelNode) {
    labelNode.textContent =
      label;
  }
}

function restoreSharedPresetFields() {
  if (
    !notionDynamicFieldsHost
  ) {
    return;
  }

  notionTitleFieldNode
    ?.classList.remove(
      "notion-dynamic-field-hidden"
    );

  notionTagsFieldNode
    ?.classList.remove(
      "notion-dynamic-field-hidden"
    );

  setSharedFieldLabel(
    notionTitleFieldNode,
    "Title"
  );

  setSharedFieldLabel(
    notionTagsFieldNode,
    "Tags"
  );

  if (
    notionTitleFieldPlaceholder
      ?.parentNode &&
    notionTitleFieldNode
  ) {
    notionTitleFieldPlaceholder
      .parentNode
      .insertBefore(
        notionTitleFieldNode,
        notionTitleFieldPlaceholder
          .nextSibling
      );
  }

  if (
    notionTagsFieldPlaceholder
      ?.parentNode &&
    notionTagsFieldNode
  ) {
    notionTagsFieldPlaceholder
      .parentNode
      .insertBefore(
        notionTagsFieldNode,
        notionTagsFieldPlaceholder
          .nextSibling
      );
  }

  notionDynamicFieldsHost
    .replaceChildren();

  notionDynamicFieldsHost
    .classList.add(
      "hidden"
    );
}

function getNotionPresetFieldNode(
  preset,
  field
) {
  const propertyId =
    String(
      field?.propertyId ||
      ""
    ).trim();

  const propertyType =
    String(
      field?.propertyType ||
      ""
    ).trim();

  const titlePropertyId =
    String(
      preset?.propertyIds
        ?.title ||
      ""
    ).trim();

  const tagsPropertyId =
    String(
      preset?.propertyIds
        ?.tags ||
      ""
    ).trim();

  if (
    propertyId &&
    titlePropertyId &&
    propertyId ===
      titlePropertyId
  ) {
    return {
      node:
        notionTitleFieldNode,

      fallbackLabel:
        "Title"
    };
  }

  if (
    propertyType ===
      "title" &&
    !titlePropertyId
  ) {
    return {
      node:
        notionTitleFieldNode,

      fallbackLabel:
        "Title"
    };
  }

  if (
    propertyId &&
    tagsPropertyId &&
    propertyId ===
      tagsPropertyId
  ) {
    return {
      node:
        notionTagsFieldNode,

      fallbackLabel:
        "Tags"
    };
  }

  return null;
}

function notionPresetOptionLabel(
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

function positionNotionPopupMenu(
  control,
  anchor,
  menu
) {
  const list =
    menu.querySelector(
      ".notion-custom-select-list, " +
      ".notion-custom-multiselect-list"
    );

  if (!list) {
    return;
  }

  const gap =
    4;

  const edgePadding =
    8;

  const maxListHeight =
    156;

  const minListHeight =
    64;

  control.classList.remove(
    "open-up"
  );

  list.style.removeProperty(
    "max-height"
  );

  const rect =
    anchor.getBoundingClientRect();

  const spaceBelow =
    Math.max(
      0,
      window.innerHeight -
        rect.bottom -
        gap -
        edgePadding
    );

  const spaceAbove =
    Math.max(
      0,
      rect.top -
        gap -
        edgePadding
    );

  const menuChromeHeight =
    Math.max(
      0,
      menu.offsetHeight -
        list.offsetHeight
    );

  const naturalListHeight =
    Math.min(
      list.scrollHeight ||
        maxListHeight,
      maxListHeight
    );

  const desiredMenuHeight =
    menuChromeHeight +
    naturalListHeight;

  const openUp =
    spaceBelow <
      desiredMenuHeight &&
    spaceAbove >
      spaceBelow;

  control.classList.toggle(
    "open-up",
    openUp
  );

  const availableHeight =
    openUp
      ? spaceAbove
      : spaceBelow;

  const availableListHeight =
    Math.max(
      minListHeight,
      Math.min(
        maxListHeight,
        availableHeight -
          menuChromeHeight
      )
    );

  list.style.setProperty(
    "max-height",
    `${availableListHeight}px`,
    "important"
  );
}

function createNotionChoiceControl(
  field,
  propertyId,
  allowCreate
) {
  const memoryStorageKey =
    "clipnestNotionFieldMemoryV1";

  const memoryKey =
    `${String(
      notionOpenPresetId ||
      ""
    )}::${String(
      propertyId ||
      ""
    )}`;

  const control =
    document.createElement(
      "div"
    );

  control.className =
    "notion-custom-select";

  const trigger =
    document.createElement(
      "button"
    );

  trigger.type =
    "button";

  trigger.className =
    "notion-custom-select-trigger";

  trigger.setAttribute(
    "aria-expanded",
    "false"
  );

  const selectedLabel =
    document.createElement(
      "span"
    );

  selectedLabel.className =
    "notion-custom-select-value";

  const chevron =
    document.createElement(
      "span"
    );

  chevron.className =
    "notion-custom-select-chevron";

  chevron.textContent =
    "⌄";

  trigger.append(
    selectedLabel,
    chevron
  );

  const menu =
    document.createElement(
      "div"
    );

  menu.className =
    "notion-custom-select-menu hidden";

  const search =
    document.createElement(
      "input"
    );

  search.type =
    "search";

  search.autocomplete =
    "off";

  search.spellcheck =
    false;

  search.placeholder =
    allowCreate
      ? "Search or create…"
      : "Search statuses…";

  search.className =
    "notion-custom-select-search";

  const list =
    document.createElement(
      "div"
    );

  list.className =
    "notion-custom-select-list";

  menu.append(
    search,
    list
  );

  control.append(
    trigger,
    menu
  );

  const options =
    (
      Array.isArray(
        field?.options
      )
        ? field.options
        : []
    )
      .map(
        (option) => ({
          value:
            notionPresetOptionLabel(
              option
            ),

          color:
            String(
              option?.color ||
              ""
            ).trim()
        })
      )
      .filter(
        (option) =>
          option.value
      );

  let selected =
    String(
      field?.defaultValue ??
      ""
    ).trim();

  let touched =
    false;

  async function persistRememberedValue(
    value
  ) {
    if (
      !notionOpenPresetId ||
      !propertyId
    ) {
      return;
    }

    try {
      const stored =
        await chrome.storage.local.get(
          memoryStorageKey
        );

      const current =
        stored[
          memoryStorageKey
        ] &&
        typeof stored[
          memoryStorageKey
        ] === "object" &&
        !Array.isArray(
          stored[
            memoryStorageKey
          ]
        )
          ? stored[
              memoryStorageKey
            ]
          : {};

      await chrome.storage.local.set({
        [memoryStorageKey]: {
          ...current,

          [memoryKey]:
            String(
              value ??
              ""
            )
        }
      });
    } catch (error) {
      console.warn(
        "ClipNest could not remember Notion field value:",
        error
      );
    }
  }

  async function restoreRememberedValue() {
    if (
      !notionOpenPresetId ||
      !propertyId
    ) {
      return;
    }

    try {
      const stored =
        await chrome.storage.local.get(
          memoryStorageKey
        );

      const memory =
        stored[
          memoryStorageKey
        ];

      if (
        touched ||
        !memory ||
        typeof memory !==
          "object" ||
        !Object.prototype
          .hasOwnProperty.call(
            memory,
            memoryKey
          )
      ) {
        return;
      }

      const remembered =
        String(
          memory[
            memoryKey
          ] ??
          ""
        ).trim();

      const valid =
        !remembered ||
        options.some(
          (option) =>
            option.value
              .toLowerCase() ===
            remembered.toLowerCase()
        );

      if (!valid) {
        return;
      }

      selected =
        remembered;

      notionDynamicFieldValues[
        propertyId
      ] =
        selected;

      updateTrigger();
    } catch (error) {
      console.warn(
        "ClipNest could not restore Notion field value:",
        error
      );
    }
  }

  function closeMenu() {
    menu.classList.add(
      "hidden"
    );

    control.classList.remove(
      "open-up"
    );

    trigger.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  function updateTrigger() {
    selectedLabel.textContent =
      selected ||
      "None";

    trigger.classList.toggle(
      "has-value",
      Boolean(
        selected
      )
    );
  }

  function chooseValue(
    value
  ) {
    touched =
      true;

    selected =
      String(
        value ||
        ""
      ).trim();

    notionDynamicFieldValues[
      propertyId
    ] =
      selected;

    updateTrigger();
    closeMenu();

    void persistRememberedValue(
      selected
    );
  }

  function makeOptionButton({
    value,
    color = "",
    create = false
  }) {
    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      create
        ? "notion-custom-select-option create"
        : "notion-custom-select-option";

    if (
      !create &&
      value === selected
    ) {
      button.classList.add(
        "selected"
      );
    }

    if (
      !create &&
      color
    ) {
      const dot =
        document.createElement(
          "span"
        );

      dot.className =
        "notion-custom-select-dot";

      dot.dataset.color =
        color;

      button.append(
        dot
      );
    }

    const copy =
      document.createElement(
        "span"
      );

    copy.textContent =
      create
        ? `+ Create "${value}"`
        : (
            value ||
            "None"
          );

    button.append(
      copy
    );

    button.addEventListener(
      "click",
      () => {
        chooseValue(
          value
        );
      }
    );

    return button;
  }

  function renderOptions() {
    list.replaceChildren();

    const query =
      search.value
        .trim();

    const normalized =
      query.toLowerCase();

    if (!normalized) {
      list.append(
        makeOptionButton({
          value:
            ""
        })
      );
    }

    const matching =
      options.filter(
        (option) =>
          !normalized ||
          option.value
            .toLowerCase()
            .includes(
              normalized
            )
      );

    for (
      const option of
        matching
    ) {
      list.append(
        makeOptionButton(
          option
        )
      );
    }

    const exact =
      options.some(
        (option) =>
          option.value
            .toLowerCase() ===
          normalized
      );

    if (
      allowCreate &&
      query &&
      !exact
    ) {
      list.append(
        makeOptionButton({
          value:
            query,

          create:
            true
        })
      );
    }

    if (
      normalized &&
      !matching.length &&
      (
        !allowCreate ||
        exact
      )
    ) {
      const empty =
        document.createElement(
          "div"
        );

      empty.className =
        "notion-custom-select-empty";

      empty.textContent =
        "No matches";

      list.append(
        empty
      );
    }
  }

  trigger.addEventListener(
    "click",
    () => {
      const opening =
        menu.classList.contains(
          "hidden"
        );

      if (!opening) {
        closeMenu();
        return;
      }

      search.value =
        "";

      renderOptions();

      menu.classList.remove(
        "hidden"
      );

      positionNotionPopupMenu(
        control,
        trigger,
        menu
      );

      trigger.setAttribute(
        "aria-expanded",
        "true"
      );

      search.focus();
    }
  );

  search.addEventListener(
    "input",
    renderOptions
  );

  search.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
          "Escape"
      ) {
        event.preventDefault();
        closeMenu();
        trigger.focus();
        return;
      }

      if (
        event.key !==
          "Enter"
      ) {
        return;
      }

      event.preventDefault();

      const query =
        search.value
          .trim();

      if (!query) {
        chooseValue(
          ""
        );

        return;
      }

      const exact =
        options.find(
          (option) =>
            option.value
              .toLowerCase() ===
            query.toLowerCase()
        );

      if (exact) {
        chooseValue(
          exact.value
        );

        return;
      }

      if (allowCreate) {
        chooseValue(
          query
        );
      }
    }
  );

  control.addEventListener(
    "focusout",
    () => {
      setTimeout(
        () => {
          if (
            !control.contains(
              document.activeElement
            )
          ) {
            closeMenu();
          }
        },
        0
      );
    }
  );

  notionDynamicFieldValues[
    propertyId
  ] =
    selected;

  updateTrigger();

  void restoreRememberedValue();

  return control;
}

function createNotionSelectControl(
  field,
  propertyId
) {
  return createNotionChoiceControl(
    field,
    propertyId,
    true
  );
}

function createNotionStatusControl(
  field,
  propertyId
) {
  return createNotionChoiceControl(
    field,
    propertyId,
    false
  );
}

function createNotionDateControl(
  field,
  propertyId
) {
  const control =
    document.createElement(
      "div"
    );

  control.className =
    "notion-custom-date";

  const trigger =
    document.createElement(
      "button"
    );

  trigger.type =
    "button";

  trigger.className =
    "notion-custom-date-trigger";

  trigger.setAttribute(
    "aria-expanded",
    "false"
  );

  const valueLabel =
    document.createElement(
      "span"
    );

  valueLabel.className =
    "notion-custom-date-value";

  const icon =
    document.createElement(
      "span"
    );

  icon.className =
    "notion-custom-date-icon";

  trigger.append(
    valueLabel,
    icon
  );

  const menu =
    document.createElement(
      "div"
    );

  menu.className =
    "notion-custom-date-menu hidden";

  const header =
    document.createElement(
      "div"
    );

  header.className =
    "notion-custom-date-header";

  const previous =
    document.createElement(
      "button"
    );

  previous.type =
    "button";

  previous.className =
    "notion-custom-date-nav";

  previous.textContent =
    "‹";

  const monthLabel =
    document.createElement(
      "strong"
    );

  monthLabel.className =
    "notion-custom-date-month";

  const next =
    document.createElement(
      "button"
    );

  next.type =
    "button";

  next.className =
    "notion-custom-date-nav";

  next.textContent =
    "›";

  header.append(
    previous,
    monthLabel,
    next
  );

  const weekdays =
    document.createElement(
      "div"
    );

  weekdays.className =
    "notion-custom-date-weekdays";

  for (
    const day of [
      "S",
      "M",
      "T",
      "W",
      "T",
      "F",
      "S"
    ]
  ) {
    const item =
      document.createElement(
        "span"
      );

    item.textContent =
      day;

    weekdays.append(
      item
    );
  }

  const grid =
    document.createElement(
      "div"
    );

  grid.className =
    "notion-custom-date-grid";

  const footer =
    document.createElement(
      "div"
    );

  footer.className =
    "notion-custom-date-footer";

  const clear =
    document.createElement(
      "button"
    );

  clear.type =
    "button";

  clear.className =
    "notion-custom-date-footer-button clear";

  clear.textContent =
    "Clear";

  const today =
    document.createElement(
      "button"
    );

  today.type =
    "button";

  today.className =
    "notion-custom-date-footer-button today";

  today.textContent =
    "Today";

  footer.append(
    clear,
    today
  );

  menu.append(
    header,
    weekdays,
    grid,
    footer
  );

  control.append(
    trigger,
    menu
  );

  function pad(
    value
  ) {
    return String(
      value
    ).padStart(
      2,
      "0"
    );
  }

  function formatIso(
    date
  ) {
    return (
      `${date.getFullYear()}-` +
      `${pad(
        date.getMonth() +
        1
      )}-` +
      `${pad(
        date.getDate()
      )}`
    );
  }

  function parseIso(
    value
  ) {
    const match =
      String(
        value ||
        ""
      ).match(
        /^(\d{4})-(\d{2})-(\d{2})$/
      );

    if (!match) {
      return null;
    }

    const year =
      Number(
        match[1]
      );

    const month =
      Number(
        match[2]
      ) - 1;

    const day =
      Number(
        match[3]
      );

    const date =
      new Date(
        year,
        month,
        day
      );

    if (
      date.getFullYear() !==
        year ||
      date.getMonth() !==
        month ||
      date.getDate() !==
        day
    ) {
      return null;
    }

    return date;
  }

  function displayDate(
    value
  ) {
    const date =
      parseIso(
        value
      );

    if (!date) {
      return "mm/dd/yyyy";
    }

    return (
      `${pad(
        date.getMonth() +
        1
      )}/` +
      `${pad(
        date.getDate()
      )}/` +
      `${date.getFullYear()}`
    );
  }

  let selected =
    /^\d{4}-\d{2}-\d{2}$/
      .test(
        String(
          field?.defaultValue ??
          ""
        )
      )
        ? String(
            field.defaultValue
          )
        : "";

  const initialDate =
    parseIso(
      selected
    ) ||
    new Date();

  let viewYear =
    initialDate.getFullYear();

  let viewMonth =
    initialDate.getMonth();

  function updateTrigger() {
    valueLabel.textContent =
      displayDate(
        selected
      );

    trigger.classList.toggle(
      "has-value",
      Boolean(
        selected
      )
    );
  }

  function closeMenu() {
    menu.classList.add(
      "hidden"
    );

    control.classList.remove(
      "open-up"
    );

    trigger.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  function renderCalendar() {
    monthLabel.textContent =
      new Date(
        viewYear,
        viewMonth,
        1
      ).toLocaleDateString(
        undefined,
        {
          month:
            "long",

          year:
            "numeric"
        }
      );

    grid.replaceChildren();

    const firstDay =
      new Date(
        viewYear,
        viewMonth,
        1
      ).getDay();

    const gridStart =
      new Date(
        viewYear,
        viewMonth,
        1 - firstDay
      );

    const todayIso =
      formatIso(
        new Date()
      );

    for (
      let index = 0;
      index < 42;
      index += 1
    ) {
      const date =
        new Date(
          gridStart.getFullYear(),
          gridStart.getMonth(),
          gridStart.getDate() +
            index
        );

      const iso =
        formatIso(
          date
        );

      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.className =
        "notion-custom-date-day";

      button.textContent =
        String(
          date.getDate()
        );

      button.classList.toggle(
        "outside",
        date.getMonth() !==
          viewMonth
      );

      button.classList.toggle(
        "today",
        iso ===
          todayIso
      );

      button.classList.toggle(
        "selected",
        iso ===
          selected
      );

      button.addEventListener(
        "click",
        () => {
          selected =
            iso;

          notionDynamicFieldValues[
            propertyId
          ] =
            selected;

          updateTrigger();
          closeMenu();
          trigger.focus();
        }
      );

      grid.append(
        button
      );
    }
  }

  function openMenu() {
    renderCalendar();

    control.classList.remove(
      "open-up"
    );

    menu.classList.remove(
      "hidden"
    );

    trigger.setAttribute(
      "aria-expanded",
      "true"
    );

    const rect =
      trigger.getBoundingClientRect();

    if (
      rect.bottom +
        330 >
      window.innerHeight &&
      rect.top >
        330
    ) {
      control.classList.add(
        "open-up"
      );
    }
  }

  trigger.addEventListener(
    "click",
    () => {
      if (
        menu.classList.contains(
          "hidden"
        )
      ) {
        openMenu();
      } else {
        closeMenu();
      }
    }
  );

  previous.addEventListener(
    "click",
    () => {
      viewMonth -=
        1;

      if (
        viewMonth <
          0
      ) {
        viewMonth =
          11;

        viewYear -=
          1;
      }

      renderCalendar();
    }
  );

  next.addEventListener(
    "click",
    () => {
      viewMonth +=
        1;

      if (
        viewMonth >
          11
      ) {
        viewMonth =
          0;

        viewYear +=
          1;
      }

      renderCalendar();
    }
  );

  clear.addEventListener(
    "click",
    () => {
      selected =
        "";

      notionDynamicFieldValues[
        propertyId
      ] =
        "";

      updateTrigger();
      closeMenu();
      trigger.focus();
    }
  );

  today.addEventListener(
    "click",
    () => {
      selected =
        formatIso(
          new Date()
        );

      notionDynamicFieldValues[
        propertyId
      ] =
        selected;

      const current =
        parseIso(
          selected
        );

      viewYear =
        current.getFullYear();

      viewMonth =
        current.getMonth();

      updateTrigger();
      closeMenu();
      trigger.focus();
    }
  );

  control.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
          "Escape"
      ) {
        closeMenu();
        trigger.focus();
      }
    }
  );

  control.addEventListener(
    "focusout",
    () => {
      setTimeout(
        () => {
          if (
            !control.contains(
              document.activeElement
            )
          ) {
            closeMenu();
          }
        },
        0
      );
    }
  );

  notionDynamicFieldValues[
    propertyId
  ] =
    selected;

  updateTrigger();

  return control;
}

function createNotionMultiSelectControl(
  field,
  propertyId
) {
  const control =
    document.createElement(
      "div"
    );

  control.className =
    "notion-custom-multiselect";

  const editor =
    document.createElement(
      "div"
    );

  editor.className =
    "notion-custom-multiselect-editor";

  const chips =
    document.createElement(
      "div"
    );

  chips.className =
    "notion-custom-multiselect-chips";

  const input =
    document.createElement(
      "input"
    );

  input.type =
    "text";

  input.autocomplete =
    "off";

  input.spellcheck =
    false;

  input.placeholder =
    "Add values…";

  input.className =
    "notion-custom-multiselect-input";

  const menu =
    document.createElement(
      "div"
    );

  menu.className =
    "notion-custom-multiselect-menu hidden";

  const list =
    document.createElement(
      "div"
    );

  list.className =
    "notion-custom-multiselect-list";

  menu.append(
    list
  );

  editor.append(
    chips,
    input
  );

  control.append(
    editor,
    menu
  );

  const options =
    (
      Array.isArray(
        field?.options
      )
        ? field.options
        : []
    )
      .map(
        (option) => ({
          value:
            notionPresetOptionLabel(
              option
            ),

          color:
            String(
              option?.color ||
              ""
            ).trim()
        })
      )
      .filter(
        (option) =>
          option.value
      );

  let selected =
    Array.isArray(
      field?.defaultValue
    )
      ? field.defaultValue
          .map(
            (value) =>
              String(
                value ||
                ""
              ).trim()
          )
          .filter(Boolean)
      : [];

  function normalize(
    value
  ) {
    return String(
      value ||
      ""
    )
      .trim()
      .toLowerCase();
  }

  function syncValue() {
    notionDynamicFieldValues[
      propertyId
    ] =
      [
        ...selected
      ];
  }

  function optionForValue(
    value
  ) {
    return options.find(
      (option) =>
        normalize(
          option.value
        ) ===
        normalize(
          value
        )
    ) ||
    null;
  }

  function closeMenu() {
    menu.classList.add(
      "hidden"
    );

    control.classList.remove(
      "open-up"
    );
  }

  function openMenu() {
    renderMenu();

    menu.classList.remove(
      "hidden"
    );

    positionNotionPopupMenu(
      control,
      editor,
      menu
    );
  }

  function addValue(
    rawValue
  ) {
    const value =
      String(
        rawValue ||
        ""
      ).trim();

    if (!value) {
      return;
    }

    if (
      selected.some(
        (candidate) =>
          normalize(
            candidate
          ) ===
          normalize(
            value
          )
      )
    ) {
      input.value =
        "";

      renderMenu();
      return;
    }


    selected.push(
      value
    );

    input.value =
      "";

    syncValue();
    renderChips();
    renderMenu();


    input.focus();
  }

  function removeValue(
    value
  ) {

    selected =
      selected.filter(
        (candidate) =>
          normalize(
            candidate
          ) !==
          normalize(
            value
          )
      );

    syncValue();
    renderChips();
    renderMenu();

  }

  function renderChips() {
    chips.replaceChildren();

    for (
      const value of
        selected
    ) {
      const option =
        optionForValue(
          value
        );

      const chip =
        document.createElement(
          "span"
        );

      chip.className =
        "notion-custom-multiselect-chip";

      if (
        option?.color
      ) {
        chip.dataset.color =
          option.color;
      }

      const copy =
        document.createElement(
          "span"
        );

      copy.textContent =
        value;

      const remove =
        document.createElement(
          "button"
        );

      remove.type =
        "button";

      remove.className =
        "notion-custom-multiselect-remove";

      remove.textContent =
        "×";

      remove.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();

          removeValue(
            value
          );

          input.focus();
        }
      );

      chip.append(
        copy,
        remove
      );

      chips.append(
        chip
      );
    }

    input.placeholder =
      selected.length
        ? ""
        : "Add values…";
  }

  function renderMenu() {
    list.replaceChildren();

    const query =
      input.value
        .trim();

    const normalizedQuery =
      normalize(
        query
      );

    const selectedKeys =
      new Set(
        selected.map(
          normalize
        )
      );

    const matching =
      options.filter(
        (option) =>
          !selectedKeys.has(
            normalize(
              option.value
            )
          ) &&
          (
            !normalizedQuery ||
            normalize(
              option.value
            ).includes(
              normalizedQuery
            )
          )
      );

    for (
      const option of
        matching
    ) {
      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.className =
        "notion-custom-multiselect-option";

      if (
        option.color
      ) {
        const dot =
          document.createElement(
            "span"
          );

        dot.className =
          "notion-custom-select-dot";

        dot.dataset.color =
          option.color;

        button.append(
          dot
        );
      }

      const copy =
        document.createElement(
          "span"
        );

      copy.textContent =
        option.value;

      button.append(
        copy
      );

      button.addEventListener(
        "click",
        () => {
          addValue(
            option.value
          );
        }
      );

      list.append(
        button
      );
    }

    const exact =
      options.some(
        (option) =>
          normalize(
            option.value
          ) ===
          normalizedQuery
      ) ||
      selectedKeys.has(
        normalizedQuery
      );

    if (
      query &&
      !exact
    ) {
      const create =
        document.createElement(
          "button"
        );

      create.type =
        "button";

      create.className =
        "notion-custom-multiselect-option create";

      create.textContent =
        `+ Create "${query}"`;

      create.addEventListener(
        "click",
        () => {
          addValue(
            query
          );
        }
      );

      list.append(
        create
      );
    }

    if (
      !matching.length &&
      (
        !query ||
        exact
      )
    ) {
      const empty =
        document.createElement(
          "div"
        );

      empty.className =
        "notion-custom-multiselect-empty";

      empty.textContent =
        selected.length
          ? "No more options"
          : "No options";

      list.append(
        empty
      );
    }
  }

  editor.addEventListener(
    "click",
    () => {
      input.focus();
      openMenu();
    }
  );

  input.addEventListener(
    "focus",
    openMenu
  );

  input.addEventListener(
    "input",
    openMenu
  );

  input.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
          "Escape"
      ) {
        closeMenu();
        return;
      }

      if (
        event.key ===
          "Backspace" &&
        !input.value &&
        selected.length
      ) {
        removeValue(
          selected[
            selected.length - 1
          ]
        );

        return;
      }

      if (
        event.key !==
          "Enter"
      ) {
        return;
      }

      event.preventDefault();

      const query =
        input.value
          .trim();

      if (!query) {
        return;
      }

      const exact =
        options.find(
          (option) =>
            normalize(
              option.value
            ) ===
            normalize(
              query
            )
        );

      addValue(
        exact
          ? exact.value
          : query
      );
    }
  );

  control.addEventListener(
    "focusout",
    () => {
      setTimeout(
        () => {
          if (
            !control.contains(
              document.activeElement
            )
          ) {
            closeMenu();
          }
        },
        0
      );
    }
  );

  syncValue();
  renderChips();


  return control;
}

function createNotionCustomFieldNode(
  field
) {
  const type =
    String(
      field?.propertyType ||
      ""
    );

  const propertyId =
    String(
      field?.propertyId ||
      ""
    );

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.className =
    "field notion-custom-field";

  wrapper.dataset.propertyId =
    propertyId;

  const label =
    document.createElement(
      "span"
    );

  label.textContent =
    String(
      field?.label ||
      field?.propertyName ||
      "Field"
    );

  wrapper.append(
    label
  );

  if (
    type === "multi_select"
  ) {
    const control =
      createNotionMultiSelectControl(
        field,
        propertyId
      );

    wrapper.append(
      control
    );

    return wrapper;
  }

  if (
    type === "select"
  ) {
    const control =
      createNotionSelectControl(
        field,
        propertyId
      );

    wrapper.append(
      control
    );

    return wrapper;
  }

  if (
    type === "status"
  ) {
    const control =
      createNotionStatusControl(
        field,
        propertyId
      );

    wrapper.append(
      control
    );

    return wrapper;
  }

  if (
    type === "file" ||
    type === "files"
  ) {
    const detected =
      String(
        state.capture?.image ||
        ""
      ).trim();

    const stored =
      String(
        field?.defaultValue ??
        ""
      ).trim();

    const initial =
      field?.source ===
        "page_image"
        ? detected ||
          stored
        : stored;

    const picker =
      globalThis
        .ClipNestNotionImagePicker
        ?.create({
          detectedImage:
            detected,

          initialValue:
            initial,

          onChange:
            (value) => {
              notionDynamicFieldValues[
                propertyId
              ] =
                value;
            }
        });

    if (!picker) {
      return null;
    }

    wrapper.append(
      picker
    );

    return wrapper;
  }

  if (
    type === "checkbox"
  ) {
    const control =
      document.createElement(
        "label"
      );

    control.className =
      "notion-custom-checkbox-control";

    const input =
      document.createElement(
        "input"
      );

    input.type =
      "checkbox";

    input.checked =
      field?.defaultValue ===
        true ||
      String(
        field?.defaultValue ??
        ""
      )
        .trim()
        .toLowerCase() ===
        "true" ||
      String(
        field?.defaultValue ??
        ""
      )
        .trim()
        .toLowerCase() ===
        "yes";

    const copy =
      document.createElement(
        "span"
      );

    copy.textContent =
      "Checked";

    notionDynamicFieldValues[
      propertyId
    ] =
      input.checked;

    input.addEventListener(
      "change",
      () => {
        notionDynamicFieldValues[
          propertyId
        ] =
          input.checked;
      }
    );

    control.append(
      input,
      copy
    );

    wrapper.append(
      control
    );

    return wrapper;
  }

  if (
    type === "number"
  ) {
    const input =
      document.createElement(
        "input"
      );

    input.type =
      "number";

    input.step =
      "any";

    input.inputMode =
      "decimal";

    input.autocomplete =
      "off";

    input.value =
      String(
        field?.defaultValue ??
        ""
      );

    notionDynamicFieldValues[
      propertyId
    ] =
      input.value;

    input.addEventListener(
      "input",
      () => {
        notionDynamicFieldValues[
          propertyId
        ] =
          input.value;
      }
    );

    wrapper.append(
      input
    );

    return wrapper;
  }

  if (
    type === "date"
  ) {
    const control =
      createNotionDateControl(
        field,
        propertyId
      );

    wrapper.append(
      control
    );

    return wrapper;
  }

  if (
    type === "text" ||
    type === "rich_text"
  ) {
    const input =
      document.createElement(
        "input"
      );

    input.type =
      "text";

    input.autocomplete =
      "off";

    const usePageAuthor =
      field?.source ===
        "page_author" ||
      (
        field?.source !==
          "fixed" &&
        notionBuilderIsAuthorProperty(
          field
        )
      );

    input.value =
      usePageAuthor
        ? String(
            state.capture?.author ||
            field?.defaultValue ||
            ""
          )
        : String(
            field?.defaultValue ??
            ""
          );

    notionDynamicFieldValues[
      propertyId
    ] =
      input.value;

    input.addEventListener(
      "input",
      () => {
        notionDynamicFieldValues[
          propertyId
        ] =
          input.value;
      }
    );

    wrapper.append(
      input
    );

    return wrapper;
  }

  return null;
}

function renderNotionPresetFields(
  preset
) {
  if (
    !ensureNotionDynamicFieldsHost()
  ) {
    return;
  }

  restoreSharedPresetFields();

  notionDynamicFieldValues =
    {};

  notionDynamicFieldsHost
    .classList.remove(
      "hidden"
    );

  notionTitleFieldNode
    ?.classList.add(
      "notion-dynamic-field-hidden"
    );

  notionTagsFieldNode
    ?.classList.add(
      "notion-dynamic-field-hidden"
    );

  if (notionTitleFieldNode) {
    notionDynamicFieldsHost
      .append(
        notionTitleFieldNode
      );
  }

  if (notionTagsFieldNode) {
    notionDynamicFieldsHost
      .append(
        notionTagsFieldNode
      );
  }

  const fields =
    Array.isArray(
      preset?.fields
    )
      ? [
          ...preset.fields
        ]
      : [];

  if (!fields.length) {
    notionTitleFieldNode
      ?.classList.remove(
        "notion-dynamic-field-hidden"
      );

    notionTagsFieldNode
      ?.classList.remove(
        "notion-dynamic-field-hidden"
      );

    setSharedFieldLabel(
      notionTitleFieldNode,
      "Title"
    );

    setSharedFieldLabel(
      notionTagsFieldNode,
      "Tags"
    );

    return;
  }

  fields
    .slice()
    .sort(
      (a, b) =>
        Number(
          a?.order ||
          0
        ) -
        Number(
          b?.order ||
          0
        )
    )
    .forEach(
      (field) => {
        if (
          field?.visible ===
            false
        ) {
          return;
        }

        const match =
          getNotionPresetFieldNode(
            preset,
            field
          );

        if (
          match?.node
        ) {
          match.node
            .classList.remove(
              "notion-dynamic-field-hidden"
            );

          setSharedFieldLabel(
            match.node,
            String(
              field.label ||
              field.propertyName ||
              match.fallbackLabel
            ).trim() ||
            match.fallbackLabel
          );

          notionDynamicFieldsHost
            .append(
              match.node
            );

          return;
        }

        const custom =
          createNotionCustomFieldNode(
            field
          );

        if (custom) {
          notionDynamicFieldsHost
            .append(
              custom
            );
        }
      }
    );
}

function showNotionPresetClip(
  preset
) {
  notionOpenPresetId =
    String(
      preset?.id ||
      ""
    ).trim();

  document.body.classList.add(
    "notion-preset-open"
  );

  notionPresetChooserEl?.classList.add(
    "hidden"
  );

  setNotionClipRangeHidden(
    false
  );

  /*
   * The old preset dropdown remains the
   * internal selection bridge for now,
   * but it is not user-facing.
   */
  notionPresetFieldRoot?.classList.add(
    "notion-navigation-hidden"
  );

  renderNotionPresetFields(
    preset
  );

  notionClipHeaderEl?.classList.remove(
    "hidden"
  );

  const title =
    document.getElementById(
      "notionClipPresetName"
    );

  if (title) {
    title.textContent =
      preset?.name ||
      "Notion preset";
  }

  els.tagsInput?.focus({
    preventScroll:
      true
  });

  els.tagsInput?.blur();
}

async function choosePopupDestination(
  destination
) {
  const normalized =
    destination ===
      "notion"
      ? "notion"
      : "obsidian";

  if (
    normalized ===
      "obsidian" &&
    state.destination ===
      "notion"
  ) {
    const configScreen =
      document.getElementById(
        "notionPresetConfigScreen"
      );

    const destinationPicker =
      document.getElementById(
        "notionDestinationPicker"
      );

    if (
      configScreen &&
      !configScreen.classList
        .contains(
          "hidden"
        )
    ) {
      await persistNotionPresetBuilderState(
        "config"
      );
    } else if (
      destinationPicker &&
      !destinationPicker.classList
        .contains(
          "hidden"
        )
    ) {
      await persistNotionPresetBuilderState(
        "destination"
      );
    }
  }

  await chrome.storage.local.set({
    [LAST_POPUP_DESTINATION_KEY]:
      normalized
  });

  setDestination(
    normalized
  );
}

function setDestination(destination) {
  state.destination =
    destination;

  document.body.dataset.destination =
    destination;

  if (
    destination === "notion" &&
    getContentMode() !== "article"
  ) {
    setContentMode(
      "article"
    );
  }

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
    if (
      !notionPresetBuilderResumePending
    ) {
      void (
        async () => {
          const restored =
            await restoreNotionPresetBuilderState();

          if (!restored) {
            await showNotionPresetChooser();
          }
        }
      )();
    }

    return;
  }

  hideNotionNavigationViews();

  setNotionClipRangeHidden(
    false
  );

  notionPresetFieldRoot?.classList.remove(
    "notion-navigation-hidden"
  );

  restoreSharedPresetFields();

  notionTagOptions =
    [];

  void loadObsidianTags();
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
    value ===
      "__manage__"
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

    notionSelectedTags =
      [];

    els.tagsInput.value =
      "";

    renderNotionSelectedTags();

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

async function saveObsidianOpenAfterSave() {
  if (!els.obsidianOpenAfterSave) {
    return;
  }

  const enabled =
    els.obsidianOpenAfterSave.checked ===
    true;

  try {
    await chrome.storage.local.set({
      obsidianOpenAfterSave:
        enabled
    });

    await ClipNestVaultStore
      .updateActiveConfig({
        openAfterSave:
          enabled
      });
  } catch (error) {
    els.obsidianOpenAfterSave.checked =
      !enabled;

    setStatus(
      error.message ||
        String(error),
      "error"
    );
  }
}

async function refreshPopupVaultContext() {
  await loadVaultPicker();

  const settings =
    await chrome.storage.local.get([
      "obsidianDefaultTemplatePath",
      "obsidianSubfolder",
      "obsidianOpenAfterSave"
    ]);

  if (els.obsidianOpenAfterSave) {
    els.obsidianOpenAfterSave.checked =
      settings.obsidianOpenAfterSave ===
      true;
  }

  els.tagsInput.value =
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

    /*
     * A webpage selection makes Text mode available,
     * but must never silently replace the user's
     * Article mode.
     */
    refreshUxPass1();

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
      setStatus(
        "Preparing article…"
      );

      state.articleEnhancementPromise =
        enhanceStructuredArticleCapture(
          state.articleEnhancementTab,
          state.capture
        );

      await Promise.race([
        state.articleEnhancementPromise,
        new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              2500
            )
        )
      ]);

      state.articleEnhancementDone =
        true;
    }

    const payload = buildPayload();

    if (state.destination === "notion") {
      setStatus(
        "Writing to Notion…"
      );

      const response =
        await chrome.runtime.sendMessage({
          type:
            "notion.save",

          payload
        });
      if (!response?.ok) throw new Error(response?.error?.message || "Notion save failed.");
      setStatus("Saved to Notion.", "success");
    } else {
      const obsidianResult =
        await saveToObsidian(
          payload
        );

      const filename =
        obsidianResult.filename;

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

      setStatus(
        `Saved to Obsidian as ${filename}.`,
        "success"
      );
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
  const tags = getCurrentTags();
  const notes = els.notesInput.value.trim();
  const contentMode =
    state.destination === "notion"
      ? "article"
      : getContentMode();

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
    template,

    notionFields:
      state.destination ===
        "notion"
        ? {
            ...notionDynamicFieldValues
          }
        : {}
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
    restoreTagEditorValue(
      pendingQuickClipDraft.tags,
      pendingQuickClipDraft.destination
    );
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
        tags: serializeCurrentTags(),
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

    const createFolder =
      document.createElement(
        "option"
      );

    createFolder.value =
      "__create__";

    createFolder.textContent =
      "Create folder…";

    els.folderSelect.append(
      createFolder
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
    value === "__create__"
  ) {
    const settings =
      await chrome.storage.local.get([
        "obsidianSubfolder"
      ]);

    const previous =
      settings.obsidianSubfolder ||
      "";

    const rawPath =
      window.prompt(
        "Create folder or nested path:",
        ""
      );

    if (rawPath === null) {
      await loadObsidianFolders(
        previous
      );

      return;
    }

    const parts =
      String(rawPath)
        .split("/")
        .map(
          (part) =>
            part.trim()
        )
        .filter(Boolean);

    if (
      !parts.length ||
      parts.some(
        (part) =>
          part === "." ||
          part === ".."
      )
    ) {
      await loadObsidianFolders(
        previous
      );

      setStatus(
        "Enter a valid folder name.",
        "error"
      );

      return;
    }

    const folderPath =
      parts.join("/");

    try {
      const handle =
        await getVaultHandle();

      if (!handle) {
        throw new Error(
          "Connect an Obsidian vault first."
        );
      }

      const permission =
        await ensureWritePermission(
          handle
        );

      if (!permission) {
        throw new Error(
          "Chrome no longer has permission to write to the vault. Reconnect it in Settings."
        );
      }

      await getSubfolder(
        handle,
        folderPath
      );

      await chrome.storage.local.set({
        obsidianSubfolder:
          folderPath
      });

      await ClipNestVaultStore
        .updateActiveConfig({
          subfolder:
            folderPath
        });

      await loadObsidianFolders(
        folderPath,
        true
      );

      setStatus(
        `Created folder: ${folderPath}`,
        "success"
      );
    } catch (error) {
      await loadObsidianFolders(
        previous
      );

      setStatus(
        error?.message ||
          String(error),
        "error"
      );
    }

    return;
  }

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

let notionSelectedTags =
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

    renderNotionSelectedTags();
    renderObsidianTagSuggestions();
  } catch (error) {
    notionTagOptions =
      [];

    renderNotionSelectedTags();

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
    els.tagsInput?.closest(
      ".field"
    );

  if (!field) {
    return;
  }

  field.classList.add(
    "tags-autocomplete-field"
  );

  const editor =
    document.createElement(
      "div"
    );

  editor.id =
    "notionTagsEditor";

  editor.className =
    "notion-tags-editor";

  const selectedTags =
    document.createElement(
      "div"
    );

  selectedTags.id =
    "notionSelectedTags";

  selectedTags.className =
    "notion-selected-tags";

  els.tagsInput.insertAdjacentElement(
    "beforebegin",
    editor
  );

  editor.append(
    selectedTags,
    els.tagsInput
  );

  els.notionTagsEditor =
    editor;

  els.notionSelectedTags =
    selectedTags;

  const suggestions =
    document.createElement(
      "div"
    );

  suggestions.id =
    "obsidianTagSuggestions";

  suggestions.className =
    "tag-suggestions hidden";

  field.append(
    suggestions
  );

  const meta =
    document.createElement(
      "small"
    );

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

  editor.addEventListener(
    "click",
    (event) => {
      if (
        event.target === editor ||
        event.target ===
          selectedTags
      ) {
        els.tagsInput.focus();
      }
    }
  );

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
        event.key ===
          "Escape"
      ) {
        els.tagSuggestions?.classList.add(
          "hidden"
        );

        return;
      }

      if (
        state.destination ===
          "notion" &&
        event.key ===
          "Backspace" &&
        !els.tagsInput.value &&
        notionSelectedTags.length
      ) {
        event.preventDefault();

        const last =
          notionSelectedTags[
            notionSelectedTags.length - 1
          ];

        removeNotionSelectedTag(
          last.tag
        );

        return;
      }

      if (
        state.destination ===
          "notion" &&
        (
          event.key ===
            "Enter" ||
          event.key ===
            ","
        )
      ) {
        const query =
          normalizeNotionTagName(
            els.tagsInput.value
          );

        if (query) {
          event.preventDefault();

          const match =
            getNotionOptionForTag(
              query
            );

          addNotionSelectedTag(
            match?.tag ||
            query
          );
        }
      }
    }
  );

  els.tagsInput.addEventListener(
    "blur",
    () => {
      setTimeout(
        () => {
          els.tagSuggestions?.classList.add(
            "hidden"
          );
        },
        120
      );
    }
  );

  const notionTagOutsidePointerDown =
    (event) => {
      if (
        state.destination !==
          "notion"
      ) {
        return;
      }

      const target =
        event.target;

      if (
        els.notionTagsEditor?.contains(
          target
        ) ||
        els.tagSuggestions?.contains(
          target
        )
      ) {
        return;
      }

      els.tagSuggestions?.classList.add(
        "hidden"
      );
    };

  document.addEventListener(
    "pointerdown",
    notionTagOutsidePointerDown
  );

  window.addEventListener(
    "resize",
    () => {
      if (
        !els.tagSuggestions?.classList.contains(
          "hidden"
        )
      ) {
        positionNotionTagSuggestions();
      }
    }
  );

  renderNotionSelectedTags();
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

function normalizeNotionTagName(
  value
) {
  return String(
    value ||
    ""
  )
    .trim()
    .replace(
      /^#/,
      ""
    );
}

function notionTagKey(
  value
) {
  return normalizeNotionTagName(
    value
  ).toLowerCase();
}

function getNotionOptionForTag(
  tag
) {
  const key =
    notionTagKey(
      tag
    );

  return notionTagOptions.find(
    (option) =>
      notionTagKey(
        option?.tag
      ) === key
  ) || null;
}

function uniqueTagNames(
  values
) {
  const seen =
    new Set();

  const result =
    [];

  for (const value of values) {
    const tag =
      normalizeNotionTagName(
        value
      );

    const key =
      tag.toLowerCase();

    if (
      !tag ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    result.push(tag);
  }

  return result;
}

function renderNotionSelectedTags() {
  const container =
    els.notionSelectedTags;

  if (!container) {
    return;
  }

  container.replaceChildren();

  for (
    const selected of
      notionSelectedTags
  ) {
    const option =
      getNotionOptionForTag(
        selected.tag
      );

    const tag =
      option?.tag ||
      selected.tag;

    const color =
      option?.color ||
      selected.color ||
      "default";

    const chip =
      document.createElement(
        "span"
      );

    chip.className =
      "notion-selected-tag-chip notion-tag-pill";

    chip.dataset.notionColor =
      normalizeNotionTagColor(
        color
      );

    const label =
      document.createElement(
        "span"
      );

    label.className =
      "notion-selected-tag-label";

    label.textContent =
      tag;

    const remove =
      document.createElement(
        "button"
      );

    remove.type =
      "button";

    remove.className =
      "notion-selected-tag-remove";

    remove.setAttribute(
      "aria-label",
      `Remove ${tag}`
    );

    remove.title =
      `Remove ${tag}`;

    remove.textContent =
      "×";

    remove.addEventListener(
      "mousedown",
      (event) => {
        event.preventDefault();
      }
    );

    remove.addEventListener(
      "click",
      () => {
        removeNotionSelectedTag(
          tag
        );

        els.tagsInput?.focus();
      }
    );

    chip.append(
      label,
      remove
    );

    container.append(
      chip
    );
  }
}

function addNotionSelectedTag(
  rawTag
) {
  const clean =
    normalizeNotionTagName(
      rawTag
    );

  if (!clean) {
    return;
  }

  const key =
    notionTagKey(
      clean
    );

  const exists =
    notionSelectedTags.some(
      (item) =>
        notionTagKey(
          item.tag
        ) === key
    );

  if (!exists) {
    const option =
      getNotionOptionForTag(
        clean
      );

    notionSelectedTags.push({
      tag:
        option?.tag ||
        clean,

      color:
        option?.color ||
        chooseNewNotionTagColor(
          clean
        )
    });
  }

  els.tagsInput.value =
    "";

  renderNotionSelectedTags();

  els.tagsInput.focus();

  renderObsidianTagSuggestions();
}

function removeNotionSelectedTag(
  rawTag
) {
  const key =
    notionTagKey(
      rawTag
    );

  notionSelectedTags =
    notionSelectedTags.filter(
      (item) =>
        notionTagKey(
          item.tag
        ) !== key
    );

  renderNotionSelectedTags();
  renderObsidianTagSuggestions();
}

function getCurrentTags() {
  const typed =
    parseTags(
      els.tagsInput?.value ||
      ""
    );

  if (
    state.destination !==
      "notion"
  ) {
    return typed;
  }

  return uniqueTagNames([
    ...notionSelectedTags.map(
      (item) =>
        item.tag
    ),
    ...typed
  ]);
}

function serializeCurrentTags() {
  return getCurrentTags()
    .join(", ");
}

function restoreTagEditorValue(
  rawValue,
  destination =
    state.destination
) {
  const tags =
    parseTags(
      rawValue
    );

  if (
    destination !==
      "notion"
  ) {
    notionSelectedTags =
      [];

    els.tagsInput.value =
      String(
        rawValue ||
        ""
      );

    renderNotionSelectedTags();

    return;
  }

  notionSelectedTags =
    tags.map(
      (tag) => {
        const option =
          getNotionOptionForTag(
            tag
          );

        return {
          tag:
            option?.tag ||
            tag,

          color:
            option?.color ||
            chooseNewNotionTagColor(
              tag
            )
        };
      }
    );

  els.tagsInput.value =
    "";

  renderNotionSelectedTags();
}

function chooseNewNotionTagColor(
  value
) {
  const colors = [
    "gray",
    "brown",
    "orange",
    "yellow",
    "green",
    "blue",
    "purple",
    "pink",
    "red"
  ];

  const text =
    notionTagKey(
      value
    );

  let hash =
    2166136261;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash ^=
      text.charCodeAt(
        index
      );

    hash =
      Math.imul(
        hash,
        16777619
      );
  }

  return colors[
    (
      hash >>> 0
    ) %
    colors.length
  ];
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

function positionNotionTagSuggestions() {
  if (
    state.destination !==
      "notion" ||
    !els.tagSuggestions
  ) {
    return;
  }

  const anchor =
    els.notionTagsEditor ||
    els.tagsInput;

  if (!anchor) {
    return;
  }

  const rect =
    anchor.getBoundingClientRect();

  const viewportWidth =
    document.documentElement
      .clientWidth;

  const verticalGap =
    6;

  const rightMargin =
    18;

  const desiredWidth =
    Math.min(
      440,
      Math.max(
        300,
        rect.width * 0.72
      )
    );

  const availableWidth =
    Math.max(
      220,
      viewportWidth -
        rect.left -
        rightMargin
    );

  const width =
    Math.min(
      desiredWidth,
      availableWidth
    );

  const saveRect =
    els.saveButton
      ?.getBoundingClientRect();

  let maxHeight =
    188;

  if (
    saveRect &&
    saveRect.top >
      rect.bottom
  ) {
    const roomBeforeSave =
      saveRect.top -
      rect.bottom -
      18;

    maxHeight =
      Math.max(
        92,
        Math.min(
          188,
          roomBeforeSave
        )
      );
  }

  els.tagSuggestions.style.setProperty(
    "left",
    `${rect.left}px`,
    "important"
  );

  els.tagSuggestions.style.setProperty(
    "top",
    `${rect.bottom + verticalGap}px`,
    "important"
  );

  els.tagSuggestions.style.setProperty(
    "bottom",
    "auto",
    "important"
  );

  els.tagSuggestions.style.setProperty(
    "right",
    "auto",
    "important"
  );

  els.tagSuggestions.style.setProperty(
    "width",
    `${width}px`,
    "important"
  );

  els.tagSuggestions.style.setProperty(
    "max-height",
    `${maxHeight}px`,
    "important"
  );
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

  const raw =
    String(
      els.tagsInput.value ||
      ""
    );

  const pieces =
    raw.split(",");

  const queryText =
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
      );

  const query =
    queryText.toLowerCase();

  const selected =
    new Set([
      ...(
        state.destination ===
          "notion"
          ? notionSelectedTags.map(
              (item) =>
                notionTagKey(
                  item.tag
                )
            )
          : []
      ),

      ...pieces
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
    ]);

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

  const exactNotionMatch =
    state.destination ===
      "notion" &&
    Boolean(query) &&
    notionTagOptions.some(
      (item) =>
        notionTagKey(
          item.tag
        ) === query
    );

  const queryAlreadySelected =
    state.destination ===
      "notion" &&
    Boolean(query) &&
    notionSelectedTags.some(
      (item) =>
        notionTagKey(
          item.tag
        ) === query
    );

  const canCreate =
    state.destination ===
      "notion" &&
    Boolean(
      queryText
    ) &&
    !exactNotionMatch &&
    !queryAlreadySelected;

  container.replaceChildren();

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

  if (canCreate) {
    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.className =
      "tag-suggestion notion-create-tag-suggestion";

    const prefix =
      document.createElement(
        "span"
      );

    prefix.className =
      "notion-create-tag-prefix";

    prefix.textContent =
      "Create";

    const pill =
      document.createElement(
        "span"
      );

    pill.className =
      "notion-tag-pill";

    pill.dataset.notionColor =
      normalizeNotionTagColor(
        chooseNewNotionTagColor(
          queryText
        )
      );

    pill.textContent =
      queryText;

    button.append(
      prefix,
      pill
    );

    button.addEventListener(
      "mousedown",
      (event) => {
        event.preventDefault();

        addNotionSelectedTag(
          queryText
        );
      }
    );

    container.append(
      button
    );
  }

  if (
    !matches.length &&
    !canCreate
  ) {
    container.classList.add(
      "hidden"
    );

    return;
  }

  if (
    state.destination ===
      "notion"
  ) {
    positionNotionTagSuggestions();
  }

  container.classList.remove(
    "hidden"
  );
}

function chooseObsidianTag(tag) {
  if (
    state.destination ===
      "notion"
  ) {
    addNotionSelectedTag(
      tag
    );

    return;
  }

  const pieces =
    String(
      els.tagsInput.value ||
      ""
    ).split(",");

  pieces.pop();

  const existing =
    pieces
      .map(
        (value) =>
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
  const handle =
    await getVaultHandle();

  if (!handle) {
    throw new Error(
      "No Obsidian vault is connected. Open Settings and choose your vault folder."
    );
  }

  const permission =
    await ensureWritePermission(
      handle
    );

  if (!permission) {
    throw new Error(
      "Chrome no longer has permission to write to the vault. Reconnect it in Settings."
    );
  }

  const settings =
    await chrome.storage.local.get([
      "obsidianSubfolder",
      "obsidianOpenAfterSave"
    ]);

  const subfolder =
    normalizeObsidianSubfolder(
      settings.obsidianSubfolder ||
      ""
    );

  const directory =
    await getSubfolder(
      handle,
      subfolder
    );

  const baseName =
    sanitizeFilename(
      payload.title
    ) ||
    "Untitled";

  const filename =
    await findAvailableFilename(
      directory,
      baseName,
      ".md"
    );

  const fileHandle =
    await directory.getFileHandle(
      filename,
      {
        create: true
      }
    );

  const writable =
    await fileHandle.createWritable();

  await writable.write(
    buildObsidianMarkdown(
      payload
    )
  );

  await writable.close();

  const filePath = [
    subfolder,
    filename
  ]
    .filter(Boolean)
    .join("/");

  if (
    settings.obsidianOpenAfterSave ===
    true
  ) {
    try {
      await openSavedObsidianNote(
        handle.name ||
          "",
        filePath
      );
    } catch (error) {
      console.warn(
        "ClipNest saved the note but could not open it in Obsidian:",
        error
      );
    }
  }

  return {
    filename,
    filePath
  };
}

function normalizeObsidianSubfolder(
  rawPath
) {
  return String(
    rawPath ||
    ""
  )
    .split("/")
    .map(
      (part) =>
        part.trim()
    )
    .filter(Boolean)
    .filter(
      (part) =>
        part !== "." &&
        part !== ".."
    )
    .join("/");
}

function buildObsidianOpenUri(
  vaultName,
  filePath
) {
  const vault =
    String(
      vaultName ||
      ""
    ).trim();

  const file =
    String(
      filePath ||
      ""
    ).trim();

  if (!vault) {
    throw new Error(
      "The connected Obsidian vault has no name."
    );
  }

  if (!file) {
    throw new Error(
      "The saved Obsidian note has no file path."
    );
  }

  return (
    "obsidian://open?vault=" +
    encodeURIComponent(
      vault
    ) +
    "&file=" +
    encodeURIComponent(
      file
    )
  );
}

async function openSavedObsidianNote(
  vaultName,
  filePath
) {
  const uri =
    buildObsidianOpenUri(
      vaultName,
      filePath
    );

  const [tab] =
    await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

  if (
    !Number.isInteger(
      tab?.id
    )
  ) {
    throw new Error(
      "No active Chrome tab is available."
    );
  }

  await chrome.tabs.update(
    tab.id,
    {
      url: uri
    }
  );
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
          ? "Selection"
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
    label = "Save selection";
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
