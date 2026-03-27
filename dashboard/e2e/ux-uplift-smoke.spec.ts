import { expect, test } from "@playwright/test";

function dispatchFakeActiveChart() {
  window.dispatchEvent(
    new CustomEvent("dashboard:active-chart-id", {
      detail: {
        chartId: "smoke-chart",
        chartData: {
          chartConfig: { general: { vizType: "line" } },
          columnMapping: { filters: [] },
          logicalQuery: { sourceModel: "Sales" },
        },
      },
    })
  );
}

test("ux uplift smoke flow", async ({ page }) => {
  const notes: string[] = [];
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
  });

  // Home checks
  await page.goto("/home", { waitUntil: "domcontentloaded" });

  const hasConnectToData = (await page.getByText("Connect to Data", { exact: false }).count()) > 0;
  if (hasConnectToData) notes.push("PASS: Home shows 'Connect to Data'.");
  else notes.push("INFO: 'Connect to Data' not visible (likely all slots filled).");

  const hasOnboarding = (await page.getByText("Get started in 3 steps", { exact: false }).count()) > 0;
  if (hasOnboarding) notes.push("PASS: Home shows 3-step onboarding.");
  else notes.push("INFO: 3-step onboarding hidden (precondition not met).");

  const hasRefreshBtn = (await page.getByRole("button", { name: "Refresh" }).count()) > 0;
  if (hasRefreshBtn) notes.push("PASS: Connection card exposes Refresh.");
  else notes.push("INFO: Refresh button not visible on current home state.");

  // Dashboard checks
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  // Open Visualizations panel
  const vizButton = page.locator('button[data-testid="dock-visualizations-btn"]:visible').first();
  await expect(vizButton).toBeVisible();
  await vizButton.evaluate((el) => (el as HTMLButtonElement).click());

  await expect(page.getByTestId("viz-tab-build")).toBeVisible();
  await expect(page.getByTestId("viz-tab-format")).toBeVisible();
  await expect(page.getByTestId("viz-tab-filters")).toBeVisible();
  notes.push("PASS: Visualizations tabs (Build/Format/Filters) are visible.");

  // Simulate active chart for Visualizations (panel must be mounted first)
  await page.evaluate(dispatchFakeActiveChart);
  await page.waitForTimeout(300);

  // Build gallery (visible when chart is active)
  await page.getByTestId("viz-tab-build").first().evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.getByText("Line", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Pie", { exact: false }).first()).toBeVisible();
  notes.push("PASS: Build tab chart gallery visible.");

  // Fields panel checks (mount panel first — then dispatch so listener receives chart id)
  await page.locator('button[data-testid="dock-fields-btn"]:visible').first().evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.getByTestId("fields-search-input")).toBeVisible();
  await page.evaluate(dispatchFakeActiveChart);
  await page.waitForTimeout(300);
  await expect(page.getByText("Advanced", { exact: false })).toBeVisible();
  notes.push("PASS: Fields panel shows Advanced toggle.");

  const search = page.getByTestId("fields-search-input");
  await search.fill("zzzz__no_field__smoke");
  await expect(page.getByText("No fields match", { exact: false })).toBeVisible();
  notes.push("PASS: Fields panel empty search state appears.");

  const hasDateGranularity = (await page.getByText("Date Granularity", { exact: false }).count()) > 0;
  if (hasDateGranularity) notes.push("PASS: Date Granularity label visible.");
  else notes.push("INFO: Date Granularity section hidden (no base time axis selected).");

  // Filters panel checks
  await page.locator('button[data-testid="dock-filters-btn"]:visible').first().evaluate((el) => (el as HTMLButtonElement).click());
  await page.evaluate(dispatchFakeActiveChart);
  await page.waitForTimeout(300);
  await expect(page.getByText("+ Add Filter", { exact: false }).first()).toBeVisible();
  notes.push("PASS: Filters panel exposes '+ Add Filter'.");

  await page
    .getByTestId("filters-clear-visual-btn")
    .evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.getByText("Remove all visual filters?", { exact: false })).toBeVisible();
  notes.push("PASS: Inline confirmation appears before clear.");

  // Report notes to terminal output for quick inspection.
  // eslint-disable-next-line no-console
  console.log("\nUX SMOKE NOTES:\n" + notes.map((n) => `- ${n}`).join("\n"));
});

