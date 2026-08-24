const NOTION_TOKEN_URL =
  "https://api.notion.com/v1/oauth/token";

function jsonResponse(
  request,
  data,
  status = 200
) {
  const origin =
    request.headers.get("Origin");

  const headers = {
    "Content-Type":
      "application/json; charset=utf-8",

    "Cache-Control":
      "no-store",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS"
  };

  if (origin) {
    headers[
      "Access-Control-Allow-Origin"
    ] = origin;

    headers.Vary =
      "Origin";
  } else {
    headers[
      "Access-Control-Allow-Origin"
    ] = "*";
  }

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
}

function getAllowedRedirects(env) {
  return String(
    env.NOTION_ALLOWED_REDIRECTS ||
    ""
  )
    .split(",")
    .map(
      (value) =>
        value.trim()
    )
    .filter(Boolean);
}

function isAllowedRedirect(
  env,
  redirectUri
) {
  return getAllowedRedirects(
    env
  ).includes(
    String(
      redirectUri ||
      ""
    ).trim()
  );
}

function getBasicAuth(env) {
  const clientId =
    String(
      env.NOTION_CLIENT_ID ||
      ""
    ).trim();

  const clientSecret =
    String(
      env.NOTION_CLIENT_SECRET ||
      ""
    ).trim();

  if (
    !clientId ||
    !clientSecret
  ) {
    throw new Error(
      "Notion OAuth credentials are not configured."
    );
  }

  return (
    "Basic " +
    btoa(
      `${clientId}:${clientSecret}`
    )
  );
}

async function notionTokenRequest(
  env,
  body
) {
  const response =
    await fetch(
      NOTION_TOKEN_URL,
      {
        method:
          "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          Authorization:
            getBasicAuth(env)
        },

        body:
          JSON.stringify(
            body
          )
      }
    );

  let data;

  try {
    data =
      await response.json();
  } catch {
    data = {
      error:
        "invalid_response",

      message:
        "Notion returned an invalid OAuth response."
    };
  }

  return {
    ok:
      response.ok,

    status:
      response.status,

    data
  };
}

async function handleExchange(
  request,
  env
) {
  let body;

  try {
    body =
      await request.json();
  } catch {
    return jsonResponse(
      request,
      {
        error:
          "invalid_request",

        message:
          "Expected a JSON request body."
      },
      400
    );
  }

  const code =
    String(
      body.code ||
      ""
    ).trim();

  const redirectUri =
    String(
      body.redirect_uri ||
      ""
    ).trim();

  if (!code) {
    return jsonResponse(
      request,
      {
        error:
          "invalid_request",

        message:
          "Missing authorization code."
      },
      400
    );
  }

  if (
    !isAllowedRedirect(
      env,
      redirectUri
    )
  ) {
    return jsonResponse(
      request,
      {
        error:
          "invalid_redirect_uri",

        message:
          "Redirect URI is not allowed."
      },
      400
    );
  }

  const result =
    await notionTokenRequest(
      env,
      {
        grant_type:
          "authorization_code",

        code,

        redirect_uri:
          redirectUri
      }
    );

  return jsonResponse(
    request,
    result.data,
    result.status
  );
}

async function handleRefresh(
  request,
  env
) {
  let body;

  try {
    body =
      await request.json();
  } catch {
    return jsonResponse(
      request,
      {
        error:
          "invalid_request",

        message:
          "Expected a JSON request body."
      },
      400
    );
  }

  const refreshToken =
    String(
      body.refresh_token ||
      ""
    ).trim();

  if (!refreshToken) {
    return jsonResponse(
      request,
      {
        error:
          "invalid_request",

        message:
          "Missing refresh token."
      },
      400
    );
  }

  const result =
    await notionTokenRequest(
      env,
      {
        grant_type:
          "refresh_token",

        refresh_token:
          refreshToken
      }
    );

  return jsonResponse(
    request,
    result.data,
    result.status
  );
}

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(
        request.url
      );

    if (
      request.method ===
      "OPTIONS"
    ) {
      return jsonResponse(
        request,
        {
          ok:
            true
        }
      );
    }

    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/health"
    ) {
      return jsonResponse(
        request,
        {
          ok:
            true,

          service:
            "clipnest-notion-oauth"
        }
      );
    }

    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/exchange"
    ) {
      try {
        return await handleExchange(
          request,
          env
        );
      } catch (error) {
        return jsonResponse(
          request,
          {
            error:
              "server_error",

            message:
              error.message ||
              String(error)
          },
          500
        );
      }
    }

    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/refresh"
    ) {
      try {
        return await handleRefresh(
          request,
          env
        );
      } catch (error) {
        return jsonResponse(
          request,
          {
            error:
              "server_error",

            message:
              error.message ||
              String(error)
          },
          500
        );
      }
    }

    return jsonResponse(
      request,
      {
        error:
          "not_found"
      },
      404
    );
  }
};
