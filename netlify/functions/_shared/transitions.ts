export const STATUSES = [
  "pending", "researching", "drafting", "reflecting",
  "ready", "approved", "published", "failed",
] as const;

const ALLOWED: Record<string, string[]> = {
  pending:     ["researching"],
  researching: ["drafting", "failed"],
  drafting:    ["reflecting", "failed"],
  reflecting:  ["ready", "failed"],
  ready:       ["approved"],
  approved:    ["published"],
  published:   [],
  failed:      ["pending"],
};

export function canTransition(from: string, to: string): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
