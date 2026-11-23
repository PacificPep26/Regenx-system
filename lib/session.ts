import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rx_session";
const key = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "");

export type SessionPayload = { uid: string; v: number };

export async function signSession(p: SessionPayload, maxAgeSec: number) {
  return new SignJWT(p)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
