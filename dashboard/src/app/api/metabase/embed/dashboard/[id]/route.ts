import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

function getSiteUrl() {
  return process.env.METABASE_SITE_URL || "http://metabase:3000";
}

function getPublicUrl() {
  return process.env.METABASE_PUBLIC_URL || "http://localhost:3001";
}

function getEmbeddingSecret() {
  return process.env.METABASE_EMBEDDING_SECRET_KEY || "";
}

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const id = context.params.id;
    const secret = getEmbeddingSecret();

    if (!secret) {
      return NextResponse.json({ error: "METABASE_EMBEDDING_SECRET_KEY is not set" }, { status: 500 });
    }

    const token = jwt.sign(
      {
        resource: { dashboard: Number(id) || id },
        params: {},
        exp: Math.floor(Date.now() / 1000) + 60 * 10,
      },
      secret,
    );

    const site = getSiteUrl();
    const publicUrl = getPublicUrl();

    const embedPath = `/embed/dashboard/${token}#bordered=true&titled=true`;

    return NextResponse.json({
      url: `${publicUrl}${embedPath}`,
      internalUrl: `${site}${embedPath}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate embed token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
