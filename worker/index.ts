import { DurableObject } from "cloudflare:workers";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  CHAT_ROOMS: DurableObjectNamespace<ChatRoom>;
}

const UPSTREAM_PREFIXES = ["/rest/v1", "/storage/v1", "/functions/v1", "/auth/v1", "/graphql/v1"];

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

  async getPresence(): Promise<{ online: boolean }> { const onlineAt = await this.ctx.storage.get<number>("onlineAt"); return { online: !!onlineAt && Date.now() - onlineAt < 70000 }; }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "WebSocket requis." }, 426);
    const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map(x => x.trim());
    const tokenProtocol = protocols.find(x => x.startsWith("session."));
    const token = tokenProtocol?.slice("session.".length) ?? "";
    if (!protocols.includes("safary.v1") || !/^[a-f0-9]{64}$/.test(token)) return json({ error: "Session manquante." }, 401);

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
    const parts = url.pathname.split("/").filter(Boolean);
    const roomType = parts.at(-2);
    const roomId = parts.at(-1) ?? "";
    if (!validId(roomId) || (roomType !== "chat" && roomType !== "inbox" && roomType !== "presence")) return json({ error: "Canal invalide." }, 400);
    if ((roomType === "inbox" && roomId !== userId) || (roomType === "presence" && roomId !== userId)) return json({ error: "Accès refusé à ce canal." }, 403);
    let participants = [userId];
    if (roomType === "presence") {
      const prefUrl = new URL(base + "/rest/v1/user_settings");
      prefUrl.search = new URLSearchParams({ select: "online_status_visible", user_id: "eq." + userId, limit: "1" }).toString();
      const pref = await fetch(prefUrl, { headers: { apikey: this.env.SUPABASE_PUBLISHABLE_KEY, "x-client-info": "safary-session:" + token } });
      if (!pref.ok) return json({ error: "Impossible de vérifier la confidentialité." }, 503);
      const rows = await pref.json() as Array<{ online_status_visible: boolean }>;
      if (rows[0]?.online_status_visible === false) return json({ hidden: true }, 403);
    }
    if (roomType === "chat") {
      const membershipUrl = new URL(base + "/rest/v1/conversation_members");
      membershipUrl.search = new URLSearchParams({ select: "user_id", conversation_id: "eq." + roomId }).toString();
      const membership = await fetch(membershipUrl, { headers: { apikey: this.env.SUPABASE_PUBLISHABLE_KEY, "x-client-info": "safary-session:" + token } });
      if (!membership.ok) return json({ error: "Vérification des droits impossible." }, 503);
      const membershipRows = await membership.json() as Array<{ user_id: string }>;
      participants = [...new Set(membershipRows.map(row => row.user_id))];
      if (!participants.includes(userId)) return json({ error: "Accès refusé à cette conversation." }, 403);
    } else if (roomType === "presence" || roomType === "inbox") {
      const membershipsUrl = new URL(base + "/rest/v1/conversation_members");
      membershipsUrl.search = new URLSearchParams({ select: "conversation_id", user_id: "eq." + userId }).toString();
      const ownMemberships = await fetch(membershipsUrl, { headers: { apikey: this.env.SUPABASE_PUBLISHABLE_KEY, "x-client-info": "safary-session:" + token } });
      if (!ownMemberships.ok) return json({ error: "Vérification des contacts impossible." }, 503);
      const ownRows = await ownMemberships.json() as Array<{ conversation_id: string }>;
      const ids = [...new Set(ownRows.map(row => row.conversation_id))];
      if (ids.length) {
        const peersUrl = new URL(base + "/rest/v1/conversation_members");
        peersUrl.search = new URLSearchParams({ select: "user_id", conversation_id: "in.(" + ids.join(",") + ")" }).toString();
        const peers = await fetch(peersUrl, { headers: { apikey: this.env.SUPABASE_PUBLISHABLE_KEY, "x-client-info": "safary-session:" + token } });
        if (!peers.ok) return json({ error: "Chargement des contacts impossible." }, 503);
        const peerRows = await peers.json() as Array<{ user_id: string }>;
        participants = [...new Set(peerRows.map(row => row.user_id).filter(id => id !== userId))];
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, roomId, roomType, participants });
    if (roomType === "presence") {
      await this.ctx.storage.put("onlineAt", Date.now());
      await this.ctx.storage.put("presenceMeta", { userId, participants });
      await this.ctx.storage.setAlarm(Date.now() + 70000);
      await this.broadcastPresence(userId, true, participants);
    }
    if (roomType === "inbox") {
      const snapshot = await Promise.all(participants.map(async peerId => ({ userId: peerId, ...(await this.env.CHAT_ROOMS.get(this.env.CHAT_ROOMS.idFromName("presence:" + peerId)).getPresence()) })));
      server.send(JSON.stringify({ type: "presence-snapshot", users: snapshot }));
    }
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": "safary.v1" } });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const attachment = ws.deserializeAttachment() as { userId: string; roomId: string; roomType: string; participants: string[]; lastSyncAt?: number } | null;
    if (!attachment || typeof message !== "string" || message.length > 2048) return;
    let payload: { type?: string };
    try { payload = JSON.parse(message); } catch { return; }
    if (attachment.roomType === "presence" && payload.type === "heartbeat") { const now = Date.now(); await this.ctx.storage.put("onlineAt", now); await this.ctx.storage.setAlarm(now + 70000); return; }
    if (attachment.roomType === "presence" && payload.type === "activity") { const event = JSON.stringify({ type: "activity", actorId: attachment.userId, at: Date.now() }); await Promise.all(attachment.participants.map(async id => { const stub = this.env.CHAT_ROOMS.get(this.env.CHAT_ROOMS.idFromName("inbox:" + id)); await stub.notify(event); })); return; }
    if (attachment.roomType !== "chat" || payload.type !== "sync") return;
    const now = Date.now();
    if (attachment.lastSyncAt && now - attachment.lastSyncAt < 100) return;
    ws.serializeAttachment({ ...attachment, lastSyncAt: now });
    const event = JSON.stringify({ type: "sync", conversationId: attachment.roomId, actorId: attachment.userId, at: now });
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === ws) continue;
      const peer = socket.deserializeAttachment() as { roomId?: string; roomType?: string } | null;
      if (peer?.roomType === "chat" && peer.roomId === attachment.roomId) {
        try { socket.send(event); } catch { try { socket.close(1011, "send failed"); } catch {} }
      }
    }
    const inboxEvent = JSON.stringify({ type: "inbox-sync", conversationId: attachment.roomId, actorId: attachment.userId, at: now });
    await Promise.all(attachment.participants.filter(id => id !== attachment.userId).map(async id => {
      const stub = this.env.CHAT_ROOMS.get(this.env.CHAT_ROOMS.idFromName("inbox:" + id));
      await stub.notify(inboxEvent);
    }));
  }

  async broadcastPresence(userId: string, online: boolean, participants: string[]) { const event = JSON.stringify({ type: "presence", userId, online, at: Date.now() }); await Promise.all(participants.map(async id => { const stub = this.env.CHAT_ROOMS.get(this.env.CHAT_ROOMS.idFromName("inbox:" + id)); await stub.notify(event); })); }

  async notify(event: string) {
    if (event.length > 2048) return;
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as { roomType?: string } | null;
      if (attachment?.roomType === "inbox") {
        try { socket.send(event); } catch { try { socket.close(1011, "send failed"); } catch {} }
      }
    }
  }

  async alarm() {
    const onlineAt = await this.ctx.storage.get<number>("onlineAt");
    if (!onlineAt) return;
    const remaining = 70000 - (Date.now() - onlineAt);
    if (remaining > 0) { await this.ctx.storage.setAlarm(Date.now() + remaining); return; }
    await this.ctx.storage.delete("onlineAt");
    const meta = await this.ctx.storage.get<{ userId: string; participants: string[] }>("presenceMeta");
    if (meta?.userId) await this.broadcastPresence(meta.userId, false, meta.participants ?? []);
  }

  async webSocketClose(ws: WebSocket) { const attachment = ws.deserializeAttachment() as { userId?: string; roomType?: string; participants?: string[] } | null; if (attachment?.roomType === "presence" && this.ctx.getWebSockets().filter(s => { const a = s.deserializeAttachment() as { roomType?: string } | null; return s !== ws && a?.roomType === "presence"; }).length === 0) { await this.ctx.storage.delete("onlineAt"); await this.ctx.storage.delete("presenceMeta"); await this.ctx.storage.deleteAlarm(); await this.broadcastPresence(attachment.userId ?? "", false, attachment.participants ?? []); } try { ws.close(1000, "closed"); } catch {} }
  async webSocketError(ws: WebSocket) { try { ws.close(1011, "socket error"); } catch {} }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url);

    if (incoming.pathname.startsWith("/realtime/chat/")) {
      const conversationId = incoming.pathname.slice("/realtime/chat/".length);
      if (!validId(conversationId)) return json({ error: "Conversation invalide." }, 400);
      return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName("chat:" + conversationId)).fetch(request);
    }
    if (incoming.pathname.startsWith("/realtime/presence/")) {
      const userId = incoming.pathname.slice("/realtime/presence/".length);
      if (!validId(userId)) return json({ error: "Compte invalide." }, 400);
      return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName("presence:" + userId)).fetch(request);
    }
    if (incoming.pathname.startsWith("/realtime/inbox/")) {
      const userId = incoming.pathname.slice("/realtime/inbox/".length);
      if (!validId(userId)) return json({ error: "Compte invalide." }, 400);
      return env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName("inbox:" + userId)).fetch(request);
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
