// Dify AI Client for PocketAnalyst
// Connects to Dify API for generating AI insights

const DIFY_API_URL = process.env.DIFY_API_URL || "http://localhost:5001";
const DIFY_API_KEY = process.env.DIFY_API_KEY || "";

export interface DifyMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DifyResponse {
  answer: string;
  conversation_id: string;
  message_id: string;
}

export interface AnalyticsInsight {
  id: string;
  type: "critical" | "warning" | "success" | "tip";
  title: string;
  message: string;
  metric?: string;
  change?: number;
  action?: string;
  timestamp: string;
}

export async function sendMessageToDify(
  message: string,
  conversationId?: string
): Promise<DifyResponse> {
  const response = await fetch(`${DIFY_API_URL}/v1/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DIFY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: {},
      query: message,
      response_mode: "blocking",
      conversation_id: conversationId,
      user: "analyst",
    }),
  });

  if (!response.ok) {
    throw new Error(`Dify API error: ${response.statusText}`);
  }

  return response.json();
}

export async function generateInsights(
  analyticsData: Record<string, unknown>
): Promise<AnalyticsInsight[]> {
  const prompt = `You are an AI product analyst. Analyze the following analytics data and provide exactly 3 actionable insights.

Analytics Data:
${JSON.stringify(analyticsData, null, 2)}

Return your response as a valid JSON array with objects containing these fields:
- type: one of "critical", "warning", "success", or "tip"
- title: short title (max 5 words)
- message: detailed explanation (2-3 sentences)
- metric: the metric name if applicable
- change: percentage change if applicable (number)
- action: recommended action (short phrase)

Focus on:
1. Retention and engagement patterns
2. Conversion opportunities
3. User behavior anomalies

Return ONLY the JSON array, no other text.`;

  try {
    const response = await sendMessageToDify(prompt);
    const insights = JSON.parse(response.answer);
    
    return insights.map((insight: Omit<AnalyticsInsight, "id" | "timestamp">, index: number) => ({
      ...insight,
      id: `insight_${Date.now()}_${index}`,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error("Failed to generate insights:", error);
    throw error;
  }
}

export async function askAnalyst(
  question: string,
  context?: Record<string, unknown>
): Promise<string> {
  const prompt = context
    ? `Context: ${JSON.stringify(context)}\n\nQuestion: ${question}`
    : question;

  const response = await sendMessageToDify(prompt);
  return response.answer;
}

// SQL Query generation for ClickHouse
export async function generateSQLQuery(
  naturalLanguageQuery: string
): Promise<string> {
  const prompt = `You are a ClickHouse SQL expert. Convert this natural language query to ClickHouse SQL.

Available tables:
- analytics.events (event_id, event_type, event_name, timestamp, user_id, anonymous_id, session_id, source, page_url, page_path, properties, project_id)
- analytics.users (user_id, email, name, created_at, first_seen_at, last_seen_at, traits, project_id)
- analytics.sessions (session_id, user_id, started_at, ended_at, duration_seconds, page_views, events_count, source, device_type, project_id)

Query: ${naturalLanguageQuery}

Return ONLY the SQL query, no explanation.`;

  const response = await sendMessageToDify(prompt);
  return response.answer.trim();
}
