/**
 * AWS cloud speech provider for KrishiMitra-AI.
 *
 * Speech-to-Text: Amazon Transcribe Streaming
 *   - Streams the audio buffer in 32 KB chunks
 *   - Collects final (non-partial) transcript results
 *   - Supported: hi-IN, ta-IN, te-IN, kn-IN, en-IN
 *
 * Text-to-Speech: Amazon Polly
 *   - Neural engine for Hindi/English (Kajal voice)
 *   - Standard engine fallback for Tamil, Telugu, Kannada (no native Polly voices)
 *   - Output: MP3 audio as Buffer
 *
 * Enabled when SPEECH_ENABLED=true. Falls back to MockCloudSpeechProvider otherwise.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
  LanguageCode,
  MediaEncoding,
} from '@aws-sdk/client-transcribe-streaming';
import {
  PollyClient,
  SynthesizeSpeechCommand,
  OutputFormat,
  Engine,
  VoiceId,
} from '@aws-sdk/client-polly';
import { CloudSpeechProvider, AudioEncoding } from '../../types/speech';

// ── Voice mapping (Polly) ───────────────────────────────────────

/**
 * Polly voice and engine per BCP-47 language code.
 * Hindi/English: Kajal (Neural, bilingual en-IN/hi-IN).
 * Tamil/Telugu/Kannada: Raveena (Standard, en-IN) — Polly has no native voices yet.
 */
const POLLY_VOICE_MAP: Record<string, { voiceId: VoiceId; engine: Engine; pollyLanguageCode?: string }> = {
  'hi-IN': { voiceId: VoiceId.Kajal, engine: Engine.NEURAL, pollyLanguageCode: 'hi-IN' },
  'en-IN': { voiceId: VoiceId.Kajal, engine: Engine.NEURAL, pollyLanguageCode: 'en-IN' },
  'ta-IN': { voiceId: VoiceId.Raveena, engine: Engine.STANDARD },
  'te-IN': { voiceId: VoiceId.Raveena, engine: Engine.STANDARD },
  'kn-IN': { voiceId: VoiceId.Raveena, engine: Engine.STANDARD },
};

// ── Transcribe encoding map ─────────────────────────────────────

const TRANSCRIBE_ENCODING_MAP: Record<string, MediaEncoding> = {
  wav: MediaEncoding.PCM,
  mp3: MediaEncoding.OGG_OPUS,   // mp3 not directly supported; ogg is closest for streaming
  ogg: MediaEncoding.OGG_OPUS,
  webm: MediaEncoding.OGG_OPUS,
  flac: MediaEncoding.FLAC,
};

const CHUNK_SIZE = 32 * 1024; // 32 KB

// ── Audio stream generator ──────────────────────────────────────

async function* bufferToAudioStream(
  audio: Buffer,
): AsyncIterable<AudioStream.AudioEventMember> {
  for (let offset = 0; offset < audio.length; offset += CHUNK_SIZE) {
    yield {
      AudioEvent: {
        AudioChunk: audio.subarray(offset, offset + CHUNK_SIZE),
      },
    };
  }
}

// ── AwsCloudSpeechProvider ──────────────────────────────────────

export class AwsCloudSpeechProvider implements CloudSpeechProvider {
  private transcribeClient: TranscribeStreamingClient;
  private pollyClient: PollyClient;

  constructor() {
    const region = process.env.AWS_REGION ?? 'ap-south-1';
    // Uses AWS SDK default credential chain: ECS task role → env vars → ~/.aws/credentials
    this.transcribeClient = new TranscribeStreamingClient({ region });
    this.pollyClient = new PollyClient({ region });
  }

  // ── Speech-to-Text ──────────────────────────────────────────

  async recognize(
    audio: Buffer,
    languageCode: string,
    encoding: AudioEncoding,
    sampleRateHertz: number,
  ): Promise<{ transcript: string; confidence: number }> {
    const mediaEncoding =
      TRANSCRIBE_ENCODING_MAP[encoding] ?? MediaEncoding.PCM;

    const command = new StartStreamTranscriptionCommand({
      LanguageCode: languageCode as LanguageCode,
      MediaSampleRateHertz: sampleRateHertz,
      MediaEncoding: mediaEncoding,
      AudioStream: bufferToAudioStream(audio),
    });

    const response = await this.transcribeClient.send(command);

    let transcript = '';
    let resultCount = 0;

    if (response.TranscriptResultStream) {
      for await (const event of response.TranscriptResultStream) {
        const results = event.TranscriptEvent?.Transcript?.Results ?? [];
        for (const result of results) {
          // Only collect final (non-partial) results
          if (!result.IsPartial) {
            const text = result.Alternatives?.[0]?.Transcript ?? '';
            if (text) {
              transcript += (transcript ? ' ' : '') + text;
              resultCount++;
            }
          }
        }
      }
    }

    // Transcribe doesn't return a confidence score per result in streaming mode.
    // Use a heuristic: if we got results, confidence is high; otherwise low.
    const confidence = resultCount > 0 ? 0.9 : 0.0;

    return { transcript: transcript.trim(), confidence };
  }

  // ── Text-to-Speech ──────────────────────────────────────────

  async synthesize(
    text: string,
    languageCode: string,
  ): Promise<{ audio: Buffer; durationMs: number }> {
    const voiceConfig = POLLY_VOICE_MAP[languageCode] ?? {
      voiceId: VoiceId.Raveena,
      engine: Engine.STANDARD,
    };

    const command = new SynthesizeSpeechCommand({
      Text: text,
      ...(voiceConfig.pollyLanguageCode ? { LanguageCode: voiceConfig.pollyLanguageCode as 'hi-IN' | 'en-IN' } : {}),
      OutputFormat: OutputFormat.MP3,
      VoiceId: voiceConfig.voiceId,
      Engine: voiceConfig.engine,
    });

    const response = await this.pollyClient.send(command);

    if (!response.AudioStream) {
      throw new Error('Polly returned no audio stream');
    }

    // Collect stream into Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.AudioStream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const audio = Buffer.concat(chunks);

    // Estimate duration: MP3 at 24 kbps ≈ 3000 bytes/sec
    const durationMs = Math.max(500, (audio.length / 3000) * 1000);

    return { audio, durationMs };
  }
}

// ── Factory ─────────────────────────────────────────────────────

/**
 * Returns AwsCloudSpeechProvider when SPEECH_ENABLED=true,
 * otherwise the MockCloudSpeechProvider (imported by SpeechService).
 */
export function isSpeechConfigured(): boolean {
  return process.env.SPEECH_ENABLED === 'true';
}
