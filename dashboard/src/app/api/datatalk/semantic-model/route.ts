import { NextRequest, NextResponse } from "next/server";
import { SchemaIntelligenceService } from "../../../../lib/schema-intelligence";

/**
 * POST /api/datatalk/semantic-model
 * 
 * Build semantic model from database schema metadata
 * 
 * Request body:
 * {
 *   database: string;
 *   columns: ColumnMetadata[];
 * }
 * 
 * Response:
 * {
 *   data: {
 *     dimensions: ClassifiedColumn[];
 *     measures: ClassifiedColumn[];
 *     timeFields: ClassifiedColumn[];
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const semanticModel = SchemaIntelligenceService.buildSemanticModel(body);

    return NextResponse.json({ data: semanticModel }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to build semantic model";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
