(() => {
  "use strict";

  const NOTION_ORIGINS = [
    "https://*.notion.so/*",
    "https://*.notion.com/*"
  ];

  const NOTION_HOSTS = [
    "https://app.notion.com",
    "https://www.notion.so"
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

  function normalizeRecordTable(
    table
  ) {
    const normalized =
      {};

    for (
      const [
        id,
        record
      ] of Object.entries(
        table || {}
      )
    ) {
      if (
        !record ||
        typeof record !==
          "object" ||
        !record.value
      ) {
        normalized[id] =
          record;

        continue;
      }

      if (
        record.value &&
        typeof record.value ===
          "object" &&
        record.value.value
      ) {
        normalized[id] = {
          value:
            record.value.value,

          role:
            record.value.role
        };

        continue;
      }

      normalized[id] =
        record;
    }

    return normalized;
  }

  function normalizeAccountBundle(
    bundle
  ) {
    if (
      !bundle ||
      typeof bundle !==
        "object"
    ) {
      return bundle;
    }

    const firstEntry =
      Object.entries(
        bundle
      ).find(
        ([key]) =>
          key !==
          "__version__"
      )?.[1];

    const firstRecord =
      firstEntry &&
      typeof firstEntry ===
        "object"
        ? Object.values(
            firstEntry
          )[0]
        : null;

    if (
      !firstRecord?.value
        ?.value
    ) {
      return bundle;
    }

    const normalized = {
      ...bundle
    };

    for (
      const [
        tableName,
        table
      ] of Object.entries(
        normalized
      )
    ) {
      if (
        tableName ===
          "__version__" ||
        !table ||
        typeof table !==
          "object"
      ) {
        continue;
      }

      normalized[
        tableName
      ] =
        normalizeRecordTable(
          table
        );
    }

    return normalized;
  }

  function normalizeGetSpacesPayload(
    payload
  ) {
    if (
      !payload ||
      typeof payload !==
        "object"
    ) {
      return payload;
    }

    const firstBundle =
      Object.values(
        payload
      )[0];

    if (
      !firstBundle
        ?.notion_user
    ) {
      return payload;
    }

    const normalized = {
      ...payload
    };

    for (
      const userId of
        Object.keys(
          normalized
        )
    ) {
      const bundle =
        normalized[
          userId
        ];

      if (
        bundle &&
        typeof bundle ===
          "object" &&
        bundle.notion_user
      ) {
        normalized[
          userId
        ] =
          normalizeAccountBundle(
            bundle
          );
      }
    }

    return normalized;
  }

  function unwrapRecord(
    record
  ) {
    let current =
      record;

    for (
      let depth = 0;
      depth < 4;
      depth += 1
    ) {
      if (
        !current ||
        typeof current !==
          "object" ||
        !Object.prototype
          .hasOwnProperty.call(
            current,
            "value"
          )
      ) {
        break;
      }

      const keys =
        Object.keys(
          current
        );

      const wrapperKeys =
        new Set([
          "value",
          "role",
          "version"
        ]);

      const looksLikeWrapper =
        keys.length <= 3 &&
        keys.every(
          (key) =>
            wrapperKeys.has(
              key
            )
        );

      if (!looksLikeWrapper) {
        break;
      }

      current =
        current.value;
    }

    return current;
  }

  function capitalize(
    value
  ) {
    const text =
      String(
        value ||
        ""
      );

    if (!text) {
      return "";
    }

    return (
      text.charAt(0)
        .toUpperCase() +
      text.slice(1)
    );
  }

  function getUser(
    payload,
    userId
  ) {
    const bundle =
      payload?.[userId];

    const value =
      unwrapRecord(
        bundle
          ?.notion_user
          ?.[userId]
      );

    return {
      id:
        value?.id ||
        userId,

      name:
        value?.name ||
        value?.given_name ||
        "",

      email:
        value?.email ||
        ""
    };
  }

  function getSpaceIdsForUser(
    payload,
    userId
  ) {
    const bundle =
      payload?.[userId] ||
      {};

    const ids =
      new Set();

    const spaceViews =
      bundle.space_view;

    if (
      spaceViews &&
      typeof spaceViews ===
        "object"
    ) {
      for (
        const record of
          Object.values(
            spaceViews
          )
      ) {
        const value =
          unwrapRecord(
            record
          );

        const spaceId =
          value?.space_id ||
          value?.spaceId;

        if (spaceId) {
          ids.add(
            String(spaceId)
          );
        }
      }
    }

    if (!ids.size) {
      const userRoot =
        unwrapRecord(
          bundle
            ?.user_root
            ?.[userId]
        );

      const pointers =
        Array.isArray(
          userRoot
            ?.space_view_pointers
        )
          ? userRoot
              .space_view_pointers
          : [];

      for (
        const pointer of
          pointers
      ) {
        const spaceId =
          pointer?.spaceId ||
          pointer?.space_id;

        if (spaceId) {
          ids.add(
            String(spaceId)
          );
        }
      }
    }

    return [
      ...ids
    ];
  }

  function getSpaceViewIds(
    payload,
    userId
  ) {
    const bundle =
      payload?.[userId] ||
      {};

    const result =
      {};

    const spaceViews =
      bundle.space_view;

    if (
      spaceViews &&
      typeof spaceViews ===
        "object"
    ) {
      for (
        const [
          viewId,
          record
        ] of Object.entries(
          spaceViews
        )
      ) {
        const value =
          unwrapRecord(
            record
          );

        const spaceId =
          value?.space_id ||
          value?.spaceId;

        if (!spaceId) {
          continue;
        }

        if (!result[spaceId]) {
          result[spaceId] =
            [];
        }

        result[spaceId].push(
          viewId
        );
      }

      return result;
    }

    const userRoot =
      unwrapRecord(
        bundle
          ?.user_root
          ?.[userId]
      );

    const pointers =
      Array.isArray(
        userRoot
          ?.space_view_pointers
      )
        ? userRoot
            .space_view_pointers
        : [];

    for (
      const pointer of
        pointers
    ) {
      const spaceId =
        pointer?.spaceId ||
        pointer?.space_id;

      const viewId =
        pointer?.id;

      if (
        !spaceId ||
        !viewId
      ) {
        continue;
      }

      if (!result[spaceId]) {
        result[spaceId] =
          [];
      }

      result[spaceId].push(
        viewId
      );
    }

    return result;
  }

  function getMembershipType(
    payload,
    userId,
    spaceId
  ) {
    const record =
      payload?.[userId]
        ?.space_user
        ?.[`${userId}|${spaceId}`];

    const value =
      unwrapRecord(
        record
      );

    return (
      value?.membership_type ||
      "none"
    );
  }

  function membershipRank(
    type
  ) {
    if (type === "owner") {
      return 0;
    }

    if (type === "member") {
      return 1;
    }

    return 2;
  }

  function linkedUsersForSpace(
    payload,
    users,
    spaceId
  ) {
    return users
      .filter(
        (user) =>
          user.spaceIds.includes(
            spaceId
          )
      )
      .map(
        (user) => ({
          ...user,

          membershipType:
            getMembershipType(
              payload,
              user.id,
              spaceId
            )
        })
      )
      .sort(
        (a, b) =>
          membershipRank(
            a.membershipType
          ) -
          membershipRank(
            b.membershipType
          )
      );
  }

  function buildContext(
    payload
  ) {
    const userIds =
      Object.keys(
        payload || {}
      );

    const users =
      userIds
        .map(
          (userId) => ({
            ...getUser(
              payload,
              userId
            ),

            spaceIds:
              getSpaceIdsForUser(
                payload,
                userId
              )
          })
        )
        .filter(
          (user) =>
            user.id
        );

    const allSpaceViewIds =
      {};

    for (
      const user of
        users
    ) {
      const mapping =
        getSpaceViewIds(
          payload,
          user.id
        );

      for (
        const [
          spaceId,
          viewIds
        ] of Object.entries(
          mapping
        )
      ) {
        if (
          !allSpaceViewIds[
            spaceId
          ]
        ) {
          allSpaceViewIds[
            spaceId
          ] = [];
        }

        for (
          const viewId of
            viewIds
        ) {
          if (
            !allSpaceViewIds[
              spaceId
            ].includes(
              viewId
            )
          ) {
            allSpaceViewIds[
              spaceId
            ].push(
              viewId
            );
          }
        }
      }
    }

    return {
      users,
      allSpaceViewIds
    };
  }

  function buildDirectSpaces(
    payload,
    users,
    allSpaceViewIds
  ) {
    const spaces =
      new Map();

    for (
      const bundle of
        Object.values(
          payload || {}
        )
    ) {
      const directSpaces =
        bundle?.space;

      if (
        !directSpaces ||
        typeof directSpaces !==
          "object"
      ) {
        continue;
      }

      for (
        const [
          recordId,
          record
        ] of Object.entries(
          directSpaces
        )
      ) {
        const value =
          unwrapRecord(
            record
          );

        if (
          !value ||
          typeof value !==
            "object"
        ) {
          continue;
        }

        const spaceId =
          String(
            value.id ||
            recordId ||
            ""
          ).trim();

        if (!spaceId) {
          continue;
        }

        if (
          spaces.has(
            spaceId
          )
        ) {
          continue;
        }

        const linkedUsers =
          linkedUsersForSpace(
            payload,
            users,
            spaceId
          );

        spaces.set(
          spaceId,
          {
            id:
              spaceId,

            spaceId,

            name:
              value.name ||
              "Untitled workspace",

            icon:
              value.icon ||
              "",

            planInfo:
              value.plan_type
                ? `${
                    capitalize(
                      value.plan_type
                    )
                  } Plan`
                : "Guest Access - Invited",

            linkedUsers,

            spaceViewIds:
              allSpaceViewIds[
                spaceId
              ] ||
              [],

            source:
              "getSpaces"
          }
        );
      }
    }

    return spaces;
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

  async function postNotion(
    host,
    path,
    body = {},
    extraHeaders = {}
  ) {
    const response =
      await fetch(
        `${host}/api/v3/${path}`,
        {
          method:
            "POST",

          credentials:
            "include",

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",

            ...extraHeaders
          },

          body:
            JSON.stringify(
              body
            )
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

      payload = {
        nonJson:
          true,

        preview:
          text.slice(
            0,
            160
          )
      };
    }

    return {
      response,
      payload,
      contentType
    };
  }

  async function fetchSpaces() {
    const attempts =
      [];

    for (
      const host of
        NOTION_HOSTS
    ) {
      try {
        const result =
          await postNotion(
            host,
            "getSpaces",
            {}
          );

        attempts.push({
          host,

          status:
            result.response.status,

          contentType:
            result.contentType,

          topLevelKeys:
            result.payload &&
            typeof result.payload ===
              "object"
              ? Object.keys(
                  result.payload
                )
              : []
        });

        if (
          result.response.ok &&
          result.payload &&
          typeof result.payload ===
            "object"
        ) {
          return {
            host,

            payload:
              normalizeGetSpacesPayload(
                result.payload
              ),

            attempts
          };
        }
      } catch (error) {
        attempts.push({
          host,

          error:
            error.message ||
            String(error)
        });
      }
    }

    const error =
      new Error(
        "Notion did not return a usable getSpaces response."
      );

    error.attempts =
      attempts;

    throw error;
  }

  async function fetchPublicSpaceData(
    host,
    spaceId,
    userId
  ) {
    const result =
      await postNotion(
        host,
        "getPublicSpaceData",
        {
          type:
            "space-ids",

          spaceIds: [
            spaceId
          ]
        },
        {
          "x-notion-active-user-header":
            userId,

          "x-notion-space-id":
            spaceId
        }
      );

    if (!result.response.ok) {
      throw new Error(
        `getPublicSpaceData returned HTTP ${result.response.status}`
      );
    }

    const results =
      Array.isArray(
        result.payload?.results
      )
        ? result.payload.results
        : [];

    return results;
  }

  async function resolveAdditionalSpaces(
    host,
    payload,
    users,
    allSpaceViewIds,
    spaces
  ) {
    const diagnostics =
      [];

    for (
      const user of
        users
    ) {
      const directSpaceIds =
        new Set(
          Object.values(
            payload?.[user.id]
              ?.space ||
            {}
          )
            .map(
              (record) =>
                unwrapRecord(
                  record
                )?.id
            )
            .filter(Boolean)
            .map(String)
        );

      const missing =
        user.spaceIds.filter(
          (spaceId) =>
            !directSpaceIds.has(
              spaceId
            ) &&
            !spaces.has(
              spaceId
            )
        );

      for (
        const spaceId of
          missing
      ) {
        try {
          const results =
            await fetchPublicSpaceData(
              host,
              spaceId,
              user.id
            );

          diagnostics.push({
            userId:
              user.id,

            spaceId,

            resultCount:
              results.length,

            status:
              "ok"
          });

          for (
            const result of
              results
          ) {
            if (
              !result ||
              typeof result !==
                "object"
            ) {
              continue;
            }

            const resolvedId =
              String(
                result.id ||
                spaceId
              );

            const linkedUsers =
              linkedUsersForSpace(
                payload,
                users,
                resolvedId
              );

            spaces.set(
              resolvedId,
              {
                id:
                  resolvedId,

                spaceId:
                  resolvedId,

                name:
                  result.name ||
                  "Untitled workspace",

                icon:
                  result.icon ||
                  "",

                planInfo:
                  result.planType
                    ? `${
                        capitalize(
                          result.planType
                        )
                      } Plan`
                    : "Guest Access - Invited",

                linkedUsers,

                spaceViewIds:
                  allSpaceViewIds[
                    resolvedId
                  ] ||
                  [],

                source:
                  "getPublicSpaceData"
              }
            );
          }
        } catch (error) {
          diagnostics.push({
            userId:
              user.id,

            spaceId,

            status:
              "error",

            error:
              error.message ||
              String(error)
          });
        }
      }
    }

    return diagnostics;
  }

  function iconText(
    workspace
  ) {
    const icon =
      workspace.icon;

    if (
      typeof icon ===
        "string" &&
      icon.length > 0 &&
      icon.length <= 12 &&
      !/^https?:/i.test(
        icon
      )
    ) {
      return icon;
    }

    const first =
      String(
        workspace.name ||
        "N"
      )
        .trim()
        .charAt(0)
        .toUpperCase();

    return first || "N";
  }

  function workspaceAccountLabel(
    workspace
  ) {
    const users =
      workspace.linkedUsers ||
      [];

    if (!users.length) {
      return workspace.planInfo ||
        "";
    }

    const primary =
      users[0];

    const identity =
      primary.email ||
      primary.name ||
      primary.id;

    if (
      identity &&
      workspace.planInfo
    ) {
      return (
        `${identity} · ` +
        workspace.planInfo
      );
    }

    return (
      identity ||
      workspace.planInfo ||
      ""
    );
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
        iconText(
          workspace
        );

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
        workspaceAccountLabel(
          workspace
        );

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

  async function discoverWorkspaces() {
    const getSpaces =
      await fetchSpaces();

    const {
      users,
      allSpaceViewIds
    } =
      buildContext(
        getSpaces.payload
      );

    const spaces =
      buildDirectSpaces(
        getSpaces.payload,
        users,
        allSpaceViewIds
      );

    const directCount =
      spaces.size;

    const additionalAttempts =
      await resolveAdditionalSpaces(
        getSpaces.host,
        getSpaces.payload,
        users,
        allSpaceViewIds,
        spaces
      );

    const workspaces = [
      ...spaces.values()
    ].sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );

    return {
      workspaces,

      diagnostics: {
        endpoint:
          `${getSpaces.host}/api/v3/getSpaces`,

        usersFound:
          users.length,

        users:
          users.map(
            (user) => ({
              id:
                user.id,

              email:
                user.email ||
                "",

              spaceCount:
                user.spaceIds.length
            })
          ),

        directSpacesFound:
          directCount,

        additionalSpaceAttempts:
          additionalAttempts,

        totalWorkspacesFound:
          workspaces.length,

        getSpacesAttempts:
          getSpaces.attempts,

        sources:
          workspaces.reduce(
            (
              result,
              workspace
            ) => {
              const source =
                workspace.source ||
                "unknown";

              result[source] =
                (
                  result[source] ||
                  0
                ) + 1;

              return result;
            },
            {}
          )
      }
    };
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
        "Reading workspace information from your existing Notion browser session…"
      );

      const result =
        await discoverWorkspaces();

      els.diagnosticText.textContent =
        JSON.stringify(
          result.diagnostics,
          null,
          2
        );

      els.diagnostics.classList.remove(
        "hidden"
      );

      if (
        !result.workspaces.length
      ) {
        throw new Error(
          "Notion responded, but no workspaces could be resolved."
        );
      }

      renderWorkspaces(
        result.workspaces
      );

      setStatus(
        `Success. Found ${
          result.workspaces.length
        } workspace${
          result.workspaces.length === 1
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
