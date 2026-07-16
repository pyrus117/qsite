import json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "runner"))
from runner import build_prompt, claude_cmd, run_stage

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
    assert out["body"].startswith("Draft paragraph one.")

def test_draft_stage_missing_title_returns_none():
    out = run_stage("draft", IDEA, {"brief": "b"}, STYLE, lambda p: "No title prefix here.\n\nJust body.")
    assert out["title"] is None
    assert "Just body." in out["body"]

def test_draft_stage_title_with_extra_whitespace():
    out = run_stage("draft", IDEA, {"brief": "b"}, STYLE,
                    lambda p: "TITLE:  Spaced Title  \n\nBody text.")
    assert out["title"] == "Spaced Title"
    assert out["body"].strip() == "Body text."

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
    assert out["revised_body"] == "Revised text here."

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
