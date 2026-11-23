// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { describe, expect, it } from "vitest";
import {
  createServiceSignInToken,
  readServiceSignInToken,
  SERVICE_SIGN_IN_TTL_SECONDS,
} from "./service-sign-in.js";

const secret = "a-service-secret-that-is-long-enough-000";
const at = new Date("2027-01-01T00:00:00Z");

describe("service sign-in pass", () => {
  it("reads back the person and the Space it was made for", () => {
    const token = createServiceSignInToken(secret, "user_1", "space_1", at);
    expect(readServiceSignInToken(secret, token, at)).toMatchObject({
      sub: "user_1",
      space: "space_1",
    });
  });

  it("carries a settings screen to open, and drops one it does not know", () => {
    const token = createServiceSignInToken(secret, "user_1", "space_1", at, "billing");
    expect(readServiceSignInToken(secret, token, at)).toMatchObject({ open: "billing" });
    // Signed by the same secret but naming a screen this server does not offer.
    const unknown = createServiceSignInToken(secret, "user_1", "space_1", at, "admin" as "billing");
    expect(readServiceSignInToken(secret, unknown, at)).not.toHaveProperty("open");
  });

  it("is refused once it has expired", () => {
    const token = createServiceSignInToken(secret, "user_1", undefined, at);
    const late = new Date(at.getTime() + (SERVICE_SIGN_IN_TTL_SECONDS + 1) * 1000);
    expect(readServiceSignInToken(secret, token, late)).toBeNull();
  });

  it("is refused when signed with another secret or changed after signing", () => {
    const token = createServiceSignInToken(secret, "user_1", undefined, at);
    expect(readServiceSignInToken(`${secret}x`, token, at)).toBeNull();
    const [prefix, payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "user_2", jti: "j", exp: 9_999_999_999 }));
    expect(
      readServiceSignInToken(secret, `${prefix}.${forged.toString("base64url")}.${signature}`, at),
    ).toBeNull();
    expect(readServiceSignInToken(secret, `${prefix}.${payload}`, at)).toBeNull();
  });

  it("gives every pass its own id, so one can be spent only once", () => {
    const first = readServiceSignInToken(secret, createServiceSignInToken(secret, "u"));
    const second = readServiceSignInToken(secret, createServiceSignInToken(secret, "u"));
    expect(first?.jti).not.toBe(second?.jti);
  });
});
