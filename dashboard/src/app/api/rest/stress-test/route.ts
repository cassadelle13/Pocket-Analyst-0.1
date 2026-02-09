import { NextRequest, NextResponse } from "next/server";


function generateHeavyProperties(): string {
  // Generate ~1-2 KB of JSON properties
  const loremIpsum = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ";
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    stress_payload: loremIpsum.repeat(20),
    meta_1: "heavy_data_".repeat(10),
    meta_2: "more_payload_".repeat(10),
    meta_3: "stress_test_".repeat(10),
    nested: {
      key1: "value1_".repeat(5),
      key2: "value2_".repeat(5),
      key3: "value3_".repeat(5),
      deep: {
        level1: loremIpsum.repeat(3),
        level2: "nested_data_".repeat(8),
      },
    },
    array_field: Array(10).fill("array_item_data_"),
  });
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const pageSize = Math.min(parseInt(sp.get("pageSize") || "1000", 10), 5000);
  const excludeProperties = sp.get("exclude_properties") === "true";

  // Generate synthetic events for stress testing
  const events = Array.from({ length: pageSize }, (_, i) => ({
    id: `stress-${i}-${Date.now()}`,
    event_name: ["page_view", "click", "submit", "scroll"][i % 4],
    user_id: `user_${Math.floor(i / 10)}`,
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
    properties: excludeProperties ? "" : generateHeavyProperties(),
  }));

  return NextResponse.json({
    data: events,
    total: events.length,
    pageSize,
    mode: excludeProperties ? "optimized (no properties)" : "stress (heavy properties ~1-2KB/row)",
    note: "Synthetic data for parse performance testing",
  });
}
