// Modified by Agental: new file in the Agental white-label of Rakazo (Apache-2.0, see NOTICE).
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signHubBody } from "./project-hub.js";

describe("project hub signature", () => {
  it("signs the time and the exact body, in the header format the hub checks", () => {
    const body = JSON.stringify({ type: "ticket.updated", external_id: "task_1" });
    const header = signHubBody("hub-secret", body, 1_800_000_000);
    const mac = createHmac("sha256", "hub-secret").update(`1800000000.${body}`).digest("hex");
    expect(header).toBe(`t=1800000000,v1=${mac}`);
    expect(signHubBody("hub-secret", `${body} `, 1_800_000_000)).not.toBe(header);
  });
});
