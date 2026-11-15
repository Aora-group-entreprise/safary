import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: cors });
const encoder = new TextEncoder();
const iterations = 600_000;
const sessionDays = 30;

function randomHex(bytes: number) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return [...data].map((v) => v.toString(16).padStart(2, "0")).join("");
}
async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(hash)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations }, key, 256);
  return [...new Uint8Array(bits)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function parseImage(dataUrl: unknown) {
  if (typeof dataUrl !== "string") throw new Error("Les deux photos sont obligatoires.");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("Format d’image invalide. Utilise JPG, PNG ou WebP.");
  const binary = atob(match[2]);
  if (binary.length < 100 || binary.length > 1536 * 1024) throw new Error("Chaque image doit faire moins de 1,5 Mo.");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType: match[1], extension: match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1] };
}
async function signedAccount(account: Record<string, any>) {
  const [avatar, cover] = await Promise.all([
    db.storage.from("profile-media").createSignedUrl(account.avatar_path, 3600),
    db.storage.from("profile-media").createSignedUrl(account.cover_path, 3600),
  ]);
  return {
    id: account.id, username: account.username, display_name: account.display_name,
    age: account.age, bio: account.bio ?? "",
    avatar_url: avatar.data?.signedUrl ?? null, cover_url: cover.data?.signedUrl ?? null,
  };
}
async function authenticate(req: Request) {
  const clientInfo = req.headers.get("x-client-info") ?? "";
  const token = clientInfo.startsWith("safary-session:") ? clientInfo.slice("safary-session:".length) : null;
  if (!token || token.length < 40) return null;
  const tokenHash = await digest(token);
  const { data, error } = await db.from("safary_sessions").select("id,account_id,expires_at,revoked_at").eq("token_hash", tokenHash).maybeSingle();
  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return null;
  const { data: account, error: accountError } = await db.from("safary_accounts").select("id,username,display_name,age,bio,avatar_path,cover_path").eq("id", data.account_id).single();
  if (accountError || !account) return null;
  return { sessionId: data.id as string, account };
}
async function createSession(accountId: string, req: Request) {
  const token = randomHex(32);
  const tokenHash = await digest(token);
  const expires = new Date(Date.now() + sessionDays * 86400000).toISOString();
  const { error } = await db.from("safary_sessions").insert({
    account_id: accountId, token_hash: tokenHash, expires_at: expires,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  });
  if (error) throw error;
  return { token, expires_at: expires };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json(500, { error: "Configuration serveur incomplète." });
  try {
    const body = await req.json();
    const action = String(body.action ?? "");
    if (action === "signup") {
      const username = String(body.username ?? "").trim();
      const normalized = username.toLowerCase();
      const password = String(body.password ?? "");
      const confirmation = String(body.confirmPassword ?? "");
      const age = Number(body.age);
      if (!/^[a-z0-9_.]{3,30}$/.test(normalized)) return json(400, { error: "Le pseudo doit contenir 3 à 30 caractères (lettres, chiffres, _ ou .)." });
      if (password.length < 10 || password.length > 128) return json(400, { error: "Le mot de passe doit contenir entre 10 et 128 caractères." });
      if (password !== confirmation) return json(400, { error: "Les mots de passe ne correspondent pas." });
      if (!Number.isInteger(age) || age < 1 || age > 120) return json(400, { error: "Âge invalide." });
      const avatar = parseImage(body.avatarDataUrl);
      const cover = parseImage(body.coverDataUrl);
      const salt = randomHex(16);
      const hash = await passwordHash(password, salt);
      const accountId = crypto.randomUUID();
      const avatarPath = accountId + "/avatar." + avatar.extension;
      const coverPath = accountId + "/cover." + cover.extension;
      const [avatarUpload, coverUpload] = await Promise.all([
        db.storage.from("profile-media").upload(avatarPath, avatar.bytes, { contentType: avatar.contentType, upsert: false }),
        db.storage.from("profile-media").upload(coverPath, cover.bytes, { contentType: cover.contentType, upsert: false }),
      ]);
      if (avatarUpload.error || coverUpload.error) {
        await db.storage.from("profile-media").remove([avatarPath, coverPath]);
        return json(400, { error: "Impossible d’enregistrer les photos. Réessaie." });
      }
      const { data: account, error } = await db.from("safary_accounts").insert({
        id: accountId, username, display_name: username, age, password_hash: hash,
        password_salt: salt, avatar_path: avatarPath, cover_path: coverPath,
      }).select("id,username,display_name,age,bio,avatar_path,cover_path").single();
      if (error) {
        await db.storage.from("profile-media").remove([avatarPath, coverPath]);
        if (error.code === "23505") return json(409, { error: "Ce pseudo est déjà utilisé." });
        throw error;
      }
      let session;
      try {
        session = await createSession(account.id, req);
      } catch (sessionError) {
        await db.from("safary_accounts").delete().eq("id", account.id);
        await db.storage.from("profile-media").remove([avatarPath, coverPath]);
        throw sessionError;
      }
      return json(201, { session, account: await signedAccount(account) });
    }
    if (action === "login") {
      const username = String(body.username ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (!/^[a-z0-9_.]{3,30}$/.test(username) || !password) return json(400, { error: "Pseudo ou mot de passe incorrect." });
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const ip = req.headers.get("cf-connecting-ip") ?? "";
      const ipHash = ip ? await digest(ip) : null;
      const { count: usernameFailures } = await db.from("safary_login_attempts").select("id", { count: "exact", head: true }).eq("username_normalized", username).gte("attempted_at", since).eq("succeeded", false);
      const { count: ipFailures } = ipHash
        ? await db.from("safary_login_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("attempted_at", since).eq("succeeded", false)
        : { count: 0 };
      if ((usernameFailures ?? 0) >= 8 || (ipFailures ?? 0) >= 30) return json(429, { error: "Trop de tentatives. Réessaie dans 15 minutes." });
      const { data: account } = await db.from("safary_accounts").select("id,username,display_name,age,bio,password_hash,password_salt,avatar_path,cover_path").eq("username_normalized", username).maybeSingle();
      const computed = account ? await passwordHash(password, account.password_salt) : await passwordHash(password, "safary-fixed-dummy-salt");
      const ok = Boolean(account && safeEqual(computed, account.password_hash));
      await db.from("safary_login_attempts").insert({ username_normalized: username, succeeded: ok, ip_hash: ipHash });
      if (!ok || !account) return json(401, { error: "Pseudo ou mot de passe incorrect." });
      const session = await createSession(account.id, req);
      const { password_hash: _hash, password_salt: _salt, ...safe } = account;
      return json(200, { session, account: await signedAccount(safe) });
    }
    const auth = await authenticate(req);
    if (!auth) return json(401, { error: "Session invalide ou expirée. Connecte-toi à nouveau." });
    if (action === "me") return json(200, { account: await signedAccount(auth.account) });
    if (action === "logout") {
      await db.from("safary_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", auth.sessionId);
      return json(200, { success: true });
    }
    if (action === "profile-update") {
      const username = String(body.username ?? auth.account.username).trim();
      const normalized = username.toLowerCase();
      const displayName = String(body.displayName ?? auth.account.display_name).trim().slice(0, 60);
      const bio = String(body.bio ?? auth.account.bio ?? "").trim().slice(0, 160);
      if (!/^[a-z0-9_.]{3,30}$/.test(normalized)) return json(400, { error: "Pseudo invalide." });
      const { data, error } = await db.from("safary_accounts").update({ username, display_name: displayName || username, bio, updated_at: new Date().toISOString() }).eq("id", auth.account.id).select("id,username,display_name,age,bio,avatar_path,cover_path").single();
      if (error?.code === "23505") return json(409, { error: "Ce pseudo est déjà utilisé." });
      if (error) throw error;
      const profileUpdate = await db.from("profiles").update({
        username, display_name: displayName || username, bio, updated_at: new Date().toISOString(),
      }).eq("id", auth.account.id);
      if (profileUpdate.error) throw profileUpdate.error;
      return json(200, { account: await signedAccount(data) });
    }
    return json(400, { error: "Action inconnue." });
  } catch (error) {
    console.error("safary-auth error", error);
    return json(500, { error: "Une erreur serveur est survenue." });
  }
});