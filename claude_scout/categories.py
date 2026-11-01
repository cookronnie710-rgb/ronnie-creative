"""What kinds of Claude upgrades to look for, and how to find them on GitHub."""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Category:
    key: str
    title: str
    blurb: str
    queries: tuple[str, ...]
    # Paths inside a repo that are a strong signal this repo really is one of these.
    path_markers: tuple[str, ...] = field(default_factory=tuple)


CATEGORIES: dict[str, Category] = {
    c.key: c
    for c in [
        Category(
            "skills",
            "Agent Skills",
            "SKILL.md packages that teach Claude a new workflow (drop into ~/.claude/skills).",
            ("claude skills in:name,description,topics", "topic:claude-skills",
             "topic:agent-skills claude", "SKILL.md claude in:readme"),
            ("SKILL.md",),
        ),
        Category(
            "mcp",
            "MCP Servers",
            "Model Context Protocol servers that give Claude new tools and data sources.",
            ("mcp server in:name,description,topics", "topic:mcp-server",
             "topic:model-context-protocol", "awesome mcp servers"),
            ("mcp.json", ".mcp.json", "server.json"),
        ),
        Category(
            "agents",
            "Subagents",
            "Specialised subagent definitions (.claude/agents/*.md).",
            ("claude code subagents", "claude code agents collection",
             "topic:claude-code-agents", "topic:subagents claude"),
            (".claude/agents/", "agents/"),
        ),
        Category(
            "commands",
            "Slash Commands",
            "Reusable custom slash commands (.claude/commands/*.md).",
            ("claude code slash commands", "claude code commands collection",
             "topic:claude-commands"),
            (".claude/commands/", "commands/"),
        ),
        Category(
            "hooks",
            "Hooks",
            "Hook scripts that run before/after Claude's tool calls (lint, guardrails, notify).",
            ("claude code hooks", "topic:claude-code-hooks", "claude hooks pretooluse"),
            ("hooks/", "settings.json"),
        ),
        Category(
            "plugins",
            "Plugins & Marketplaces",
            "Claude Code plugins and plugin marketplaces bundling skills/agents/hooks/MCP.",
            ("claude code plugin marketplace", "topic:claude-code-plugin",
             "claude-plugins in:name", "topic:claude-plugins"),
            (".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"),
        ),
        Category(
            "claudemd",
            "CLAUDE.md & Workflows",
            "Example CLAUDE.md files, prompts and workflow guides to make Claude better at your repo.",
            ("CLAUDE.md best practices", "claude code workflow guide",
             "awesome claude code", "topic:claude-code"),
            ("CLAUDE.md",),
        ),
    ]
}
