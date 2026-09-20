import { ReplitConnectors } from "@replit/connectors-sdk";

export async function supabaseRequest(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<Response> {
  const connectors = new ReplitConnectors();
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && typeof init.body !== "string") {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const headerRecord: Record<string, string> = {};
  headers.forEach((value, key) => {
    headerRecord[key] = value;
  });

  return connectors.proxy("supabase", path, {
    ...init,
    headers: headerRecord,
  });
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