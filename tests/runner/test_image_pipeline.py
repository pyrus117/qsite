"""TDD tests for Task B runner image pipeline — written RED first."""
import base64, json, sys, pathlib, urllib.error
import pytest
sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "runner"))
from runner import (
    _parse_image_candidate, _slugify, _download_image, _find_image,
    process,
)

IDEA = {"id": 7, "title": "Pride Week Wrap-Up: 250-plus schools", "notes": ""}
STYLE = {"voice": "warm", "rules": [], "language": "NZ", "structure": "short"}

# ── _slugify ──────────────────────────────────────────────────────────────────

def test_slug_basic():
    assert _slugify("Pride Week Wrap-Up") == "pride-week-wrap-up"

def test_slug_special_chars():
    assert _slugify("250-plus schools!") == "250-plus-schools"

def test_slug_leading_trailing():
    assert _slugify("  A title  ") == "a-title"

# ── _parse_image_candidate ────────────────────────────────────────────────────

VALID_JSON = '{"image_url":"https://example.com/a.jpg","page_url":"https://example.com","alt":"alt text","credit":"Photo: X / Unsplash","license":"Unsplash"}'

def test_parse_valid_candidate():
    c = _parse_image_candidate(VALID_JSON)
    assert c["image_url"] == "https://example.com/a.jpg"
    assert c["credit"] == "Photo: X / Unsplash"

def test_parse_null_returns_none():
    assert _parse_image_candidate("null") is None

def test_parse_garbage_returns_none():
    assert _parse_image_candidate("not json at all") is None

def test_parse_missing_image_url_returns_none():
    bad = '{"page_url":"https://example.com","alt":"x","credit":"y","license":"z"}'
    assert _parse_image_candidate(bad) is None

def test_parse_empty_string_returns_none():
    assert _parse_image_candidate("") is None

def test_parse_json_wrapped_in_backticks():
    # model sometimes wraps output in ```json ... ```
    wrapped = f"```json\n{VALID_JSON}\n```"
    c = _parse_image_candidate(wrapped)
    assert c is not None
    assert c["image_url"] == "https://example.com/a.jpg"

# ── _download_image ───────────────────────────────────────────────────────────

def _make_response(data: bytes, content_type="image/jpeg"):
    """Build a minimal fake HTTP response."""
    class FakeResp:
        def __init__(self):
            self._data = data
            self.headers = {"Content-Type": content_type}
        def read(self, n=-1): return self._data if n < 0 else self._data[:n]
        def __enter__(self): return self
        def __exit__(self, *a): pass
    return FakeResp()

def test_download_returns_bytes_and_ext(monkeypatch):
    data = b"FAKEIMGDATA"
    monkeypatch.setattr("urllib.request.urlopen", lambda req, timeout: _make_response(data))
    result = _download_image("https://example.com/photo.jpg")
    assert result == (data, ".jpg")

def test_download_rejects_oversize(monkeypatch):
    big = b"x" * (3 * 1024 * 1024 + 1)
    monkeypatch.setattr("urllib.request.urlopen", lambda req, timeout: _make_response(big))
    with pytest.raises(ValueError, match="3MB"):
        _download_image("https://example.com/big.jpg")

def test_download_rejects_bad_extension(monkeypatch):
    monkeypatch.setattr("urllib.request.urlopen", lambda req, timeout: _make_response(b"data"))
    with pytest.raises(ValueError, match="extension"):
        _download_image("https://example.com/file.exe")

def test_download_allows_webp(monkeypatch):
    monkeypatch.setattr("urllib.request.urlopen", lambda req, timeout: _make_response(b"data", "image/webp"))
    data, ext = _download_image("https://example.com/photo.webp")
    assert ext == ".webp"

# ── fail-soft: download error must not propagate out of process ───────────────

def _fake_claude_with_image(prompt, tools=None):
    """Returns draft output; for image-find call returns valid candidate JSON."""
    if tools and "WebSearch" in tools and "image" in prompt.lower():
        return VALID_JSON
    if "line-editor" in prompt.lower():
        return json.dumps({"notes": "ok", "revised_title": "T", "revised_body": "Kia Ora Peers and Queers,\n\nBody."})
    if "produce a research brief" in prompt.lower():
        return "Brief."
    return "TITLE: My Post\n\nKia Ora Peers and Queers,\n\nDraft body."

def test_failsoft_download_error_does_not_raise(monkeypatch):
    """If download raises, process() must still complete (draft sent without image)."""
    import urllib.request as ureq
    calls = []

    def fake_urlopen(req, timeout):
        raise urllib.error.URLError("network down")

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    api_calls = []
    def fake_api(path, payload=None):
        api_calls.append((path, payload))
        return {}

    # patch at module level so process() sees the monkeypatched versions
    import runner as rmod
    monkeypatch.setattr(rmod, "claude_call", _fake_claude_with_image)
    monkeypatch.setattr(rmod, "api", fake_api)
    monkeypatch.setattr(rmod, "STYLE_GUIDE", STYLE)

    # should not raise
    rmod.process(IDEA)

    # update calls made — at least one for reflecting status
    update_calls = [(p, pl) for p, pl in api_calls if p == "/api/runner/update"]
    assert update_calls, "Expected at least one update call"
    # draft body was sent even though image failed
    reflecting_calls = [(p, pl) for p, pl in update_calls if pl.get("status") == "reflecting"]
    assert reflecting_calls, "Expected reflecting-status update"
    draft = reflecting_calls[0][1].get("draft", {})
    assert "image" not in draft, "image field must be absent when download failed"

def test_failsoft_find_garbage_does_not_raise(monkeypatch):
    """If claude returns garbage for image JSON, process() still completes."""
    def bad_claude(prompt, tools=None):
        if tools and "WebSearch" in tools and "image" in prompt.lower():
            return "absolute garbage not json"
        return _fake_claude_with_image(prompt, tools)

    import runner as rmod
    api_calls = []
    monkeypatch.setattr(rmod, "claude_call", bad_claude)
    monkeypatch.setattr(rmod, "api", lambda path, payload=None: api_calls.append((path, payload)) or {})
    monkeypatch.setattr(rmod, "STYLE_GUIDE", STYLE)

    rmod.process(IDEA)
    # just verify it didn't raise — api was called at least once
    assert api_calls

def test_dry_run_skips_image_step(monkeypatch):
    """RUNNER_DRY_RUN=1 must skip the image step entirely (no urlopen call)."""
    monkeypatch.setenv("RUNNER_DRY_RUN", "1")
    urlopen_called = []
    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **kw: urlopen_called.append(1))

    import runner as rmod
    api_calls = []
    monkeypatch.setattr(rmod, "api", lambda path, payload=None: api_calls.append((path, payload)) or {})
    monkeypatch.setattr(rmod, "STYLE_GUIDE", STYLE)

    rmod.process(IDEA)
    assert not urlopen_called, "urlopen must not be called in dry-run mode"

def test_draft_payload_carries_image_fields_on_success(monkeypatch):
    """When image pipeline succeeds, draft payload must include image/imageAlt/imageCredit."""
    raw = b"IMGDATA"
    b64 = base64.b64encode(raw).decode()

    def fake_urlopen(req, timeout):
        return _make_response(raw)

    import runner as rmod
    api_calls = []
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    monkeypatch.setattr(rmod, "claude_call", _fake_claude_with_image)
    monkeypatch.setattr(rmod, "api", lambda path, payload=None: api_calls.append((path, payload)) or {"filename": "my-post.jpg"})
    monkeypatch.setattr(rmod, "STYLE_GUIDE", STYLE)

    rmod.process(IDEA)

    reflecting = [(p, pl) for p, pl in api_calls if p == "/api/runner/update" and pl.get("status") == "reflecting"]
    assert reflecting
    draft = reflecting[0][1].get("draft", {})
    assert "image" in draft
    assert "imageAlt" in draft
    assert "imageCredit" in draft
