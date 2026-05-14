import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { canaryDocument } from "@/db/schema";
import { desc } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateDocumentSchema = z.object({
  title: z.string().min(1, "title is required"),
  document_text: z.string().min(1, "document_text is required"),
  source_name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { title, document_text, source_name } = parsed.data;

    const [doc] = await db
      .insert(canaryDocument)
      .values({
        title,
        documentText: document_text,
        sourceName: source_name ?? null,
      })
      .returning();

    if (!doc) {
      return NextResponse.json(
        { ok: false, error: { code: "INSERT_FAILED", message: "Failed to insert document" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, document: doc }, { status: 201 });
  } catch (err) {
    console.error("[canary-documents POST]", err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const docs = await db
      .select()
      .from(canaryDocument)
      .orderBy(desc(canaryDocument.createdAt))
      .limit(50);
    return NextResponse.json({ ok: true, documents: docs });
  } catch (err) {
    console.error("[canary-documents GET]", err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
