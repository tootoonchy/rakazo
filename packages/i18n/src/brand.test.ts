// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { setupI18n } from "@lingui/core";
import { BRANDS } from "@rakazo/contracts/brand";
import { describe, expect, it } from "vitest";
import { brandI18n } from "./brand";

function brandedI18n() {
  const i18n = setupI18n();
  brandI18n(i18n, BRANDS.agental);
  return i18n;
}

describe("brandI18n", () => {
  it("names the brand in a loaded catalog, in every plural branch, in any language", () => {
    const i18n = brandedI18n();
    i18n.load("de", {
      signIn: ["Bei Rakazo anmelden"],
      bots: [["count", "plural", { one: ["#", " Rakazo-Bot"], other: ["#", " Rakazo-Bots"] }]],
    });
    i18n.activate("de");
    expect(i18n._("signIn")).toBe("Bei Agental anmelden");
    expect(i18n._("bots", { count: 2 })).toBe("2 Agental-Bots");
  });

  it("names the brand in the English fallback of a string no catalog lists yet", () => {
    const i18n = brandedI18n();
    i18n.loadAndActivate({ locale: "en", messages: {} });
    expect(i18n._({ id: "new", message: "Welcome to Rakazo" })).toBe("Welcome to Agental");
    expect(i18n.t({ id: "new", message: "Welcome to Rakazo" })).toBe("Welcome to Agental");
  });

  it("leaves what a person typed alone", () => {
    const i18n = brandedI18n();
    i18n.loadAndActivate({ locale: "en", messages: { hello: ["Hello ", ["name"]] } });
    expect(i18n._("hello", { name: "Rakazo fan" })).toBe("Hello Rakazo fan");
  });

  it("changes nothing for the upstream identity", () => {
    const i18n = setupI18n();
    brandI18n(i18n, BRANDS.upstream);
    i18n.loadAndActivate({ locale: "en", messages: { signIn: ["Sign in to Rakazo"] } });
    expect(i18n._("signIn")).toBe("Sign in to Rakazo");
  });
});
