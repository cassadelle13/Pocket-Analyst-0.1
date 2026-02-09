import { NextRequest, NextResponse } from "next/server";
import type { ParsedCommandResponse, DashboardCommand } from "../../../../types/dashboard-state";

/**
 * POST /api/commands/parse
 * 
 * LLM-based parser: converts natural language to structured commands
 * Does NOT generate SQL or access database
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, availableFields } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: "Text is required" },
        { status: 400 }
      );
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL || process.env.NEXT_PUBLIC_AI_API_URL;
    if (!aiServiceUrl) {
      return NextResponse.json(
        { success: false, error: "AI service not configured" },
        { status: 500 }
      );
    }

    const systemPrompt = `You are a command parser for a data visualization dashboard.
Your ONLY job is to parse user text into structured commands.

Available commands:
1. change_chart_type: { "action": "change_chart_type", "value": "line" | "bar" | "table" }
2. change_x_axis: { "action": "change_x_axis", "fieldName": "field_name" }
3. add_y_axis: { "action": "add_y_axis", "fieldName": "field_name" }
4. remove_y_axis: { "action": "remove_y_axis", "fieldName": "field_name" }
5. add_filter: { "action": "add_filter", "field": "field_name", "operator": "eq"|"gt"|"lt"|"contains", "value": "value" }
6. remove_filter: { "action": "remove_filter", "field": "field_name" }
7. set_limit: { "action": "set_limit", "value": number }
8. clear_state: { "action": "clear_state" }

Available fields: ${JSON.stringify(availableFields || [])}

CRITICAL RULES:
- Return ONLY valid JSON
- Do NOT generate SQL
- Do NOT access database
- Match field names exactly from available fields
- If unclear, return error

Examples:
"сделай этот график столбчатым" → { "action": "change_chart_type", "value": "bar" }
"поменяй ось X на дату" → { "action": "change_x_axis", "fieldName": "timestamp" }
"покажи топ 5 по выручке" → { "action": "set_limit", "value": 5 }
"отфильтруй по региону Европа" → { "action": "add_filter", "field": "region", "operator": "eq", "value": "Европа" }

Return format:
{
  "command": <command object>,
  "interpretation": "brief explanation"
}

If cannot parse:
{
  "error": "reason"
}`;

    const userPrompt = `Parse this command: "${text}"`;

    const aiResponse = await fetch(`${aiServiceUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error('AI service request failed');
    }

    const aiData = await aiResponse.json();
    const aiText = aiData.choices?.[0]?.message?.content || aiData.response || '';

    let parsed;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: 'Failed to parse AI response',
      } as ParsedCommandResponse);
    }

    if (parsed.error) {
      return NextResponse.json({
        success: false,
        error: parsed.error,
      } as ParsedCommandResponse);
    }

    if (!parsed.command || !parsed.command.action) {
      return NextResponse.json({
        success: false,
        error: 'Invalid command structure',
      } as ParsedCommandResponse);
    }

    return NextResponse.json({
      success: true,
      command: parsed.command as DashboardCommand,
      interpretation: parsed.interpretation,
    } as ParsedCommandResponse);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to parse command';
    return NextResponse.json({
      success: false,
      error: message,
    } as ParsedCommandResponse, { status: 500 });
  }
}
