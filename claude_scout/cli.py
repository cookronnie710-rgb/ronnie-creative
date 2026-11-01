"""Command-line interface: `python -m claude_scout <command>`."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import __version__
from .categories import CATEGORIES
from .github import DEFAULT_CACHE, GitHub, GitHubError, find_token
from .install import InstallError, install_skill
from .scout import (clean, detect_kinds, find_skills, render_markdown, render_table, search_all,
                    search_free_text, to_hit)


def _since(days: int | None) -> str | None:
    if not days:
        return None
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")


def _client(args) -> GitHub:
    return GitHub(token=find_token(), cache_dir=None if args.no_cache else DEFAULT_CACHE)


def cmd_categories(args) -> int:
    for c in CATEGORIES.values():
        print(f"  {c.key:10} {c.title:24} {c.blurb}")
    return 0


def cmd_discover(args) -> int:
    gh = _client(args)
    keys = args.categories or list(CATEGORIES)
    bad = [k for k in keys if k not in CATEGORIES]
    if bad:
        print(f"Unknown category: {', '.join(bad)}. See `categories`.", file=sys.stderr)
        return 2
    results = search_all(gh, keys, limit=args.limit, min_stars=args.min_stars,
                         since=_since(args.days))
    if args.json:
        print(json.dumps({k: [h.to_dict() for h in v] for k, v in results.items()}, indent=2))
        return 0
    for k, hits in results.items():
        print(f"\n== {CATEGORIES[k].title} ==  ({CATEGORIES[k].blurb})")
        print(render_table(hits))
    print("\nNext: `python -m claude_scout show OWNER/REPO` to look inside one.")
    return 0


def cmd_search(args) -> int:
    gh = _client(args)
    hits = search_free_text(gh, " ".join(args.text), limit=args.limit, min_stars=args.min_stars)
    if args.json:
        print(json.dumps([h.to_dict() for h in hits], indent=2))
    else:
        print(render_table(hits))
    return 0


def cmd_show(args) -> int:
    gh = _client(args)
    repo = gh.repo(args.repo)
    hit = to_hit(repo, "show")
    tree = gh.tree(args.repo, repo["default_branch"])
    kinds = detect_kinds(tree)
    skills = find_skills(tree)

    print(f"{hit.full_name}  ⭐ {hit.stars:,}  updated {hit.pushed_at}  "
          f"license {hit.license or 'none'}{'  [ARCHIVED]' if hit.archived else ''}")
    print(f"{hit.url}\n{hit.description}\n")
    print("Contains: " + (", ".join(f"{v} {k}" for k, v in kinds.items()) or "nothing Claude-specific detected"))
    if skills:
        print(f"\nSkills ({len(skills)}):")
        for s in skills[: args.max_skills]:
            print(f"  {clean(s)}")
        if len(skills) > args.max_skills:
            print(f"  … and {len(skills) - args.max_skills} more")
        print(f"\nInstall one: python -m claude_scout install {args.repo} <skill-dir>")
    if args.readme:
        text = gh.readme(args.repo)
        print("\n--- README (first 60 lines) ---")
        print("\n".join(clean(line) for line in text.splitlines()[:60]))
    return 0


def cmd_install(args) -> int:
    gh = _client(args)
    dest = Path(args.dest).expanduser() if args.dest else (
        Path.cwd() / ".claude" / "skills" if args.project else Path.home() / ".claude" / "skills")
    install_skill(gh, args.repo, args.skill_dir, dest, ref=args.ref, name=args.name,
                  yes=args.yes, force=args.force)
    return 0


def cmd_report(args) -> int:
    gh = _client(args)
    results = search_all(gh, args.categories or None, limit=args.limit,
                         min_stars=args.min_stars, since=_since(args.days))
    md = render_markdown(results)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(md)
    total = sum(len(v) for v in results.values())
    print(f"Wrote {out} ({total} repos across {len(results)} categories)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="claude-scout",
                                description="Search GitHub for ways to upgrade Claude Code.")
    p.add_argument("--version", action="version", version=__version__)
    p.add_argument("--no-cache", action="store_true", help="skip the 1-hour response cache")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("categories", help="list what can be searched for").set_defaults(fn=cmd_categories)

    def common(sp, limit=10, min_stars=10):
        sp.add_argument("--limit", type=int, default=limit)
        sp.add_argument("--min-stars", type=int, default=min_stars)

    d = sub.add_parser("discover", help="top repos per category")
    d.add_argument("categories", nargs="*", help=f"any of: {', '.join(CATEGORIES)}")
    d.add_argument("--days", type=int, help="only repos updated in the last N days")
    d.add_argument("--json", action="store_true")
    common(d)
    d.set_defaults(fn=cmd_discover)

    s = sub.add_parser("search", help="free-text search, biased to Claude tooling")
    s.add_argument("text", nargs="+")
    s.add_argument("--json", action="store_true")
    common(s, limit=15, min_stars=0)
    s.set_defaults(fn=cmd_search)

    sh = sub.add_parser("show", help="look inside a repo: what it contains, which skills")
    sh.add_argument("repo", help="OWNER/REPO")
    sh.add_argument("--readme", action="store_true", help="also print the README head")
    sh.add_argument("--max-skills", type=int, default=40)
    sh.set_defaults(fn=cmd_show)

    i = sub.add_parser("install", help="install a skill (dry run unless --yes)")
    i.add_argument("repo", help="OWNER/REPO")
    i.add_argument("skill_dir", help="directory in the repo that contains SKILL.md")
    i.add_argument("--ref", help="branch/tag/sha (default: repo default branch)")
    i.add_argument("--name", help="install under this folder name")
    i.add_argument("--project", action="store_true", help="install to ./.claude/skills")
    i.add_argument("--dest", help="custom destination root")
    i.add_argument("--yes", action="store_true", help="actually write files")
    i.add_argument("--force", action="store_true", help="overwrite an existing skill")
    i.set_defaults(fn=cmd_install)

    r = sub.add_parser("report", help="write a Markdown report of all categories")
    r.add_argument("categories", nargs="*")
    r.add_argument("-o", "--output", default="reports/latest.md")
    r.add_argument("--days", type=int, default=None)
    common(r)
    r.set_defaults(fn=cmd_report)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.fn(args)
    except (GitHubError, InstallError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
