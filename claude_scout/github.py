"""Minimal GitHub REST client (stdlib only) with on-disk caching."""

from __future__ import annotations

import hashlib
import json
import re
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.github.com"
DEFAULT_CACHE = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "claude-scout"


REPO_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$")


class GitHubError(RuntimeError):
    pass


def check_repo(full_name: str) -> str:
    """Only accept OWNER/REPO, so user input can't steer requests to other API paths."""
    if not REPO_RE.match(full_name) or full_name.split("/")[1] in (".", ".."):
        raise GitHubError(f"Not a valid OWNER/REPO: {full_name!r}")
    return full_name


def find_token() -> str | None:
    """GITHUB_TOKEN / GH_TOKEN env vars, then `gh auth token`, else None."""
    for var in ("GITHUB_TOKEN", "GH_TOKEN"):
        if os.environ.get(var):
            return os.environ[var]
    if shutil.which("gh"):
        try:
            out = subprocess.run(
                ["gh", "auth", "token"], capture_output=True, text=True, timeout=5
            )
            if out.returncode == 0 and out.stdout.strip():
                return out.stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            pass
    return None


class GitHub:
    def __init__(self, token: str | None = None, cache_dir: Path | None = DEFAULT_CACHE,
                 cache_ttl: int = 3600):
        self.token = token
        self.cache_dir = cache_dir
        self.cache_ttl = cache_ttl

    # -- low level -----------------------------------------------------------
    def _cache_path(self, url: str) -> Path | None:
        if not self.cache_dir:
            return None
        key = hashlib.sha256(url.encode()).hexdigest()[:32]
        return self.cache_dir / f"{key}.json"

    def get(self, path: str, params: dict | None = None, raw: bool = False):
        url = path if path.startswith("http") else API + path
        if params:
            url += "?" + urllib.parse.urlencode(params)

        cache = None if raw else self._cache_path(url)
        if cache and cache.exists() and time.time() - cache.stat().st_mtime < self.cache_ttl:
            return json.loads(cache.read_text())

        headers = {
            "Accept": "application/vnd.github.raw" if raw else "application/vnd.github+json",
            "User-Agent": "claude-scout",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        # Never send the token anywhere but the GitHub API itself.
        if self.token and urllib.parse.urlsplit(url).netloc == "api.github.com" \
                and url.startswith("https://"):
            headers["Authorization"] = f"Bearer {self.token}"

        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            if e.code in (403, 429) and "rate limit" in detail.lower():
                raise GitHubError(
                    "GitHub rate limit hit. Set GITHUB_TOKEN (or log in with `gh auth login`) "
                    "for much higher limits."
                ) from e
            raise GitHubError(f"GitHub API {e.code} for {url}: {detail}") from e
        except urllib.error.URLError as e:
            raise GitHubError(f"Network error for {url}: {e.reason}") from e

        if raw:
            return body
        data = json.loads(body)
        if cache:
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(data))
        return data

    # -- high level ----------------------------------------------------------
    def search_repos(self, query: str, per_page: int = 30, sort: str | None = None) -> list[dict]:
        params = {"q": query, "per_page": per_page}
        if sort:
            params["sort"] = sort
        return self.get("/search/repositories", params).get("items", [])

    def repo(self, full_name: str) -> dict:
        return self.get(f"/repos/{check_repo(full_name)}")

    def tree(self, full_name: str, ref: str) -> list[dict]:
        data = self.get(f"/repos/{check_repo(full_name)}/git/trees/{urllib.parse.quote(ref)}",
                        {"recursive": "1"})
        return data.get("tree", [])

    def readme(self, full_name: str) -> str:
        try:
            return self.get(f"/repos/{check_repo(full_name)}/readme", raw=True).decode(errors="replace")
        except GitHubError:
            return ""

    def file_bytes(self, full_name: str, path: str, ref: str) -> bytes:
        return self.get(
            f"/repos/{check_repo(full_name)}/contents/{urllib.parse.quote(path)}", {"ref": ref}, raw=True
        )
