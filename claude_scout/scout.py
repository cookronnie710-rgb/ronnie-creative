"""Searching, ranking and reporting."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone

from .categories import CATEGORIES, Category
from .github import GitHub

# Words that suggest a repo is actually about Claude / agent tooling.
RELEVANCE_TERMS = ("claude", "anthropic", "mcp", "skill", "agent", "subagent", "hook",
                   "slash command", "plugin", "claude.md", "model context protocol")


_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_MD_SPECIAL = re.compile(r"([\\`*_{}\[\]()#+!|~])")


def clean(text: str | None) -> str:
    """Remove control characters (incl. ANSI escapes) from untrusted repo text."""
    return _CONTROL.sub(" ", text or "").strip()


def md_escape(text: str) -> str:
    """Neutralise Markdown/HTML so repo descriptions can't inject links, images or tags."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return _MD_SPECIAL.sub(r"\\\1", text)


@dataclass
class Hit:
    full_name: str
    url: str
    description: str
    stars: int
    pushed_at: str
    topics: list[str]
    archived: bool
    license: str | None
    category: str
    score: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


def _days_since(iso: str, now: datetime) -> float:
    try:
        then = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return 9999.0
    return max(0.0, (now - then).total_seconds() / 86400)


def score_repo(item: dict, now: datetime | None = None) -> float:
    """Popularity (log stars) + freshness + relevance. Archived repos sink."""
    now = now or datetime.now(timezone.utc)
    stars = item.get("stargazers_count", 0) or 0
    popularity = math.log10(stars + 1) * 10          # 10 stars -> ~10, 10k -> ~40

    days = _days_since(item.get("pushed_at", ""), now)
    freshness = 15 * math.exp(-days / 60)            # pushed today -> 15, 2 months -> ~5.5

    text = " ".join([
        item.get("name", ""), item.get("description") or "", " ".join(item.get("topics", []))
    ]).lower()
    relevance = min(10, 2.5 * sum(term in text for term in RELEVANCE_TERMS))
    if "claude" in text:
        relevance += 12  # strongly prefer repos that are explicitly about Claude

    s = popularity + freshness + relevance
    if item.get("archived"):
        s *= 0.3
    return round(s, 2)


def to_hit(item: dict, category: str, now: datetime | None = None) -> Hit:
    lic = item.get("license") or {}
    return Hit(
        full_name=item["full_name"],
        url=item.get("html_url", f"https://github.com/{item['full_name']}"),
        description=clean(item.get("description")),
        stars=item.get("stargazers_count", 0) or 0,
        pushed_at=clean(item.get("pushed_at"))[:10],
        topics=[clean(t) for t in item.get("topics", []) or []],
        archived=bool(item.get("archived")),
        license=lic.get("spdx_id") if isinstance(lic, dict) else None,
        category=category,
        score=score_repo(item, now),
    )


def search_category(gh: GitHub, cat: Category, limit: int = 10, min_stars: int = 5,
                    since: str | None = None, now: datetime | None = None) -> list[Hit]:
    """Run every query for a category, de-duplicate, rank."""
    seen: dict[str, Hit] = {}
    for q in cat.queries:
        full_q = f"{q} stars:>={min_stars} fork:false"
        if since:
            full_q += f" pushed:>={since}"
        for item in gh.search_repos(full_q, per_page=30, sort="stars"):
            hit = to_hit(item, cat.key, now)
            if hit.full_name not in seen or hit.score > seen[hit.full_name].score:
                seen[hit.full_name] = hit
    ranked = sorted(seen.values(), key=lambda h: h.score, reverse=True)
    return ranked[:limit]


def search_all(gh: GitHub, keys: list[str] | None = None, **kw) -> dict[str, list[Hit]]:
    keys = keys or list(CATEGORIES)
    return {k: search_category(gh, CATEGORIES[k], **kw) for k in keys}


def search_free_text(gh: GitHub, text: str, limit: int = 15, min_stars: int = 0,
                     now: datetime | None = None) -> list[Hit]:
    """Ad-hoc search, biased toward Claude tooling."""
    hits: dict[str, Hit] = {}
    for q in (f"{text} claude", f"{text} mcp", f"{text} claude skill"):
        for item in gh.search_repos(f"{q} stars:>={min_stars} fork:false", per_page=20):
            h = to_hit(item, "search", now)
            hits.setdefault(h.full_name, h)
    return sorted(hits.values(), key=lambda h: h.score, reverse=True)[:limit]


# -- inspecting a single repo ------------------------------------------------

def find_skills(tree: list[dict]) -> list[str]:
    """Directories in a repo tree that contain a SKILL.md."""
    dirs = set()
    for entry in tree:
        if entry.get("type") == "blob" and entry["path"].split("/")[-1] == "SKILL.md":
            d = entry["path"].rsplit("/", 1)[0] if "/" in entry["path"] else "."
            dirs.add(d)
    return sorted(dirs)


def detect_kinds(tree: list[dict]) -> dict[str, int]:
    """Count what a repo contains: skills, agents, commands, hooks, plugin manifests, MCP."""
    counts = {"skills": 0, "agents": 0, "commands": 0, "hooks": 0, "plugins": 0, "mcp": 0,
              "claudemd": 0}
    for e in tree:
        if e.get("type") != "blob":
            continue
        p = e["path"]
        name = p.rsplit("/", 1)[-1]
        if name == "SKILL.md":
            counts["skills"] += 1
        elif "/agents/" in f"/{p}" and p.endswith(".md"):
            counts["agents"] += 1
        elif "/commands/" in f"/{p}" and p.endswith(".md"):
            counts["commands"] += 1
        elif "/hooks/" in f"/{p}" or name == "hooks.json":
            counts["hooks"] += 1
        if name in ("plugin.json", "marketplace.json") and ".claude-plugin" in p:
            counts["plugins"] += 1
        if name in (".mcp.json", "mcp.json", "server.json"):
            counts["mcp"] += 1
        if name == "CLAUDE.md":
            counts["claudemd"] += 1
    return {k: v for k, v in counts.items() if v}


# -- rendering ---------------------------------------------------------------

def _clip(s: str, n: int) -> str:
    return s if len(s) <= n else s[: n - 1] + "…"


def render_table(hits: list[Hit]) -> str:
    if not hits:
        return "  (nothing found)"
    lines = [f"  {'#':>2}  {'score':>5}  {'stars':>7}  {'pushed':10}  repo / description"]
    for i, h in enumerate(hits, 1):
        flag = " [archived]" if h.archived else ""
        lines.append(f"  {i:>2}  {h.score:>5.1f}  {h.stars:>7,}  {h.pushed_at:10}  "
                     f"{h.full_name}{flag}")
        if h.description:
            lines.append(f"  {'':>2}  {'':>5}  {'':>7}  {'':10}    {_clip(h.description, 90)}")
    return "\n".join(lines)


def render_markdown(results: dict[str, list[Hit]], generated: datetime | None = None) -> str:
    generated = generated or datetime.now(timezone.utc)
    out = [
        "# Claude Upgrade Report",
        "",
        f"_Generated {generated:%Y-%m-%d %H:%M} UTC by claude-scout._",
        "",
        "Ranked by popularity (stars), how recently the repo was updated, and how clearly "
        "it's about Claude tooling. **Read anything before you install it.** Skills, hooks and "
        "MCP servers can run code on your machine.",
        "",
    ]
    for key, hits in results.items():
        cat = CATEGORIES.get(key)
        out += [f"## {cat.title if cat else key}", ""]
        if cat:
            out += [f"_{cat.blurb}_", ""]
        if not hits:
            out += ["Nothing found.", ""]
            continue
        out += ["| # | Repo | ⭐ | Updated | What it is |", "|---|---|---|---|---|"]
        for i, h in enumerate(hits, 1):
            desc = md_escape(_clip(h.description, 120)) or "—"
            name = f"[{h.full_name}]({h.url})" + (" *(archived)*" if h.archived else "")
            out.append(f"| {i} | {name} | {h.stars:,} | {h.pushed_at} | {desc} |")
        out.append("")
    return "\n".join(out)
