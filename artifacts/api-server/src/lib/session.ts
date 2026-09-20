import crypto from "node:crypto";
import type { Request, Response } from "express";

const COOKIE_NAME = "private_cloud_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionData = {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  vaultUnlocked: boolean;
  failedAttempts: number;
  lockedUntil?: number;
};

function secret(): string {
  return process.env.SESSION_SECRET ?? "development-only-session-secret";
}

function encode(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function decode(value: string): SessionData | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = crypto
    .createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionData;
  } catch {
    return null;
  }
}

export function getSession(req: Request): SessionData | null {
  const raw = req.cookies?.[COOKIE_NAME] as string | undefined;
  return raw ? decode(raw) : null;
}

export function setSession(res: Response, session: SessionData): void {
  res.cookie(COOKIE_NAME, encode(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS * 1000,
    path: "/",
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", path: "/" });
}

export function updateSession(res: Response, session: SessionData): void {
  setSession(res, session);
}