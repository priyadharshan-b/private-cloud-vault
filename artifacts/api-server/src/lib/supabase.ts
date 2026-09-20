function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function supabaseEnv() {
  const url = trimSlash(process.env.SUPABASE_URL ?? "");
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_KEY ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { url, anonKey, serviceRoleKey };
}

function applyJsonContentType(headers: Headers, init: RequestInit) {
  if (init.body && !headers.has("Content-Type") && !headers.has("content-type")) {
    headers.set("Content-Type", "application/json");
  }
}

export async function supabaseRequest(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<Response> {
  const { url, anonKey } = supabaseEnv();
  if (!url || !anonKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY before starting the API.");
  }

  const headers = new Headers(init.headers);
  applyJsonContentType(headers, init);
  headers.set("apikey", anonKey);
  headers.set("Authorization", `Bearer ${accessToken || anonKey}`);

  return fetch(`${url}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });
}

export async function supabaseAdminRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { url, anonKey, serviceRoleKey } = supabaseEnv();
  const key = serviceRoleKey || anonKey;
  if (!url || !key) {
    throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY before starting the API.");
  }

  const headers = new Headers(init.headers);
  applyJsonContentType(headers, init);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);

  return fetch(`${url}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });
}

export function publicAppUrl(req: { protocol: string; get(name: string): string | undefined }) {
  return trimSlash(process.env.PUBLIC_APP_URL ?? `${req.protocol}://${req.get("host")}`);
}

export function absoluteStorageUrl(signedPath: string) {
  if (!signedPath) return "";
  if (signedPath.startsWith("http://") || signedPath.startsWith("https://")) return signedPath;
  const { url } = supabaseEnv();
  const path = signedPath.startsWith("/") ? signedPath : `/${signedPath}`;
  if (path.startsWith("/storage/v1")) return `${url}${path}`;
  return `${url}/storage/v1${path}`;
}

export async function readSupabaseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { msg?: string; message?: string; error_description?: string };
    return body.msg ?? body.message ?? body.error_description ?? "Supabase request failed";
  } catch {
    return "Supabase request failed";
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
