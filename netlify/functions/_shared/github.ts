const API = "https://api.github.com";

function headers(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "qyouth-blog-studio",
  };
}

function repoPath(path: string): string {
  const repo = process.env.GITHUB_REPO;
  if (!repo) throw new Error("GITHUB_REPO is not set");
  return `${API}/repos/${repo}/contents/${path}`;
}

export async function getFile(path: string): Promise<{ content: string; sha: string }> {
  const res = await fetch(repoPath(path), { headers: headers() });
  if (!res.ok) throw new Error(`GitHub read of ${path} failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return { content: Buffer.from(body.content, "base64").toString("utf-8"), sha: body.sha };
}

export async function putFile(path: string, content: string, message: string, sha?: string): Promise<void> {
  const res = await fetch(repoPath(path), {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf-8").toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub write of ${path} failed: ${res.status} ${await res.text()}`);
}

// images arrive as base64 already — skip the utf-8 round-trip
export async function putBinaryFile(path: string, base64: string, message: string): Promise<void> {
  const res = await fetch(repoPath(path), {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: base64 }),
  });
  if (!res.ok) throw new Error(`GitHub write of ${path} failed: ${res.status} ${await res.text()}`);
}
