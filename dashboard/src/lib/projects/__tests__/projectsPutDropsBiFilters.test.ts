import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { updateProject } = vi.hoisted(() => ({
  updateProject: vi.fn(async (id: string, input: Record<string, unknown>) => ({ id, ...input })),
}));

vi.mock("../../../lib/datatalkMetaDb", () => ({
  updateProject,
  listProjects: vi.fn(),
  getProjectById: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
}));

describe("PUT /api/projects mapping (KNOWN DEFECT I9)", () => {
  beforeEach(() => {
    updateProject.mockClear();
  });

  it("forwards name/nodes and drops bi_filters / biFilters (characterization, not a product fix)", async () => {
    const { PUT } = await import("../../../app/api/projects/route");
    const req = new NextRequest("http://localhost/api/projects", {
      method: "PUT",
      body: JSON.stringify({
        id: "fixture_project_filter_persist",
        name: "Persist fixture",
        nodes: [{ id: "n1" }],
        bi_filters: [{ field: "country", op: "in", values: ["DE"], scope: "report" }],
        biFilters: [{ field: "country", op: "in", values: ["DE"], scope: "report" }],
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(updateProject).toHaveBeenCalledTimes(1);
    const [, input] = updateProject.mock.calls[0] as [string, Record<string, unknown>];
    expect(input.name).toBe("Persist fixture");
    expect(input.nodes).toEqual([{ id: "n1" }]);
    expect(input).not.toHaveProperty("bi_filters");
    expect(input).not.toHaveProperty("biFilters");
  });
});
