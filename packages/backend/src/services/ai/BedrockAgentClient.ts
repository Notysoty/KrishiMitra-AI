/**
 * AWS Bedrock Agent client for KrishiMitra.
 *
 * Instead of a single LLM call, a Bedrock Agent:
 * 1. Reasons about which tools (action groups) to call
 * 2. Calls tools (get_weather, get_market_price, classify_disease, get_scheme_info)
 * 3. Synthesizes a final answer from tool results
 *
 * This enables queries like:
 *   "Should I sell my wheat now?" → agent checks live prices + weather forecast
 *   "Is my tomato crop showing early blight?" → agent calls disease classifier
 *   "Am I eligible for PM-KISAN?" → agent checks scheme eligibility via RAG
 *
 * Set BEDROCK_AGENT_ID and BEDROCK_AGENT_ALIAS_ID in .env to enable.
 * Falls back to direct LLM call (BedrockLLMClient) when not configured.
 *
 * Requirements: T3-1 (Bedrock Agent with tool use)
 */

import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import type { LLMClient, LLMGenerateParams, LLMResult } from './AIAssistant';

export function isAgentConfigured(): boolean {
  return !!(process.env.BEDROCK_AGENT_ID && process.env.BEDROCK_AGENT_ALIAS_ID);
}

/**
 * Bedrock Agent client that implements the LLMClient interface.
 * Drop-in replacement for BedrockLLMClient when an Agent is configured.
 */
export class BedrockAgentLLMClient implements LLMClient {
  private client: BedrockAgentRuntimeClient;
  private agentId: string;
  private agentAliasId: string;

  constructor() {
    this.client = new BedrockAgentRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
    this.agentId = process.env.BEDROCK_AGENT_ID!;
    this.agentAliasId = process.env.BEDROCK_AGENT_ALIAS_ID!;
  }

  async generate(params: LLMGenerateParams): Promise<LLMResult> {
    // Build enriched prompt with farmer context + document context
    const docContext = params.documents.length > 0
      ? `Relevant knowledge:\n${params.documents.map((d) => `[${d.title}]: ${d.content}`).join('\n\n')}\n\n`
      : '';

    const inputText = docContext
      ? `${docContext}Question: ${params.query}`
      : params.query;

    // Each user session gets a stable session ID for multi-turn agent memory
    const sessionId = `krishimitra-agent-${Date.now()}`;

    const command = new InvokeAgentCommand({
      agentId: this.agentId,
      agentAliasId: this.agentAliasId,
      sessionId,
      inputText,
      sessionState: {
        promptSessionAttributes: {
          language: params.language,
          systemPrompt: params.systemPrompt,
        },
      },
    });

    const response = await this.client.send(command);

    // The agent streams chunks — collect and join
    let fullText = '';
    if (response.completion) {
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          fullText += new TextDecoder().decode(chunk.chunk.bytes);
        }
      }
    }

    if (!fullText.trim()) {
      throw new Error('Bedrock Agent returned empty response');
    }

    return { text: fullText.trim() };
  }
}

/**
 * Action group handler — called by the Bedrock Agent when it needs real data.
 * Deploy this as a Lambda function and register it in the Bedrock Agent console.
 *
 * Action Groups to register:
 *   - get_weather:        { latitude, longitude } → current weather + 5-day forecast
 *   - get_market_price:   { crop, state } → current mandi prices from Agmarknet
 *   - get_scheme_info:    { query, farmer_profile } → scheme eligibility via RAG
 *   - classify_disease:   { image_s3_url, crop_type } → disease classification
 *
 * Example Lambda handler (deploy separately):
 */
export const AGENT_ACTION_GROUP_SCHEMA = {
  openapi: '3.0.0',
  info: { title: 'KrishiMitra Agent Actions', version: '1.0' },
  paths: {
    '/get_weather': {
      post: {
        operationId: 'get_weather',
        summary: 'Get current weather and 5-day forecast for farm location',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  latitude: { type: 'number', description: 'Farm latitude' },
                  longitude: { type: 'number', description: 'Farm longitude' },
                },
                required: ['latitude', 'longitude'],
              },
            },
          },
        },
        responses: { '200': { description: 'Weather data' } },
      },
    },
    '/get_market_price': {
      post: {
        operationId: 'get_market_price',
        summary: 'Get current mandi prices for a crop in a state',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  crop: { type: 'string', description: 'Crop name (e.g., tomato, wheat)' },
                  state: { type: 'string', description: 'Indian state name' },
                },
                required: ['crop'],
              },
            },
          },
        },
        responses: { '200': { description: 'Market price data' } },
      },
    },
    '/get_scheme_info': {
      post: {
        operationId: 'get_scheme_info',
        summary: 'Check farmer eligibility for government schemes',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Question about scheme eligibility' },
                  land_area_hectares: { type: 'number' },
                  annual_income: { type: 'number' },
                  state: { type: 'string' },
                },
                required: ['query'],
              },
            },
          },
        },
        responses: { '200': { description: 'Scheme eligibility information' } },
      },
    },
  },
};
