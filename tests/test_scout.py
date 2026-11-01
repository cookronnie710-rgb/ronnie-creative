import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from claude_scout.categories import CATEGORIES
from claude_scout.install import InstallError, install_skill, plan_skill
from claude_scout.scout import (detect_kinds, find_skills, render_markdown, render_table, score_repo,
                                search_category, to_hit)

NOW = datetime(2026, 11, 1, tzinfo=timezone.utc)


def repo(name, stars=100, pushed="2026-10-30T00:00:00Z", desc="", topics=(), archived=False):
    return {"full_name": name, "name": name.split("/")[1], "html_url": f"https://github.com/{name}",
            "description": desc, "stargazers_count": stars, "pushed_at": pushed,
            "topics": list(topics), "archived": archived, "license": {"spdx_id": "MIT"},
            "default_branch": "main"}


TREE = [
    {"path": "README.md", "type": "blob", "size": 10},
    {"path": "skills/pdf/SKILL.md", "type": "blob", "size": 100},
    {"path": "skills/pdf/scripts/fill.py", "type": "blob", "size": 50},
    {"path": "skills/pdf/reference.md", "type": "blob", "size": 30},
    {"path": "skills/docx/SKILL.md", "type": "blob", "size": 100},
    {"path": ".claude/agents/reviewer.md", "type": "blob", "size": 5},
    {"path": ".claude/commands/ship.md", "type": "blob", "size": 5},
    {"path": ".claude-plugin/plugin.json", "type": "blob", "size": 5},
    {"path": "CLAUDE.md", "type": "blob", "size": 5},
]


class FakeGitHub:
    def __init__(self, search_results=None, tree=TREE, files=None):
        self.search_results = search_results or []
        self._tree = tree
        self.files = files or {}
        self.queries = []

    def search_repos(self, q, per_page=30, sort=None):
        self.queries.append(q)
        return self.search_results

    def repo(self, name):
        return repo(name)

    def tree(self, name, ref):
        return self._tree

    def file_bytes(self, name, path, ref):
        return self.files.get(path, f"content of {path}".encode())


class ScoringTests(unittest.TestCase):
    def test_more_stars_scores_higher(self):
        self.assertGreater(score_repo(repo("a/b", stars=5000), NOW),
                           score_repo(repo("a/c", stars=5), NOW))

    def test_fresh_beats_stale(self):
        self.assertGreater(score_repo(repo("a/b", pushed="2026-10-31T00:00:00Z"), NOW),
                           score_repo(repo("a/b", pushed="2023-01-01T00:00:00Z"), NOW))

    def test_claude_relevance(self):
        self.assertGreater(score_repo(repo("a/b", desc="Claude Code skills"), NOW),
                           score_repo(repo("a/b", desc="a web framework"), NOW))

    def test_archived_sinks(self):
        self.assertLess(score_repo(repo("a/b", archived=True), NOW), score_repo(repo("a/b"), NOW))

    def test_bad_date_doesnt_crash(self):
        score_repo(repo("a/b", pushed=None), NOW)


class SearchTests(unittest.TestCase):
    def test_dedupes_and_ranks(self):
        gh = FakeGitHub([repo("x/small", stars=10), repo("x/big", stars=9000)])
        hits = search_category(gh, CATEGORIES["skills"], limit=5, now=NOW)
        self.assertEqual([h.full_name for h in hits], ["x/big", "x/small"])
        self.assertEqual(len(gh.queries), len(CATEGORIES["skills"].queries))
        self.assertTrue(all("fork:false" in q and "stars:>=" in q for q in gh.queries))

    def test_since_filter_added(self):
        gh = FakeGitHub([])
        search_category(gh, CATEGORIES["mcp"], since="2026-10-01")
        self.assertTrue(all("pushed:>=2026-10-01" in q for q in gh.queries))

    def test_markdown_escapes_pipes(self):
        md = render_markdown({"skills": [to_hit(repo("a/b", desc="x | y"), "skills", NOW)]}, NOW)
        self.assertIn("x \\| y", md)
        self.assertIn("[a/b](https://github.com/a/b)", md)


class TreeTests(unittest.TestCase):
    def test_find_skills(self):
        self.assertEqual(find_skills(TREE), ["skills/docx", "skills/pdf"])

    def test_detect_kinds(self):
        k = detect_kinds(TREE)
        self.assertEqual(k["skills"], 2)
        self.assertEqual(k["agents"], 1)
        self.assertEqual(k["commands"], 1)
        self.assertEqual(k["plugins"], 1)
        self.assertEqual(k["claudemd"], 1)


class InstallTests(unittest.TestCase):
    def test_plan_flags_scripts(self):
        plan = plan_skill(TREE, "skills/pdf")
        self.assertEqual([f.rel_path for f in plan],
                         ["SKILL.md", "reference.md", "scripts/fill.py"])
        self.assertTrue(next(f for f in plan if f.rel_path == "scripts/fill.py").is_script)

    def test_requires_skill_md(self):
        with self.assertRaises(InstallError):
            plan_skill(TREE, ".claude")

    def test_rejects_traversal(self):
        bad = [{"path": "s/SKILL.md", "type": "blob"}, {"path": "s/../../etc/x", "type": "blob"}]
        with self.assertRaises(InstallError):
            plan_skill(bad, "s")

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            out = install_skill(FakeGitHub(), "a/b", "skills/pdf", Path(d), log=lambda *a: None)
            self.assertIsNone(out)
            self.assertEqual(os.listdir(d), [])

    def test_install_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            target = install_skill(FakeGitHub(), "a/b", "skills/pdf", Path(d), yes=True,
                                   log=lambda *a: None)
            self.assertEqual((target / "SKILL.md").read_text(), "content of skills/pdf/SKILL.md")
            self.assertTrue((target / "scripts" / "fill.py").exists())
            self.assertFalse(os.access(target / "scripts" / "fill.py", os.X_OK))
            self.assertIn("github.com/a/b/tree/main/skills/pdf",
                          (target / ".scout-source").read_text())
            with self.assertRaises(InstallError):
                install_skill(FakeGitHub(), "a/b", "skills/pdf", Path(d), yes=True,
                              log=lambda *a: None)


class SecurityTests(unittest.TestCase):
    def test_name_cannot_escape_dest(self):
        with tempfile.TemporaryDirectory() as d:
            for bad in ("../escaped", "a/b", "..", "/etc"):
                with self.assertRaises(InstallError, msg=bad):
                    install_skill(FakeGitHub(), "a/b", "skills/pdf", Path(d), name=bad,
                                  yes=True, log=lambda *a: None)
            self.assertEqual(os.listdir(d), [])

    def test_terminal_escapes_stripped(self):
        h = to_hit(repo("a/b", desc="hi\x1b]0;pwned\x07\x1b[2J", topics=["x\x1b[31m"]), "x", NOW)
        self.assertNotIn("\x1b", render_table([h]))
        self.assertNotIn("\x1b", h.topics[0])

    def test_markdown_injection_neutralised(self):
        desc = "![x](https://evil.example/t.png) <img src=x onerror=alert(1)> [c](javascript:x)"
        md = render_markdown({"skills": [to_hit(repo("a/b", desc=desc), "skills", NOW)]}, NOW)
        self.assertNotIn("![x](", md)
        self.assertNotIn("<img", md)
        self.assertNotIn("[c](", md)

    def test_token_only_sent_to_github_api(self):
        import urllib.request
        from unittest import mock
        from claude_scout.github import GitHub

        seen = []

        def fake(req, timeout=0):
            seen.append((req.full_url, req.get_header("Authorization")))
            raise urllib.error.URLError("stop")

        import urllib.error
        gh = GitHub(token="SECRET", cache_dir=None)
        with mock.patch("urllib.request.urlopen", fake):
            for url in ("https://evil.example/x", "http://api.github.com/x",
                        "https://api.github.com.evil.example/x", "/repos/a/b"):
                with self.assertRaises(Exception):
                    gh.get(url)
        auth = dict(seen)
        self.assertIsNone(auth["https://evil.example/x"])
        self.assertIsNone(auth["http://api.github.com/x"])
        self.assertIsNone(auth["https://api.github.com.evil.example/x"])
        self.assertEqual(auth["https://api.github.com/repos/a/b"], "Bearer SECRET")

    def test_repo_name_validated(self):
        from claude_scout.github import GitHub, GitHubError
        gh = GitHub(token=None, cache_dir=None)
        for bad in ("../../users/x", "a/b/c", "a/..", "a", "a/b?x=1"):
            with self.assertRaises(GitHubError, msg=bad):
                gh.repo(bad)

    def test_symlinks_skipped(self):
        tree = [{"path": "s/SKILL.md", "type": "blob", "mode": "100644"},
                {"path": "s/link", "type": "blob", "mode": "120000"}]
        self.assertEqual([f.rel_path for f in plan_skill(tree, "s")], ["SKILL.md"])

    def test_real_download_size_capped(self):
        from claude_scout import install
        big = FakeGitHub(files={"skills/pdf/SKILL.md": b"x" * (install.MAX_BYTES + 1)})
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(InstallError):
                install_skill(big, "a/b", "skills/pdf", Path(d), yes=True, log=lambda *a: None)


if __name__ == "__main__":
    unittest.main()
