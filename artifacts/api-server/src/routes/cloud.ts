import crypto from "node:crypto";
import express, { Router, type IRouter } from "express";
import cookieParser from "cookie-parser";
import {
  BeginGoogleLoginBody,
  CreateFileBody,
  CreateFolderBody,
  CreatePasscodeBody,
  DeleteFileParams,
  DeleteFolderParams,
  GetFileDownloadParams,
  ListFilesQueryParams,
  LoginWithEmailBody,
  RequestUploadUrlBody,
  UpdateFileBody,
  UpdateFileParams,
  UpdateFolderBody,
  UpdateFolderParams,
  UnlockVaultBody,
} from "@workspace/api-zod";
import { clearSession, getSession, setSession, updateSession, type SessionData } from "../lib/session";
import { hashPasscode, verifyPasscode } from "../lib/passcode";
import {
  absoluteStorageUrl,
  publicAppUrl,
  readJson,
  supabaseAdminRequest,
  supabaseRequest,
} from "../lib/supabase";

type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
};

type ProfileRow = {
  id: string;
  email?: string;
  full_name?: string | null;
  avatar_url?: string | null;
  passcode_hash?: string | null;
};

type FileRow = {
  id: string;
  name: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  folder_id?: string | null;
  created_at: string;
  updated_at: string;
};

type FolderRow = {
  id: string;
  name: string;
  parent_folder_id?: string | null;
  created_at: string;
  updated_at: string;
};

const WEAK_PASSCODES = new Set(["000000", "111111", "123456", "654321", "012345", "987654"]);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const PKCE_COOKIE = "private_cloud_pkce";
const RESET_COOKIE = "private_cloud_reset";

const router: IRouter = Router();
router.use(cookieParser());

function sessionUser(user: SupabaseUser) {
  return {
    id: user.id,
    email: user.email ?? "",
    fullName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    avatarUrl: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
  };
}

function isWeakPasscode(value: string) {
  return WEAK_PASSCODES.has(value) || /^(\d)\1{5}$/.test(value);
}

function cookieSettings() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

async function getProfile(userId: string): Promise<ProfileRow | null> {
  const response = await supabaseAdminRequest(
    `/rest/v1/profiles?select=id,email,full_name,avatar_url,passcode_hash&id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  if (!response.ok) return null;
  const rows = await readJson<ProfileRow[]>(response);
  return rows[0] ?? null;
}

async function listUserFolders(userId: string, accessToken: string): Promise<FolderRow[]> {
  const response = await supabaseRequest(
    `/rest/v1/folders?select=id,name,parent_folder_id,created_at,updated_at&user_id=eq.${encodeURIComponent(userId)}&order=name.asc`,
    {},
    accessToken,
  );
  if (!response.ok) return [];
  return readJson<FolderRow[]>(response);
}

function folderPath(folders: FolderRow[], folderId: string | null | undefined) {
  if (!folderId) return "My Storage";
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const parts: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.name);
    current = current.parent_folder_id ? byId.get(current.parent_folder_id) : undefined;
  }
  return parts.join(" / ") || "My Storage";
}

async function currentUser(session: SessionData): Promise<SupabaseUser | null> {
  const response = await supabaseRequest("/auth/v1/user", {}, session.accessToken);
  if (!response.ok) return null;
  return readJson<SupabaseUser>(response);
}

async function requireSession(req: express.Request, res: express.Response): Promise<SessionData | null> {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: "Please sign in to continue." });
    return null;
  }
  const user = await currentUser(session);
  if (!user) {
    clearSession(res);
    res.status(401).json({ error: "Your session has expired. Please sign in again." });
    return null;
  }
  return session;
}

async function requireVault(req: express.Request, res: express.Response): Promise<SessionData | null> {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (session.lockedUntil && session.lockedUntil > Date.now()) {
    res.status(429).json({ error: "Vault temporarily locked. Try again shortly." });
    return null;
  }
  if (!session.vaultUnlocked) {
    res.status(423).json({ error: "Unlock your private vault to continue." });
    return null;
  }
  return session;
}

function authSession(session: SessionData | null, profile: ProfileRow | null, user: SupabaseUser | null) {
  return {
    authenticated: Boolean(session && user),
    vaultUnlocked: Boolean(session?.vaultUnlocked),
    hasPasscode: Boolean(profile?.passcode_hash),
    user: user ? sessionUser(user) : null,
  };
}

function mapFile(row: FileRow, folders: FolderRow[]) {
  return {
    id: row.id,
    name: row.name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    folderId: row.folder_id ?? null,
    folderPath: folderPath(folders, row.folder_id),
    storagePath: row.storage_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFolder(row: FolderRow) {
  return {
    id: row.id,
    name: row.name,
    parentFolderId: row.parent_folder_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function beginPkce(res: express.Response) {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  res.cookie(PKCE_COOKIE, verifier, { ...cookieSettings(), maxAge: 10 * 60 * 1000 });
  return challenge;
}

async function establishSession(
  res: express.Response,
  auth: { access_token: string; refresh_token?: string; user: SupabaseUser },
  extras: Partial<SessionData> = {},
) {
  const session: SessionData = {
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token,
    userId: auth.user.id,
    vaultUnlocked: false,
    failedAttempts: 0,
    ...extras,
  };
  setSession(res, session);
  const profile = await getProfile(session.userId);
  return { session, profile };
}

router.get("/auth/session", async (req, res): Promise<void> => {
  const session = getSession(req);
  if (!session) {
    res.json(authSession(null, null, null));
    return;
  }
  const user = await currentUser(session);
  const profile = user ? await getProfile(session.userId) : null;
  if (!user) clearSession(res);
  res.json(authSession(user ? session : null, profile, user));
});

router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = LoginWithEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and a password with at least 8 characters." });
    return;
  }
  if (parsed.data.password.length < 8) {
    res.status(400).json({ error: "Use a password with at least 8 characters." });
    return;
  }
  const response = await supabaseRequest("/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
  });
  if (!response.ok) {
    res.status(400).json({ error: "That email could not be registered. Try signing in instead." });
    return;
  }
  const auth = await readJson<{ access_token?: string; refresh_token?: string; user?: SupabaseUser }>(response);
  if (!auth.access_token || !auth.user) {
    res.json({
      authenticated: false,
      vaultUnlocked: false,
      hasPasscode: false,
      user: null,
      error: "Check your email to confirm the account, then sign in.",
    });
    return;
  }
  const { session, profile } = await establishSession(res, {
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    user: auth.user,
  });
  res.status(201).json(authSession(session, profile, auth.user));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginWithEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }

  const response = await supabaseRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
  });
  if (!response.ok) {
    req.log.warn({ status: response.status }, "Supabase email login failed");
    res.status(401).json({ error: "That email or password was not recognized." });
    return;
  }

  const auth = await readJson<{ access_token: string; refresh_token?: string; user: SupabaseUser }>(response);
  const { session, profile } = await establishSession(res, auth);
  res.json(authSession(session, profile, auth.user));
});

router.post("/auth/magic-link", async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!email.includes("@")) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const challenge = beginPkce(res);
  const redirectTo = `${publicAppUrl(req)}/api/auth/google/callback`;
  const response = await supabaseRequest("/auth/v1/otp", {
    method: "POST",
    body: JSON.stringify({
      email,
      create_user: true,
      data: {},
      gotrue_meta_security: {},
      options: { email_redirect_to: redirectTo },
    }),
  });
  if (!response.ok) {
    const fallback = await supabaseRequest("/auth/v1/magiclink", {
      method: "POST",
      body: JSON.stringify({ email, data: { redirect_to: redirectTo }, code_challenge: challenge, code_challenge_method: "s256" }),
    });
    if (!fallback.ok) {
      res.status(502).json({ error: "We could not send a sign-in email just now." });
      return;
    }
  }
  res.json({ sent: true });
});

router.post("/auth/google", async (req, res): Promise<void> => {
  BeginGoogleLoginBody.safeParse(req.body ?? {});
  const challenge = beginPkce(res);
  const reset = Boolean(req.body?.reset);
  if (reset) {
    res.cookie(RESET_COOKIE, "1", { ...cookieSettings(), maxAge: 10 * 60 * 1000 });
  }
  res.json({ url: `/api/auth/google/start?challenge=${encodeURIComponent(challenge)}${reset ? "&reset=1" : ""}` });
});

router.get("/auth/google/start", async (req, res): Promise<void> => {
  const challenge = typeof req.query.challenge === "string" ? req.query.challenge : "";
  if (!challenge) {
    res.status(400).send("Google sign-in could not be started.");
    return;
  }
  const redirectTo = `${publicAppUrl(req)}/api/auth/google/callback`;
  const response = await supabaseRequest(
    `/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`,
    { method: "GET", redirect: "manual" },
  );
  const location = response.headers.get("location");
  if (location) {
    res.redirect(location);
    return;
  }
  res.status(502).send("Google sign-in is not configured yet.");
});

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const verifier = req.cookies?.[PKCE_COOKIE] as string | undefined;
  const reset = req.cookies?.[RESET_COOKIE] === "1" || req.query.reset === "1";
  res.clearCookie(PKCE_COOKIE, cookieSettings());
  res.clearCookie(RESET_COOKIE, cookieSettings());
  if (!code || !verifier) {
    res.redirect("/?auth_error=google");
    return;
  }

  const response = await supabaseRequest("/auth/v1/token?grant_type=pkce", {
    method: "POST",
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  if (!response.ok) {
    req.log.warn({ status: response.status }, "OAuth callback exchange failed");
    res.redirect("/?auth_error=google");
    return;
  }

  const auth = await readJson<{ access_token: string; refresh_token?: string; user: SupabaseUser }>(response);
  await establishSession(res, auth, { resetVerified: reset });
  res.redirect(reset ? "/?reset=1" : "/");
});

router.post("/auth/logout", (_req, res): void => {
  clearSession(res);
  res.sendStatus(204);
});

router.post("/vault/verify-account", async (req, res): Promise<void> => {
  const session = await requireSession(req, res);
  if (!session) return;
  const user = await currentUser(session);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!user?.email || !password) {
    res.status(400).json({ error: "Re-enter your account password to reset the passcode." });
    return;
  }
  const response = await supabaseRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: user.email, password }),
  });
  if (!response.ok) {
    res.status(401).json({ error: "That account password was not recognized." });
    return;
  }
  updateSession(res, { ...session, resetVerified: true, vaultUnlocked: false });
  res.json({ verified: true });
});

router.post("/vault/passcode", async (req, res): Promise<void> => {
  const session = await requireSession(req, res);
  if (!session) return;
  const parsed = CreatePasscodeBody.safeParse(req.body);
  if (!parsed.success || isWeakPasscode(parsed.data.passcode)) {
    res.status(400).json({ error: "Choose a six-digit passcode that is not a repeated or obvious number." });
    return;
  }

  const existing = await getProfile(session.userId);
  if (existing?.passcode_hash && !session.resetVerified) {
    res.status(403).json({ error: "Verify your account before replacing an existing passcode." });
    return;
  }

  const response = await supabaseAdminRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(session.userId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        passcode_hash: hashPasscode(parsed.data.passcode),
        passcode_created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) {
    req.log.error({ status: response.status }, "Could not save vault passcode");
    res.status(502).json({ error: "We could not save your passcode. Please try again." });
    return;
  }

  const updated = { ...session, vaultUnlocked: true, failedAttempts: 0, lockedUntil: undefined, resetVerified: false };
  updateSession(res, updated);
  const user = await currentUser(updated);
  const profile = await getProfile(updated.userId);
  res.json(authSession(updated, profile, user));
});

router.post("/vault/unlock", async (req, res): Promise<void> => {
  const session = await requireSession(req, res);
  if (!session) return;
  const parsed = UnlockVaultBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your six-digit passcode." });
    return;
  }
  if (session.lockedUntil && session.lockedUntil > Date.now()) {
    res.status(429).json({ error: "Too many attempts. Try again in a minute." });
    return;
  }

  const profile = await getProfile(session.userId);
  if (!profile?.passcode_hash || !verifyPasscode(parsed.data.passcode, profile.passcode_hash)) {
    const failedAttempts = session.failedAttempts + 1;
    const lockedUntil = failedAttempts >= 5 ? Date.now() + 60_000 : undefined;
    updateSession(res, { ...session, failedAttempts, lockedUntil });
    res.status(401).json({
      error: lockedUntil ? "Too many attempts. Vault locked for one minute." : "That passcode is not correct.",
    });
    return;
  }

  const updated = { ...session, vaultUnlocked: true, failedAttempts: 0, lockedUntil: undefined };
  updateSession(res, updated);
  const user = await currentUser(updated);
  res.json(authSession(updated, profile, user));
});

router.post("/vault/lock", async (req, res): Promise<void> => {
  const session = await requireSession(req, res);
  if (!session) return;
  const updated = { ...session, vaultUnlocked: false };
  updateSession(res, updated);
  const user = await currentUser(updated);
  const profile = await getProfile(updated.userId);
  res.json(authSession(updated, profile, user));
});

router.get("/files", async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const parsed = ListFilesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid file filters." });
    return;
  }
  const folders = await listUserFolders(session.userId, session.accessToken);
  const matchingFolderIds = parsed.data.search
    ? folders.filter((folder) => folder.name.toLowerCase().includes(parsed.data.search!.toLowerCase())).map((folder) => folder.id)
    : [];
  const params = new URLSearchParams({
    select: "id,name,original_name,storage_path,mime_type,file_size,folder_id,created_at,updated_at",
    user_id: `eq.${session.userId}`,
    order: "updated_at.desc",
    limit: String(parsed.data.limit ?? 50),
  });
  if (parsed.data.search) {
    const safe = parsed.data.search.replace(/[,()]/g, " ").trim();
    const folderFilter = matchingFolderIds.length ? `,folder_id.in.(${matchingFolderIds.join(",")})` : "";
    params.set("or", `(name.ilike.*${safe}*,original_name.ilike.*${safe}*,mime_type.ilike.*${safe}*${folderFilter})`);
  }
  if (parsed.data.folderId) params.set("folder_id", `eq.${parsed.data.folderId}`);

  const response = await supabaseRequest(`/rest/v1/files?${params.toString()}`, {}, session.accessToken);
  if (!response.ok) {
    res.status(502).json({ error: "Files are temporarily unavailable." });
    return;
  }
  const rows = await readJson<FileRow[]>(response);
  res.json(rows.map((row) => mapFile(row, folders)));
});

router.post("/files", async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const parsed = CreateFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "File metadata is incomplete." });
    return;
  }
  if (!parsed.data.storagePath.startsWith(`${session.userId}/`)) {
    res.status(403).json({ error: "You can only save files in your own storage." });
    return;
  }
  const response = await supabaseRequest("/rest/v1/files", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: session.userId,
      name: parsed.data.name,
      original_name: parsed.data.originalName,
      storage_path: parsed.data.storagePath,
      mime_type: parsed.data.mimeType,
      file_size: parsed.data.fileSize,
      folder_id: parsed.data.folderId ?? null,
    }),
  }, session.accessToken);
  if (!response.ok) {
    req.log.error({ status: response.status }, "Could not create file metadata");
    res.status(502).json({ error: "We could not save this file." });
    return;
  }
  const [row] = await readJson<FileRow[]>(response);
  const folders = await listUserFolders(session.userId, session.accessToken);
  res.status(201).json(mapFile(row, folders));
});

router.patch("/files/:id", async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const params = UpdateFileParams.safeParse(req.params);
  const parsed = UpdateFileBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid file update." });
    return;
  }
  const patch: Record<string, string | null> = {};
  if (parsed.data.name !== undefined && parsed.data.name !== null) patch.name = parsed.data.name;
  if (parsed.data.folderId !== undefined) patch.folder_id = parsed.data.folderId;
  patch.updated_at = new Date().toISOString();
  const response = await supabaseRequest(
    `/rest/v1/files?id=eq.${encodeURIComponent(params.data.id)}&user_id=eq.${encodeURIComponent(session.userId)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) },
    session.accessToken,
  );
  if (!response.ok) {
    res.status(404).json({ error: "File not found." });
    return;
  }
  const [row] = await readJson<FileRow[]>(response);
  if (!row) {
    res.status(404).json({ error: "File not found." });
    return;
  }
  const folders = await listUserFolders(session.userId, session.accessToken);
  res.json(mapFile(row, folders));
});

router.delete("/files/:id", async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const params = DeleteFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid file." });
    return;
  }
  const lookup = await supabaseRequest(
    `/rest/v1/files?select=storage_path&id=eq.${encodeURIComponent(params.data.id)}&user_id=eq.${encodeURIComponent(session.userId)}&limit=1`,
    {},
    session.accessToken,
  );
  const [row] = lookup.ok ? await readJson<Array<{ storage_path: string }>>(lookup) : [];
  if (row?.storage_path?.startsWith(`${session.userId}/`)) {
    await supabaseRequest(`/storage/v1/object/user-files/${row.storage_path}`, { method: "DELETE" }, session.accessToken);
  }
  const response = await supabaseRequest(
    `/rest/v1/files?id=eq.${encodeURIComponent(params.data.id)}&user_id=eq.${encodeURIComponent(session.userId)}`,
    { method: "DELETE" },
    session.accessToken,
  );
  if (!response.ok) {
    res.status(404).json({ error: "File not found." });
    return;
  }
  res.sendStatus(204);
});

router.get("/files/:id/download", async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const params = GetFileDownloadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid file." });
    return;
  }
  const lookup = await supabaseRequest(
    `/rest/v1/files?select=storage_path&id=eq.${encodeURIComponent(params.data.id)}&user_id=eq.${encodeURIComponent(session.userId)}&limit=1`,
    {},
    session.accessToken,
  );
  if (!lookup.ok) {
    res.status(404).json({ error: "File not found." });
    return;
  }
  const [row] = await readJson<Array<{ storage_path: string }>>(lookup);
  if (!row) {
    res.status(404).json({ error: "File not found." });
    return;
  }
  const signed = await supabaseRequest(
    `/storage/v1/object/sign/user-files/${row.storage_path}`,
    { method: "POST", body: JSON.stringify({ expiresIn: 120 }) },
    session.accessToken,
  );
  if (!signed.ok) {
    res.status(502).json({ error: "A download link could not be created." });
    return;
  }
  const payload = await readJson<{ signedURL?: string; signedUrl?: string }>(signed);
  res.json({ url: absoluteStorageUrl(payload.signedURL || payload.signedUrl || "") });
});

router.post("/files/upload-url", async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid upload." });
    return;
  }
  if (parsed.data.fileSize > MAX_UPLOAD_BYTES) {
    res.status(400).json({ error: "Files larger than 50 MB cannot be uploaded in this version." });
    return;
  }
  const safeName = parsed.data.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 180);
  const storagePath = `${session.userId}/${crypto.randomUUID()}-${safeName}`;
  const uploadUrl = `/api/files/upload?path=${encodeURIComponent(storagePath)}&contentType=${encodeURIComponent(parsed.data.contentType)}`;
  res.json({ uploadUrl, storagePath });
});

router.put("/files/upload", express.raw({ type: "*/*", limit: "50mb" }), async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const objectPath = typeof req.query.path === "string" ? req.query.path : "";
  const contentType = typeof req.query.contentType === "string" ? req.query.contentType : "application/octet-stream";
  if (!objectPath || !objectPath.startsWith(`${session.userId}/`)) {
    res.status(400).json({ error: "Invalid upload path." });
    return;
  }
  const body = req.body as Buffer;
  if (body?.length > MAX_UPLOAD_BYTES) {
    res.status(400).json({ error: "Files larger than 50 MB cannot be uploaded in this version." });
    return;
  }
  const response = await supabaseRequest(
    `/storage/v1/object/user-files/${objectPath}`,
    {
      method: "POST",
      headers: { "Content-Type": contentType, "x-upsert": "false" },
      body,
    },
    session.accessToken,
  );
  if (!response.ok) {
    req.log.error({ status: response.status }, "Supabase file upload failed");
    res.status(502).json({ error: "The upload could not be completed." });
    return;
  }
  res.status(201).json({ uploaded: true });
});

router.get("/folders", async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const rows = await listUserFolders(session.userId, session.accessToken);
  res.json(rows.map(mapFolder));
});

router.post("/folders", async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const parsed = CreateFolderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Folder name is required." });
    return;
  }
  const response = await supabaseRequest("/rest/v1/folders", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: session.userId,
      name: parsed.data.name,
      parent_folder_id: parsed.data.parentFolderId ?? null,
    }),
  }, session.accessToken);
  if (!response.ok) {
    res.status(502).json({ error: "We could not create that folder." });
    return;
  }
  const [row] = await readJson<FolderRow[]>(response);
  res.status(201).json(mapFolder(row));
});

router.patch("/folders/:id", async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const params = UpdateFolderParams.safeParse(req.params);
  const parsed = UpdateFolderBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid folder update." });
    return;
  }
  const response = await supabaseRequest(
    `/rest/v1/folders?id=eq.${encodeURIComponent(params.data.id)}&user_id=eq.${encodeURIComponent(session.userId)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ name: parsed.data.name, updated_at: new Date().toISOString() }) },
    session.accessToken,
  );
  if (!response.ok) {
    res.status(404).json({ error: "Folder not found." });
    return;
  }
  const [row] = await readJson<FolderRow[]>(response);
  if (!row) {
    res.status(404).json({ error: "Folder not found." });
    return;
  }
  res.json(mapFolder(row));
});

router.delete("/folders/:id", async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const params = DeleteFolderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid folder." });
    return;
  }
  const response = await supabaseRequest(
    `/rest/v1/folders?id=eq.${encodeURIComponent(params.data.id)}&user_id=eq.${encodeURIComponent(session.userId)}`,
    { method: "DELETE" },
    session.accessToken,
  );
  if (!response.ok) {
    res.status(404).json({ error: "Folder not found." });
    return;
  }
  res.sendStatus(204);
});

router.get("/storage/summary", async (req, res): Promise<void> => {
  const session = await requireVault(req, res);
  if (!session) return;
  const response = await supabaseRequest(
    `/rest/v1/files?select=file_size&user_id=eq.${encodeURIComponent(session.userId)}`,
    {},
    session.accessToken,
  );
  if (!response.ok) {
    res.status(502).json({ error: "Storage usage is temporarily unavailable." });
    return;
  }
  const rows = await readJson<Array<{ file_size: number }>>(response);
  const usedBytes = rows.reduce((sum, row) => sum + Number(row.file_size), 0);
  res.json({ usedBytes, fileCount: rows.length, quotaBytes: 15 * 1024 * 1024 * 1024 });
});

export default router;
