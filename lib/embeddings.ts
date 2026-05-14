/**
 * Embedding helper for RAG search.
 * Uses gemini-embedding-001 via the Google OpenAI-compatible gateway.
 * vector(3072) — exact cosine scan, no ANN index.
 */
import { openai } from '@/lib/ai';

export const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL ?? 'gemini-embedding-001';
export const EMBEDDING_DIMS = Number(process.env.AI_EMBEDDING_DIMENSIONS ?? '3072');

export async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim().slice(0, 8000),
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Embedding dimension mismatch: expected ${EMBEDDING_DIMS}, got ${embedding?.length ?? 0}`
    );
  }
  return embedding;
}
