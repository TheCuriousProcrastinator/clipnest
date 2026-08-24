(() => {
  "use strict";

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

    return (
      String(
        workspace.name ||
        "N"
      )
        .trim()
        .charAt(0)
        .toUpperCase() ||
      "N"
    );
  }

  function workspaceMeta(
    workspace
  ) {
    const primary =
      workspace
        .linkedUsers
        ?.[0];

    const identity =
      primary?.email ||
      primary?.name ||
      "";

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
        workspaceMeta(
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
      "Reading workspace information from your existing Notion browser session…"
    );

    try {
      const result =
        await ClipNestNotionSession
          .getWorkspaces({
            requestPermission:
              true
          });

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
