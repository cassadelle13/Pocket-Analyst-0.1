import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const restDir = path.resolve(__dirname, "..");

vi.mock("../../../../lib/api-client", () => ({
  apiClient: {
    post: vi.fn(async () => {
      throw new Error("ClickHouse down (test double)");
    }),
  },
}));

describe("ClickHouse error vs empty result (KNOWN DEFECT I10/I11)", () => {
  it("static: analytics-trend source still has return [] after host loop", () => {
    const src = readFileSync(path.join(restDir, "analytics-trend/route.ts"), "utf8");
    expect(src).toMatch(/return \[\]/);
  });

  it("behavior: GET analytics-trend is 200 with empty historical when every host fails", async () => {
    const { GET } = await import("../analytics-trend/route");
    const res = await GET(new NextRequest("http://localhost/api/rest/analytics-trend"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.historical).toEqual([]);
    expect(body).not.toHaveProperty("error");
  });

  it("static: users-graph source still mentions Ghost Data + 200", () => {
    const src = readFileSync(path.join(restDir, "users-graph/route.ts"), "utf8");
    expect(src).toMatch(/Ghost Data/);
    expect(src).toMatch(/status:\s*200/);
  });

  it("behavior: GET users-graph is 200 synthetic nodes, not an error payload", async () => {
    const { GET } = await import("../users-graph/route");
    const res = await GET(new NextRequest("http://localhost/api/rest/users-graph?limit=60"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data?.nodes?.length).toBeGreaterThan(0);
    expect(String(body.data.nodes[0].id)).toMatch(/^u_/);
    expect(body).not.toHaveProperty("error");
  });
});
