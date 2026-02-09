import { NextResponse } from "next/server";


export async function GET() {
  try {
    const sources = [
      "https://geo.datav.aliyun.com/areas_v3/bound/World.json",
      "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson",
      "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json",
    ];

    let lastStatus = 502;
    let lastError: unknown = null;

    for (const url of sources) {
      try {
        const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
        if (!res.ok) {
          lastStatus = 502;
          continue;
        }
        const geo = await res.json();
        return NextResponse.json(geo, {
          headers: {
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
          },
        });
      } catch (e) {
        lastError = e;
        lastStatus = 502;
      }
    }

    return NextResponse.json(
      {
        error: "Failed to fetch world geojson",
        status: lastStatus,
        detail: lastError ? String(lastError) : undefined,
      },
      { status: 502 },
    );
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch world geojson" }, { status: 500 });
  }
}
