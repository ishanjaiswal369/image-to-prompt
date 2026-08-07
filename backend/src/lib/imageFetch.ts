import { ImageFetchError } from "./errors.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export async function fetchImageAsBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ImageFetchError(`invalid image URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ImageFetchError(`unsupported URL protocol: ${parsed.protocol}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(parsed, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "image-to-prompt-bot/1.0" },
    });
  } catch (err) {
    throw new ImageFetchError(
      `could not reach image URL (network error, or the site may block hotlinking): ${(err as Error).message}`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new ImageFetchError(`image URL returned HTTP ${res.status} (the site may block hotlinking)`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new ImageFetchError(`URL did not return an image (content-type: ${contentType || "unknown"})`);
  }

  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) {
    throw new ImageFetchError(`image too large (${contentLength} bytes, max ${MAX_IMAGE_BYTES})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageFetchError(`image too large (${arrayBuffer.byteLength} bytes, max ${MAX_IMAGE_BYTES})`);
  }

  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: contentType.split(";")[0]?.trim() || "image/png",
  };
}
