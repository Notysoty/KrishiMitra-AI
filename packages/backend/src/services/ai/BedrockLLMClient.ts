import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { LLMClient, LLMGenerateParams, LLMResult } from './AIAssistant';

const DEFAULT_MODEL_ID = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
const MAX_TOKENS = 2048;

export class BedrockLLMClient implements LLMClient {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor(modelId?: string) {
    this.modelId = modelId ?? process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID;
    // Uses AWS SDK default credential chain: ECS task role → env vars → ~/.aws/credentials
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
  }

  async generate(params: LLMGenerateParams): Promise<LLMResult> {
    const docContext = params.documents.length > 0
      ? params.documents.map((d, i) =>
          `[Document ${i + 1}: ${d.title}]\n${d.content}`
        ).join('\n\n')
      : '';

    const finalUserContent = docContext
      ? `Context from knowledge base:\n${docContext}\n\nUser question: ${params.query}`
      : params.query;

    // Build multi-turn messages: history + current query
    const history = params.history ?? [];
    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: finalUserContent },
    ];

    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: MAX_TOKENS,
      system: params.systemPrompt,
      messages,
    });

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(body),
    });

    try {
      const response = await this.client.send(command);
      const rawBody = new TextDecoder().decode(response.body);

      let responseBody: Record<string, unknown>;
      try {
        responseBody = JSON.parse(rawBody);
      } catch {
        console.error('Bedrock returned non-JSON response');
        throw new Error('Invalid response format from Bedrock');
      }

      const text = (responseBody.content as Array<{ type: string; text?: string }>)
        ?.map((block) => block.type === 'text' ? block.text : '')
        .join('')
        .trim();

      if (!text) {
        throw new Error('Empty response from Bedrock');
      }

      return { text };
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown Bedrock error';
      console.error(`Bedrock LLM call failed: ${message}`);
      throw err;
    }
  }
}

export class BedrockMultimodalClient {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor(modelId?: string) {
    this.modelId = modelId ?? process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID;
    // Uses AWS SDK default credential chain: ECS task role → env vars → ~/.aws/credentials
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
  }

  async classifyImage(imageBase64: string, mediaType: string, cropType: string): Promise<string> {
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `You are an expert agricultural plant pathologist. Analyze this crop image (crop type: ${cropType}) for any diseases, pests, or health issues.

Respond ONLY with valid JSON in this exact format:
{
  "disease": "disease_identifier_snake_case",
  "disease_label": "Human Readable Disease Name",
  "confidence": 0.85,
  "message": "Brief description of the diagnosis",
  "recommendations": [
    {"type": "organic", "title": "Recommendation title", "description": "Details", "priority": 1},
    {"type": "cultural", "title": "Recommendation title", "description": "Details", "priority": 2},
    {"type": "chemical", "title": "Recommendation title", "description": "Details - consult agronomist for dosage", "priority": 3}
  ],
  "alternative_diagnoses": [
    {"disease": "alternative_disease", "confidence": 0.15}
  ]
}

Rules:
- confidence should be between 0.0 and 1.0
- If the image does not show a plant or crop, set disease to "not_a_plant" with confidence 0.0
- If you cannot identify the disease clearly, set disease to "unknown" with low confidence
- For chemical recommendations, NEVER provide specific dosages or mixing ratios - always advise consulting an agronomist
- recommendation type must be one of: "organic", "cultural", "chemical"
- priority: 1 = highest priority`,
            },
          ],
        },
      ],
    });

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(body),
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    const text = responseBody.content
      ?.map((block: { type: string; text?: string }) =>
        block.type === 'text' ? block.text : ''
      )
      .join('')
      .trim();

    if (!text) {
      throw new Error('Empty response from Bedrock multimodal');
    }

    return text;
  }
}

/**
 * Returns true when Bedrock is explicitly enabled.
 * Set BEDROCK_ENABLED=true in production (ECS task uses IAM role credentials automatically).
 * In local dev, also ensure AWS_REGION and ~/.aws/credentials or env vars are set.
 */
export function isBedrockConfigured(): boolean {
  return process.env.BEDROCK_ENABLED === 'true';
}
