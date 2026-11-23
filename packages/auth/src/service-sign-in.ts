// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

/** A sign-in link is for a redirect that happens at once, so it lives one minute. */
export const SERVICE_SIGN_IN_TTL_SECONDS = 60;
export const SERVICE_SIGN_IN_PATH = "/service-sign-in";
const PREFIX = "ssl1";

/** The settings screens a link may open on arrival. */
export const SERVICE_SIGN_IN_SCREENS = ["billing"] as const;
export type ServiceSignInScreen = (typeof SERVICE_SIGN_IN_SCREENS)[number];

/**
 * `space` names the Space the person should land in, when the link is for one, and `open` a
 * settings screen to show there.
 */
type Claim = { sub: string; jti: string; exp: number; space?: string; open?: ServiceSignInScreen };

const base64url = (text: string) => Buffer.from(text, "utf8").toString("base64url");
const sign = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(`service-sign-in.v1.${payload}`).digest("base64url");

/**
 * A one-time pass that signs one person in: "ssl1.<claim>.<signature>". Only the server that
 * holds the service secret can make one, and it does so only for a caller that proved the same
 * secret (the service API), so the other system never signs anything itself.
 */
export function createServiceSignInToken(
  secret: string,
  userId: string,
  spaceId?: string,
  now: Date = new Date(),
  open?: ServiceSignInScreen,
): string {
  const claim: Claim = {
    sub: userId,
    ...(spaceId ? { space: spaceId } : {}),
    ...(open ? { open } : {}),
    jti: randomUUID(),
    exp: Math.floor(now.getTime() / 1000) + SERVICE_SIGN_IN_TTL_SECONDS,
  };
  const payload = base64url(JSON.stringify(claim));
  return `${PREFIX}.${payload}.${sign(secret, payload)}`;
}

export function readServiceSignInToken(
  secret: string,
  token: string,
  now: Date = new Date(),
): Claim | null {
  const [prefix, payload, signature, ...rest] = token.split(".");
  if (prefix !== PREFIX || !payload || !signature || rest.length) return null;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let claim: Partial<Claim>;
  try {
    claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<Claim>;
  } catch {
    return null;
  }
  const { sub, jti, exp, space, open } = claim;
  if (typeof sub !== "string" || !sub || typeof jti !== "string" || !jti) return null;
  if (typeof exp !== "number" || exp * 1000 < now.getTime()) return null;
  const landsIn = typeof space === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(space);
  const opens = SERVICE_SIGN_IN_SCREENS.find((screen) => screen === open);
  return { sub, jti, exp, ...(landsIn ? { space } : {}), ...(opens ? { open: opens } : {}) };
}

/**
 * `GET /api/auth/service-sign-in?token=…`: trades a pass for a session and sends the person to
 * the app. A pass works once: its id is recorded until it would have expired anyway, and a
 * second use is refused. A bad, expired or used pass lands on the ordinary sign-in screen.
 */
export function serviceSignIn(options: { secret: string; appUrl: string }): BetterAuthPlugin {
  return {
    id: "service-sign-in",
    endpoints: {
      serviceSignIn: createAuthEndpoint(SERVICE_SIGN_IN_PATH, { method: "GET" }, async (ctx) => {
        const token = (ctx.query as { token?: unknown } | undefined)?.token;
        const claim =
          typeof token === "string" && token.length <= 1024
            ? readServiceSignInToken(options.secret, token)
            : null;
        if (!claim) throw ctx.redirect(`${options.appUrl}/sign-in`);
        const usedKey = `service-sign-in:${claim.jti}`;
        if (await ctx.context.internalAdapter.findVerificationValue(usedKey)) {
          throw ctx.redirect(`${options.appUrl}/sign-in`);
        }
        await ctx.context.internalAdapter.createVerificationValue({
          identifier: usedKey,
          value: claim.sub,
          expiresAt: new Date((claim.exp + SERVICE_SIGN_IN_TTL_SECONDS) * 1000),
        });
        const user = await ctx.context.internalAdapter.findUserById(claim.sub);
        if (!user) throw new APIError("UNAUTHORIZED");
        const session = await ctx.context.internalAdapter.createSession(user.id);
        if (!session) throw new APIError("INTERNAL_SERVER_ERROR");
        await setSessionCookie(ctx, { session, user });
        // The app picks the Space up from the address and opens it (see adoptSpaceFromUrl), and
        // shows the settings screen the address names.
        const landing = new URLSearchParams({
          ...(claim.space ? { space: claim.space } : {}),
          ...(claim.open ? { settings: claim.open } : {}),
        }).toString();
        throw ctx.redirect(landing ? `${options.appUrl}/?${landing}` : options.appUrl);
      }),
    },
  };
}
