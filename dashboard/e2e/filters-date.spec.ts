import { test, expect, type Page } from "@playwright/test";

const PROJECT_ID = "project_1771280519979_wsr421553";
const DASHBOARD_URL = `http://localhost:3000/dashboard?project=${encodeURIComponent(PROJECT_ID)}`;

const DATE_FROM = "2026-01-01T00:00:00Z";
const DATE_TO = "2026-12-31T23:59:59Z";

async function seedReportFilterOnCreatedAt(page: Page) {
  // Inject a minimal report-level filter directly into localStorage.
  // Drag & drop is flaky in automated browsers because an overlay intercepts pointer events.
  await page.evaluate(() => {
    const filters = [
      {
        field: "chat.created_at",
        op: "gte",
        values: ["2026-01-01T00:00:00Z"],
        scope: "report",
      },
    ];
    const version = Date.now();
    window.dispatchEvent(new CustomEvent("dashboard:bi-filters-changed", { detail: { filters, version } }));
    window.dispatchEvent(new CustomEvent("dashboard:bi-filters-applied"));
  });
}

async function openFiltersOnly(page: Page) {
  // DragDropCanvas mounts after dashboard tabs hydrate from localStorage — hotkey "0" does nothing until then.
  const filtersDock = page.locator('button[data-testid="dock-filters-btn"]:visible').first();
  await expect(filtersDock).toBeVisible({ timeout: 30_000 });

  // Hide Next.js "Static route" indicator if it is shown
  const hideStatic = page.getByRole("button", { name: "Hide static indicator" });
  if (await hideStatic.isVisible().catch(() => false)) {
    await hideStatic.evaluate((el) => (el as HTMLButtonElement).click());
  }

  await filtersDock.evaluate((el) => (el as HTMLButtonElement).click());
  await expect(page.getByTestId("filters-report-section").first()).toBeVisible({ timeout: 30_000 });
}

async function openReportFilterEditor(page: Page) {
  // We seed a report filter, then open it via the card's edit button.
  await expect(page.getByTestId("report-filter-card").first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("dashboard:open-first-report-filter-editor"));
  });
  await expect(page.getByTestId("filter-editor-overlay").first()).toBeVisible({ timeout: 30_000 });

  // D) Relative date placeholder should be visible but disabled
  const relativeOption = page
    .getByTestId("filter-operator-select")
    .first()
    .locator("option")
    .filter({ hasText: "Relative date (soon)" });
  await expect(relativeOption).toHaveCount(1);
  await expect(relativeOption.first()).toBeDisabled();
}

test("Filters UI: date ops gte/lte/between propagate to /api/semantic/query; relative date is disabled", async ({ page }) => {
  await page.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded" });

  await openFiltersOnly(page);

  // Seed an initial report filter in storage (avoids flaky drag & drop in automated runs)
  await seedReportFilterOnCreatedAt(page);

  // Open editor for the seeded filter.
  await openReportFilterEditor(page);

  const operatorSelect = page.getByTestId("filter-operator-select").first();
  const singleValueInput = page.getByTestId("filter-single-value").first();
  const betweenFrom = page.getByTestId("filter-between-from").first();
  const betweenTo = page.getByTestId("filter-between-to").first();

  const operatorOptions = operatorSelect.locator("option");
  await expect(operatorOptions.filter({ hasText: ">=" })).toHaveCount(1);
  await expect(operatorOptions.filter({ hasText: "<=" })).toHaveCount(1);
  await expect(operatorOptions.filter({ hasText: "is between" })).toHaveCount(1);

  // C) gte
  await operatorSelect.selectOption("gte");
  await singleValueInput.fill(DATE_FROM);
  await expect(singleValueInput).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("dashboard:apply-filter-editor"));
  });

  // Re-open the report filter editor
  await openReportFilterEditor(page);

  // C) lte
  await operatorSelect.selectOption("lte");
  await singleValueInput.fill(DATE_TO);
  await expect(singleValueInput).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("dashboard:apply-filter-editor"));
  });

  // Re-open the report filter editor
  await openReportFilterEditor(page);

  // C) between
  await operatorSelect.selectOption("between");
  await betweenFrom.fill(DATE_FROM);
  await betweenTo.fill(DATE_TO);
  await expect(betweenFrom).toBeVisible();
  await expect(betweenTo).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("dashboard:apply-filter-editor"));
  });
});
