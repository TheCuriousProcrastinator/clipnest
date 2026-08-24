(() => {
  "use strict";

  const NOTION_ORIGINS = [
    "https://*.notion.so/*",
    "https://*.notion.com/*"
  ];

  const ENDPOINTS = [
    "https://www.notion.so/api/v3/getSpaces",
    "https://app.notion.com/api/v3/getSpaces"
  ];

  const els = {};

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      els.detectButton =
        document.getElementById(
          "detectButton"
        );

      els.status =
        document.getElementById(
          "status"
        );

      els.results =
        document.getElementById(
          "results"
        );

      els.workspaceList =
        document.getElementById(
          "workspaceList"
        );

      els.diagnostics =
        document.getElementById(
          "diagnostics"
        );

      els.diagnosticText =
        document.getElementById(
          "diagnosticText"
        );

      els.detectButton.addEventListener(
        "click",
        runProbe
      );
    }
  );

  function setStatus(
    message,
    type = ""
  ) {
    els.status.textContent =
      message || "";

    els.status.className =
      `status ${type}`.trim();
  }

  function recordValue(
    record
  ) {
    if (
      record &&
      typeof record === "object" &&
      record.value &&
      typeof record.value === "object"
    ) {
      return record.value;
    }

    return record;
  }

  function workspaceName(
    value,
    fallback
  ) {
    return String(
      value?.name ||
      value?.display_name ||
      value?.displayName ||
      value?.title ||
      fallback ||
      "Untitled workspace"
    ).trim();
  }

  function workspaceIcon(
    value
  ) {
    const icon =
      value?.icon ||
      value?.emoji ||
      "";

    if (
      typeof icon === "string" &&
      icon.length <= 12
    ) {
      return icon;
    }

    return "N";
  }

  function addWorkspace(
    map,
    id,
    record,
    account = ""
  ) {
    const value =
      recordValue(record);

    if (
      !value ||
      typeof value !== "object"
    ) {
      return;
    }

    const resolvedId =
      String(
        value.id ||
        value.space_id ||
        value.spaceId ||
        id ||
        ""
      ).trim();

    if (!resolvedId) {
      return;
    }

    const name =
      workspaceName(
        value,
        resolvedId
      );

    const existing =
      map.get(resolvedId);

    map.set(
      resolvedId,
      {
        id:
          resolvedId,

        name:
          existing?.name &&
          existing.name !==
            existing.id
            ? existing.name
            : name,

        icon:
          existing?.icon ||
          workspaceIcon(value),

        account:
          existing?.account ||
          account ||
          ""
      }
    );
  }

  function accountEmail(
    data
  ) {
    const notionUsers =
      data?.notion_user ||
      data?.recordMap
        ?.notion_user ||
      {};

    for (
      const record of
        Object.values(
          notionUsers
        )
    ) {
      const value =
        recordValue(record);

      if (value?.email) {
        return String(
          value.email
        );
      }
    }

    return "";
  }

  function extractWorkspaces(
    payload
  ) {
    const map =
      new Map();

    const inspectContainer =
      (
        container,
        account = ""
      ) => {
        if (
          !container ||
          typeof container !==
            "object"
        ) {
          return;
        }

        const directSpace =
          container.space;

        if (
          directSpace &&
          typeof directSpace ===
            "object"
        ) {
          for (
            const [
              id,
              record
            ] of Object.entries(
              directSpace
            )
          ) {
            addWorkspace(
              map,
              id,
              record,
              account
            );
          }
        }

        const recordMapSpace =
          container.recordMap
            ?.space;

        if (
          recordMapSpace &&
          typeof recordMapSpace ===
            "object"
        ) {
          for (
            const [
              id,
              record
            ] of Object.entries(
              recordMapSpace
            )
          ) {
            addWorkspace(
              map,
              id,
              record,
              account
            );
          }
        }

        const spaces =
          container.spaces;

        if (
          Array.isArray(spaces)
        ) {
          for (
            const record of spaces
          ) {
            const value =
              recordValue(record);

            addWorkspace(
              map,
              value?.id ||
              value?.spaceId ||
              "",
              record,
              account
            );
          }
        } else if (
          spaces &&
          typeof spaces ===
            "object"
        ) {
          for (
            const [
              id,
              record
            ] of Object.entries(
              spaces
            )
          ) {
            addWorkspace(
              map,
              id,
              record,
              account
            );
          }
        }
      };

    inspectContainer(
      payload,
      accountEmail(payload)
    );

    if (
      payload &&
      typeof payload ===
        "object"
    ) {
      for (
        const value of
          Object.values(payload)
      ) {
        if (
          !value ||
          typeof value !==
            "object"
        ) {
          continue;
        }

        inspectContainer(
          value,
          accountEmail(value)
        );
      }
    }

    return [
      ...map.values()
    ].sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );
  }

  function summarizePayload(
    payload
  ) {
    if (
      !payload ||
      typeof payload !==
        "object"
    ) {
      return {
        type:
          typeof payload
      };
    }

    return {
      topLevelKeys:
        Object.keys(payload),

      accountCount:
        Object.values(payload)
          .filter(
            (value) =>
              value &&
              typeof value ===
                "object" &&
              (
                value.space ||
                value.recordMap
                  ?.space ||
                value.spaces
              )
          )
          .length
    };
  }

  async function requestPermissions() {
    const alreadyGranted =
      await chrome.permissions
        .contains({
          origins:
            NOTION_ORIGINS
        });

    if (alreadyGranted) {
      return true;
    }

    return chrome.permissions
      .request({
        origins:
          NOTION_ORIGINS
      });
  }

  async function fetchSpaces() {
    const attempts =
      [];

    for (
      const endpoint of
        ENDPOINTS
    ) {
      try {
        const response =
          await fetch(
            endpoint,
            {
              method:
                "POST",

              credentials:
                "include",

              headers: {
                Accept:
                  "application/json",

                "Content-Type":
                  "application/json"
              },

              body:
                "{}"
            }
          );

        const contentType =
          response.headers.get(
            "content-type"
          ) || "";

        let payload =
          null;

        if (
          contentType.includes(
            "application/json"
          )
        ) {
          payload =
            await response.json();
        } else {
          const text =
            await response.text();

          attempts.push({
            endpoint,
            status:
              response.status,
            contentType,
            bodyType:
              "non-json",
            preview:
              text.slice(
                0,
                120
              )
          });

          continue;
        }

        attempts.push({
          endpoint,
          status:
            response.status,
          contentType,
          summary:
            summarizePayload(
              payload
            )
        });

        if (response.ok) {
          return {
            endpoint,
            payload,
            attempts
          };
        }
      } catch (error) {
        attempts.push({
          endpoint,
          error:
            error.message ||
            String(error)
        });
      }
    }

    const failure =
      new Error(
        "Notion did not return a usable workspace response."
      );

    failure.attempts =
      attempts;

    throw failure;
  }

  function renderWorkspaces(
    workspaces
  ) {
    els.workspaceList
      .replaceChildren();

    for (
      const workspace of
        workspaces
    ) {
      const row =
        document.createElement(
          "div"
        );

      row.className =
        "workspace";

      const icon =
        document.createElement(
          "div"
        );

      icon.className =
        "workspace-icon";

      icon.textContent =
        workspace.icon ||
        "N";

      const copy =
        document.createElement(
          "div"
        );

      const name =
        document.createElement(
          "div"
        );

      name.className =
        "workspace-name";

      name.textContent =
        workspace.name;

      const meta =
        document.createElement(
          "div"
        );

      meta.className =
        "workspace-meta";

      meta.textContent =
        workspace.account
          ? workspace.account
          : workspace.id;

      copy.append(
        name,
        meta
      );

      row.append(
        icon,
        copy
      );

      els.workspaceList.append(
        row
      );
    }

    els.results.classList.remove(
      "hidden"
    );
  }

  async function runProbe() {
    els.detectButton.disabled =
      true;

    els.results.classList.add(
      "hidden"
    );

    els.diagnostics.classList.add(
      "hidden"
    );

    setStatus(
      "Requesting read-only access to Notion…"
    );

    try {
      const granted =
        await requestPermissions();

      if (!granted) {
        throw new Error(
          "Notion website access was not granted."
        );
      }

      setStatus(
        "Checking your existing Notion browser session…"
      );

      const result =
        await fetchSpaces();

      const workspaces =
        extractWorkspaces(
          result.payload
        );

      els.diagnosticText.textContent =
        JSON.stringify(
          {
            endpoint:
              result.endpoint,

            workspacesFound:
              workspaces.length,

            attempts:
              result.attempts
          },
          null,
          2
        );

      els.diagnostics.classList.remove(
        "hidden"
      );

      if (!workspaces.length) {
        throw new Error(
          "The Notion session responded, but ClipNest could not find workspace records in the response."
        );
      }

      renderWorkspaces(
        workspaces
      );

      setStatus(
        `Success. Found ${workspaces.length} workspace${
          workspaces.length === 1
            ? ""
            : "s"
        } through your existing Notion browser session.`,
        "success"
      );
    } catch (error) {
      if (
        error?.attempts
      ) {
        els.diagnosticText.textContent =
          JSON.stringify(
            {
              attempts:
                error.attempts
            },
            null,
            2
          );

        els.diagnostics.classList.remove(
          "hidden"
        );
      }

      setStatus(
        error.message ||
        String(error),
        "error"
      );
    } finally {
      els.detectButton.disabled =
        false;
    }
  }
})();
