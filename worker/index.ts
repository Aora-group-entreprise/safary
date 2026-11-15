interface Env {
  SUPABASE_URL: string;
}

const UPSTREAM_PREFIXES = [
  "/rest/v1",
  "/storage/v1",
  "/functions/v1",
  "/realtime/v1",
  "/auth/v1",
  "/graphql/v1",
];

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);

    if (incoming.pathname === "/api/health") {
      return json({ ok: true, service: "safary-api", provider: "cloudflare-workers" });
    }

    if (!incoming.pathname.startsWith("/api/")) {
      return json({ error: "Route introuvable." }, 404);
    }

    if (!env.SUPABASE_URL) {
      return json({ error: "SUPABASE_URL is not configured." }, 503);
    }

    const upstreamPath = incoming.pathname.slice("/api".length);
    const allowed = UPSTREAM_PREFIXES.some(
      (prefix) => upstreamPath === prefix || upstreamPath.startsWith(prefix + "/"),
    );
    if (!allowed) return json({ error: "API route not allowed." }, 404);

    let upstreamBase: URL;
    try {
      upstreamBase = new URL(env.SUPABASE_URL);
      if (upstreamBase.protocol !== "https:") {
        return json({ error: "Supabase upstream must use HTTPS." }, 500);
      }
    } catch {
      return json({ error: "Invalid SUPABASE_URL configuration." }, 500);
    }

    const upstream = new URL(upstreamPath + incoming.search, upstreamBase.origin);
    const headers = new Headers(request.headers);
    headers.delete("host");

    try {
      // Reuse the incoming request so method, body and WebSocket upgrade metadata survive.
      const upstreamRequest = new Request(upstream.toString(), {
        ...request,
        headers,
      });
      const response = await fetch(upstreamRequest);

      // A 101 response carries the upgraded WebSocket; do not wrap it in a new Response.
      if (response.status === 101) return response;

      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("x-safary-api", "cloudflare-worker");
      responseHeaders.set("x-content-type-options", "nosniff");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch {
      return json({ error: "Supabase upstream is temporarily unavailable." }, 502);
    }
  },
};
