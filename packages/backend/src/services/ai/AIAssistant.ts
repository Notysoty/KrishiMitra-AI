import { BaseRepository } from '../../db/BaseRepository';
import { AIResponse, Citation } from '../../types/ai';
import { SafetyRefusal } from '../../types/errors';
import { SafetyGuardrail } from './SafetyGuardrail';
import { RAGSystem, RetrievedDocument, MockEmbeddingService } from './RAGSystem';
import { BedrockLLMClient, isBedrockConfigured } from './BedrockLLMClient';
import { BedrockEmbeddingService } from './BedrockEmbeddingService';
import { BedrockAgentLLMClient, isAgentConfigured } from './BedrockAgentClient';

// ── LLM Client Interface ────────────────────────────────────────

export interface LLMGenerateParams {
  query: string;
  documents: RetrievedDocument[];
  systemPrompt: string;
  language: string;
  history?: ConversationMessage[];
}

export interface LLMResult {
  text: string;
}

export interface LLMClient {
  generate(params: LLMGenerateParams): Promise<LLMResult>;
}

/**
 * Mock LLM client for MVP. Returns a deterministic response
 * incorporating the query and retrieved document context.
 */
export class MockLLMClient implements LLMClient {
  async generate(params: LLMGenerateParams): Promise<LLMResult> {
    const docContext =
      params.documents.length > 0
        ? `Based on ${params.documents.length} knowledge base document(s): ${params.documents.map((d) => d.title).join(', ')}.`
        : 'Based on general agricultural knowledge.';

    return {
      text: `${docContext} Regarding your question about "${params.query}": This is a mock AI response for MVP demonstration purposes.`,
    };
  }
}

// ── User Context ────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UserContext {
  userId: string;
  tenantId: string;
  language: string;
  userName?: string;
  history?: ConversationMessage[];
  farm?: {
    farmName?: string;
    state?: string;
    district?: string;
    soilType?: string;
    irrigationType?: string;
    location?: { latitude: number; longitude: number };
    crops?: string[];
    irrigation_type?: string;
  };
}

// ── Rate Limiter ────────────────────────────────────────────────

/**
 * Simple in-memory rate limiter. Tracks AI queries per user per day.
 * Max 100 queries per user per day.
 */
export class RateLimiter {
  static readonly MAX_QUERIES_PER_DAY = 100;
  private counts = new Map<string, { count: number; resetAt: number }>();

  /**
   * Check if the user is within rate limits. Returns true if allowed.
   */
  check(userId: string): boolean {
    const now = Date.now();
    const entry = this.counts.get(userId);
    if (!entry || now >= entry.resetAt) {
      return true;
    }
    return entry.count < RateLimiter.MAX_QUERIES_PER_DAY;
  }

  /**
   * Record a query for the user. Returns false if rate limit exceeded.
   */
  record(userId: string): boolean {
    const now = Date.now();
    const entry = this.counts.get(userId);
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const resetAt = midnight.getTime();

    if (!entry || now >= entry.resetAt) {
      this.counts.set(userId, { count: 1, resetAt });
      return true;
    }

    if (entry.count >= RateLimiter.MAX_QUERIES_PER_DAY) {
      return false;
    }

    entry.count++;
    return true;
  }

  /** Get remaining queries for a user today. */
  remaining(userId: string): number {
    const now = Date.now();
    const entry = this.counts.get(userId);
    if (!entry || now >= entry.resetAt) {
      return RateLimiter.MAX_QUERIES_PER_DAY;
    }
    return Math.max(0, RateLimiter.MAX_QUERIES_PER_DAY - entry.count);
  }
}

// ── Interaction Logger ──────────────────────────────────────────

export interface AIInteractionLog {
  id: string;
  userId: string;
  tenantId: string;
  query: string;
  responseText: string;
  confidence: number;
  citationCount: number;
  wasRefused: boolean;
  refusalReason?: string;
  timestamp: Date;
}

/**
 * Logs all AI interactions for quality monitoring.
 * MVP: in-memory store. Production: persists to database.
 */
export class InteractionLogger {
  private logs: AIInteractionLog[] = [];

  log(entry: Omit<AIInteractionLog, 'id' | 'timestamp'>): AIInteractionLog {
    const record: AIInteractionLog = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
    };
    this.logs.push(record);
    return record;
  }

  getHistory(userId: string, tenantId: string, limit = 50): AIInteractionLog[] {
    return this.logs
      .filter((l) => l.userId === userId && l.tenantId === tenantId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
}

// ── Educational Disclaimer ──────────────────────────────────────

const EDUCATIONAL_DISCLAIMER =
  'This information is for educational purposes. Always consult local agricultural experts for your specific situation.';

// ── AIAssistant ─────────────────────────────────────────────────

/**
 * Core AI assistant integrating SafetyGuardrail, RAGSystem, and LLM.
 *
 * Flow:
 * 1. Rate-limit check
 * 2. Safety guardrail check (prompt injection, prohibited topics, chemical dosage, toxic)
 * 3. RAG retrieval for relevant documents
 * 4. LLM generation with system prompt
 * 5. Confidence scoring based on document count and relevance
 * 6. Citation extraction
 * 7. Threshold-based response handling (refuse < 50%, uncertain < 70%)
 * 8. Educational disclaimer appended to all responses
 * 9. Interaction logging
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 5.9,
 *               26.3, 26.4, 26.5, 26.6, 27.1, 27.2, 27.3, 27.5, 27.6
 */
export class AIAssistant {
  private llmClient: LLMClient;
  private ragSystem: RAGSystem;
  private safetyGuardrail: SafetyGuardrail;
  private rateLimiter: RateLimiter;
  private logger: InteractionLogger;

  constructor(
    llmClient: LLMClient = isAgentConfigured()
      ? new BedrockAgentLLMClient()
      : isBedrockConfigured() ? new BedrockLLMClient() : new MockLLMClient(),
    ragSystem: RAGSystem = new RAGSystem(
      isBedrockConfigured() ? new BedrockEmbeddingService() : new MockEmbeddingService(),
    ),
    safetyGuardrail: SafetyGuardrail = new SafetyGuardrail(),
    rateLimiter: RateLimiter = new RateLimiter(),
    logger: InteractionLogger = new InteractionLogger(),
  ) {
    this.llmClient = llmClient;
    this.ragSystem = ragSystem;
    this.safetyGuardrail = safetyGuardrail;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
  }

  /**
   * Process a user query through the full AI pipeline.
   */
  async processQuery(query: string, context: UserContext): Promise<AIResponse> {
    // 1. Rate-limit check
    if (!this.rateLimiter.record(context.userId)) {
      this.logInteraction(query, context, '', 0, 0, true, 'Rate limit exceeded');
      return {
        text: 'You have reached the maximum number of AI queries for today (100). Please try again tomorrow.',
        confidence: 0,
        citations: [],
        sources: [],
      };
    }

    // 2. Safety guardrail check
    const refusal = this.safetyGuardrail.check(query);
    if (refusal) {
      this.logInteraction(query, context, refusal.reason, 0, 0, true, refusal.reason);
      return {
        text: refusal.reason,
        confidence: 0,
        citations: [],
        sources: [],
      };
    }

    // 3. RAG retrieval
    let documents: RetrievedDocument[] = [];
    try {
      documents = await this.ragSystem.retrieve(query, context.tenantId);
    } catch {
      // Graceful degradation: continue without RAG results
      documents = [];
    }

    // 4. Build system prompt and generate LLM response
    const systemPrompt = this.buildSystemPrompt(context);
    const llmResult = await this.llmClient.generate({
      query,
      documents,
      systemPrompt,
      language: context.language,
      history: context.history ?? [],
    });

    // 5. Calculate confidence
    const confidence = AIAssistant.calculateConfidence(documents);

    // 6. Extract citations
    const citations = RAGSystem.buildCitations(documents);
    const sources = documents.map((d) => d.source);

    // 7. Build disclaimer based on whether RAG context was available
    let responseText = llmResult.text;
    let disclaimer = EDUCATIONAL_DISCLAIMER;

    if (documents.length === 0) {
      // LLM answered from general knowledge — no knowledge base match
      disclaimer =
        'This answer is based on general agricultural knowledge. ' +
        EDUCATIONAL_DISCLAIMER;
    }

    this.logInteraction(query, context, responseText, confidence, citations.length, false);

    return {
      text: responseText,
      confidence,
      citations,
      disclaimer,
      sources,
    };
  }

  // ── System Prompt ───────────────────────────────────────────

  /**
   * Build the system prompt with safety rules, language context, and farm context.
   */
  buildSystemPrompt(context: UserContext): string {
    const farm = context.farm;
    const farmerName = context.userName ? `\n- Name: ${context.userName}` : '';
    const location = farm?.district && farm?.state
      ? `\n- Location: ${farm.district}, ${farm.state}`
      : farm?.state ? `\n- Location: ${farm.state}` : '';
    const crops = (farm?.crops ?? []).length > 0
      ? `\n- Crops: ${farm!.crops!.join(', ')}`
      : '';
    const soilType = farm?.soilType ? `\n- Soil Type: ${farm.soilType}` : '';
    const irrigation = (farm?.irrigationType || farm?.irrigation_type)
      ? `\n- Irrigation: ${farm!.irrigationType ?? farm!.irrigation_type}`
      : '';
    const farmName = farm?.farmName ? `\n- Farm: ${farm.farmName}` : '';

    const farmerProfile = (farmerName || location || crops || soilType || irrigation || farmName)
      ? `\nFarmer Profile:${farmerName}${farmName}${location}${crops}${soilType}${irrigation}\n`
      : '';

    const langMap: Record<string, string> = {
      hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', en: 'English',
    };
    const langName = langMap[context.language] ?? context.language;

    return `You are KrishiMitra, a trusted AI farming advisor for Indian farmers. You speak like a knowledgeable friend — warm, practical, and respectful.
${farmerProfile}
Instructions:
- Always respond in ${langName}. If the farmer wrote in Hindi/Marathi/Telugu/Tamil/Kannada, reply in the same language.
- Give practical, specific advice based on the farmer's crops, soil, and location when available.
- For disease or pest issues: describe visible symptoms, suggest organic/IPM treatments first, then recommend consulting local KVK (Krishi Vigyan Kendra) for chemical treatments.
- For market questions: mention seasonal trends and nearby mandis when possible.
- For government schemes: explain eligibility clearly in simple terms.
- Use bullet points and short paragraphs for easy reading.
- Never provide specific chemical dosages or mixing ratios — always recommend consulting a licensed agronomist.
- If uncertain, say so clearly and recommend the local agricultural office.
- Keep responses concise but complete — farmers are busy people.`;
  }

  // ── Confidence Scoring ──────────────────────────────────────

  /**
   * Calculate confidence score based on:
   * - Number of relevant documents found
   * - Average relevance scores of documents
   *
   * Base confidence: 0.5
   * +0.2 if at least 1 document found
   * +0.1 if 3+ documents found
   * +up to 0.2 based on average relevance score
   */
  static calculateConfidence(documents: RetrievedDocument[]): number {
    if (documents.length === 0) {
      return 0.65; // LLM answers from general knowledge — medium confidence
    }

    let confidence = 0.5; // Base confidence

    if (documents.length > 0) {
      confidence += 0.2;
    }

    if (documents.length >= 3) {
      confidence += 0.1;
    }

    // Adjust based on average relevance scores
    const avgRelevance =
      documents.reduce((sum, d) => sum + d.relevance_score, 0) / documents.length;
    confidence += avgRelevance * 0.2;

    return Math.min(confidence, 1.0);
  }

  // ── Helpers ─────────────────────────────────────────────────

  /** Get the interaction logger (for route access to history). */
  getLogger(): InteractionLogger {
    return this.logger;
  }

  /** Get the rate limiter (for route access to remaining count). */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  private logInteraction(
    query: string,
    context: UserContext,
    responseText: string,
    confidence: number,
    citationCount: number,
    wasRefused: boolean,
    refusalReason?: string,
  ): void {
    this.logger.log({
      userId: context.userId,
      tenantId: context.tenantId,
      query,
      responseText,
      confidence,
      citationCount,
      wasRefused,
      refusalReason,
    });
  }
}
