# ronnie-creative

## Claude Scout 🔭

Search GitHub for ways to upgrade Claude Code: **skills, MCP servers, subagents, slash
commands, hooks, plugins and CLAUDE.md workflows**. Results are ranked, and you can install a
skill once you've looked at it.

Pure Python 3.10+, no dependencies.

### Quick start

```bash
# what can I search for?
python -m claude_scout categories

# top 10 repos in every category (or name some: skills mcp hooks …)
python -m claude_scout discover
python -m claude_scout discover skills mcp --limit 5 --days 30   # only recently active

# free-text search, biased toward Claude tooling
python -m claude_scout search postgres database

# look inside a repo: what it contains + every skill it ships
python -m claude_scout show anthropics/skills --readme

# install a skill (dry run first: lists every file and flags scripts)
python -m claude_scout install anthropics/skills skills/pdf
python -m claude_scout install anthropics/skills skills/pdf --yes            # ~/.claude/skills/pdf
python -m claude_scout install anthropics/skills skills/pdf --project --yes  # ./.claude/skills/pdf

# full Markdown report
python -m claude_scout report -o reports/latest.md
```

### GitHub token (recommended)

Unauthenticated search allows ~10 requests/minute. Scout picks up `GITHUB_TOKEN` / `GH_TOKEN`,
or uses `gh auth token` if you've run `gh auth login`. Responses are cached for an hour in
`~/.cache/claude-scout` (`--no-cache` to skip).

### How ranking works

`score = popularity + freshness + relevance`

* **popularity**: `10 × log10(stars + 1)`, so 10k stars doesn't drown out 500
* **freshness**: up to 15 points, decaying over ~2 months since the last push
* **relevance**: Claude/MCP/skill/agent terms in the name, description and topics, with a
  big bonus for "claude"
* archived repos get ×0.3

### Safety

Skills, hooks and MCP servers can run code on your machine. Scout:

* never runs anything it downloads,
* installs in **dry-run mode unless you pass `--yes`**,
* flags script files, doesn't keep execute bits, refuses path traversal, caps size,
* won't overwrite an existing skill without `--force`,
* writes a `.scout-source` file recording where each skill came from.

### Weekly report

`.github/workflows/scout-report.yml` regenerates `reports/latest.md` every Monday (or on
demand from the Actions tab) and commits it if anything changed.

### Tests

```bash
python -m unittest discover -s tests -v
```
