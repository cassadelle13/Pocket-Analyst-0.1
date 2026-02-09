import { NextRequest, NextResponse } from "next/server";

const DIFY_API_URL = process.env.DIFY_API_URL || "http://localhost:5001";
const DIFY_API_KEY = process.env.DIFY_API_KEY || "";

const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || "localhost";
const CLICKHOUSE_PORT = process.env.CLICKHOUSE_PORT || "8123";
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || "analytics";

async function queryClickHouse(query: string) {
  const url = `http://${CLICKHOUSE_HOST}:${CLICKHOUSE_PORT}/?database=${CLICKHOUSE_DATABASE}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: query + " FORMAT JSON",
  });

  if (!response.ok) {
    throw new Error(`ClickHouse error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data;
}

async function getAnalyticsContext(projectId: string) {
  // Get key metrics for AI analysis
  const metrics = await queryClickHouse(`
    SELECT 
      uniqExact(user_id) as total_users,
      countIf(toDate(timestamp) >= today() - 7) as events_last_week,
      countIf(toDate(timestamp) >= today() - 14 AND toDate(timestamp) < today() - 7) as events_prev_week
    FROM events
    WHERE project_id = '${projectId}'
  `);

  const topEvents = await queryClickHouse(`
    SELECT 
      event_name,
      count() as count
    FROM events
    WHERE project_id = '${projectId}'
      AND timestamp >= now() - INTERVAL 7 DAY
    GROUP BY event_name
    ORDER BY count DESC
    LIMIT 5
  `);

  const userGrowth = await queryClickHouse(`
    SELECT 
      toDate(timestamp) as date,
      uniqExact(user_id) as users
    FROM events
    WHERE project_id = '${projectId}'
      AND timestamp >= now() - INTERVAL 14 DAY
    GROUP BY date
    ORDER BY date
  `);

  return {
    metrics: metrics[0] || {},
    topEvents,
    userGrowth,
  };
}

async function generateInsightsWithDify(context: object) {
  if (!DIFY_API_KEY) {
    // Return mock insights if Dify is not configured
    return getMockInsights();
  }

  try {
    const response = await fetch(`${DIFY_API_URL}/v1/chat-messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DIFY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {},
        query: `Analyze this analytics data and provide 3 actionable insights in JSON format:
        ${JSON.stringify(context)}
        
        Return JSON array with objects containing: type (critical/warning/success/tip), title, message, action`,
        response_mode: "blocking",
        user: "analyst",
      }),
    });

    if (!response.ok) {
      throw new Error("Dify API error");
    }

    const data = await response.json();
    return JSON.parse(data.answer);
  } catch (error) {
    console.error("Dify error:", error);
    return getMockInsights();
  }
}

function getMockInsights() {
  return [
    {
      id: "1",
      type: "critical",
      title: "Retention Alert",
      message: "Day-7 retention dropped 12% this week. This correlates with the new onboarding flow deployed Monday. Users are dropping off at step 3 of the tutorial.",
      metric: "D7 Retention",
      change: -12,
      action: "Review onboarding funnel",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "2",
      type: "success",
      title: "Conversion Spike",
      message: "Premium conversion rate increased by 8% after the pricing page redesign. Users spend 40% more time on the features comparison section.",
      metric: "Conversion",
      change: 8,
      action: "A/B test new CTA",
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "3",
      type: "tip",
      title: "Engagement Opportunity",
      message: "Users who complete the profile setup have 3x higher retention. Currently only 34% complete this step. Consider adding a progress indicator.",
      action: "Add profile completion prompt",
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId") || "proj_001";

  try {
    // Get analytics context from ClickHouse
    let context = {};
    try {
      context = await getAnalyticsContext(projectId);
    } catch (e) {
      console.log("ClickHouse not available, using mock data");
    }

    // Generate insights with Dify (or mock)
    const insights = await generateInsightsWithDify(context);

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("Error generating insights:", error);
    return NextResponse.json({ insights: getMockInsights() });
  }
}
