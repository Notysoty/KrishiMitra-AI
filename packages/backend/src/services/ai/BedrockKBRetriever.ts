/**
 * Bedrock Knowledge Base retriever for KrishiMitra.
 *
 * When BEDROCK_KB_ID is set, supplements the pgvector RAG with results
 * retrieved directly from the Bedrock KB (which contains agricultural docs
 * uploaded to S3: PM-KISAN, PMFBY, KCC, crop guides, IPM guidelines).
 *
 * Used by AIAssistant when the Bedrock Agent path is not active.
 * Requirements: T4-5 (KB agricultural document ingestion)
 */

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import type { RetrievedDocument } from './RAGSystem';

export function isKBConfigured(): boolean {
  return !!process.env.BEDROCK_KB_ID;
}

export class BedrockKBRetriever {
  private client: BedrockAgentRuntimeClient;
  private knowledgeBaseId: string;

  constructor() {
    this.client = new BedrockAgentRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
    this.knowledgeBaseId = process.env.BEDROCK_KB_ID!;
  }

  async retrieve(query: string, topK = 5): Promise<RetrievedDocument[]> {
    try {
      const response = await this.client.send(
        new RetrieveCommand({
          knowledgeBaseId: this.knowledgeBaseId,
          retrievalQuery: { text: query },
          retrievalConfiguration: {
            vectorSearchConfiguration: { numberOfResults: topK },
          },
        })
      );

      const results: RetrievedDocument[] = [];
      for (const item of response.retrievalResults ?? []) {
        if (!item.content?.text) continue;
        const score = item.score ?? 0;
        if (score < 0.3) continue; // Filter low-relevance chunks

        const sourceUri = item.location?.s3Location?.uri ?? '';
        const filename = sourceUri.split('/').pop()?.replace('.txt', '') ?? 'knowledge-base';
        const title = filename.replace(/-/g, ' ').replace(/_/g, ' ');

        results.push({
          id: `kb-${results.length}`,
          article_id: `bedrock-kb-${this.knowledgeBaseId}`,
          title: this.formatTitle(title),
          content: item.content.text,
          source: 'Bedrock Knowledge Base',
          source_url: sourceUri,
          language: 'en',
          chunk_index: results.length,
          relevance_score: score,
        });
      }

      return results;
    } catch (err) {
      // Graceful degradation — KB may not be fully ingested yet
      return [];
    }
  }

  private formatTitle(filename: string): string {
    const map: Record<string, string> = {
      'pm kisan scheme': 'PM-KISAN Scheme',
      'pmfby crop insurance': 'PMFBY Crop Insurance',
      'kisan credit card': 'Kisan Credit Card',
      'wheat cultivation guide': 'Wheat Cultivation Guide',
      'tomato cultivation guide': 'Tomato Cultivation Guide',
      'rice cultivation guide': 'Rice Cultivation Guide',
      'icar ipm guidelines': 'ICAR IPM Guidelines',
    };
    return map[filename.toLowerCase()] ?? filename;
  }
}
