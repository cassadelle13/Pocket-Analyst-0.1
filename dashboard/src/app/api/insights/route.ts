import { NextRequest, NextResponse } from "next/server";


const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || process.env.NEXT_PUBLIC_AI_API_URL || "http://localhost:8000";

export type InsightApiResponse = {
  question: string;
  metric: string;
  sql: string;
  insight: string;
  recommendations?: string[];
  confidence?: number;
  timestamp?: string;
};

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const question = url.searchParams.get("question") || "";
  const metric = url.searchParams.get("metric") || "events";

  try {
    const response = await fetch(`${AI_SERVICE_URL}/insight`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metric,
        project_id: url.searchParams.get("projectId") || undefined,
        question,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`AI service error: ${response.status}`);
    }

    const data = (await response.json()) as InsightApiResponse;

    return NextResponse.json(data);
  } catch (error) {
    console.error("AI insight error:", error);
    
    // Return empty response instead of mock data
    const errorResponse: InsightApiResponse = {
      question: question || "Error occurred",
      metric,
      sql: "",
      insight: "An error occurred while generating insights.",
      recommendations: [],
      confidence: 0,
      timestamp: new Date().toISOString(),
    };
    
    return NextResponse.json(errorResponse, { status: 200 });
  }
}
