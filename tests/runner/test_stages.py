import json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "runner"))
from runner import build_prompt, claude_cmd, run_stage

STYLE = {"voice": "warm", "rules": ["no emojis"], "language": "NZ", "structure": "short"}
IDEA = {"id": 7, "title": "Starting at a new school", "notes": "term 3 intake"}

def fake_claude(prompt):
    # "research brief" alone also matches the draft prompt, which quotes the brief
    if "produce a research brief" in prompt.lower():
        return "BRIEF: evidence summary"
    if "reflect" in prompt.lower():
        return json.dumps({"notes": "Looks solid", "revised_body": None})
    return "Draft paragraph one.\n\nDraft paragraph two."

def test_prompts_carry_idea_and_style():
    p = build_prompt("research", IDEA, {}, STYLE)
    assert "Starting at a new school" in p
    assert "no emojis" in p

def test_research_stage_returns_brief():
    out = run_stage("research", IDEA, {}, STYLE, fake_claude)
    assert out == {"brief": "BRIEF: evidence summary"}

def test_draft_stage_returns_body():
    out = run_stage("draft", IDEA, {"brief": "b"}, STYLE, fake_claude)
    assert out["body"].startswith("Draft paragraph one.")

def test_reflect_stage_parses_json_notes():
    out = run_stage("reflect", IDEA, {"body": "text"}, STYLE, fake_claude)
    assert out == {"reflectionNotes": "Looks solid", "revised_body": None}

def test_reflect_stage_survives_non_json_output():
    out = run_stage("reflect", IDEA, {"body": "text"}, STYLE, lambda p: "not json at all")
    assert out["reflectionNotes"] == "not json at all"

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
