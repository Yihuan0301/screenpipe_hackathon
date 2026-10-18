import { NextResponse } from "next/server";
import { buildCockpitPayload } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await buildCockpitPayload();
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
