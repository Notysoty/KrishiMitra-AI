import { BaseRepository } from '../../db/BaseRepository';
import { Citation } from '../../types/ai';
import { KnowledgeArticle } from '../../types/knowledge';

/**
 * A retrieved document chunk with its relevance score.
 */
export interface RetrievedDocument {
  id: string;
  article_id: string;
  title: string;
  content: string;
  source: string;
  source_url?: string;
  language: string;
  chunk_index: number;
  relevance_score: number;
}

/**
 * Options for the RAG retrieve call.
 */
export interface RetrieveOptions {
  topK?: number;
  minScore?: number;
}

/**
 * A single chunk produced by the document chunker.
 */
export interface DocumentChunk {
  text: string;
  chunk_index: number;
}

/**
 * Supported content formats for indexing.
 */
export type ContentFormat = 'text' | 'pdf' | 'structured';

/**
 * Embedding service interface – allows swapping real OpenAI embeddings
 * for a mock during MVP / testing.
 */
export interface EmbeddingService {
  embed(text: string, inputType?: 'search_document' | 'search_query'): Promise<number[]>;
  readonly dimensions: number;
}

/**
 * Mock embedding service for MVP.
 * Produces deterministic 1536-dimension vectors from input text
 * so that similar texts yield similar vectors.
 */
export class MockEmbeddingService implements EmbeddingService {
  readonly dimensions = 1536;

  async embed(text: string): Promise<number[]> {
    const vec = new Array<number>(this.dimensions).fill(0);
    const lower = text.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      const idx = i % this.dimensions;
      vec[idx] += lower.charCodeAt(i) / 1000;
    }
    // Normalise to unit vector
    const magnitude = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / magnitude);
  }
}

/**
 * S3 storage interface for uploaded documents.
 */
export interface DocumentStorage {
  upload(key: string, content: Buffer, contentType: string): Promise<string>;
  getUrl(key: string): string;
}

/**
 * Mock S3 storage for MVP.
 */
export class MockDocumentStorage implements DocumentStorage {
  private store = new Map<string, Buffer>();

  async upload(key: string, content: Buffer, _contentType: string): Promise<string> {
    this.store.set(key, content);
    return this.getUrl(key);
  }

  getUrl(key: string): string {
    return `s3://krishimitra-docs/${key}`;
  }
}

/**
 * RAG (Retrieval Augmented Generation) system backed by pgvector.
 *
 * Responsibilities:
 * - Document chunking (~500 tokens, 50 token overlap)
 * - Embedding generation (via pluggable EmbeddingService)
 * - Vector similarity search with tenant_id filter
 * - Re-ranking by relevance score
 * - Indexing new knowledge base content
 *
 * Requirements: 17.1, 17.2, 17.3, 17.5, 17.6
 */
export class RAGSystem {
  private repo: BaseRepository;
  private embeddings: EmbeddingService;
  private storage: DocumentStorage;

  /** Approximate tokens per chunk. */
  static readonly CHUNK_SIZE = 500;
  /** Token overlap between consecutive chunks. */
  static readonly CHUNK_OVERLAP = 50;

  constructor(
    embeddings: EmbeddingService = new MockEmbeddingService(),
    storage: DocumentStorage = new MockDocumentStorage(),
  ) {
    this.repo = new BaseRepository('knowledge_articles');
    this.embeddings = embeddings;
    this.storage = storage;
  }

  // ── Retrieve ───────────────────────────────────────────────

  /**
   * Retrieve relevant documents for a query within a tenant scope.
   * Uses pgvector cosine similarity with tenant_id filter, then re-ranks.
   *
   * Requirement 17.1 – retrieve before generating responses
   * Requirement 17.5 – rank by relevance score
   * Requirement 17.6 – tenant-specific knowledge bases
   */
  async retrieve(
    query: string,
    tenantId: string,
    options: RetrieveOptions = {},
  ): Promise<RetrievedDocument[]> {
    const topK = options.topK ?? 5;
    const minScore = options.minScore ?? 0.0;

    const queryEmbedding = await this.embeddings.embed(query, 'search_query');
    const vecLiteral = `[${queryEmbedding.join(',')}]`;

    const sql = `
      SELECT
        id,
        title,
        content,
        source,
        source_url,
        language,
        1 - (embedding <=> $1::vector) AS relevance_score
      FROM knowledge_articles
      WHERE embedding IS NOT NULL
        AND status = 'approved'
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;

    const result = await this.repo.query<{
      id: string;
      title: string;
      content: string;
      source: string;
      source_url: string | null;
      language: string;
      relevance_score: number;
    }>(tenantId, sql, [vecLiteral, topK]);

    return result.rows
      .filter((r) => Number(r.relevance_score) >= minScore)
      .sort((a, b) => Number(b.relevance_score) - Number(a.relevance_score))
      .map((r) => ({
        id: r.id,
        article_id: r.id,
        title: r.title,
        content: r.content,
        source: r.source,
        source_url: r.source_url ?? undefined,
        language: r.language,
        chunk_index: 0,
        relevance_score: Number(r.relevance_score),
      }));
  }

  // ── Index ──────────────────────────────────────────────────

  /**
   * Index a knowledge article by generating an embedding and storing it.
   *
   * Requirement 17.2 – support text, PDF, structured data
   * Requirement 17.3 – index within 10 minutes of upload
   */
  async index(articleId: string, tenantId: string): Promise<void> {
    const row = await this.repo.findById<KnowledgeArticle & { content: string }>(
      tenantId,
      articleId,
    );
    if (!row) {
      throw new Error(`Article ${articleId} not found`);
    }

    // Chunk the content and combine for a single embedding per article (MVP).
    const chunks = RAGSystem.chunkText(row.content);
    const combinedText = chunks.map((c) => c.text).join(' ');
    const embedding = await this.embeddings.embed(combinedText, 'search_document');
    const vecLiteral = `[${embedding.join(',')}]`;

    await this.repo.query(
      tenantId,
      `UPDATE knowledge_articles SET embedding = $1::vector, updated_at = NOW() WHERE id = $2`,
      [vecLiteral, articleId],
    );
  }

  /**
   * Index raw content (text / PDF text / structured JSON) and store the
   * source document in S3.
   *
   * Requirement 17.2 – support text, PDF, structured data formats
   */
  async indexContent(
    tenantId: string,
    articleId: string,
    content: Buffer | string,
    format: ContentFormat,
  ): Promise<string> {
    const textContent = RAGSystem.extractText(content, format);

    // Store original document in S3
    const s3Key = `${tenantId}/${articleId}.${format === 'structured' ? 'json' : format}`;
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    const s3Url = await this.storage.upload(s3Key, buf, RAGSystem.mimeType(format));

    // Generate embedding from extracted text
    const chunks = RAGSystem.chunkText(textContent);
    const combinedText = chunks.map((c) => c.text).join(' ');
    const embedding = await this.embeddings.embed(combinedText, 'search_document');
    const vecLiteral = `[${embedding.join(',')}]`;

    await this.repo.query(
      tenantId,
      `UPDATE knowledge_articles SET embedding = $1::vector, source_url = $3, updated_at = NOW() WHERE id = $2`,
      [vecLiteral, articleId, s3Url],
    );

    return s3Url;
  }

  // ── Citations ──────────────────────────────────────────────

  /**
   * Build citation objects from retrieved documents.
   */
  static buildCitations(documents: RetrievedDocument[]): Citation[] {
    return documents.map((doc) => ({
      text: doc.title,
      source: doc.source,
      url: doc.source_url,
    }));
  }

  // ── Document Chunking ─────────────────────────────────────

  /**
   * Split text into chunks of ~500 tokens with 50 token overlap.
   * Uses whitespace tokenisation (1 token ≈ 1 word) as a simple heuristic.
   */
  static chunkText(text: string): DocumentChunk[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const chunks: DocumentChunk[] = [];
    let start = 0;
    let index = 0;

    while (start < words.length) {
      const end = Math.min(start + RAGSystem.CHUNK_SIZE, words.length);
      chunks.push({
        text: words.slice(start, end).join(' '),
        chunk_index: index,
      });
      index++;
      start += RAGSystem.CHUNK_SIZE - RAGSystem.CHUNK_OVERLAP;
      if (end === words.length) break;
    }

    return chunks;
  }

  // ── Helpers ────────────────────────────────────────────────

  /**
   * Extract plain text from various content formats.
   * For MVP, PDF parsing is a stub that treats the buffer as UTF-8 text.
   */
  static extractText(content: Buffer | string, format: ContentFormat): string {
    if (format === 'text') {
      return typeof content === 'string' ? content : content.toString('utf-8');
    }
    if (format === 'pdf') {
      // MVP stub – real implementation would use a PDF parser
      return typeof content === 'string' ? content : content.toString('utf-8');
    }
    if (format === 'structured') {
      const raw = typeof content === 'string' ? content : content.toString('utf-8');
      try {
        const obj = JSON.parse(raw);
        return RAGSystem.flattenObject(obj);
      } catch {
        return raw;
      }
    }
    return typeof content === 'string' ? content : content.toString('utf-8');
  }

  /** Flatten a JSON object into readable text. */
  private static flattenObject(obj: unknown, prefix = ''): string {
    if (typeof obj !== 'object' || obj === null) return String(obj);
    const parts: string[] = [];
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const label = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null) {
        parts.push(RAGSystem.flattenObject(value, label));
      } else {
        parts.push(`${label}: ${value}`);
      }
    }
    return parts.join('\n');
  }

  private static mimeType(format: ContentFormat): string {
    switch (format) {
      case 'text': return 'text/plain';
      case 'pdf': return 'application/pdf';
      case 'structured': return 'application/json';
    }
  }
}
