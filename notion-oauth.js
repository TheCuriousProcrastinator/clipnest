(() => {
  "use strict";

  const WORKER_URL =
    "https://clipnest-notion-oauth.gerainchick.workers.dev";

  const REDIRECT_PATH =
    "notion";

  function randomState() {
    if (
      globalThis.crypto
        ?.randomUUID
    ) {
      return crypto.randomUUID();
    }

    const bytes =
      new Uint8Array(24);

    crypto.getRandomValues(
      bytes
    );

    return Array.from(
      bytes,
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0")
    ).join("");
  }

  async function fetchJson(
    url,
    options = {}
  ) {
    const response =
      await fetch(
        url,
        {
          ...options,

          headers: {
            Accept:
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
        `OAuth service returned HTTP ${response.status}.`
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
        data?.error ||
        `OAuth service returned HTTP ${response.status}.`
      );
    }

    return data;
  }

  async function getConfig() {
    const config =
      await fetchJson(
        `${WORKER_URL}/config`
      );

    if (
      !config?.clientId ||
      !config?.authorizationUrl
    ) {
      throw new Error(
        "ClipNest OAuth service is not configured."
      );
    }

    return config;
  }

  function launchWebAuthFlow(
    url
  ) {
    return new Promise(
      (resolve, reject) => {
        chrome.identity
          .launchWebAuthFlow(
            {
              url,
              interactive: true
            },

            (redirectUrl) => {
              const error =
                chrome.runtime
                  .lastError;

              if (error) {
                reject(
                  new Error(
                    error.message ||
                    "Notion authorization was cancelled."
                  )
                );

                return;
              }

              if (!redirectUrl) {
                reject(
                  new Error(
                    "Notion did not return an authorization result."
                  )
                );

                return;
              }

              resolve(
                redirectUrl
              );
            }
          );
      }
    );
  }

  async function storeAuthorization(
    token
  ) {
    const owner =
      token?.owner?.user ||
      token?.owner ||
      null;

    await chrome.storage.local.set({
      notionAuthMode:
        "oauth",

      notionToken:
        token.access_token,

      notionOAuthRefreshToken:
        token.refresh_token ||
        "",

      notionOAuthBotId:
        token.bot_id ||
        "",

      notionOAuthWorkspaceId:
        token.workspace_id ||
        "",

      notionOAuthWorkspaceName:
        token.workspace_name ||
        "",

      notionOAuthWorkspaceIcon:
        token.workspace_icon ||
        "",

      notionOAuthOwner:
        owner
    });
  }

  async function connect() {
    const config =
      await getConfig();

    const redirectUri =
      chrome.identity
        .getRedirectURL(
          REDIRECT_PATH
        );

    const allowedRedirects =
      Array.isArray(
        config.redirectUris
      )
        ? config.redirectUris
        : [];

    if (
      allowedRedirects.length &&
      !allowedRedirects.includes(
        redirectUri
      )
    ) {
      throw new Error(
        "ClipNest OAuth redirect URI does not match the Notion connection."
      );
    }

    const state =
      randomState();

    const authUrl =
      new URL(
        config.authorizationUrl
      );

    authUrl.searchParams.set(
      "owner",
      "user"
    );

    authUrl.searchParams.set(
      "client_id",
      config.clientId
    );

    authUrl.searchParams.set(
      "redirect_uri",
      redirectUri
    );

    authUrl.searchParams.set(
      "response_type",
      "code"
    );

    authUrl.searchParams.set(
      "state",
      state
    );

    const redirectResult =
      await launchWebAuthFlow(
        authUrl.toString()
      );

    const resultUrl =
      new URL(
        redirectResult
      );

    const oauthError =
      resultUrl.searchParams.get(
        "error"
      );

    if (oauthError) {
      const description =
        resultUrl.searchParams.get(
          "error_description"
        );

      throw new Error(
        description ||
        `Notion authorization failed: ${oauthError}`
      );
    }

    const returnedState =
      resultUrl.searchParams.get(
        "state"
      );

    if (
      !returnedState ||
      returnedState !== state
    ) {
      throw new Error(
        "Notion authorization state validation failed."
      );
    }

    const code =
      resultUrl.searchParams.get(
        "code"
      );

    if (!code) {
      throw new Error(
        "Notion did not return an authorization code."
      );
    }

    const token =
      await fetchJson(
        `${WORKER_URL}/exchange`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              code,

              redirect_uri:
                redirectUri
            })
        }
      );

    if (!token?.access_token) {
      throw new Error(
        "Notion did not return an access token."
      );
    }

    await storeAuthorization(
      token
    );

    return {
      workspaceId:
        token.workspace_id ||
        "",

      workspaceName:
        token.workspace_name ||
        "Notion",

      workspaceIcon:
        token.workspace_icon ||
        "",

      owner:
        token.owner ||
        null
    };
  }

  async function refresh() {
    const stored =
      await chrome.storage.local.get([
        "notionOAuthRefreshToken"
      ]);

    const refreshToken =
      String(
        stored
          .notionOAuthRefreshToken ||
        ""
      ).trim();

    if (!refreshToken) {
      throw new Error(
        "No Notion refresh token is available."
      );
    }

    const token =
      await fetchJson(
        `${WORKER_URL}/refresh`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              refresh_token:
                refreshToken
            })
        }
      );

    if (!token?.access_token) {
      throw new Error(
        "Notion did not return a refreshed access token."
      );
    }

    const current =
      await chrome.storage.local.get([
        "notionOAuthWorkspaceId",
        "notionOAuthWorkspaceName",
        "notionOAuthWorkspaceIcon",
        "notionOAuthOwner"
      ]);

    await storeAuthorization({
      ...token,

      workspace_id:
        token.workspace_id ||
        current.notionOAuthWorkspaceId ||
        "",

      workspace_name:
        token.workspace_name ||
        current.notionOAuthWorkspaceName ||
        "",

      workspace_icon:
        token.workspace_icon ||
        current.notionOAuthWorkspaceIcon ||
        "",

      owner:
        token.owner ||
        current.notionOAuthOwner ||
        null
    });

    return token;
  }

  async function disconnect() {
    await chrome.storage.local.remove([
      "notionAuthMode",
      "notionToken",
      "notionOAuthRefreshToken",
      "notionOAuthBotId",
      "notionOAuthWorkspaceId",
      "notionOAuthWorkspaceName",
      "notionOAuthWorkspaceIcon",
      "notionOAuthOwner"
    ]);
  }

  async function getStatus() {
    const stored =
      await chrome.storage.local.get([
        "notionAuthMode",
        "notionToken",
        "notionOAuthWorkspaceId",
        "notionOAuthWorkspaceName",
        "notionOAuthWorkspaceIcon"
      ]);

    return {
      connected:
        stored.notionAuthMode ===
          "oauth" &&
        Boolean(
          String(
            stored.notionToken ||
            ""
          ).trim()
        ),

      workspaceId:
        stored
          .notionOAuthWorkspaceId ||
        "",

      workspaceName:
        stored
          .notionOAuthWorkspaceName ||
        "",

      workspaceIcon:
        stored
          .notionOAuthWorkspaceIcon ||
        ""
    };
  }

  globalThis.ClipNestNotionOAuth =
    Object.freeze({
      connect,
      refresh,
      disconnect,
      getStatus
    });
})();
