import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};

  // DB check
  try {
    await db.execute(sql`SELECT 1`);
    checks.db = "ok";
  } catch (err) {
    checks.db = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  // AI gateway check
  const aiGateway = process.env.AI_GATEWAY_URL;
  const aiToken = process.env.AI_GATEWAY_TOKEN;
  checks.ai_gateway = aiGateway && aiToken ? "configured" : "missing credentials";

  const allOk = Object.values(checks).every((v) => v === "ok" || v === "configured");

  return NextResponse.json(
    { ok: allOk, checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  );
}
