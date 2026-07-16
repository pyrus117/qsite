import type { Config, Context } from "@netlify/functions";
import { requireUser } from "./_shared/auth";
import { putBinaryFile } from "./_shared/github";
import { json } from "./_shared/http";

const SAFE_NAME = /^[a-zA-Z0-9._-]+\.(jpe?g|png|webp|gif|svg)$/i;

export default async (req: Request, _context: Context) => {
  const auth = await requireUser(["admin", "editor"]);
  if (auth instanceof Response) return auth;

  try {
    const { filename, data } = await req.json();
    const name = (filename ?? "").split(/[\\/]/).pop();
    if (!name || !SAFE_NAME.test(name)) {
      return json({ error: "Filename must be a plain image name (jpg/png/webp/gif/svg)" }, 422);
    }
    const base64 = typeof data === "string" && data.includes(",") ? data.split(",", 2)[1] : data;
    if (!base64) return json({ error: "No image data received" }, 422);
    // Netlify function bodies cap at ~6MB — reject earlier with a clear message
    if (base64.length > 4_500_000) return json({ error: "Image too large — compress below ~3MB first" }, 413);

    await putBinaryFile(`public/images/${name}`, base64, `blog: add image ${name}`);
    return json({ filename: name }, 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Upload failed" }, 500);
  }
};

export const config: Config = {
  path: "/api/images",
  method: ["POST"],
};
