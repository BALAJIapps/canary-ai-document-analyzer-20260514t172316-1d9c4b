import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { canaryDocumentAnalysis, canaryDocument } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { openai } from "@/lib/ai";

export const dynamic = "force-dynamic";

const AnalyzeSchema = z.object({
  document_id: z.string().uuid("document_id must be a valid UUID"),
  document_text: z.string().min(1, "document_text is required"),
});

const AI_MODEL = process.env.AI_TEXT_MODEL ?? "gemini-2.5-flash";
const AI_JSON_MODEL = process.env.AI_JSON_MODEL ?? "gemini-2.5-flash";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = AnalyzeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { document_id, document_text } = parsed.data;

    // Verify document exists
    const [doc] = await db
      .select()
      .from(canaryDocument)
      .where(eq(canaryDocument.id, document_id))
      .limit(1);

    if (!doc) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Document not found" } },
        { status: 404 }
      );
    }

    // Check AI gateway is configured
    const aiGatewayUrl = process.env.AI_GATEWAY_URL;
    const aiToken = process.env.AI_GATEWAY_TOKEN;
    if (!aiGatewayUrl || !aiToken) {
      return NextResponse.json(
        { ok: false, error: { code: "AI_NOT_CONFIGURED", message: "AI gateway credentials not configured" } },
        { status: 503 }
      );
    }

    // Call AI with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let summary: string;
    let keyPoints: string[];
    let topics: string[];

    try {
      const response = await openai.chat.completions.create({
        model: AI_JSON_MODEL,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a document analysis expert. Analyze the provided document and return a JSON object with exactly these fields:
- "summary": a concise 2-4 sentence summary of the document
- "key_points": an array of 3-7 key points extracted from the document
- "topics": an array of 2-5 main topics covered

Return ONLY valid JSON. No markdown, no code blocks.`,
          },
          {
            role: "user",
            content: `Analyze this document:\n\n${document_text.slice(0, 8000)}`,
          },
        ],
        max_tokens: 1024,
      });

      clearTimeout(timeout);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("AI returned empty response");
      }

      const parsed_ai = JSON.parse(content);
      summary = typeof parsed_ai.summary === "string" ? parsed_ai.summary : "Summary not available";
      keyPoints = Array.isArray(parsed_ai.key_points) ? parsed_ai.key_points : [];
      topics = Array.isArray(parsed_ai.topics) ? parsed_ai.topics : [];
    } catch (aiErr) {
      clearTimeout(timeout);
      console.error("[canary-analyze] AI call failed:", aiErr);
      return NextResponse.json(
        { ok: false, error: { code: "AI_ERROR", message: "AI analysis failed" } },
        { status: 502 }
      );
    }

    // Persist analysis
    const [analysis] = await db
      .insert(canaryDocumentAnalysis)
      .values({
        documentId: document_id,
        summary,
        keyPoints,
        topics,
        model: AI_MODEL,
      })
      .returning();

    if (!analysis) {
      return NextResponse.json(
        { ok: false, error: { code: "INSERT_FAILED", message: "Failed to save analysis" } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      analysis: {
        id: analysis.id,
        document_id: analysis.documentId,
        summary: analysis.summary,
        key_points: analysis.keyPoints,
        topics: analysis.topics,
        model: analysis.model,
        created_at: analysis.createdAt,
        fallback: false,
      },
    });
  } catch (err) {
    console.error("[canary-analyze POST]", err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
