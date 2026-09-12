import express from "express";
import { describe, expect, it } from "vitest";
import { configureTrustedProxy } from "./trusted-proxy";

describe("trusted proxy configuration", () => {
  it("accepts private ingress hops without trusting arbitrary public clients", () => {
    const app = express();
    configureTrustedProxy(app);
    const trust = app.get("trust proxy fn") as (
      address: string,
      hop: number,
    ) => boolean;

    expect(trust("127.0.0.1", 0)).toBe(true);
    expect(trust("10.20.30.40", 0)).toBe(true);
    expect(trust("172.20.0.10", 0)).toBe(true);
    expect(trust("203.0.113.10", 0)).toBe(false);
  });
});
