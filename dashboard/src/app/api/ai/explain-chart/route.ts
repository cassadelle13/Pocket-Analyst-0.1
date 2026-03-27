import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { chartData, chartConfig } = await req.json();

    if (!chartData && !chartConfig) {
      return NextResponse.json(
        { error: "Chart data or config is required" },
        { status: 400 }
      );
    }

    const aiServiceUrl = process.env.NEXT_PUBLIC_AI_API_URL || process.env.AI_SERVICE_URL || "http://localhost:8000";

    // Build context for AI explanation
    const opt = chartConfig as any;
    const chartType = opt?.series?.[0]?.type || chartData?.vizType || 'unknown';
    const series = Array.isArray(opt?.series) ? opt.series : [];
    const seriesNames = series.map((s: any) => s.name || 'Unnamed').filter(Boolean);
    const dataPoints = series[0]?.data?.length || 0;

    // Extract semantic query info if available
    const logicalQuery = chartData?.logicalQuery;
    const dimensions = logicalQuery?.dimensions || [];
    const measures = logicalQuery?.measures || [];
    const sourceModel = logicalQuery?.sourceModel || '';

    // Build comprehensive prompt for AI
    const prompt = `Explain this chart to a business user in 2-3 sentences. Focus on what insights they can gain and how to interpret it.

Chart Type: ${chartType}
${seriesNames.length > 0 ? `Series: ${seriesNames.join(', ')}` : ''}
${dataPoints > 0 ? `Data Points: ${dataPoints}` : ''}
${dimensions.length > 0 ? `Dimensions: ${dimensions.join(', ')}` : ''}
${measures.length > 0 ? `Measures: ${measures.join(', ')}` : ''}
${sourceModel ? `Data Source: ${sourceModel}` : ''}

Provide a clear, concise explanation that helps the user understand what this chart shows and what decisions they can make based on it.`;

    // Call AI service
    const aiResponse = await fetch(`${aiServiceUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a data visualization expert. Explain charts clearly and concisely to business users, focusing on actionable insights.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI service returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const explanation = aiData.response || aiData.message || "Unable to generate explanation";

    return NextResponse.json({
      ok: true,
      explanation,
      chartType,
      seriesCount: series.length,
      dataPoints,
      dimensions,
      measures,
    });
  } catch (error: any) {
    console.error("[AI Explain Chart] Error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Failed to generate AI explanation" },
      { status: 500 }
    );
  }
}
