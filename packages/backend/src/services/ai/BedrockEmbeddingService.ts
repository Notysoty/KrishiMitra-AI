/**
 * Bedrock Titan Embeddings v2 implementation of EmbeddingService.
 *
 * Uses `amazon.titan-embed-text-v2:0` which produces 1024-dimension vectors.
 * Enabled when BEDROCK_ENABLED=true; falls back to MockEmbeddingService otherwise.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { EmbeddingService } from './RAGSystem';

const DEFAULT_EMBEDDING_MODEL = 'amazon.titan-embed-text-v2:0';
const EMBEDDING_DIMENSIONS = 1024;

export class BedrockEmbeddingService implements EmbeddingService {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    // Uses AWS SDK default credential chain: ECS task role → env vars → ~/.aws/credentials
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
    this.modelId =
      process.env.BEDROCK_EMBEDDING_MODEL_ID ?? DEFAULT_EMBEDDING_MODEL;
  }

  async embed(text: string): Promise<number[]> {
    const body = JSON.stringify({
      inputText: text,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(body),
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as {
      embedding: number[];
    };

    return responseBody.embedding;
  }
}
