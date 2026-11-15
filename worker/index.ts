import { DurableObject } from "cloudflare:workers";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  CHAT_ROOMS: DurableObjectNamespace<ChatRoom>;
}

const UPSTREAM_PREFIXES = ["/rest/v1", "/storage/v1", "/functions/v1", "/realtime/v1", "/auth/v1", "/graphql/v1"];

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  }});
}

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "WebSocket requis." }, 426);
    const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map(x => x.trim());
    const tokenProtocol = protocols.find(x => x.startsWith("session."));
    const token = tokenProtocol?.slice("session.".length) ?? "";
    if (!protocols.includes("safary.v1") || token.length < 40 || token.length > 256) return json({ error: "Session manquante." }, 401);

    const base = this.env.SUPABASE_URL.replace(/\/$/, "");
    const auth = await fetch(base + "/functions/v1/safary-auth", {
      method: "POST",
      headers: { "content-type": "application/json", apikey: this.env.SUPABASE_PUBLISHABLE_KEY, "x-client-info": "safary-session:" + token },
      body: JSON.stringify({ action: "me" }),
    });
    if (!auth.ok) return json({ error: "Session SAFARY invalide ou expirée." }, 401);
    const authData = await auth.json() as { account?: { id?: string } };
    const userId = authData.account?.id;
    if (!userId) return json({ error: "Compte introuvable." }, 401);

    const url = new URL(request.url);
    const conversationId = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    if (!validId(conversationId)) return json({ error: "Conversation invalide." }, 400);
    const membershipUrl = new URL(base + "/rest/v1/conversation_members");
    membershipUrl.search = new URLSearchParams({ select: "conversation_id", conversation_id: "eq." + conversationId, user_id: "eq." + userId, limit: "1" }).toString();
    const membership = await fetch(membershipUrl, { headers: { apikey: this.env.SUPABASE_PUBLISHABLE_KEY, "x-client-info": "safary-session:" + token } });
    if (!membership.ok) return json({ error: "Vérification des droits impossible." }, 503);
    const membershipRows = await membership.json() as Array<{ conversation_id: string }>;
    if (!membershipRows.length) return json({ error: "Accès refusé à cette conversation." }, 403);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, conversationId });
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": "safary.v1" } });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const attachment = ws.deserializeAttachment() as { userId: string; conversationId: string } | null;
    if (!attachment || typeof message !== "string" || message.length > 2048) return;
    let payload: { type?: string };
    try { payload = JSON.parse(message); } catch { return; }
    if (payload.type !== "sync") return;
    const event = JSON.stringify({ type: "sync", conversationId: attachment.conversationId, actorId: attachment.userId, at: Date.now() });
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === ws) continue;
      const peer = socket.deserializeAttachment() as { conversationId?: string } | null;
      if (peer?.conversationId === attachment.conversationId) {
        try { socket.send(event); } catch { try { socket.close(1011, "send failed"); } catch {} }
      }
    }
  }

  async webSocketClose(ws: WebSocket) { try { ws.close(1000, "closed"); } catch {} }
  async webSocketError(ws: WebSocket) { try { ws.close(1011, "socket error"); } catch {} }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);

    if (incoming.pathname.startsWith("/realtime/chat/")) {
      const conversationId = incoming.pathname.slice("/realtime/chat/".length);
      if (!validId(conversationId)) return json({ error: "Conversation invalide." }, 400);
      const id = env.CHAT_ROOMS.idFromName(conversationId);
      return env.CHAT_ROOMS.get(id).fetch(request);
    }

    if (incoming.pathname === "/api/health") return json({ ok: true, service: "safary-api", provider: "cloudflare-workers" });
    if (!incoming.pathname.startsWith("/api/")) return json({ error: "Route introuvable." }, 404);
    if (!env.SUPABASE_URL) return json({ error: "SUPABASE_URL is not configured." }, 503);

    const upstreamPath = incoming.pathname.slice("/api".length);
    const allowed = UPSTREAM_PREFIXES.some(prefix => upstreamPath === prefix || upstreamPath.startsWith(prefix + "/"));
    if (!allowed) return json({ error: "API route not allowed." }, 404);

    let upstreamBase: URL;
    try {
      upstreamBase = new URL(env.SUPABASE_URL);
      if (upstreamBase.protocol !== "https:") return json({ error: "Supabase upstream must use HTTPS." }, 500);
    } catch { return json({ error: "Invalid SUPABASE_URL configuration." }, 500); }

    const upstream = new URL(upstreamPath + incoming.search, upstreamBase.origin);
    try {
      const upstreamRequest = new Request(upstream.toString(), request);
      const response = await fetch(upstreamRequest);
      if (response.status === 101) return response;
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("x-safary-api", "cloudflare-worker");
      responseHeaders.set("x-content-type-options", "nosniff");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
    } catch { return json({ error: "Supabase upstream is temporarily unavailable." }, 502); }
  },
};
