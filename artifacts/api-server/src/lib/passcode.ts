import crypto from "node:crypto";

export function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(passcode, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

export function verifyPasscode(passcode: string, encoded: string): boolean {
  const [, salt, expectedHex] = encoded.split("$");
  if (!salt || !expectedHex) return false;

  const actual = crypto.scryptSync(passcode, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}