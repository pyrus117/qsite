// Shared image validation — used by both images.ts and runner.ts "image" action.
// SVG allowed by default (images.ts parity); pass allowSvg:false for runner uploads.
const SAFE_NAME_NO_SVG = /^[a-zA-Z0-9._-]+\.(jpe?g|png|webp|gif)$/i;
const SAFE_NAME_SVG    = /^[a-zA-Z0-9._-]+\.(jpe?g|png|webp|gif|svg)$/i;

interface ValidateOpts { allowSvg?: boolean }

/** Returns an error string on failure, null on success. Strips data-URI prefix before size check. */
export function validateImageUpload(
  filename: string,
  data: string,
  { allowSvg = true }: ValidateOpts = {},
): string | null {
  const name = (filename ?? "").split(/[\\/]/).pop() ?? "";
  const pattern = allowSvg ? SAFE_NAME_SVG : SAFE_NAME_NO_SVG;
  if (!name || !pattern.test(name)) {
    return "Filename must be a plain image name (jpg/png/webp/gif" + (allowSvg ? "/svg" : "") + ")";
  }
  const base64 = typeof data === "string" && data.includes(",") ? data.split(",", 2)[1] : data;
  if (!base64) return "No image data received";
  if (base64.length > 4_500_000) return "Image too large — compress below ~3MB first";
  return null;
}

/** Strip data-URI prefix and return raw base64, or the string as-is. */
export function stripDataUri(data: string): string {
  return typeof data === "string" && data.includes(",") ? data.split(",", 2)[1] : data;
}
