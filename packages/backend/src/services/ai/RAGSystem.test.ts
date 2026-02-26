import {
  RAGSystem,
  MockEmbeddingService,
  MockDocumentStorage,
  DocumentChunk,
  RetrievedDocument,
} from './RAGSystem';

// ── Mock the DB layer ──────────────────────────────────────────
const mockQuery = jest.fn();
const mockFindById = jest.fn();

jest.mock('../../db/BaseRepository', () => ({
  BaseRepository: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    findById: mockFindById,
  })),
}));

describe('RAGSystem', () => {
  let rag: RAGSystem;
  let embeddings: MockEmbeddingService;
  let storage: MockDocumentStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    embeddings = new MockEmbeddingService();
    storage = new MockDocumentStorage();
    rag = new RAGSystem(embeddings, storage);
  });

  // ── chunkText ──────────────────────────────────────────────

  describe('chunkText', () => {
    it('should return empty array for empty text', () => {
      expect(RAGSystem.chunkText('')).toEqual([]);
      expect(RAGSystem.chunkText('   ')).toEqual([]);
    });

    it('should return a single chunk for short text', () => {
      const text = 'hello world foo bar';
      const chunks = RAGSystem.chunkText(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
      expect(chunks[0].chunk_index).toBe(0);
    });

    it('should split long text into overlapping chunks', () => {
      // Generate text with exactly 1000 words
      const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const chunks = RAGSystem.chunkText(text);

      // With 500 token chunks and 50 overlap, step = 450
      // ceil((1000 - 500) / 450) + 1 ≈ 3 chunks
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // First chunk should have 500 words
      expect(chunks[0].text.split(/\s+/).length).toBe(500);

      // Verify overlap: last 50 words of chunk 0 should appear at start of chunk 1
      const chunk0Words = chunks[0].text.split(/\s+/);
      const chunk1Words = chunks[1].text.split(/\s+/);
      const overlapFromChunk0 = chunk0Words.slice(-RAGSystem.CHUNK_OVERLAP);
      const overlapFromChunk1 = chunk1Words.slice(0, RAGSystem.CHUNK_OVERLAP);
      expect(overlapFromChunk0).toEqual(overlapFromChunk1);
    });

    it('should assign sequential chunk_index values', () => {
      const words = Array.from({ length: 1200 }, (_, i) => `w${i}`);
      const chunks = RAGSystem.chunkText(words.join(' '));
      chunks.forEach((c, i) => expect(c.chunk_index).toBe(i));
    });
  });

  // ── MockEmbeddingService ───────────────────────────────────

  describe('MockEmbeddingService', () => {
    it('should produce vectors of 1536 dimensions', async () => {
      const vec = await embeddings.embed('test input');
      expect(vec).toHaveLength(1536);
    });

    it('should produce normalised unit vectors', async () => {
      const vec = await embeddings.embed('some agricultural text');
      const magnitude = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(magnitude).toBeCloseTo(1.0, 4);
    });

    it('should produce identical vectors for identical input', async () => {
      const a = await embeddings.embed('rice farming');
      const b = await embeddings.embed('rice farming');
      expect(a).toEqual(b);
    });

    it('should produce different vectors for different input', async () => {
      const a = await embeddings.embed('rice farming');
      const b = await embeddings.embed('wheat prices');
      expect(a).not.toEqual(b);
    });
  });

  // ── extractText ────────────────────────────────────────────

  describe('extractText', () => {
    it('should return text as-is for text format', () => {
      expect(RAGSystem.extractText('hello world', 'text')).toBe('hello world');
    });

    it('should handle Buffer input for text format', () => {
      const buf = Buffer.from('buffer text', 'utf-8');
      expect(RAGSystem.extractText(buf, 'text')).toBe('buffer text');
    });

    it('should handle PDF format (MVP stub returns UTF-8)', () => {
      expect(RAGSystem.extractText('pdf content', 'pdf')).toBe('pdf content');
    });

    it('should flatten structured JSON', () => {
      const json = JSON.stringify({ crop: 'rice', yield: 500 });
      const result = RAGSystem.extractText(json, 'structured');
      expect(result).toContain('crop: rice');
      expect(result).toContain('yield: 500');
    });

    it('should handle nested structured JSON', () => {
      const json = JSON.stringify({ farm: { name: 'test', size: 10 } });
      const result = RAGSystem.extractText(json, 'structured');
      expect(result).toContain('farm.name: test');
      expect(result).toContain('farm.size: 10');
    });

    it('should handle invalid JSON in structured format gracefully', () => {
      expect(RAGSystem.extractText('not json', 'structured')).toBe('not json');
    });
  });

  // ── buildCitations ─────────────────────────────────────────

  describe('buildCitations', () => {
    it('should build citations from retrieved documents', () => {
      const docs: RetrievedDocument[] = [
        {
          id: '1',
          article_id: '1',
          title: 'Rice Guide',
          content: 'content',
          source: 'ICAR',
          source_url: 'https://icar.org/rice',
          language: 'en',
          chunk_index: 0,
          relevance_score: 0.9,
        },
      ];
      const citations = RAGSystem.buildCitations(docs);
      expect(citations).toHaveLength(1);
      expect(citations[0]).toEqual({
        text: 'Rice Guide',
        source: 'ICAR',
        url: 'https://icar.org/rice',
      });
    });

    it('should handle documents without source_url', () => {
      const docs: RetrievedDocument[] = [
        {
          id: '2',
          article_id: '2',
          title: 'Wheat Tips',
          content: 'content',
          source: 'Local Extension',
          language: 'hi',
          chunk_index: 0,
          relevance_score: 0.8,
        },
      ];
      const citations = RAGSystem.buildCitations(docs);
      expect(citations[0].url).toBeUndefined();
    });

    it('should return empty array for no documents', () => {
      expect(RAGSystem.buildCitations([])).toEqual([]);
    });
  });

  // ── retrieve ───────────────────────────────────────────────

  describe('retrieve', () => {
    it('should query pgvector with tenant context and return sorted results', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            title: 'Article A',
            content: 'Content A',
            source: 'Source A',
            source_url: null,
            language: 'en',
            relevance_score: 0.7,
          },
          {
            id: 'a2',
            title: 'Article B',
            content: 'Content B',
            source: 'Source B',
            source_url: 'https://example.com',
            language: 'en',
            relevance_score: 0.9,
          },
        ],
      });

      const results = await rag.retrieve('rice farming tips', 'tenant-1');

      // Should call query with tenant id
      expect(mockQuery).toHaveBeenCalledWith(
        'tenant-1',
        expect.stringContaining('knowledge_articles'),
        expect.any(Array),
      );

      // Results should be sorted by relevance descending
      expect(results).toHaveLength(2);
      expect(results[0].relevance_score).toBe(0.9);
      expect(results[1].relevance_score).toBe(0.7);
    });

    it('should filter results below minScore', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'a1', title: 'A', content: 'C', source: 'S', source_url: null, language: 'en', relevance_score: 0.3 },
          { id: 'a2', title: 'B', content: 'C', source: 'S', source_url: null, language: 'en', relevance_score: 0.8 },
        ],
      });

      const results = await rag.retrieve('query', 'tenant-1', { minScore: 0.5 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('a2');
    });

    it('should respect topK option', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await rag.retrieve('query', 'tenant-1', { topK: 3 });

      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[2]).toContain(3); // topK param
    });

    it('should return empty array when no results found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const results = await rag.retrieve('obscure query', 'tenant-1');
      expect(results).toEqual([]);
    });
  });

  // ── index ──────────────────────────────────────────────────

  describe('index', () => {
    it('should generate embedding and update the article', async () => {
      mockFindById.mockResolvedValueOnce({
        id: 'art-1',
        content: 'Rice is a staple crop in India',
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await rag.index('art-1', 'tenant-1');

      expect(mockFindById).toHaveBeenCalledWith('tenant-1', 'art-1');
      expect(mockQuery).toHaveBeenCalledWith(
        'tenant-1',
        expect.stringContaining('UPDATE knowledge_articles SET embedding'),
        expect.arrayContaining(['art-1']),
      );
    });

    it('should throw when article not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      await expect(rag.index('missing', 'tenant-1')).rejects.toThrow('not found');
    });
  });

  // ── indexContent ───────────────────────────────────────────

  describe('indexContent', () => {
    it('should store document in S3 and update embedding', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const url = await rag.indexContent('tenant-1', 'art-1', 'Some text content', 'text');

      expect(url).toContain('s3://');
      expect(url).toContain('tenant-1');
      expect(mockQuery).toHaveBeenCalledWith(
        'tenant-1',
        expect.stringContaining('UPDATE knowledge_articles'),
        expect.any(Array),
      );
    });

    it('should handle structured JSON content', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const json = JSON.stringify({ crop: 'wheat', region: 'Punjab' });
      const url = await rag.indexContent('tenant-1', 'art-2', json, 'structured');

      expect(url).toContain('.json');
    });

    it('should handle Buffer content', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const buf = Buffer.from('PDF-like content', 'utf-8');
      const url = await rag.indexContent('tenant-1', 'art-3', buf, 'pdf');

      expect(url).toContain('.pdf');
    });
  });

  // ── MockDocumentStorage ────────────────────────────────────

  describe('MockDocumentStorage', () => {
    it('should return an S3-style URL on upload', async () => {
      const url = await storage.upload('key/file.txt', Buffer.from('data'), 'text/plain');
      expect(url).toBe('s3://krishimitra-docs/key/file.txt');
    });

    it('should generate consistent URLs', () => {
      expect(storage.getUrl('a/b.pdf')).toBe('s3://krishimitra-docs/a/b.pdf');
    });
  });
});
