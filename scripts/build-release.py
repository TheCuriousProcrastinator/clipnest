#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
ROOT_RUNTIME_SUFFIXES = {".css", ".html", ".js"}
FORBIDDEN_PREFIXES = (".git/", "docs/", "scripts/", "tools/")


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def run(*args: str, capture: bool = False) -> str:
    result = subprocess.run(
        args,
        cwd=ROOT,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
    )
    return result.stdout if capture else ""


def tracked_files() -> list[str]:
    raw = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    ).stdout

    return [
        item.decode("utf-8")
        for item in raw.split(b"\0")
        if item
    ]


def package_files() -> list[str]:
    result: list[str] = []

    for relative in tracked_files():
        path = Path(relative)

        if relative == "manifest.json":
            result.append(relative)
            continue

        if (
            path.parent == Path(".")
            and path.suffix in ROOT_RUNTIME_SUFFIXES
        ):
            result.append(relative)
            continue

        if (
            path.parent == Path("icons")
            and path.suffix.lower() == ".png"
        ):
            result.append(relative)

    return sorted(set(result))


def validate_clean_tree() -> None:
    if os.environ.get(
        "CLIPNEST_ALLOW_DIRTY_BUILD"
    ) == "1":
        return

    status = run(
        "git",
        "status",
        "--porcelain",
        capture=True,
    )

    if status.strip():
        print(status, end="")
        fail("Working tree is not clean.")


def validate_manifest() -> str:
    manifest_path = ROOT / "manifest.json"

    if not manifest_path.is_file():
        fail("manifest.json is missing.")

    manifest = json.loads(
        manifest_path.read_text(
            encoding="utf-8"
        )
    )

    if manifest.get("manifest_version") != 3:
        fail("Expected Manifest V3.")

    if manifest.get("name") != "ClipNest":
        fail("Unexpected extension name.")

    version = str(
        manifest.get("version") or ""
    ).strip()

    if not re.fullmatch(
        r"\d+\.\d+\.\d+",
        version,
    ):
        fail(
            f"Invalid manifest version: {version!r}"
        )

    return version


def validate_sources(files: list[str]) -> None:
    run(
        "git",
        "diff",
        "--check",
    )

    for relative in files:
        if relative.endswith(".js"):
            run(
                "node",
                "--check",
                relative,
            )

    missing = [
        relative
        for relative in files
        if not (ROOT / relative).is_file()
    ]

    if missing:
        fail(
            "Missing package files:\n" +
            "\n".join(missing)
        )


def build_zip(
    files: list[str],
    version: str,
) -> Path:
    DIST.mkdir(
        parents=True,
        exist_ok=True,
    )

    destination = (
        DIST /
        f"clipnest-{version}.zip"
    )

    if destination.exists():
        destination.unlink()

    with ZipFile(
        destination,
        "w",
        ZIP_DEFLATED,
    ) as archive:
        for relative in files:
            archive.write(
                ROOT / relative,
                arcname=relative,
            )

    return destination


def validate_zip(
    archive_path: Path,
    version: str,
) -> None:
    with ZipFile(
        archive_path,
        "r",
    ) as archive:
        names = archive.namelist()

        if "manifest.json" not in names:
            fail(
                "manifest.json is not at ZIP root."
            )

        forbidden = [
            name
            for name in names
            if name.startswith(
                FORBIDDEN_PREFIXES
            )
        ]

        if forbidden:
            fail(
                "Development files leaked into ZIP:\n" +
                "\n".join(forbidden)
            )

        manifest = json.loads(
            archive.read(
                "manifest.json"
            )
        )

        if manifest.get("version") != version:
            fail(
                "ZIP manifest version does not match source."
            )

        if len(names) != len(set(names)):
            fail(
                "ZIP contains duplicate paths."
            )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        for chunk in iter(
            lambda: handle.read(
                1024 * 1024
            ),
            b"",
        ):
            digest.update(chunk)

    return digest.hexdigest()


def main() -> None:
    os.chdir(ROOT)

    if shutil.which("git") is None:
        fail("git is not installed.")

    if shutil.which("node") is None:
        fail("node is not installed.")

    validate_clean_tree()

    version = validate_manifest()
    files = package_files()

    if not files:
        fail("No extension files selected.")

    validate_sources(files)

    archive = build_zip(
        files,
        version,
    )

    validate_zip(
        archive,
        version,
    )

    print("")
    print("ClipNest release package ready")
    print(f"Version: {version}")
    print(f"Files:   {len(files)}")
    print(f"ZIP:     {archive}")
    print(f"SHA-256: {sha256(archive)}")
    print("")
    print("Packaged files:")

    for relative in files:
        print(f"  {relative}")


if __name__ == "__main__":
    main()
