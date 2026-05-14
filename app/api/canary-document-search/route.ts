import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { z } from "zod";
import { openai } from "@/lib/ai";

export const dynamic = "force-dynamic";

const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL ?? "gemini-embedding-001";
const EMBEDDING_DIMS = Number(process.env.AI_EMBEDDING_DIMENSIONS ?? "3072");
const MAX_SEARCH_TERMS = 10;
const MIN_WORD_LENGTH = 3; // filter words with length <= 2

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

/**
 * Build a fully parameterized ILIKE query for multi-word text search.
 * Each word gets its own ILIKE $N parameter — no dynamic SQL fragments.
 * Returns { queryText, params } where params is ready for pool.query().
 */
function buildTextSearchQuery(
  words: string[],
  limit: number
): { queryText: string; params: (string | number)[] } {
  const params: (string | number)[] = [];

  // Build per-word conditions using numbered placeholders
  const wordConditions = words.map((word) => {
    const safeWord = word.replace(/[%_\\]/g, "\\$&");
    const pattern = `%${safeWord}%`;
    const idx = params.length + 1;
    params.push(pattern);
    return `(d.title ILIKE $${idx} OR d.document_text ILIKE $${idx} OR a.summary ILIKE $${idx})`;
  });

  params.push(limit);
  const limitIdx = params.length;

  // Join all word conditions with OR — any word match returns the document
  const whereClause = wordConditions.join(" OR ");

  const queryText = `
    SELECT
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
    LIMIT $${limitIdx}
  `;

  return { queryText, params };
}

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

    // Split query into significant words; fall back to full query if all short
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= MIN_WORD_LENGTH)
      .slice(0, MAX_SEARCH_TERMS);
    const searchTerms = words.length > 0 ? words : [query.trim()];

    // Run parameterized text search
    let results: SearchRow[] = [];
    try {
      const { queryText, params } = buildTextSearchQuery(searchTerms, limit);
      const textRes = await pool.query<SearchRow>(queryText, params);
      results = textRes.rows;
    } catch (textErr) {
      console.error("[canary-document-search] text search failed:", textErr);
      // Continue — try vector search below, or return empty on total failure
    }

    // Try to upgrade to vector search if embeddings are stored
    const aiToken = process.env.AI_GATEWAY_TOKEN;
    const aiGatewayUrl = process.env.AI_GATEWAY_URL;

    if (aiToken && aiGatewayUrl) {
      try {
        const embCheckRes = await pool.query<{ cnt: string }>(
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
            // Exact cosine scan — no ANN index on vector(3072)
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
        // Vector search is optional — log and fall through to text results
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
