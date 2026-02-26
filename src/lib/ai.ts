import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Generate an embedding for a piece of text using OpenAI.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Index an update's content into AI chunks for RAG retrieval.
 * Splits the content into chunks and stores embeddings.
 */
export async function indexUpdate(updateId: string) {
  const update = await db.update.findUnique({
    where: { id: updateId },
    include: {
      company: true,
      metricValues: { include: { metricDefinition: true } },
    },
  });
  if (!update) return;

  // Build the full text to index
  const metricText = update.metricValues
    .map((mv) => `${mv.metricDefinition.name}: ${mv.value} ${mv.metricDefinition.unit || ""}`)
    .join(", ");

  const fullText = [
    `Company: ${update.company.name}`,
    `Update: ${update.title}`,
    `Period: ${update.period}`,
    update.body,
    metricText ? `Metrics: ${metricText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Split into chunks (~500 tokens each, roughly 2000 chars)
  const chunks = splitIntoChunks(fullText, 2000);

  // Delete existing chunks for this update
  await db.aIChunk.deleteMany({ where: { updateId } });

  // Create new chunks with embeddings
  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk);
      await db.$executeRaw`
        INSERT INTO ai_chunks (id, "updateId", content, embedding, "createdAt")
        VALUES (${generateId()}, ${updateId}, ${chunk}, ${embeddingToVector(embedding)}::vector, NOW())
      `;
    } catch (e) {
      console.error("Failed to index chunk:", e);
    }
  }
}

/**
 * Index a document's text content for RAG.
 */
export async function indexDocument(documentId: string, textContent: string) {
  const chunks = splitIntoChunks(textContent, 2000);

  await db.aIChunk.deleteMany({ where: { documentId } });

  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(chunk);
      await db.$executeRaw`
        INSERT INTO ai_chunks (id, "documentId", content, embedding, "createdAt")
        VALUES (${generateId()}, ${documentId}, ${chunk}, ${embeddingToVector(embedding)}::vector, NOW())
      `;
    } catch (e) {
      console.error("Failed to index chunk:", e);
    }
  }
}

/**
 * Search for relevant chunks using vector similarity.
 */
export async function searchChunks(query: string, limit = 10): Promise<
  { id: string; content: string; updateId: string | null; documentId: string | null; similarity: number }[]
> {
  const queryEmbedding = await generateEmbedding(query);
  const vectorStr = embeddingToVector(queryEmbedding);

  const results = await db.$queryRaw<
    { id: string; content: string; updateId: string | null; documentId: string | null; similarity: number }[]
  >`
    SELECT id, content, "updateId", "documentId",
           1 - (embedding <=> ${vectorStr}::vector) as similarity
    FROM ai_chunks
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `;

  return results;
}

/**
 * Chat with the AI assistant. Retrieves relevant context and queries OpenAI.
 */
export async function chatWithAI(
  message: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<{ response: string; sources: { type: string; id: string; title: string }[] }> {
  // Search for relevant context
  const chunks = await searchChunks(message, 10);

  // Build context from chunks
  const context = chunks.map((c) => c.content).join("\n\n---\n\n");

  // Gather source info
  const sourceIds = new Set<string>();
  const sources: { type: string; id: string; title: string }[] = [];

  for (const chunk of chunks) {
    if (chunk.updateId && !sourceIds.has(chunk.updateId)) {
      sourceIds.add(chunk.updateId);
      const update = await db.update.findUnique({
        where: { id: chunk.updateId },
        select: { id: true, title: true, period: true },
      });
      if (update) {
        sources.push({ type: "update", id: update.id, title: `${update.title} (${update.period})` });
      }
    }
    if (chunk.documentId && !sourceIds.has(chunk.documentId)) {
      sourceIds.add(chunk.documentId);
      const doc = await db.document.findUnique({
        where: { id: chunk.documentId },
        select: { id: true, name: true },
      });
      if (doc) {
        sources.push({ type: "document", id: doc.id, title: doc.name });
      }
    }
  }

  const systemMessage = `You are an AI assistant for Molly, a venture capital fund that manages a portfolio of companies.
You help the Molly team analyze their portfolio companies' updates, metrics, and documents.
Answer questions based on the provided context. Be specific and cite which company or update you're referencing.
If you don't have enough information to answer, say so clearly.

Context from portfolio data:
${context || "No relevant context found."}`;

  const completion = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system: systemMessage,
    messages: [
      ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: message },
    ],
  });

  const response =
    completion.content[0]?.type === "text"
      ? completion.content[0].text
      : "I couldn't generate a response.";

  return { response, sources };
}

// ─── Helpers ────────────────────────────────────────────

function splitIntoChunks(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxLength && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + para;
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

function embeddingToVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 25);
}
