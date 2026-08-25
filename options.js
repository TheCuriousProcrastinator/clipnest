const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  for (const id of [
    "defaultDestination",
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
    "input",
    () => {
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

  els.testNotion.addEventListener(
    "click",
    testNotion
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
          els.notionPresetName.value
      });

    await refreshNotionPresetList();
  }

  showStatus(
    els.saveStatus,
    "Saved.",
    "success"
  );
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
}

async function saveNotionPropertyMappings() {
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

  return ClipNestNotionStore
    .updateActivePreset({
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
}

async function applyNotionDatabaseSchema(
  preset,
  database
) {
  renderNotionPropertySelectors(
    preset,
    database?.properties ||
    []
  );

  return saveNotionPropertyMappings();
}

async function loadNotionDatabaseSchemaForPreset(
  preset
) {
  if (
    !preset ||
    preset.destinationType !==
      "collection" ||
    !preset.destinationId
  ) {
    renderNotionPropertySelectors(
      preset,
      []
    );

    return preset;
  }

  renderNotionPropertySelectors(
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

  els.testNotion.disabled =
    !(
      preset?.workspaceId &&
      preset?.workspaceUserId &&
      preset?.destinationId &&
      preset?.destinationType
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

  els.testNotion.disabled =
    false;

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

    els.notionDataSourceHelp.textContent =
      "Page selected. ClipNest will save beneath this page.";
  }

  showStatus(
    els.notionStatus,
    `Destination selected: ${
      updated.destinationName
    }.`,
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

async function testNotion() {
  const preset =
    await ClipNestNotionStore
      .getActivePreset();

  if (!preset) {
    showStatus(
      els.notionStatus,
      "Create a Notion preset first.",
      "error"
    );

    return;
  }

  if (
    !preset.workspaceId ||
    !preset.workspaceUserId
  ) {
    showStatus(
      els.notionStatus,
      "Choose a Notion workspace first.",
      "error"
    );

    return;
  }

  if (
    !preset.destinationId ||
    !preset.destinationType
  ) {
    showStatus(
      els.notionStatus,
      "Choose a Notion destination first.",
      "error"
    );

    return;
  }

  const timestamp =
    new Date()
      .toLocaleString();

  const title =
    `ClipNest content test - ${timestamp}`;

  const markdown = `## ClipNest content test

This paragraph was written by ClipNest through your existing Notion browser session.

Here is a [test link](https://example.com).

- Bullet item one
- Bullet item two

1. Numbered item one
2. Numbered item two

> This is a quote block created by ClipNest.

\`\`\`
hello from ClipNest
content block test
\`\`\`

---

### End of test

If you can read all of this in Notion, the content writer works.`;

  const originalLabel =
    els.testNotion.textContent;

  let createdPage =
    null;

  els.testNotion.disabled =
    true;

  els.testNotion.textContent =
    "Creating content test…";

  showStatus(
    els.notionStatus,
    `Creating one content test in ${
      preset.destinationName ||
      "Notion"
    }…`
  );

  try {
    if (
      preset.destinationType ===
        "collection"
    ) {
      const titlePropertyId =
        preset.propertyIds
          ?.title ||
        "";

      if (!titlePropertyId) {
        throw new Error(
          "Choose a Title property before testing this database."
        );
      }

      const properties =
        ClipNestNotionSession
          .encodeDatabaseProperties({
            title,

            propertyIds: {
              title:
                titlePropertyId,

              url:
                "",

              tags:
                ""
            }
          });

      createdPage =
        await ClipNestNotionSession
          .createPage({
            workspaceId:
              preset.workspaceId,

            userId:
              preset.workspaceUserId,

            parentId:
              preset.destinationId,

            parentTable:
              "collection",

            title:
              "",

            properties
          });
    } else if (
      preset.destinationType ===
        "page"
    ) {
      createdPage =
        await ClipNestNotionSession
          .createPage({
            workspaceId:
              preset.workspaceId,

            userId:
              preset.workspaceUserId,

            parentId:
              preset.destinationId,

            parentTable:
              "block",

            title,

            properties:
              {}
          });
    } else {
      throw new Error(
        "This Notion destination type is not supported."
      );
    }

    const content =
      await ClipNestNotionSession
        .appendMarkdownToPage({
          workspaceId:
            preset.workspaceId,

          userId:
            preset.workspaceUserId,

          pageId:
            createdPage.id,

          markdown
        });

    console.log(
      "ClipNest Notion content test succeeded:",
      {
        preset:
          preset.name,

        destination:
          preset.destinationName,

        destinationType:
          preset.destinationType,

        pageId:
          createdPage.id,

        pageUrl:
          createdPage.url,

        blockCount:
          content.blockCount
      }
    );

    showStatus(
      els.notionStatus,
      `Created "${title}" with ${content.blockCount} content blocks in ${
        preset.destinationName ||
        "Notion"
      }.`,
      "success"
    );
  } catch (error) {
    console.error(
      "ClipNest Notion content test failed:",
      error,
      error?.attempts ||
      []
    );

    let message =
      error?.message ||
      String(error);

    if (createdPage?.id) {
      message =
        `The test page was created, but writing its content failed. ${message}`;
    }

    if (
      Array.isArray(
        error?.attempts
      ) &&
      error.attempts.length
    ) {
      const details =
        error.attempts
          .map(
            (attempt) => {
              const status =
                attempt.httpStatus
                  ? ` HTTP ${attempt.httpStatus}`
                  : "";

              return (
                `${attempt.host}${status}: ` +
                `${attempt.error || attempt.status}`
              );
            }
          )
          .join(" | ");

      message =
        `${message} ${details}`;
    }

    showStatus(
      els.notionStatus,
      message,
      "error"
    );
  } finally {
    els.testNotion.textContent =
      originalLabel ||
      "Create content test";

    const currentPreset =
      await ClipNestNotionStore
        .getActivePreset();

    els.testNotion.disabled =
      !(
        currentPreset?.workspaceId &&
        currentPreset?.workspaceUserId &&
        currentPreset?.destinationId &&
        currentPreset?.destinationType
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
