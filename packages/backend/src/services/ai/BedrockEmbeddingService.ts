/**
 * Bedrock embedding service supporting:
 *   - Cohere Embed Multilingual v3  (cohere.embed-multilingual-v3)  — default
 *   - Amazon Titan Embeddings v2    (amazon.titan-embed-text-v2:0)
 *
 * Both models produce 1024-dimension vectors.
 * Cohere requires an `input_type` field distinguishing indexing vs querying.
 * Enabled when BEDROCK_ENABLED=true; falls back to MockEmbeddingService otherwise.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { EmbeddingService } from './RAGSystem';

const DEFAULT_EMBEDDING_MODEL = 'cohere.embed-multilingual-v3';
const EMBEDDING_DIMENSIONS = 1024;

export class BedrockEmbeddingService implements EmbeddingService {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
    this.modelId = process.env.BEDROCK_EMBEDDING_MODEL_ID ?? DEFAULT_EMBEDDING_MODEL;
  }

  async embed(text: string, inputType: 'search_document' | 'search_query' = 'search_query'): Promise<number[]> {
    const isCohere = this.modelId.startsWith('cohere.');

    const body = isCohere
      ? JSON.stringify({ texts: [text], input_type: inputType })
      : JSON.stringify({ inputText: text, dimensions: EMBEDDING_DIMENSIONS });

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(body),
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as
      | { embeddings: number[][] }   // Cohere
      | { embedding: number[] };     // Titan

    if ('embeddings' in responseBody) {
      return responseBody.embeddings[0];
    }
    return responseBody.embedding;
  }
}
