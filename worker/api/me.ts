import { requireUser } from "../_shared/auth";
import { json } from "../_shared/http";

export default async (req: Request, _params: Record<string, string>) => {
  const auth = await requireUser(req, ["admin", "editor"]);
  if (auth instanceof Response) return auth;
  return json({ email: auth.user.email, roles: auth.user.roles });
};
