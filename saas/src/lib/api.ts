/** Small helpers shared by the API routes. */

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export class BodyError extends Error {
  constructor(readonly status: 400 | 413) {
    super(status === 413 ? "Request too large" : "Invalid JSON");
  }
}

/** Reads a JSON body, refusing anything bigger than `maxBytes` (checked on the real bytes, not just the header). */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new BodyError(413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new BodyError(413);
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError(400);
  }
}

/** `Authorization: Bearer <token>` -> token, or null. */
export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = /^Bearer (\S{1,200})$/.exec(h);
  return m?.[1] ?? null;
}
