import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { z } from "zod";
import { openai } from "@/lib/ai";

export const dynamic = "force-dynamic";

const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL ?? "gemini-embedding-001";
const EMBEDDING_DIMS = Number(process.env.AI_EMBEDDING_DIMENSIONS ?? "3072");

const SearchSchema = z.object({
  query: z.string().min(1, "query is required"),
  limit: z.number().int().min(1).max(20).optional().default(5),
});

type SearchRow = {
  id: string;
  title: string;
  source_name: string | null;
  summary: string | null;
  key_points: unknown;
  topics: unknown;
  similarity: number;
  created_at: Date;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SearchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
        { status: 400 }
      );
    }

    const { query, limit } = parsed.data;

    // Build word-level ILIKE conditions so multi-word queries match documents
    // containing ANY of the significant words (length > 2 to skip stop words)
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 10);

    // Fall back to whole query if all words are too short
    const searchTerms = words.length > 0 ? words : [query];

    // Build parameterized WHERE clause: each term generates 3 ILIKE conditions
    // joined with OR. Params: $1...$N are like patterns, $N+1 is limit.
    const params: (string | number)[] = [];
    const termConditions: string[] = [];

    for (const term of searchTerms) {
      const safeterm = term.replace(/[%_\\]/g, "\\$&");
      const pattern = `%${safeterm}%`;
      const p = params.length + 1;
      params.push(pattern);
      termConditions.push(
        `(d.title ILIKE $${p} OR d.document_text ILIKE $${p} OR a.summary ILIKE $${p})`
      );
    }

    params.push(limit);
    const limitParam = params.length;
    const whereClause = termConditions.join(" OR ");

    const textRes = await pool.query<SearchRow>(
      `SELECT
        d.id,
        d.title,
        d.source_name,
        d.created_at,
        a.summary,
        a.key_points,
        a.topics,
        0.5 AS similarity
      FROM canary_documents d
      LEFT JOIN canary_document_analyses a ON a.document_id = d.id
      WHERE ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${limitParam}`,
      params
    );
    let results: SearchRow[] = textRes.rows;

    // Try to upgrade to vector search if embeddings are stored
    const aiToken = process.env.AI_GATEWAY_TOKEN;
    const aiGatewayUrl = process.env.AI_GATEWAY_URL;

    if (aiToken && aiGatewayUrl) {
      try {
        const embCheckRes = await pool.query(
          `SELECT COUNT(*) AS cnt FROM canary_document_analyses WHERE embedding IS NOT NULL`
        );
        const hasEmbeddings = parseInt(embCheckRes.rows[0]?.cnt ?? "0") > 0;

        if (hasEmbeddings) {
          const embeddingResponse = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: query.trim(),
          });
          const queryEmbedding = embeddingResponse.data[0]?.embedding;

          if (queryEmbedding && queryEmbedding.length === EMBEDDING_DIMS) {
            const vecRes = await pool.query<SearchRow>(
              `SELECT
                d.id,
                d.title,
                d.source_name,
                d.created_at,
                a.summary,
                a.key_points,
                a.topics,
                (1 - (a.embedding <=> $1::vector)) AS similarity
              FROM canary_documents d
              INNER JOIN canary_document_analyses a ON a.document_id = d.id
              WHERE a.embedding IS NOT NULL
              ORDER BY a.embedding <=> $1::vector
              LIMIT $2`,
              [JSON.stringify(queryEmbedding), limit]
            );
            if (vecRes.rows.length > 0) {
              results = vecRes.rows;
            }
          }
        }
      } catch (vecErr) {
        console.warn("[canary-document-search] vector search error, using text results:", vecErr);
      }
    }

    return NextResponse.json({
      ok: true,
      query,
      results: results.map((r) => ({
        id: r.id,
        title: r.title,
        source_name: r.source_name,
        summary: r.summary,
        key_points: r.key_points,
        topics: r.topics,
        similarity:
          typeof r.similarity === "number"
            ? r.similarity
            : parseFloat(String(r.similarity)),
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[canary-document-search POST]", err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}
