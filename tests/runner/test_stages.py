import json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "runner"))
from runner import build_prompt, claude_cmd, run_stage, _ensure_greeting, _run_image_step

GREETING = "Kia Ora Peers and Queers,"

STYLE = {"voice": "warm", "rules": ["no emojis"], "language": "NZ", "structure": "short"}
IDEA = {"id": 7, "title": "Starting at a new school", "notes": "term 3 intake"}

def fake_claude(prompt):
    # "research brief" alone also matches the draft prompt, which quotes the brief
    if "produce a research brief" in prompt.lower():
        return "BRIEF: evidence summary"
    if "line-editor" in prompt.lower():  # reflect prompt identifies itself this way
        return json.dumps({"notes": "Looks solid", "revised_title": "Better Title", "revised_body": "Revised text here."})
    return "TITLE: A Real Title\n\nDraft paragraph one.\n\nDraft paragraph two."

def test_prompts_carry_idea_and_style():
    p = build_prompt("research", IDEA, {}, STYLE)
    assert "Starting at a new school" in p
    assert "no emojis" in p

def test_research_stage_returns_brief():
    out = run_stage("research", IDEA, {}, STYLE, fake_claude)
    assert out == {"brief": "BRIEF: evidence summary"}

def test_draft_stage_returns_body_and_title():
    out = run_stage("draft", IDEA, {"brief": "b"}, STYLE, fake_claude)
    assert out["title"] == "A Real Title"
    # backstop prepends greeting, so actual body text follows after blank line
    assert GREETING in out["body"]
    assert "Draft paragraph one." in out["body"]

def test_draft_stage_missing_title_returns_none():
    out = run_stage("draft", IDEA, {"brief": "b"}, STYLE, lambda p: "No title prefix here.\n\nJust body.")
    assert out["title"] is None
    assert "Just body." in out["body"]

def test_draft_stage_title_with_extra_whitespace():
    out = run_stage("draft", IDEA, {"brief": "b"}, STYLE,
                    lambda p: "TITLE:  Spaced Title  \n\nBody text.")
    assert out["title"] == "Spaced Title"
    # backstop prepends greeting; body text is present after it
    assert out["body"].startswith(GREETING)
    assert "Body text." in out["body"]

def test_draft_prompt_contains_banned_patterns_block():
    p = build_prompt("draft", IDEA, {"brief": "b"}, STYLE)
    assert "em-dash" in p.lower() or "em dash" in p.lower()
    assert "TITLE:" in p
    assert "Here's the thing" in p
    assert "Fragment-stacking in threes" in p

def test_reflect_stage_parses_new_json_shape():
    out = run_stage("reflect", IDEA, {"body": "text", "title": "Old Title"}, STYLE, fake_claude)
    assert out["reflectionNotes"] == "Looks solid"
    assert out["revised_title"] == "Better Title"
    # backstop prepends greeting if model didn't include it
    assert out["revised_body"].startswith(GREETING)
    assert "Revised text here." in out["revised_body"]

def test_reflect_stage_survives_non_json_output():
    out = run_stage("reflect", IDEA, {"body": "text", "title": "T"}, STYLE, lambda p: "not json at all")
    assert out["reflectionNotes"] == "not json at all"
    assert out.get("revised_title") is None
    assert out.get("revised_body") is None

def test_reflect_stage_missing_revised_body_returns_none():
    out = run_stage("reflect", IDEA, {"body": "text", "title": "T"}, STYLE,
                    lambda p: json.dumps({"notes": "x", "revised_title": "t"}))
    assert out["revised_body"] is None
    assert out["revised_title"] == "t"

def test_reflect_stage_always_has_revised_body():
    # revised_body must be a string (never null) in the new shape
    out = run_stage("reflect", IDEA, {"body": "text", "title": "T"}, STYLE, fake_claude)
    assert isinstance(out["revised_body"], str)

def test_unknown_stage_raises():
    import pytest
    with pytest.raises(ValueError):
        run_stage("render", IDEA, {}, STYLE, fake_claude)

def test_claude_cmd_plain_has_no_tools():
    cmd = claude_cmd("hello")
    assert "--allowedTools" not in cmd
    assert "--tools" not in cmd

def test_claude_cmd_with_tools_allows_them():
    cmd = claude_cmd("hello", tools=["WebSearch", "WebFetch"])
    assert cmd[cmd.index("--tools") + 1] == "WebSearch,WebFetch"
    assert cmd[cmd.index("--allowedTools") + 1] == "WebSearch,WebFetch"

def test_research_prompt_asks_for_web_search():
    assert "web search" in build_prompt("research", IDEA, {}, STYLE).lower()

# ── greeting tests ────────────────────────────────────────────────

def test_draft_prompt_contains_greeting_instruction():
    p = build_prompt("draft", IDEA, {"brief": "b"}, STYLE)
    assert GREETING in p

def test_reflect_prompt_preserves_greeting_verbatim():
    p = build_prompt("reflect", IDEA, {"body": "text", "title": "T"}, STYLE)
    assert GREETING in p

def test_ensure_greeting_prepends_when_absent():
    body = "Some body text."
    result = _ensure_greeting(body)
    assert result.startswith(GREETING + "\n\n")
    assert "Some body text." in result

def test_ensure_greeting_no_double_when_present():
    body = GREETING + "\n\nAlready has it."
    result = _ensure_greeting(body)
    # must not have the greeting twice
    assert result.count(GREETING) == 1
    assert result.startswith(GREETING)

# ── image pipeline tests ──────────────────────────────────────────

def test_image_step_truncates_long_alt_and_credit(monkeypatch):
    # credit/alt from web-influenced JSON can exceed varchar(255) → Postgres error
    long_str = "x" * 300
    candidate = {"image_url": "https://example.com/img.jpg", "alt": long_str, "credit": long_str}
    monkeypatch.setattr("runner._find_image", lambda title, body: candidate)
    monkeypatch.setattr("runner._download_image", lambda url: (b"fake", ".jpg"))
    monkeypatch.setattr("runner.api", lambda path, payload=None: {"filename": "img.jpg"})
    result = _run_image_step({"id": 1, "title": "Test"}, "body text")
    assert len(result["imageAlt"]) == 255
    assert len(result["imageCredit"]) == 255


def test_image_step_file_scheme_fails_soft(monkeypatch):
    # file:// URL must be rejected without calling urlopen; draft still proceeds
    candidate = {"image_url": "file:///etc/passwd", "alt": "alt", "credit": "cred"}
    monkeypatch.setattr("runner._find_image", lambda title, body: candidate)
    # urlopen must never be reached — if it is, the test fails via side-effect
    monkeypatch.setattr("runner.urllib.request.urlopen",
                        lambda *a, **kw: (_ for _ in ()).throw(AssertionError("urlopen called")))
    result = _run_image_step({"id": 1, "title": "Test"}, "body text")
    # fail-soft: no image fields, empty dict
    assert result == {}


def test_ensure_greeting_case_insensitive_no_double():
    # backstop is exact-match on start; lowercase variant should get prepended
    body = "kia ora peers and queers,\n\nLowercase."
    result = _ensure_greeting(body)
    # the exact greeting is now first (prepended), lowercase version still in body
    assert result.startswith(GREETING + "\n\n")

def test_draft_stage_applies_greeting_backstop():
    # fake_claude returns body without the greeting — backstop must add it
    out = run_stage("draft", IDEA, {"brief": "b"}, STYLE, fake_claude)
    assert out["body"].startswith(GREETING + "\n\n")

def test_reflect_stage_applies_greeting_backstop():
    # reflect fake returns revised_body without greeting — backstop must add it
    out = run_stage("reflect", IDEA, {"body": "text", "title": "T"}, STYLE, fake_claude)
    assert out["revised_body"].startswith(GREETING + "\n\n")
