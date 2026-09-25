import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { biFiltersStorageKey } from "../../../store/biFiltersContext";
import { loadProject } from "../../../lib/projectsStorage";

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/filter-persist-project.json"), "utf8"),
) as {
  id: string;
  name: string;
  nodes: unknown[];
  biFilters: Array<{ field: string; op: string; values: string[]; scope: string }>;
};

describe("filter persist fixture", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("biFiltersStorageKey names the client cache key (not save/load)", () => {
    expect(biFiltersStorageKey(fixture.id)).toBe(`dashboard:bi-filters:${fixture.id}`);
  });

  it("loadProject maps bi_filters from the API JSON (client adapter only)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          ok: true,
          project: { id: fixture.id, name: fixture.name, bi_filters: fixture.biFilters },
        }),
      })),
    );
    const project = await loadProject(fixture.id);
    expect(project?.id).toBe(fixture.id);
    expect(project?.biFilters).toEqual(fixture.biFilters);
  });
});

// C4 (DragDropCanvas project-load hydrate overwriting filters) is not covered here.
// A Map + invented serverBiFilters is not that path. Do not treat this file as C4 proof.
// PUT /api/projects dropping bi_filters: projectsPutDropsBiFilters.test.ts (I9).
