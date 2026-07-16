import type { Config, Context } from "@netlify/functions";
import { requireUser } from "./_shared/auth";
import { putBinaryFile } from "./_shared/github";
import { json } from "./_shared/http";
import { stripDataUri, validateImageUpload } from "./_shared/imageUpload";

export default async (req: Request, _context: Context) => {
  const auth = await requireUser(["admin", "editor"]);
  if (auth instanceof Response) return auth;

  try {
    const { filename, data } = await req.json();
    const err = validateImageUpload(filename ?? "", data ?? "", { allowSvg: true });
    if (err) return json({ error: err }, err.includes("large") ? 413 : 422);

    const name = (filename as string).split(/[\\/]/).pop()!;
    const base64 = stripDataUri(data as string);
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
