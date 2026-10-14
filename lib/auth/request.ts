// The login request is read only up to this size: it holds an email and a password, so anything bigger is refused
// before it's read (a huge request would otherwise cost memory and bandwidth, even from someone not signed in).
export const MAX_LOGIN_BODY_BYTES = 4096;

export type SmallJson = { ok: true; value: unknown } | { ok: false; tooLarge: boolean };

export async function readSmallJson(request: Request, maxBytes: number): Promise<SmallJson> {
  if (Number(request.headers.get("content-length")) > maxBytes) return { ok: false, tooLarge: true };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, tooLarge: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    // A missing or wrong length header can't get past this: reading stops at the limit.
    if (size > maxBytes) {
      await reader.cancel();
      return { ok: false, tooLarge: true };
    }
    chunks.push(value);
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) };
  } catch {
    return { ok: false, tooLarge: false };
  }
}

// A browser request sent from this site: its Origin names the host it was sent to. Server actions get this check
// from Next; route handlers that change data do it themselves.
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
