#!/usr/bin/env python3
"""Q Youth Blog Studio runner — polls the studio API, does agent stages via claude CLI.
Run on Nate's PC:  python3 runner/runner.py   (config via runner/.env)"""
import json, os, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
STYLE_GUIDE = json.loads((HERE / "blog_style_guide.json").read_text(encoding="utf-8"))

def load_env():
    env_file = HERE / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

def cfg(name, default=None):
    v = os.environ.get(name, default)
    if v is None:
        sys.exit(f"Missing required env var {name} (set it in runner/.env)")
    return v

# ── prompts ──────────────────────────────────────────────────────
def build_prompt(stage, idea, prior, style):
    style_block = json.dumps(style, indent=2, ensure_ascii=False)
    if stage == "research":
        return (f"You are researching a blog post for Q-Youth NZ.\n"
                f"Topic: {idea['title']}\nNotes: {idea.get('notes') or 'none'}\n\n"
                f"Use web search to find current, real sources — do not rely on memory. "
                f"Produce a research brief: key evidence-based points, each with the source's "
                f"name, URL, and date so claims can be verified, "
                f"NZ/Te Tau Ihu context, and angles suited to this style guide:\n{style_block}\n"
                f"Output only the research brief text.")
    if stage == "draft":
        banned = (
            "BANNED PATTERNS — do not use any of these:\n"
            "- Fragment-stacking in threes (\"Not the fastest. Not the flashiest. But…\")\n"
            "- \"Here's the thing / part / takeaway\" signposting\n"
            "- One-word rhetorical Q&A (\"And honestly?\")\n"
            "- \"It's not X, it's Y\" reversals\n"
            "- Standalone affirmation one-liners (\"You belong here.\")\n"
            "- Tidy metaphor-callback endings (the \"bow\")\n"
            "- Em-dash overload — maximum 2 em-dashes in the whole post\n"
            "- Ending paragraphs on tidy punchlines\n"
            "Vary sentence length: let some sentences run long and conversational."
        )
        return (f"Write the blog post for Q-Youth NZ.\nTopic: {idea['title']}\n\n"
                f"Research brief:\n{prior.get('brief', '')}\n\n"
                f"Follow this style guide exactly:\n{style_block}\n\n"
                f"{banned}\n\n"
                f"First line must be: TITLE: <your generated title based on content — not the topic prompt>\n"
                f"Then a blank line, then the post body. Paragraphs separated by blank lines. No heading.")
    if stage == "reflect":
        return (f"You are a humanising line-editor for Q-Youth NZ blog posts.\n\n"
                f"Draft title: {prior.get('title', '')}\n"
                f"Draft body:\n{prior.get('body', '')}\n\nStyle guide:\n{style_block}\n\n"
                f"Hunt for any AI writing tells and rewrite them. The banned patterns are:\n"
                f"fragment-stacking in threes, \"Here's the thing\" signposting, one-word rhetorical Q&A, "
                f"\"It's not X it's Y\" reversals, standalone affirmation one-liners, tidy metaphor-callback endings, "
                f"em-dash overload (max 2 total), ending paragraphs on tidy punchlines, anything else that smells generated.\n\n"
                f"Always produce a full rewritten body — never return the draft unchanged.\n"
                f"If the title is clunky, improve it.\n\n"
                f'Return JSON only: {{"notes": "<what you changed and why>", "revised_title": "<improved or same title>", "revised_body": "<full rewritten text>"}}')
    raise ValueError(f"Unknown stage: {stage}")

def run_stage(stage, idea, prior, style, claude_call):
    output = claude_call(build_prompt(stage, idea, prior, style)).strip()
    if stage == "research":
        return {"brief": output}
    if stage == "draft":
        title = None
        lines = output.splitlines()
        if lines and lines[0].upper().startswith("TITLE:"):
            title = lines[0][len("TITLE:"):].strip() or None
            # drop the title line (and any following blank line) from body
            body = "\n".join(lines[1:]).lstrip("\n")
        else:
            body = output
        return {"title": title, "body": body}
    if stage == "reflect":
        try:
            parsed = json.loads(output)
            return {
                "reflectionNotes": parsed.get("notes", ""),
                "revised_title": parsed.get("revised_title"),
                "revised_body": parsed.get("revised_body"),
            }
        except (json.JSONDecodeError, AttributeError):
            return {"reflectionNotes": output, "revised_title": None, "revised_body": None}
    raise ValueError(f"Unknown stage: {stage}")

# ── claude CLI ───────────────────────────────────────────────────
def claude_cmd(prompt, tools=None):
    cmd = [cfg("CLAUDE_BIN", "claude"), "-p", prompt, "--output-format", "text"]
    if tools:
        joined = ",".join(tools)
        cmd += ["--tools", joined, "--allowedTools", joined]
    return cmd

def claude_call(prompt, tools=None):
    if os.environ.get("RUNNER_DRY_RUN"):
        if "revised_title" in prompt:  # reflect prompt contains this key name
            return json.dumps({"notes": "dry run", "revised_title": None, "revised_body": "[dry-run body]"})
        return f"[dry-run output for prompt starting: {prompt[:60]}...]"
    result = subprocess.run(claude_cmd(prompt, tools),
        capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed: {(result.stderr or result.stdout)[:500]}")
    return result.stdout

# ── API ──────────────────────────────────────────────────────────
def api(path, payload=None):
    req = urllib.request.Request(
        cfg("STUDIO_URL").rstrip("/") + path,
        data=json.dumps(payload or {}).encode(),
        headers={"Authorization": f"Bearer {cfg('RUNNER_TOKEN')}",
                 "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"API {path} → {e.code}: {e.read().decode()[:300]}")

STAGE_FLOW = [("research", "drafting"), ("draft", "reflecting"), ("reflect", "ready")]

def process(idea):
    prior = {}
    for stage, next_status in STAGE_FLOW:
        print(f"  [{idea['title']}] {stage}…")
        # research gets web access so briefs cite real, current sources
        call = (lambda p: claude_call(p, tools=["WebSearch", "WebFetch"])) \
            if stage == "research" else claude_call
        out = run_stage(stage, idea, prior, STYLE_GUIDE, call)
        prior.update({k: v for k, v in out.items() if v is not None})
        draft = None
        if stage == "research":
            draft = {"brief": out["brief"]}
        elif stage == "draft":
            draft = {"body": out["body"]}
            if out.get("title"):
                draft["title"] = out["title"]
        elif stage == "reflect":
            draft = {"reflectionNotes": out["reflectionNotes"]}
            if out.get("revised_body"):
                draft["body"] = out["revised_body"]
            if out.get("revised_title"):
                draft["title"] = out["revised_title"]
        api("/api/runner/update", {"ideaId": idea["id"], "status": next_status, "draft": draft})
    print(f"  [{idea['title']}] ready for review")

def main():
    load_env()
    poll = int(cfg("POLL_SECONDS", "90"))
    print(f"Runner polling {cfg('STUDIO_URL')} every {poll}s. Ctrl+C to stop.")
    while True:
        try:
            api("/api/runner/heartbeat")
            claimed = api("/api/runner/claim").get("idea")
            if claimed:
                try:
                    process(claimed)
                except Exception as e:
                    print(f"  FAILED: {e}", file=sys.stderr)
                    api("/api/runner/update",
                        {"ideaId": claimed["id"], "status": "failed", "error": str(e)[:1000]})
        except Exception as e:
            print(f"poll error: {e}", file=sys.stderr)
        time.sleep(poll)

if __name__ == "__main__":
    main()
