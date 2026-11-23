import { NextResponse } from "next/server";
import { runWeeklyStatements } from "@/lib/statements";

export const dynamic = "force-dynamic";

// Vercel Cron sends "Authorization: Bearer $CRON_SECRET"
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runWeeklyStatements();
  return NextResponse.json(result);
}
