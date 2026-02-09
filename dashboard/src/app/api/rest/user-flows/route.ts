import { NextRequest, NextResponse } from "next/server";

import { sqlStringLiteral, safeISODate } from "../../../../lib/propertyFilterUtils";

import { apiClient } from "../../../../lib/api-client";


const CLICKHOUSE_HOSTS = [
  process.env.CLICKHOUSE_HOST || "http://localhost:8123",
  "http://clickhouse:8123",
  "http://localhost:8123",
];

async function queryClickHouse(query: string): Promise<any[]> {
  for (const host of CLICKHOUSE_HOSTS) {
    try {
      const response = await apiClient.post(
        host,
        query + " FORMAT JSON",
        {
          headers: { "Content-Type": "text/plain" },
        }
      );
      
      if (response.error) continue;
      return response.data?.data || [];
    } catch {
      continue;
    }
  }
  console.error("ClickHouse unavailable on all hosts");
  return [];
}

interface FlowLink {
  source: string;
  target: string;
  value: number;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  
  // Date range filters
  const startDate = safeISODate(sp.get("startDate"), new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  const endDate = safeISODate(sp.get("endDate"), new Date().toISOString());
  
  // Minimum flow threshold (filter out rare transitions)
  const minFlowCount = parseInt(sp.get("minFlowCount") || "5", 10);

  // User flow analysis using ClickHouse neighbor() function
  // Find event sequences: Event A → Event B for each user
  const query = `
    WITH user_events AS (
      SELECT
        user_id,
        event_name,
        timestamp,
        neighbor(event_name, 1) OVER (PARTITION BY user_id ORDER BY timestamp) as next_event
      FROM events
      WHERE timestamp >= ${sqlStringLiteral(startDate)}
        AND timestamp <= ${sqlStringLiteral(endDate)}
        AND user_id != ''
      ORDER BY user_id, timestamp
    ),
    
    flows AS (
      SELECT
        event_name as source,
        next_event as target,
        count() as flow_count
      FROM user_events
      WHERE next_event != ''
        AND event_name != next_event  -- exclude self-loops
      GROUP BY source, target
      HAVING flow_count >= ${minFlowCount}
      ORDER BY flow_count DESC
      LIMIT 100
    )
    
    SELECT
      source,
      target,
      flow_count as value
    FROM flows
  `;

  const rows = await queryClickHouse(query);

  const links: FlowLink[] = rows.map((row) => ({
    source: String(row.source),
    target: String(row.target),
    value: Number(row.value || 0),
  }));

  // Identify dead-end flows (high exit rate from specific events)
  const deadEndQuery = `
    WITH user_events AS (
      SELECT
        user_id,
        event_name,
        timestamp,
        neighbor(event_name, 1) OVER (PARTITION BY user_id ORDER BY timestamp) as next_event
      FROM events
      WHERE timestamp >= ${sqlStringLiteral(startDate)}
        AND timestamp <= ${sqlStringLiteral(endDate)}
        AND user_id != ''
      ORDER BY user_id, timestamp
    ),
    
    exit_rates AS (
      SELECT
        event_name,
        countIf(next_event = '') as exits,
        count() as total,
        exits / nullIf(total, 0) as exit_rate
      FROM user_events
      GROUP BY event_name
      HAVING total >= 10
      ORDER BY exit_rate DESC
      LIMIT 5
    )
    
    SELECT
      event_name,
      exits,
      total,
      round(exit_rate * 100, 1) as exit_rate_pct
    FROM exit_rates
  `;

  const deadEndRows = await queryClickHouse(deadEndQuery);

  const deadEnds = deadEndRows.map((row) => ({
    event: String(row.event_name),
    exits: Number(row.exits || 0),
    total: Number(row.total || 0),
    exitRate: Number(row.exit_rate_pct || 0),
  }));

  // Generate AI insight for dead-end flows
  let aiInsight = null;
  if (deadEnds.length > 0 && deadEnds[0].exitRate > 30) {
    try {
      const aiServiceUrl = process.env.AI_SERVICE_URL || process.env.NEXT_PUBLIC_AI_API_URL;
      if (aiServiceUrl) {
        const prompt = `Проанализируй тупиковые пути пользователей (dead-end flows) и предложи гипотезу:

${deadEnds.map((d) => 
  `- ${d.event}: ${d.exits} выходов из ${d.total} (${d.exitRate}% exit rate)`
).join('\n')}

Предложи конкретные действия для улучшения user flow и снижения exit rate.`;

        const aiRes = await fetch(`${aiServiceUrl}/api/insights`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: prompt }),
          cache: "no-store",
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          aiInsight = aiData.insight || aiData.response || null;
        }
      }
    } catch (err) {
      console.error("AI analysis failed:", err);
    }
  }

  return NextResponse.json({
    links,
    deadEnds,
    aiInsight,
    totalFlows: links.length,
    dateRange: { start: startDate, end: endDate },
  });
}
