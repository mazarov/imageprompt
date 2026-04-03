import * as jose from "jose";

const CLOCK_TOLERANCE_SEC = 60;

function secretKey(): Uint8Array {
  const raw = process.env.AUTH_JWT_SECRET?.trim();
  if (!raw || raw.length < 16) {
    throw new Error("AUTH_JWT_SECRET must be set and at least 16 characters");
  }
  return new TextEncoder().encode(raw);
}

export function authJwtExpiresSeconds(): number {
  const days = Number(process.env.AUTH_JWT_EXPIRES_DAYS ?? "7");
  if (!Number.isFinite(days) || days < 1 || days > 365) return 7 * 24 * 60 * 60;
  return Math.floor(days * 24 * 60 * 60);
}

export async function signAppSessionToken(payload: {
  sub: string;
  email: string | null;
  name?: string | null;
  picture?: string | null;
}): Promise<string> {
  const key = secretKey();
  return new jose.SignJWT({
    email: payload.email ?? "",
    name: payload.name ?? "",
    picture: payload.picture ?? "",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${authJwtExpiresSeconds()}s`)
    .sign(key);
}

export async function verifyAppSessionToken(token: string): Promise<{
  sub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
} | null> {
  try {
    const key = secretKey();
    const { payload } = await jose.jwtVerify(token, key, {
      algorithms: ["HS256"],
      clockTolerance: CLOCK_TOLERANCE_SEC,
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    if (!sub) return null;
    const emailRaw = payload.email;
    const email =
      typeof emailRaw === "string" && emailRaw.length > 0 ? emailRaw : null;
    const nameRaw = payload.name;
    const name =
      typeof nameRaw === "string" && nameRaw.length > 0 ? nameRaw : null;
    const pictureRaw = payload.picture;
    const picture =
      typeof pictureRaw === "string" && pictureRaw.length > 0
        ? pictureRaw
        : null;
    return { sub, email, name, picture };
  } catch {
    return null;
  }
}

/** Decode Google id_token claims without verify (already received over TLS from token endpoint). */
export function decodeGoogleIdTokenClaims(idToken: string): {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
} | null {
  try {
    const payload = jose.decodeJwt(idToken);
    return payload as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
  } catch {
    return null;
  }
}
