import { expect, test } from "@playwright/test";

const PROJECT_ID = "musgen_full_1774374018827";

test("Open as Slicer creates visual-scoped slicer and emits BI filter on select", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "pocketanalyst_active_connection",
      JSON.stringify({
        id: "demo-session",
        name: "user 1",
        type: "clickhouse",
        connectedAt: new Date().toISOString(),
      })
    );
    localStorage.setItem("dashboard:semantic:projectId", "musgen_full_1774374018827");
  });

  await page.route("**/api/semantic/values", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { values: ["click", "page_view"] } }),
    });
  });

  await page.goto(`/dashboard?project=${encodeURIComponent(PROJECT_ID)}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Drag charts here", { exact: false })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    (window as any).__lastBiFilters = [];
    (window as any).__lastActiveChart = null;
    window.addEventListener("dashboard:bi-filters-changed", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      (window as any).__lastBiFilters = Array.isArray(detail?.filters) ? detail.filters : [];
    });
    window.addEventListener("dashboard:active-chart-id", (e: Event) => {
      const detail = (e as CustomEvent).detail;
      (window as any).__lastActiveChart = detail ?? null;
    });
  });

  const beforeIds = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[data-canvas-node="true"]'));
    return els
      .map((el) => el.getAttribute("data-node-id") || el.getAttribute("data-id") || "")
      .filter(Boolean);
  });

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("dashboard:add-chart", {
        detail: {
          chart: {
            name: "E2E Source Chart",
            page: "/dashboard",
            description: "source chart for open-as-slicer",
            vizType: "line",
            status: "ready",
            kind: "chart-builder",
            columnMapping: { xColumn: "events.event_name" },
            logicalQuery: {
              sourceModel: "events",
              dimensions: ["events.event_name"],
              measures: ["events.rows"],
            },
          },
        },
      })
    );
  });

  await expect
    .poll(async () => {
      const ids = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[data-canvas-node="true"]'));
        return els
          .map((el) => el.getAttribute("data-node-id") || el.getAttribute("data-id") || "")
          .filter(Boolean);
      });
      return ids.length;
    }, { timeout: 30_000 })
    .toBeGreaterThan(beforeIds.length);

  const sourceId = await page.evaluate((existingIds) => {
    const els = Array.from(document.querySelectorAll('[data-canvas-node="true"]'));
    const ids = els
      .map((el) => el.getAttribute("data-node-id") || el.getAttribute("data-id") || "")
      .filter(Boolean);
    const next = ids.find((id) => !existingIds.includes(id));
    return next || "";
  }, beforeIds);
  expect(sourceId).toBeTruthy();

  await page.evaluate((chartId) => {
    window.dispatchEvent(new CustomEvent("dashboard:open-as-slicer", { detail: { chartId } }));
  }, sourceId);

  await expect
    .poll(async () => {
      const ids = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[data-canvas-node="true"]'));
        return els
          .map((el) => el.getAttribute("data-node-id") || el.getAttribute("data-id") || "")
          .filter(Boolean);
      });
      return ids.length;
    }, { timeout: 30_000 })
    .toBeGreaterThan(beforeIds.length + 1);

  const slicerId = await page.evaluate(({ existingIds, srcId }) => {
    const els = Array.from(document.querySelectorAll('[data-canvas-node="true"]'));
    const ids = els
      .map((el) => el.getAttribute("data-node-id") || el.getAttribute("data-id") || "")
      .filter(Boolean);
    const newIds = ids.filter((id) => !existingIds.includes(id));
    return newIds.find((id) => id !== srcId) || "";
  }, { existingIds: beforeIds, srcId: sourceId });
  expect(slicerId).toBeTruthy();

  const slicerNode = page.locator(`[data-canvas-node="true"][data-node-id="${slicerId}"], [data-canvas-node="true"][data-id="${slicerId}"]`).first();
  await expect(slicerNode).toBeVisible({ timeout: 30_000 });
  await slicerNode.click();

  const activeInfo = await page.evaluate(() => (window as any).__lastActiveChart);
  expect(String(activeInfo?.chartData?.__slicerBiScope ?? "")).toBe("visual");
  expect(String(activeInfo?.chartData?.__sourceChartId ?? "")).toBe(sourceId);
  expect(String(activeInfo?.chartData?.slicer?.fieldRef ?? "")).toBe("events.event_name");

  const clickValue = slicerNode.getByRole("button", { name: /^click$/i }).first();
  await expect(clickValue).toBeVisible({ timeout: 30_000 });
  await clickValue.click();

  await expect
    .poll(async () => {
      const filters = await page.evaluate(() => (window as any).__lastBiFilters ?? []);
      return Array.isArray(filters) ? filters.length : 0;
    }, { timeout: 15_000 })
    .toBeGreaterThan(0);

  const filters = await page.evaluate(() => (window as any).__lastBiFilters ?? []);
  const first = Array.isArray(filters) ? filters[0] : null;
  expect(String(first?.field ?? "")).toBe("events.event_name");
  expect(String(first?.op ?? "")).toBe("in");
  expect(String(first?.scope ?? "")).toBe("visual");
  expect(String(first?.sourceChartId ?? "")).toBe(sourceId);
  expect(Array.isArray(first?.values) ? first.values.map(String) : []).toContain("click");
});

