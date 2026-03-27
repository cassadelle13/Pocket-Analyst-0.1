import { NextRequest, NextResponse } from "next/server";

import type { SemanticModelV1 } from "../../../../lib/semantic/types";
import { normalizeSemanticModelV1, validateSemanticModelV1 } from "../../../../lib/semantic/validator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const model = (body?.model ?? body?.modelJson ?? body) as SemanticModelV1;

    const validated = validateSemanticModelV1(model);
    if (!validated.ok) {
      return NextResponse.json({ ok: false, errors: validated.errors }, { status: 400 });
    }

    const normalized = normalizeSemanticModelV1(model);
    return NextResponse.json({ ok: true, model: normalized }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to compile semantic model";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
