// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { projectToolsToken, signHubBody } from "./project-hub.js";

describe("project hub signature", () => {
  it("signs the time and the exact body, in the header format the hub checks", () => {
    const body = JSON.stringify({ type: "ticket.updated", external_id: "task_1" });
    const header = signHubBody("hub-secret", body, 1_800_000_000);
    const mac = createHmac("sha256", "hub-secret").update(`1800000000.${body}`).digest("hex");
    expect(header).toBe(`t=1800000000,v1=${mac}`);
    expect(signHubBody("hub-secret", `${body} `, 1_800_000_000)).not.toBe(header);
  });

  it("makes the tools token the hub recomputes for the same project", () => {
    // The hub's own test holds this same pair, so neither side can change the format alone.
    expect(projectToolsToken("0123456789abcdef0123456789abcdef", "proj_1")).toBe(
      "proj_1.56db6cbe4caed01739a8d15992d3bb62a1a4290c63f11e1bd2b222d017bee215",
    );
  });
});
