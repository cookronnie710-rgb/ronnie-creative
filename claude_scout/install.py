"""Install a skill directory from a GitHub repo into ~/.claude/skills (or a project).

Safety rules:
  * Dry run by default: you see every file first, and nothing is written without --yes.
  * Never executes anything it downloads.
  * Flags executable/script files so you know to read them.
  * Refuses paths that would escape the destination directory.
  * Caps total download size.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from .github import GitHub
from .scout import clean

SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]{1,100}$")

MAX_FILES = 200
MAX_BYTES = 5 * 1024 * 1024
SCRIPT_SUFFIXES = {".sh", ".bash", ".zsh", ".py", ".js", ".mjs", ".cjs", ".ts", ".rb",
                   ".pl", ".ps1", ".bat", ".cmd", ".exe", ".bin"}


class InstallError(RuntimeError):
    pass


@dataclass
class PlannedFile:
    repo_path: str
    rel_path: str
    size: int
    is_script: bool


def plan_skill(tree: list[dict], skill_dir: str) -> list[PlannedFile]:
    skill_dir = skill_dir.strip("/")
    prefix = "" if skill_dir in ("", ".") else skill_dir + "/"
    files = []
    for e in tree:
        if e.get("type") != "blob" or not e["path"].startswith(prefix):
            continue
        if e.get("mode") == "120000":  # symlink: could point anywhere, never install
            continue
        rel = e["path"][len(prefix):]
        p = PurePosixPath(rel)
        if p.is_absolute() or ".." in p.parts:
            raise InstallError(f"Unsafe path in repo: {e['path']}")
        files.append(PlannedFile(
            repo_path=e["path"], rel_path=rel, size=e.get("size", 0) or 0,
            is_script=p.suffix.lower() in SCRIPT_SUFFIXES or e.get("mode") == "100755",
        ))
    if not any(f.rel_path == "SKILL.md" for f in files):
        raise InstallError(f"No SKILL.md directly inside '{skill_dir or '.'}'.")
    if len(files) > MAX_FILES:
        raise InstallError(f"Skill has {len(files)} files (limit {MAX_FILES}); refusing.")
    total = sum(f.size for f in files)
    if total > MAX_BYTES:
        raise InstallError(f"Skill is {total:,} bytes (limit {MAX_BYTES:,}); refusing.")
    return sorted(files, key=lambda f: f.rel_path)


def install_skill(gh: GitHub, full_name: str, skill_dir: str, dest_root: Path,
                  ref: str | None = None, name: str | None = None, yes: bool = False,
                  force: bool = False, log=print) -> Path | None:
    ref = ref or gh.repo(full_name)["default_branch"]
    files = plan_skill(gh.tree(full_name, ref), skill_dir)

    skill_name = name or (PurePosixPath(skill_dir.strip("/")).name or full_name.split("/")[1])
    if not SAFE_NAME.match(skill_name) or skill_name in (".", ".."):
        raise InstallError(f"Unsafe skill folder name: {skill_name!r}")
    dest_root = dest_root.resolve()
    target = (dest_root / skill_name).resolve()
    if target.parent != dest_root:
        raise InstallError(f"Refusing to install outside {dest_root}")

    log(f"Skill '{skill_name}' from {full_name}@{clean(ref)}:{clean(skill_dir) or '.'}")
    log(f"Destination: {target}")
    for f in files:
        warn = "  <-- script: read before using" if f.is_script else ""
        log(f"  {f.size:>8,}  {clean(f.rel_path)}{warn}")
    scripts = [f for f in files if f.is_script]
    if scripts:
        log(f"\n{len(scripts)} script file(s). Claude may run these when it uses the skill.")

    if not yes:
        log("\nDry run: nothing written. Re-run with --yes to install.")
        return None
    if target.exists() and not force:
        raise InstallError(f"{target} already exists (use --force to overwrite).")

    written = 0
    for f in files:
        out = (target / f.rel_path).resolve()
        if target not in out.parents and out != target:
            raise InstallError(f"Refusing to write outside {target}: {f.rel_path}")
        out.parent.mkdir(parents=True, exist_ok=True)
        data = gh.file_bytes(full_name, f.repo_path, ref)
        written += len(data)
        if written > MAX_BYTES:  # don't trust the sizes the tree reported
            raise InstallError(f"Download exceeded {MAX_BYTES:,} bytes; stopped. "
                               f"Delete the partial install at {target}.")
        out.write_bytes(data)
        # Deliberately not preserving exec bits: you opt in after reading.
    (target / ".scout-source").write_text(f"https://github.com/{full_name}/tree/{ref}/"
                                          f"{skill_dir.strip('/')}\n")
    log(f"\nInstalled {len(files)} file(s) to {target}")
    return target
