import { expect, test } from "@playwright/test";
import path from "path";
import fs from "fs";

const PROJECT_ID = "project_1774373347527_602lmt0v5";
const DASHBOARD_URL = `/dashboard?project=${encodeURIComponent(PROJECT_ID)}`;

test.describe("Slicer Functionality Test - Comprehensive", () => {
  const testReport: string[] = [];
  const jsErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    // Set up localStorage for connection
    await page.addInitScript(() => {
      localStorage.setItem(
        "pocketanalyst_active_connection",
        JSON.stringify({
          id: "demo-session",
          name: "Test User",
          type: "clickhouse",
          connectedAt: new Date().toISOString(),
        })
      );
    });

    // Listen for console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const error = `BROWSER ERROR: ${msg.text()}`;
        console.log(error);
        jsErrors.push(error);
      }
    });

    // Listen for page errors
    page.on("pageerror", (err) => {
      const error = `PAGE ERROR: ${err.message}`;
      console.log(error);
      jsErrors.push(error);
    });
  });

  test("Full slicer functionality test with screenshots and console monitoring", async ({ page }) => {
    // Create screenshots directory
    const screenshotsDir = path.join(__dirname, "screenshots");
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const screenshots: string[] = [];

    // Step 1: Navigate to the URL
    testReport.push("=== STEP 1: Navigate to Dashboard ===");
    await page.goto(`http://localhost:3000${DASHBOARD_URL}`, { waitUntil: "domcontentloaded" });
    testReport.push(`Navigated to: http://localhost:3000${DASHBOARD_URL}`);
    
    // Wait for page to fully load - look for canvas or main content
    await page.waitForTimeout(3000);
    
    // Step 2: Take initial screenshot
    testReport.push("\n=== STEP 2: Initial State Screenshot ===");
    const initialScreenshot = path.join(screenshotsDir, "01-initial-state.png");
    await page.screenshot({ path: initialScreenshot, fullPage: true });
    screenshots.push(initialScreenshot);
    testReport.push(`Screenshot saved: ${initialScreenshot}`);

    // Step 3: Identify slicers on canvas
    testReport.push("\n=== STEP 3: Identify Slicers and Charts ===");
    
    // Look for canvas nodes
    const slicerNodes = await page.locator('[data-canvas-node="true"]').all();
    testReport.push(`Total canvas nodes found: ${slicerNodes.length}`);

    const slicers: Array<{ id: string; name: string; type: string; element: any }> = [];
    const charts: Array<{ id: string; name: string; type: string }> = [];

    for (const node of slicerNodes) {
      const nodeId = (await node.getAttribute("data-node-id")) || 
                     (await node.getAttribute("data-id")) || 
                     `node_${slicers.length + charts.length}`;
      
      // Check if it's a slicer - look for common slicer patterns
      const hasButtons = await node.locator('[role="button"]').count() > 0;
      const hasCheckboxes = await node.locator('input[type="checkbox"]').count() > 0;
      const hasSelect = await node.locator('select').count() > 0;
      const hasSlicerClass = await node.evaluate(el => 
        el.className.toLowerCase().includes('slicer') || 
        el.getAttribute('data-visual-type') === 'slicer'
      );
      
      const isSlicer = hasButtons || hasCheckboxes || hasSelect || hasSlicerClass;
      
      // Try to get the title/name
      let title = "Unnamed";
      try {
        const titleEl = node.locator('[class*="header"], h1, h2, h3, [class*="title"]').first();
        const titleText = await titleEl.textContent({ timeout: 1000 });
        if (titleText && titleText.trim()) {
          title = titleText.trim();
        }
      } catch (e) {
        // No title found
      }
      
      if (isSlicer) {
        const slicerType = hasSelect ? "dropdown" :
                          await node.locator('[type="date"]').count() > 0 ? "dateRange" :
                          hasButtons && await node.locator('[role="button"]').count() > 5 ? "list" : "tile";
        
        slicers.push({ id: nodeId, name: title, type: slicerType, element: node });
        testReport.push(`  ✓ Slicer found: "${title}" (Type: ${slicerType}, ID: ${nodeId})`);
      } else {
        // Assume it's a chart
        const chartType = "chart"; // We'd need more inspection to determine specific chart type
        charts.push({ id: nodeId, name: title, type: chartType });
        testReport.push(`  ✓ Chart found: "${title}" (ID: ${nodeId})`);
      }
    }

    testReport.push(`\nTotal slicers: ${slicers.length}`);
    testReport.push(`Total charts: ${charts.length}`);

    // Step 4: Document charts
    testReport.push("\n=== STEP 4: Chart Inventory ===");
    if (charts.length === 0) {
      testReport.push("  No charts found on dashboard");
    } else {
      charts.forEach((chart, idx) => {
        testReport.push(`  ${idx + 1}. ${chart.name} (ID: ${chart.id})`);
      });
    }

    // Step 5: Screenshot showing slicers clearly
    if (slicers.length > 0) {
      testReport.push("\n=== STEP 5: Slicer Close-up Screenshot ===");
      const slicerScreenshot = path.join(screenshotsDir, "02-slicers-visible.png");
      
      // Try to scroll first slicer into view
      const firstSlicerNode = slicers[0].element;
      await firstSlicerNode.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: slicerScreenshot, fullPage: true });
      screenshots.push(slicerScreenshot);
      testReport.push(`Screenshot saved: ${slicerScreenshot}`);
    }

    // Step 6 & 7: Console monitoring (already set up in beforeEach)
    testReport.push("\n=== STEP 6-7: Console Monitoring ===");
    testReport.push("Console errors are being captured via page event listeners");
    
    if (jsErrors.length > 0) {
      testReport.push("JavaScript Errors Found So Far:");
      jsErrors.forEach(err => testReport.push(`  - ${err}`));
    } else {
      testReport.push("No JavaScript errors detected so far");
    }

    // Step 8: Interact with slicers
    if (slicers.length > 0) {
      testReport.push("\n=== STEP 8: Slicer Interaction Tests ===");
      
      for (let i = 0; i < Math.min(slicers.length, 2); i++) {
        const slicer = slicers[i];
        testReport.push(`\n--- Testing slicer ${i + 1}: "${slicer.name}" (${slicer.type}) ---`);
        
        const slicerNode = slicer.element;
        await slicerNode.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        
        // Screenshot BEFORE interaction
        const beforeScreenshot = path.join(screenshotsDir, `03-slicer-${i + 1}-before.png`);
        await page.screenshot({ path: beforeScreenshot, fullPage: true });
        screenshots.push(beforeScreenshot);
        testReport.push(`  Before screenshot: ${beforeScreenshot}`);
        
        try {
          // Get slicer values/buttons
          const slicerButtons = slicerNode.locator('[role="button"]');
          const buttonCount = await slicerButtons.count();
          testReport.push(`  Found ${buttonCount} slicer value buttons`);
          
          if (buttonCount > 0) {
            // Get text of first few buttons
            const buttonTexts: string[] = [];
            for (let j = 0; j < Math.min(buttonCount, 5); j++) {
              const text = await slicerButtons.nth(j).textContent();
              buttonTexts.push(text?.trim() || `Button ${j + 1}`);
            }
            testReport.push(`  Available values: ${buttonTexts.join(", ")}`);
            
            // Click on first value
            testReport.push(`  → Clicking on first value: "${buttonTexts[0]}"`);
            await slicerButtons.first().click();
            
            // Wait for any updates
            await page.waitForTimeout(2000);
            
            // Screenshot AFTER interaction
            const afterScreenshot = path.join(screenshotsDir, `04-slicer-${i + 1}-after-click1.png`);
            await page.screenshot({ path: afterScreenshot, fullPage: true });
            screenshots.push(afterScreenshot);
            testReport.push(`  After screenshot: ${afterScreenshot}`);
            
            // Check if charts updated
            testReport.push("  Checking if charts were updated...");
            
            // Look for loading indicators
            const hasLoadingIndicator = await page.locator('[class*="loading"], [class*="spinner"], [class*="Loading"]').count() > 0;
            testReport.push(`    Loading indicator visible: ${hasLoadingIndicator}`);
            
            // Check if any buttons are now selected/active
            const hasActiveButton = await slicerNode.locator('[role="button"][class*="active"], [role="button"][class*="selected"], [role="button"][aria-pressed="true"]').count() > 0;
            testReport.push(`    Slicer value appears selected: ${hasActiveButton}`);
            
            // Try clicking another value if available
            if (buttonCount > 1) {
              await page.waitForTimeout(1000);
              testReport.push(`  → Clicking on second value: "${buttonTexts[1]}"`);
              await slicerButtons.nth(1).click();
              await page.waitForTimeout(2000);
              
              const after2Screenshot = path.join(screenshotsDir, `05-slicer-${i + 1}-after-click2.png`);
              await page.screenshot({ path: after2Screenshot, fullPage: true });
              screenshots.push(after2Screenshot);
              testReport.push(`  Second interaction screenshot: ${after2Screenshot}`);
            }
            
          } else {
            testReport.push("  ⚠ No interactive buttons found in this slicer");
          }
        } catch (err) {
          testReport.push(`  ❌ ERROR during interaction: ${err}`);
        }
      }
    } else {
      testReport.push("\n=== STEP 8: Skipped (No Slicers Found) ===");
    }

    // Step 9: Final console check
    testReport.push("\n=== STEP 9: Final Console Check ===");
    await page.waitForTimeout(1000);
    
    if (jsErrors.length > 0) {
      testReport.push(`Total JavaScript errors: ${jsErrors.length}`);
      testReport.push("Errors:");
      jsErrors.forEach((err, idx) => testReport.push(`  ${idx + 1}. ${err}`));
    } else {
      testReport.push("✓ No JavaScript errors detected");
    }

    // Final Report
    testReport.push("\n" + "=".repeat(80));
    testReport.push("FINAL REPORT");
    testReport.push("=".repeat(80));
    testReport.push(`Dashboard URL: http://localhost:3000${DASHBOARD_URL}`);
    testReport.push(`Slicers found: ${slicers.length}`);
    testReport.push(`Charts found: ${charts.length}`);
    testReport.push(`Screenshots captured: ${screenshots.length}`);
    testReport.push(`JavaScript errors: ${jsErrors.length}`);
    
    testReport.push("\n--- SLICER LIST ---");
    if (slicers.length === 0) {
      testReport.push("❌ No slicers found on the dashboard");
    } else {
      slicers.forEach((s, idx) => {
        testReport.push(`  ${idx + 1}. "${s.name}" (Type: ${s.type}, ID: ${s.id})`);
      });
    }
    
    testReport.push("\n--- CHART LIST ---");
    if (charts.length === 0) {
      testReport.push("❌ No charts found on the dashboard");
    } else {
      charts.forEach((c, idx) => {
        testReport.push(`  ${idx + 1}. "${c.name}" (ID: ${c.id})`);
      });
    }
    
    testReport.push("\n--- INTERACTION RESULTS ---");
    if (slicers.length > 0 && charts.length > 0) {
      testReport.push("✓ Slicer interactions were tested (see screenshots for visual confirmation)");
      testReport.push("  Check screenshots to verify if:");
      testReport.push("    - Slicer values become highlighted when clicked");
      testReport.push("    - Charts update/filter when slicer values are selected");
      testReport.push("    - Multiple slicer selections work correctly");
    } else if (slicers.length === 0) {
      testReport.push("⚠ No slicers to test");
    } else if (charts.length === 0) {
      testReport.push("⚠ No charts to observe filtering behavior");
    }
    
    testReport.push("\n--- ERRORS & ISSUES ---");
    if (jsErrors.length > 0) {
      testReport.push("❌ JavaScript errors detected (see list above)");
    } else {
      testReport.push("✓ No JavaScript errors");
    }
    
    testReport.push("\n" + "=".repeat(80));
    testReport.push(`Screenshots saved to: ${screenshotsDir}`);
    testReport.push("=".repeat(80));

    // Print full report
    console.log("\n" + testReport.join("\n") + "\n");
    
    // Save report to file
    const reportPath = path.join(screenshotsDir, "test-report.txt");
    fs.writeFileSync(reportPath, testReport.join("\n"));
    testReport.push(`\nReport saved to: ${reportPath}`);
    
    // Basic assertion - expect at least some nodes on canvas
    expect(slicerNodes.length).toBeGreaterThan(0);
  });
});
