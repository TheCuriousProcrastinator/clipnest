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

            linkedUsers:
              linkedUsersForSpace(
                payload,
                users,
                spaceId
              ),

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

  async function hasPermission() {
    return chrome.permissions
      .contains({
        origins:
          NOTION_ORIGINS
      });
  }

  async function requestPermission() {
    const granted =
      await hasPermission();

    if (granted) {
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
    {
      userId = "",
      spaceId = ""
    } = {}
  ) {
    const headers = {
      Accept:
        "application/json",

      "Content-Type":
        "application/json"
    };

    if (userId) {
      headers[
        "x-notion-active-user-header"
      ] = userId;
    }

    if (spaceId) {
      headers[
        "x-notion-space-id"
      ] = spaceId;
    }

    const response =
      await fetch(
        `${host}/api/v3/${path}`,
        {
          method:
            "POST",

          credentials:
            "include",

          headers,

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

    let payload;

    if (
      contentType.includes(
        "application/json"
      )
    ) {
      payload =
        await response.json();
    } else {
      payload = {
        preview:
          (
            await response.text()
          ).slice(
            0,
            160
          )
      };
    }

    if (!response.ok) {
      const error =
        new Error(
          payload?.message ||
          `Notion returned HTTP ${response.status} for ${path}.`
        );

      error.status =
        response.status;

      error.payload =
        payload;

      throw error;
    }

    return payload;
  }

  async function fetchSpaces() {
    const attempts =
      [];

    for (
      const host of
        NOTION_HOSTS
    ) {
      try {
        const payload =
          await postNotion(
            host,
            "getSpaces",
            {}
          );

        attempts.push({
          host,
          status:
            200
        });

        return {
          host,

          payload:
            normalizeGetSpacesPayload(
              payload
            ),

          attempts
        };
      } catch (error) {
        attempts.push({
          host,

          status:
            error.status ||
            null,

          error:
            error.message ||
            String(error)
        });
      }
    }

    const error =
      new Error(
        "Notion browser session is unavailable. Open Notion in Chrome and sign in."
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
    const payload =
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
          userId,
          spaceId
        }
      );

    return Array.isArray(
      payload?.results
    )
      ? payload.results
      : [];
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

            status:
              "ok",

            resultCount:
              results.length
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

                linkedUsers:
                  linkedUsersForSpace(
                    payload,
                    users,
                    resolvedId
                  ),

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

  function notionPlainText(
    value,
    fallback = ""
  ) {
    const parts =
      [];

    const seen =
      new Set();

    function visit(
      item
    ) {
      if (
        item === null ||
        item === undefined
      ) {
        return;
      }

      if (
        typeof item ===
          "string"
      ) {
        parts.push(
          item
        );

        return;
      }

      if (
        typeof item !==
          "object"
      ) {
        return;
      }

      if (seen.has(item)) {
        return;
      }

      seen.add(item);

      if (
        Array.isArray(item)
      ) {
        for (
          const child of item
        ) {
          visit(child);
        }

        return;
      }

      for (
        const key of [
          "plain_text",
          "content",
          "text",
          "title",
          "name",
          "value"
        ]
      ) {
        if (
          Object.prototype.hasOwnProperty.call(
            item,
            key
          )
        ) {
          const before =
            parts.length;

          visit(
            item[key]
          );

          if (
            parts.length >
            before
          ) {
            return;
          }
        }
      }
    }

    visit(
      value
    );

    return (
      parts
        .join("")
        .trim() ||
      fallback
    );
  }

  function notionPageName(
    page
  ) {
    return notionPlainText(
      page?.properties?.title,
      "Untitled"
    );
  }

  function notionCollectionName(
    collection
  ) {
    const candidates = [
      collection?.name,
      collection?.title,
      collection?.properties?.title,
      collection?.properties?.Name,
      collection?.properties?.name
    ];

    for (
      const candidate of
        candidates
    ) {
      const name =
        notionPlainText(
          candidate,
          ""
        );

      if (name) {
        return name;
      }
    }

    return "Untitled database";
  }

  function deepUnwrapNotionRecord(
    record
  ) {
    let current =
      record;

    let role =
      record?.role ||
      "";

    for (
      let depth = 0;
      depth < 6;
      depth += 1
    ) {
      if (
        !current ||
        typeof current !==
          "object" ||
        !Object.prototype
          .hasOwnProperty
          .call(
            current,
            "value"
          )
      ) {
        break;
      }

      if (
        !role &&
        current.role
      ) {
        role =
          current.role;
      }

      const next =
        current.value;

      if (
        next === null ||
        next === undefined
      ) {
        break;
      }

      if (
        typeof next !==
          "object"
      ) {
        break;
      }

      current =
        next;
    }

    if (
      !role &&
      current?.role
    ) {
      role =
        current.role;
    }

    return {
      value:
        current,

      role
    };
  }

  function notionRecord(
    recordMap,
    table,
    id
  ) {
    if (
      !recordMap ||
      !table ||
      !id
    ) {
      return null;
    }

    const record =
      recordMap
        ?.[table]
        ?.[id];

    return deepUnwrapNotionRecord(
      record
    ).value;
  }

  function notionParentPath(
    recordMap,
    parentId,
    parentTable = "block"
  ) {
    const parents =
      [];

    const seen =
      new Set();

    let currentId =
      parentId;

    let currentTable =
      parentTable ||
      "block";

    for (
      let depth = 0;
      depth < 20;
      depth += 1
    ) {
      if (!currentId) {
        break;
      }

      const key =
        `${currentTable}:${currentId}`;

      if (seen.has(key)) {
        break;
      }

      seen.add(key);

      const collection =
        notionRecord(
          recordMap,
          "collection",
          currentId
        );

      let current =
        notionRecord(
          recordMap,
          currentTable,
          currentId
        );

      if (
        !current &&
        currentTable !==
          "block"
      ) {
        current =
          notionRecord(
            recordMap,
            "block",
            currentId
          );
      }

      if (collection) {
        parents.push({
          id:
            collection.id ||
            currentId,

          type:
            "collection",

          name:
            notionCollectionName(
              collection
            ),

          icon:
            collection.icon ||
            ""
        });

        current =
          collection;
      } else if (
        current?.type ===
          "page"
      ) {
        parents.push({
          id:
            current.id ||
            currentId,

          type:
            "page",

          name:
            notionPageName(
              current
            ),

          icon:
            current.format
              ?.page_icon ||
            ""
        });
      }

      if (!current) {
        break;
      }

      currentId =
        current.parent_id ||
        "";

      currentTable =
        current.parent_table ||
        "block";
    }

    return parents.reverse();
  }

  function notionSearchSessionId() {
    if (
      globalThis.crypto
        ?.randomUUID
    ) {
      return crypto.randomUUID();
    }

    return (
      `${Date.now()}-` +
      Math.random()
        .toString(16)
        .slice(2)
    );
  }

  function normalizeDestinationSearch(
    payload,
    workspaceId
  ) {
    const recordMap =
      payload?.recordMap ||
      {};

    const results =
      Array.isArray(
        payload?.results
      )
        ? payload.results
        : [];

    const destinations =
      [];

    const seen =
      new Set();

    const resultOrder =
      new Map();

    function getRecord(
      table,
      id
    ) {
      if (!id) {
        return {
          wrapper:
            null,

          value:
            null,

          role:
            ""
        };
      }

      const wrapper =
        recordMap
          ?.[table]
          ?.[id] ||
        null;

      const normalized =
        deepUnwrapNotionRecord(
          wrapper
        );

      return {
        wrapper,

        value:
          normalized.value,

        role:
          normalized.role ||
          wrapper?.role ||
          ""
      };
    }

    function collectionIdFromBlock(
      block
    ) {
      return String(
        block?.collection_id ||
        block?.format
          ?.collection_pointer
          ?.id ||
        block?.format
          ?.collection_pointers
          ?.[0]
          ?.id ||
        ""
      );
    }

    /*
     * Notion's results[] is useful for relevance,
     * but it is NOT the complete set of records
     * returned by search.
     *
     * Save to Notion reads destinations directly
     * from recordMap. We do the same, while keeping
     * results[] only as an ordering hint.
     */
    for (
      let index = 0;
      index < results.length;
      index += 1
    ) {
      const result =
        results[index];

      const resultId =
        String(
          result?.id ||
          ""
        );

      if (!resultId) {
        continue;
      }

      const block =
        getRecord(
          "block",
          resultId
        ).value;

      const collection =
        getRecord(
          "collection",
          resultId
        ).value;

      if (
        block?.type ===
          "page"
      ) {
        resultOrder.set(
          `page:${String(
            block.id ||
            resultId
          )}`,
          index
        );
      }

      if (
        block?.type ===
          "collection_view" ||
        block?.type ===
          "collection_view_page"
      ) {
        const collectionId =
          collectionIdFromBlock(
            block
          );

        if (collectionId) {
          resultOrder.set(
            `collection:${collectionId}`,
            index
          );
        }
      }

      if (collection) {
        resultOrder.set(
          `collection:${String(
            collection.id ||
            resultId
          )}`,
          index
        );
      }
    }

    function pushPage(
      recordId
    ) {
      const record =
        getRecord(
          "block",
          recordId
        );

      const item =
        record.value;

      if (
        !item ||
        item.type !==
          "page" ||
        item.alive ===
          false ||
        item.is_template
      ) {
        return;
      }

      const id =
        String(
          item.id ||
          recordId
        );

      if (!id) {
        return;
      }

      const key =
        `page:${id}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);

      const parents =
        notionParentPath(
          recordMap,
          item.parent_id,
          item.parent_table ||
            "block"
        );

      destinations.push({
        key,

        id,

        type:
          "page",

        name:
          notionPlainText(
            item.properties
              ?.title,
            "Untitled"
          ),

        icon:
          item.format
            ?.page_icon ||
          "",

        parents,

        breadcrumb:
          parents
            .map(
              (parent) =>
                parent.name
            )
            .filter(Boolean)
            .join(" / "),

        workspaceId,

        parentId:
          item.parent_id ||
          "",

        parentTable:
          item.parent_table ||
          "block",

        role:
          record.role ||
          "",

        _searchRank:
          resultOrder.has(
            key
          )
            ? resultOrder.get(
                key
              )
            : Number.MAX_SAFE_INTEGER,

        _lastEdited:
          Number(
            item.last_edited_time ||
            0
          )
      });
    }

    function pushCollection(
      recordId
    ) {
      const record =
        getRecord(
          "collection",
          recordId
        );

      const item =
        record.value;

      if (
        !item ||
        item.alive ===
          false ||
        item.is_template
      ) {
        return;
      }

      const id =
        String(
          item.id ||
          recordId
        );

      if (!id) {
        return;
      }

      const key =
        `collection:${id}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);

      const parents =
        notionParentPath(
          recordMap,
          item.parent_id,
          "block"
        );

      destinations.push({
        key,

        id,

        type:
          "collection",

        name:
          notionPlainText(
            item.name,
            notionPlainText(
              item.title,
              "Untitled database"
            )
          ),

        icon:
          item.icon ||
          item.format
            ?.page_icon ||
          "",

        parents,

        breadcrumb:
          parents
            .map(
              (parent) =>
                parent.name
            )
            .filter(Boolean)
            .join(" / "),

        workspaceId,

        parentId:
          item.parent_id ||
          "",

        parentTable:
          "block",

        role:
          record.role ||
          "",

        _searchRank:
          resultOrder.has(
            key
          )
            ? resultOrder.get(
                key
              )
            : Number.MAX_SAFE_INTEGER,

        _lastEdited:
          Number(
            item.last_edited_time ||
            0
          )
      });
    }

    /*
     * This is the important parity fix.
     *
     * Do not restrict extraction to payload.results.
     */
    for (
      const recordId of
        Object.keys(
          recordMap.block ||
          {}
        )
    ) {
      pushPage(
        recordId
      );
    }

    for (
      const recordId of
        Object.keys(
          recordMap.collection ||
          {}
        )
    ) {
      pushCollection(
        recordId
      );
    }

    destinations.sort(
      (a, b) => {
        if (
          a._searchRank !==
          b._searchRank
        ) {
          return (
            a._searchRank -
            b._searchRank
          );
        }

        if (
          a._lastEdited !==
          b._lastEdited
        ) {
          return (
            b._lastEdited -
            a._lastEdited
          );
        }

        return a.name.localeCompare(
          b.name
        );
      }
    );

    return destinations.map(
      ({
        _searchRank,
        _lastEdited,
        ...destination
      }) =>
        destination
    );
  }

  async function getDatabaseSchema({
    workspaceId,
    userId,
    collectionId,
    parentPageId
  } = {}) {
    const spaceId =
      String(
        workspaceId ||
        ""
      ).trim();

    const activeUserId =
      String(
        userId ||
        ""
      ).trim();

    const databaseId =
      String(
        collectionId ||
        ""
      ).trim();

    const pageId =
      String(
        parentPageId ||
        ""
      ).trim();

    if (!spaceId) {
      throw new Error(
        "Notion workspace is missing."
      );
    }

    if (!activeUserId) {
      throw new Error(
        "Notion user is missing."
      );
    }

    if (!databaseId) {
      throw new Error(
        "Notion database is missing."
      );
    }

    if (!pageId) {
      throw new Error(
        "Notion database parent page is missing."
      );
    }

    const attempts =
      [];

    for (
      const host of
        NOTION_HOSTS
    ) {
      try {
        const payload =
          await postNotion(
            host,
            "loadPageChunk",
            {
              pageId,

              limit:
                100,

              cursor: {
                stack:
                  []
              },

              chunkNumber:
                0,

              verticalColumns:
                false
            },
            {
              userId:
                activeUserId,

              spaceId
            }
          );

        const raw =
          payload
            ?.recordMap
            ?.collection
            ?.[databaseId];

        const normalized =
          deepUnwrapNotionRecord(
            raw
          );

        const collection =
          normalized.value;

        if (!collection) {
          throw new Error(
            "Database record was not returned by Notion."
          );
        }

        const schema =
          collection.schema &&
          typeof collection.schema ===
            "object"
            ? collection.schema
            : {};

        const properties =
          Object.entries(
            schema
          )
            .map(
              ([
                id,
                property
              ]) => ({
                id,

                name:
                  String(
                    property?.name ||
                    ""
                  ).trim() ||
                  id,

                type:
                  String(
                    property?.type ||
                    ""
                  ).trim(),

                options:
                  Array.isArray(
                    property?.options
                  )
                    ? property.options
                    : [],

                collectionId:
                  property?.collection_id ||
                  property
                    ?.collection_pointer
                    ?.id ||
                  "",

                numberFormat:
                  String(
                    property?.number_format ||
                    ""
                  ).trim()
              })
            )
            .sort(
              (a, b) =>
                a.name.localeCompare(
                  b.name
                )
            );

        attempts.push({
          host,

          status:
            "ok",

          propertyCount:
            properties.length
        });

        return {
          host,

          collectionId:
            databaseId,

          parentPageId:
            pageId,

          name:
            notionPlainText(
              collection.name,
              "Untitled database"
            ),

          icon:
            collection.icon ||
            "",

          role:
            normalized.role ||
            raw?.role ||
            "",

          schema,

          properties,

          attempts
        };
      } catch (error) {
        attempts.push({
          host,

          status:
            "error",

          httpStatus:
            error.status ||
            null,

          error:
            error.message ||
            String(error)
        });
      }
    }

    const error =
      new Error(
        "ClipNest could not read this Notion database schema."
      );

    error.attempts =
      attempts;

    throw error;
  }

  function createNotionId() {
    if (
      globalThis.crypto
        ?.randomUUID
    ) {
      return crypto.randomUUID();
    }

    const hex =
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";

    return hex.replace(
      /[xy]/g,
      (char) => {
        const random =
          Math.random() *
          16 |
          0;

        const value =
          char === "x"
            ? random
            : (
                random &
                0x3 |
                0x8
              );

        return value.toString(
          16
        );
      }
    );
  }

  function normalizeNotionRecordId(
    value
  ) {
    const raw =
      String(
        value ||
        ""
      )
        .replace(
          /-/g,
          ""
        )
        .slice(
          -32
        );

    if (
      !/^[0-9a-f]{32}$/i.test(
        raw
      )
    ) {
      return String(
        value ||
        ""
      ).trim();
    }

    return [
      raw.slice(
        0,
        8
      ),
      raw.slice(
        8,
        12
      ),
      raw.slice(
        12,
        16
      ),
      raw.slice(
        16,
        20
      ),
      raw.slice(
        20
      )
    ].join(
      "-"
    );
  }

  function notionPageUrl(
    pageId
  ) {
    return (
      "https://www.notion.so/" +
      String(
        pageId ||
        ""
      ).replace(
        /-/g,
        ""
      )
    );
  }

function encodeDatabaseProperties({
    title = "",
    url = "",
    tags = [],
    propertyIds = {},
    customFields = []
  } = {}) {
    const properties =
      {};

    const titleId =
      String(
        propertyIds.title ||
        ""
      ).trim();

    const urlId =
      String(
        propertyIds.url ||
        ""
      ).trim();

    const tagsId =
      String(
        propertyIds.tags ||
        ""
      ).trim();

    if (titleId) {
      properties[
        titleId
      ] = [
        [
          String(
            title ||
            ""
          )
        ]
      ];
    }

    if (
      urlId &&
      url
    ) {
      properties[
        urlId
      ] = [
        [
          String(
            url
          )
        ]
      ];
    }

    const cleanTags =
      Array.isArray(
        tags
      )
        ? [
            ...new Set(
              tags
                .map(
                  (tag) =>
                    String(
                      tag ||
                      ""
                    ).trim()
                )
                .filter(Boolean)
            )
          ]
        : [];

    if (
      tagsId &&
      cleanTags.length
    ) {
      properties[
        tagsId
      ] = [
        [
          cleanTags.join(
            ","
          )
        ]
      ];
    }

    for (
      const field of
        (
          Array.isArray(
            customFields
          )
            ? customFields
            : []
        )
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

      if (
        !propertyId ||
        ![
          "select",
          "status",
          "text",
          "rich_text",
          "checkbox",
          "number",
          "date"
        ].includes(
          propertyType
        )
      ) {
        continue;
      }

      if (
        propertyId ===
          titleId ||
        propertyId ===
          urlId ||
        propertyId ===
          tagsId
      ) {
        continue;
      }

      const rawValue =
        field?.value;

      if (
        propertyType ===
          "checkbox"
      ) {
        const checked =
          rawValue ===
            true ||
          String(
            rawValue ??
            ""
          )
            .trim()
            .toLowerCase() ===
            "true" ||
          String(
            rawValue ??
            ""
          )
            .trim()
            .toLowerCase() ===
            "yes";

        properties[
          propertyId
        ] = [
          [
            checked
              ? "Yes"
              : "No"
          ]
        ];

        continue;
      }

      if (
        propertyType ===
          "number"
      ) {
        const value =
          String(
            rawValue ??
            ""
          ).trim();

        if (!value) {
          continue;
        }

        const parsed =
          Number.parseFloat(
            value
          );

        if (
          !Number.isFinite(
            parsed
          )
        ) {
          continue;
        }

        const normalized =
          String(
            field?.numberFormat ||
            ""
          ) === "percent"
            ? parsed / 100
            : parsed;

        properties[
          propertyId
        ] = [
          [
            String(
              normalized
            )
          ]
        ];

        continue;
      }

      if (
        propertyType ===
          "date"
      ) {
        const rawDate =
          String(
            rawValue ??
            ""
          ).trim();

        if (!rawDate) {
          continue;
        }

        let dateValue =
          "";

        if (
          /^\d{4}-\d{2}-\d{2}$/
            .test(
              rawDate
            )
        ) {
          dateValue =
            rawDate;
        } else {
          const parsed =
            new Date(
              rawDate
            );

          if (
            Number.isNaN(
              parsed.getTime()
            )
          ) {
            continue;
          }

          const year =
            parsed.getFullYear();

          const month =
            String(
              parsed.getMonth() +
              1
            ).padStart(
              2,
              "0"
            );

          const day =
            String(
              parsed.getDate()
            ).padStart(
              2,
              "0"
            );

          dateValue =
            `${year}-${month}-${day}`;
        }

        properties[
          propertyId
        ] = [
          [
            "‣",
            [
              [
                "d",
                {
                  type:
                    "date",

                  start_date:
                    dateValue
                }
              ]
            ]
          ]
        ];

        continue;
      }

      const value =
        String(
          rawValue ??
          ""
        ).trim();

      if (!value) {
        continue;
      }

      properties[
        propertyId
      ] = [
        [
          value
        ]
      ];
    }

    return properties;
  }

  function buildCreatePageOperations({
    pageId,
    workspaceId,
    userId,
    parentId,
    parentTable,
    title = "",
    properties = {}
  }) {
    const id =
      normalizeNotionRecordId(
        pageId
      );

    const spaceId =
      normalizeNotionRecordId(
        workspaceId
      );

    const parent =
      normalizeNotionRecordId(
        parentId
      );

    const table =
      parentTable ===
        "collection"
        ? "collection"
        : "block";

    const now =
      Date.now();

    const pageProperties = {
      ...(
        table ===
          "block" &&
        title
          ? {
              title: [
                [
                  String(
                    title
                  )
                ]
              ]
            }
          : {}
      ),

      ...(
        properties &&
        typeof properties ===
          "object"
          ? properties
          : {}
      )
    };

    const operations = [
      {
        id,

        table:
          "block",

        path:
          [],

        command:
          "update",

        args: {
          type:
            "page",

          id,

          space_id:
            spaceId,

          parent_id:
            parent,

          parent_table:
            table,

          alive:
            true,

          version:
            1,

          created_time:
            now,

          last_edited_time:
            now,

          ...(
            userId
              ? {
                  created_by_table:
                    "notion_user",

                  created_by_id:
                    userId,

                  last_edited_by_table:
                    "notion_user",

                  last_edited_by_id:
                    userId
                }
              : {}
          ),

          properties:
            pageProperties
        }
      }
    ];

    if (
      table ===
        "block"
    ) {
      operations.push({
        table:
          "block",

        id:
          parent,

        path: [
          "content"
        ],

        command:
          "listAfter",

        args: {
          id
        }
      });
    }

    return operations;
  }

  async function submitOperations({
    workspaceId,
    userId,
    operations
  } = {}) {
    const spaceId =
      String(
        workspaceId ||
        ""
      ).trim();

    const activeUserId =
      String(
        userId ||
        ""
      ).trim();

    if (!spaceId) {
      throw new Error(
        "Notion workspace is missing."
      );
    }

    if (!activeUserId) {
      throw new Error(
        "Notion user is missing."
      );
    }

    if (
      !Array.isArray(
        operations
      ) ||
      !operations.length
    ) {
      throw new Error(
        "No Notion operations were provided."
      );
    }

    const normalizedOperations =
      operations.map(
        (operation) => {
          if (
            operation.pointer
              ?.id &&
            operation.pointer
              ?.table &&
            operation.pointer
              ?.spaceId
          ) {
            return operation;
          }

          return {
            ...operation,

            pointer: {
              id:
                operation.id ??
                operation.pointer
                  ?.id,

              table:
                operation.table ??
                operation.pointer
                  ?.table,

              spaceId:
                operation.spaceId ??
                operation.space_id ??
                spaceId
            }
          };
        }
      );

    const attempts =
      [];

    for (
      const host of
        NOTION_HOSTS
    ) {
      try {
        const response =
          await postNotion(
            host,
            "saveTransactionsFanout",
            {
              requestId:
                createNotionId(),

              transactions: [
                {
                  id:
                    createNotionId(),

                  spaceId,

                  operations:
                    normalizedOperations
                }
              ]
            },
            {
              userId:
                activeUserId,

              spaceId
            }
          );

        attempts.push({
          host,

          status:
            "ok"
        });

        return {
          host,
          response,
          attempts
        };
      } catch (error) {
        attempts.push({
          host,

          status:
            "error",

          httpStatus:
            error.status ||
            null,

          error:
            error.message ||
            String(error)
        });
      }
    }

    const error =
      new Error(
        "ClipNest could not write to this Notion workspace."
      );

    error.attempts =
      attempts;

    throw error;
  }

  function cleanMarkdownInlineText(
    value
  ) {
    return String(
      value ||
      ""
    )
      .replace(
        /!\[([^\]]*)\]\([^)]+\)/g,
        "$1"
      )
      .replace(
        /\*\*([^*]+)\*\*/g,
        "$1"
      )
      .replace(
        /__([^_]+)__/g,
        "$1"
      )
      .replace(
        /~~([^~]+)~~/g,
        "$1"
      )
      .replace(
        /`([^`]+)`/g,
        "$1"
      )
      .replace(
        /\\([\\`*_[\]{}()#+\-.!>])/g,
        "$1"
      );
  }

  function notionInlineRichText(
    value
  ) {
    const source =
      String(
        value ||
        ""
      );

    const segments =
      [];

    const linkPattern =
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

    let lastIndex =
      0;

    let match =
      null;

    while (
      (
        match =
          linkPattern.exec(
            source
          )
      )
    ) {
      if (
        match.index >
        lastIndex
      ) {
        const before =
          cleanMarkdownInlineText(
            source.slice(
              lastIndex,
              match.index
            )
          );

        if (before) {
          segments.push([
            before
          ]);
        }
      }

      const label =
        cleanMarkdownInlineText(
          match[1]
        ) ||
        match[2];

      segments.push([
        label,
        [
          [
            "a",
            match[2]
          ]
        ]
      ]);

      lastIndex =
        match.index +
        match[0].length;
    }

    if (
      lastIndex <
      source.length
    ) {
      const after =
        cleanMarkdownInlineText(
          source.slice(
            lastIndex
          )
        );

      if (after) {
        segments.push([
          after
        ]);
      }
    }

    if (!segments.length) {
      const plain =
        cleanMarkdownInlineText(
          source
        );

      if (plain) {
        segments.push([
          plain
        ]);
      }
    }

    return segments;
  }

  function splitNotionBlockText(
    value,
    maxLength = 1800
  ) {
    const text =
      String(
        value ||
        ""
      );

    if (
      text.length <=
      maxLength
    ) {
      return [
        text
      ];
    }

    const chunks =
      [];

    let rest =
      text;

    while (
      rest.length >
      maxLength
    ) {
      let cut =
        rest.lastIndexOf(
          "\n",
          maxLength
        );

      if (
        cut <
        maxLength *
          0.55
      ) {
        cut =
          rest.lastIndexOf(
            " ",
            maxLength
          );
      }

      if (
        cut <
        maxLength *
          0.55
      ) {
        cut =
          maxLength;
      }

      const chunk =
        rest
          .slice(
            0,
            cut
          )
          .trim();

      if (chunk) {
        chunks.push(
          chunk
        );
      }

      rest =
        rest
          .slice(
            cut
          )
          .trimStart();
    }

    if (
      rest.trim()
    ) {
      chunks.push(
        rest.trim()
      );
    }

    return chunks;
  }

  function isMarkdownTableSeparator(
    line
  ) {
    const value =
      String(
        line ||
        ""
      ).trim();

    if (
      !value.includes(
        "|"
      )
    ) {
      return false;
    }

    const cells =
      value
        .replace(
          /^\|/,
          ""
        )
        .replace(
          /\|$/,
          ""
        )
        .split(
          "|"
        )
        .map(
          (cell) =>
            cell.trim()
        );

    return (
      cells.length >=
        2 &&
      cells.every(
        (cell) =>
          /^:?-{3,}:?$/.test(
            cell
          )
      )
    );
  }

  function markdownToNotionBlocks(
    markdown
  ) {
    const lines =
      String(
        markdown ||
        ""
      )
        .replace(
          /\r\n?/g,
          "\n"
        )
        .split(
          "\n"
        );

    const blocks =
      [];

    let paragraph =
      [];

    let codeFence =
      null;

    function pushBlock(
      type,
      text = "",
      extra = {}
    ) {
      if (
        type !==
          "divider" &&
        !String(
          text ||
          ""
        ).trim()
      ) {
        return;
      }

      const pieces =
        type ===
          "divider"
          ? [
              ""
            ]
          : splitNotionBlockText(
              text
            );

      for (
        const piece of
          pieces
      ) {
        blocks.push({
          type,
          text:
            piece,
          ...extra
        });
      }
    }

    function flushParagraph() {
      if (!paragraph.length) {
        return;
      }

      const value =
        paragraph
          .join(
            "\n"
          )
          .trim();

      paragraph =
        [];

      if (value) {
        pushBlock(
          "text",
          value
        );
      }
    }

    for (
      let index = 0;
      index <
        lines.length;
      index += 1
    ) {
      const line =
        lines[index];

      if (codeFence) {
        if (
          /^```/.test(
            line.trim()
          )
        ) {
          pushBlock(
            "code",
            codeFence.lines.join(
              "\n"
            ),
            {
              language:
                codeFence.language ||
                "Plain Text"
            }
          );

          codeFence =
            null;

          continue;
        }

        codeFence.lines.push(
          line
        );

        continue;
      }

      const fence =
        line.match(
          /^```([^`]*)$/
        );

      if (fence) {
        flushParagraph();

        codeFence = {
          language:
            fence[1]
              .trim() ||
            "Plain Text",

          lines:
            []
        };

        continue;
      }

      if (
        line.includes(
          "|"
        ) &&
        index + 1 <
          lines.length &&
        isMarkdownTableSeparator(
          lines[
            index + 1
          ]
        )
      ) {
        flushParagraph();

        const table =
          [
            line,
            lines[
              index + 1
            ]
          ];

        index += 2;

        while (
          index <
            lines.length &&
          lines[index]
            .includes(
              "|"
            ) &&
          lines[index]
            .trim()
        ) {
          table.push(
            lines[index]
          );

          index += 1;
        }

        index -= 1;

        pushBlock(
          "code",
          table.join(
            "\n"
          ),
          {
            language:
              "Markdown"
          }
        );

        continue;
      }

      if (
        !line.trim()
      ) {
        flushParagraph();
        continue;
      }

      const heading =
        line.match(
          /^(#{1,3})\s+(.+)$/
        );

      if (heading) {
        flushParagraph();

        pushBlock(
          heading[1].length ===
            1
            ? "header"
            : (
                heading[1].length ===
                  2
                  ? "sub_header"
                  : "sub_sub_header"
              ),
          heading[2]
        );

        continue;
      }

      if (
        /^\s*(?:---+|\*\*\*+|___+)\s*$/.test(
          line
        )
      ) {
        flushParagraph();

        pushBlock(
          "divider"
        );

        continue;
      }

      const bullet =
        line.match(
          /^\s*[-*+]\s+(.+)$/
        );

      if (bullet) {
        flushParagraph();

        pushBlock(
          "bulleted_list",
          bullet[1]
        );

        continue;
      }

      const numbered =
        line.match(
          /^\s*\d+[.)]\s+(.+)$/
        );

      if (numbered) {
        flushParagraph();

        pushBlock(
          "numbered_list",
          numbered[1]
        );

        continue;
      }

      const quote =
        line.match(
          /^\s*>\s?(.*)$/
        );

      if (quote) {
        flushParagraph();

        const quoteLines =
          [
            quote[1]
          ];

        while (
          index + 1 <
            lines.length
        ) {
          const next =
            lines[
              index + 1
            ].match(
              /^\s*>\s?(.*)$/
            );

          if (!next) {
            break;
          }

          index += 1;

          quoteLines.push(
            next[1]
          );
        }

        pushBlock(
          "quote",
          quoteLines.join(
            "\n"
          )
        );

        continue;
      }

      paragraph.push(
        line
      );
    }

    if (codeFence) {
      pushBlock(
        "code",
        codeFence.lines.join(
          "\n"
        ),
        {
          language:
            codeFence.language ||
            "Plain Text"
        }
      );
    }

    flushParagraph();

    return blocks;
  }

  function buildAppendMarkdownOperations({
    workspaceId,
    userId,
    parentPageId,
    markdown
  } = {}) {
    const spaceId =
      normalizeNotionRecordId(
        workspaceId
      );

    const parentId =
      normalizeNotionRecordId(
        parentPageId
      );

    if (!spaceId) {
      throw new Error(
        "Notion workspace is missing."
      );
    }

    if (!parentId) {
      throw new Error(
        "Notion parent page is missing."
      );
    }

    const blocks =
      markdownToNotionBlocks(
        markdown
      );

    const operations =
      [];

    const blockIds =
      [];

    let previousId =
      "";

    for (
      const block of
        blocks
    ) {
      const id =
        createNotionId();

      const now =
        Date.now();

      const properties =
        {};

      if (
        block.type !==
          "divider"
      ) {
        properties.title =
          notionInlineRichText(
            block.text
          );
      }

      if (
        block.type ===
          "code"
      ) {
        properties.language = [
          [
            block.language ||
            "Plain Text"
          ]
        ];
      }

      operations.push({
        id,

        table:
          "block",

        path:
          [],

        command:
          "update",

        args: {
          type:
            block.type,

          id,

          space_id:
            spaceId,

          parent_id:
            parentId,

          parent_table:
            "block",

          alive:
            true,

          version:
            1,

          created_time:
            now,

          last_edited_time:
            now,

          ...(
            userId
              ? {
                  created_by_table:
                    "notion_user",

                  created_by_id:
                    userId,

                  last_edited_by_table:
                    "notion_user",

                  last_edited_by_id:
                    userId
                }
              : {}
          ),

          ...(
            Object.keys(
              properties
            ).length
              ? {
                  properties
                }
              : {}
          )
        }
      });

      operations.push({
        table:
          "block",

        id:
          parentId,

        path: [
          "content"
        ],

        command:
          "listAfter",

        args: {
          ...(
            previousId
              ? {
                  after:
                    previousId
                }
              : {}
          ),

          id
        }
      });

      blockIds.push(
        id
      );

      previousId =
        id;
    }

    return {
      blocks,
      blockIds,
      operations
    };
  }

  function chunkNotionOperations(
    operations,
    maxOperations = 200
  ) {
    const chunks =
      [];

    for (
      let index = 0;
      index <
        operations.length;
      index +=
        maxOperations
    ) {
      chunks.push(
        operations.slice(
          index,
          index +
            maxOperations
        )
      );
    }

    return chunks;
  }

  async function appendMarkdownToPage({
    workspaceId,
    userId,
    pageId,
    markdown
  } = {}) {
    const built =
      buildAppendMarkdownOperations({
        workspaceId,
        userId,
        parentPageId:
          pageId,
        markdown
      });

    if (
      !built.operations.length
    ) {
      return {
        blockCount:
          0,

        blockIds:
          []
      };
    }

    const chunks =
      chunkNotionOperations(
        built.operations,
        200
      );

    for (
      const operations of
        chunks
    ) {
      await submitOperations({
        workspaceId,
        userId,
        operations
      });
    }

    return {
      blockCount:
        built.blockIds.length,

      blockIds:
        built.blockIds
    };
  }

  async function createPage({
    workspaceId,
    userId,
    parentId,
    parentTable = "block",
    title = "",
    properties = {}
  } = {}) {
    const pageId =
      createNotionId();

    const operations =
      buildCreatePageOperations({
        pageId,
        workspaceId,
        userId,
        parentId,
        parentTable,
        title,
        properties
      });

    await submitOperations({
      workspaceId,
      userId,
      operations
    });

    return {
      id:
        pageId,

      url:
        notionPageUrl(
          pageId
        )
    };
  }

  async function searchDestinations({
    workspaceId,
    userId,
    query = ""
  } = {}) {
    const spaceId =
      String(
        workspaceId ||
        ""
      ).trim();

    const activeUserId =
      String(
        userId ||
        ""
      ).trim();

    if (!spaceId) {
      throw new Error(
        "Choose a Notion workspace first."
      );
    }

    if (!activeUserId) {
      throw new Error(
        "ClipNest could not determine the Notion user for this workspace."
      );
    }

    const request = {
      type:
        "BlocksInSpace",

      query:
        String(
          query ||
          ""
        ),

      spaceId,

      limit:
        20,

      filters: {
        isDeletedOnly:
          false,

        excludeTemplates:
          false,

        navigableBlockContentOnly:
          false,

        requireEditPermissions:
          false,

        includePublicPagesWithoutExplicitAccess:
          false,

        ancestors:
          [],

        createdBy:
          [],

        editedBy:
          [],

        lastEditedTime:
          {},

        createdTime:
          {},

        inTeams:
          [],

        excludeSurrogateCollections:
          false,

        excludedParentCollectionIds:
          []
      },

      sort: {
        field:
          "relevance"
      },

      source:
        "quick_find_input_change",

      searchExperimentOverrides:
        {},

      searchSessionId:
        notionSearchSessionId(),

      searchSessionFlowNumber:
        2,

      recentPagesForBoosting:
        [],

      excludedBlockIds:
        []
    };

    const attempts =
      [];

    for (
      const host of
        NOTION_HOSTS
    ) {
      try {
        /*
         * Match Save to Notion:
         * active-user header only for search.
         * spaceId already lives in request body.
         */
        const payload =
          await postNotion(
            host,
            "search",
            request,
            {
              userId:
                activeUserId
            }
          );

        const allDestinations =
          normalizeDestinationSearch(
            payload,
            spaceId
          );

        const normalizedQuery =
          request.query
            .trim()
            .toLowerCase();

        const destinations =
          normalizedQuery
            ? allDestinations.filter(
                (destination) =>
                  String(
                    destination.name ||
                    ""
                  )
                    .toLowerCase()
                    .includes(
                      normalizedQuery
                    )
              )
            : allDestinations;

        attempts.push({
          host,

          status:
            "ok",

          rawResultCount:
            Array.isArray(
              payload?.results
            )
              ? payload.results.length
              : 0,

          rawBlockCount:
            Object.keys(
              payload
                ?.recordMap
                ?.block ||
              {}
            ).length,

          rawCollectionCount:
            Object.keys(
              payload
                ?.recordMap
                ?.collection ||
              {}
            ).length,

          normalizedCount:
            allDestinations.length,

          destinationCount:
            destinations.length
        });

        return {
          host,

          query:
            request.query,

          destinations,

          attempts
        };
      } catch (error) {
        attempts.push({
          host,

          status:
            "error",

          httpStatus:
            error.status ||
            null,

          error:
            error.message ||
            String(error)
        });
      }
    }

    const error =
      new Error(
        "ClipNest could not search this Notion workspace."
      );

    error.attempts =
      attempts;

    throw error;
  }

  async function getWorkspaces({
    requestPermission:
      shouldRequestPermission =
        false
  } = {}) {
    let granted =
      await hasPermission();

    if (
      !granted &&
      shouldRequestPermission
    ) {
      granted =
        await requestPermission();
    }

    if (!granted) {
      throw new Error(
        "ClipNest does not have permission to access Notion websites."
      );
    }

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
      host:
        getSpaces.host,

      workspaces,

      users,

      diagnostics: {
        endpoint:
          `${getSpaces.host}/api/v3/getSpaces`,

        usersFound:
          users.length,

        directSpacesFound:
          directCount,

        additionalSpaceAttempts:
          additionalAttempts,

        totalWorkspacesFound:
          workspaces.length,

        getSpacesAttempts:
          getSpaces.attempts
      }
    };
  }

  globalThis.ClipNestNotionSession =
    Object.freeze({
      hasPermission,
      requestPermission,
      getWorkspaces,
      searchDestinations,
      getDatabaseSchema,
      encodeDatabaseProperties,
      buildCreatePageOperations,
      markdownToNotionBlocks,
      buildAppendMarkdownOperations,
      appendMarkdownToPage,
      submitOperations,
      createPage,
      postNotion
    });
})();
