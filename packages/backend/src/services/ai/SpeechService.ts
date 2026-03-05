/**
 * SpeechService — Speech-to-Text and Text-to-Speech integration.
 *
 * Uses a CloudSpeechProvider abstraction so cloud APIs can be swapped
 * or mocked in tests. Includes voice command parsing, noise detection,
 * audio compression for low-bandwidth, and fallback tracking.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import {
  SupportedLanguage,
  LANGUAGE_CODES,
  AudioEncoding,
  SpeechToTextRequest,
  SpeechToTextResult,
  TextToSpeechRequest,
  TextToSpeechResult,
  CloudSpeechProvider,
  SpeechAttemptTracker,
} from '../../types/speech';
import { VoiceCommandParser } from './VoiceCommandParser';

// ── Constants ───────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS = 2;
const MIN_CONFIDENCE_THRESHOLD = 0.8;
const NOISE_CONFIDENCE_THRESHOLD = 0.5;
const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_ENCODING: AudioEncoding = 'wav';
const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const COMPRESSION_THRESHOLD_BYTES = 512 * 1024; // 512 KB

// ── Mock Cloud Speech Provider ──────────────────────────────────

/**
 * Mock provider for MVP / testing. Returns deterministic results
 * based on audio buffer content.
 */
export class MockCloudSpeechProvider implements CloudSpeechProvider {
  async recognize(
    audio: Buffer,
    languageCode: string,
    _encoding: AudioEncoding,
    _sampleRateHertz: number,
  ): Promise<{ transcript: string; confidence: number }> {
    // Simulate recognition based on buffer size
    const size = audio.length;
    if (size < 1000) {
      return { transcript: '', confidence: 0.2 };
    }
    const confidence = Math.min(0.95, 0.6 + (size / 100_000) * 0.35);
    const lang = languageCode.split('-')[0];
    return { transcript: `Mock transcript in ${lang}`, confidence };
  }

  async synthesize(
    text: string,
    _languageCode: string,
  ): Promise<{ audio: Buffer; durationMs: number }> {
    // Approximate: ~150 words per minute, ~5 chars per word
    const words = text.length / 5;
    const durationMs = Math.max(500, (words / 150) * 60_000);
    const audio = Buffer.alloc(Math.ceil(durationMs * 16), 0xaa);
    return { audio, durationMs };
  }
}

// ── SpeechService ───────────────────────────────────────────────

export class SpeechService {
  private provider: CloudSpeechProvider;
  private commandParser: VoiceCommandParser;
  private attemptTrackers = new Map<string, SpeechAttemptTracker>();

  constructor(
    provider: CloudSpeechProvider = new MockCloudSpeechProvider(),
    commandParser: VoiceCommandParser = new VoiceCommandParser(),
  ) {
    this.provider = provider;
    this.commandParser = commandParser;
  }

  // ── Speech-to-Text ──────────────────────────────────────────

  /**
   * Convert speech audio to text.
   * - Validates audio size and language
   * - Compresses audio if requested or above threshold
   * - Detects noise and suggests quieter environment
   * - Parses voice commands from recognized text
   * - Tracks failed attempts and triggers text fallback after 2 failures
   */
  async speechToText(
    request: SpeechToTextRequest,
    userId: string,
  ): Promise<SpeechToTextResult> {
    // Validate language
    if (!LANGUAGE_CODES[request.language]) {
      throw new SpeechError(
        `Unsupported language: ${request.language}. Supported: hi, ta, te, kn, en`,
        'UNSUPPORTED_LANGUAGE',
      );
    }

    // Validate audio size
    if (request.audio.length === 0) {
      throw new SpeechError('Audio data is empty', 'EMPTY_AUDIO');
    }
    if (request.audio.length > MAX_AUDIO_SIZE_BYTES) {
      throw new SpeechError(
        `Audio exceeds maximum size of ${MAX_AUDIO_SIZE_BYTES / (1024 * 1024)}MB`,
        'AUDIO_TOO_LARGE',
      );
    }

    // Check if user should fall back to text
    const tracker = this.getTracker(userId);
    if (tracker.shouldFallbackToText) {
      throw new SpeechError(
        'Speech recognition has failed multiple times. Please use text input instead.',
        'FALLBACK_TO_TEXT',
      );
    }

    // Compress audio for low-bandwidth if needed
    let audio = request.audio;
    if (request.compress || audio.length > COMPRESSION_THRESHOLD_BYTES) {
      audio = SpeechService.compressAudio(audio);
    }

    const encoding = request.encoding ?? DEFAULT_ENCODING;
    const sampleRate = request.sampleRateHertz ?? DEFAULT_SAMPLE_RATE;
    const languageCode = LANGUAGE_CODES[request.language];

    // Call cloud provider
    const result = await this.provider.recognize(audio, languageCode, encoding, sampleRate);

    // Detect noise / low quality
    const noiseDetected = result.confidence < NOISE_CONFIDENCE_THRESHOLD;
    const lowAccuracy = result.confidence < MIN_CONFIDENCE_THRESHOLD;

    // Track failed attempts
    if (!result.transcript || lowAccuracy) {
      tracker.failedAttempts++;
      tracker.lastAttemptAt = new Date();
      if (tracker.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        tracker.shouldFallbackToText = true;
      }
    } else {
      // Reset on success
      tracker.failedAttempts = 0;
      tracker.shouldFallbackToText = false;
    }

    // Parse voice commands
    const voiceCommand = result.transcript
      ? this.commandParser.parse(result.transcript, request.language)
      : undefined;

    const speechResult: SpeechToTextResult = {
      text: result.transcript,
      confidence: result.confidence,
      language: request.language,
      voiceCommand: voiceCommand ?? undefined,
      noiseDetected,
    };

    if (noiseDetected) {
      speechResult.qualitySuggestion =
        'Background noise detected. Please speak in a quieter environment for better results.';
    }

    return speechResult;
  }

  // ── Text-to-Speech ──────────────────────────────────────────

  /**
   * Convert text to speech audio.
   * - Validates language and text
   * - Compresses output audio if requested
   */
  async textToSpeech(request: TextToSpeechRequest): Promise<TextToSpeechResult> {
    if (!LANGUAGE_CODES[request.language]) {
      throw new SpeechError(
        `Unsupported language: ${request.language}. Supported: hi, ta, te, kn, en`,
        'UNSUPPORTED_LANGUAGE',
      );
    }

    if (!request.text || request.text.trim().length === 0) {
      throw new SpeechError('Text is required for speech synthesis', 'EMPTY_TEXT');
    }

    const languageCode = LANGUAGE_CODES[request.language];
    const result = await this.provider.synthesize(request.text, languageCode);

    let audio = result.audio;
    let encoding: AudioEncoding = 'mp3';

    if (request.compress) {
      audio = SpeechService.compressAudio(audio);
      encoding = 'ogg';
    }

    return {
      audio,
      encoding,
      durationMs: result.durationMs,
      language: request.language,
    };
  }

  // ── Attempt Tracking ────────────────────────────────────────

  /** Get the attempt tracker for a user, creating one if needed. */
  getTracker(userId: string): SpeechAttemptTracker {
    let tracker = this.attemptTrackers.get(userId);
    if (!tracker) {
      tracker = {
        userId,
        failedAttempts: 0,
        shouldFallbackToText: false,
        lastAttemptAt: new Date(),
      };
      this.attemptTrackers.set(userId, tracker);
    }
    return tracker;
  }

  /** Reset the attempt tracker for a user (e.g., when they switch to text and back). */
  resetTracker(userId: string): void {
    this.attemptTrackers.delete(userId);
  }

  // ── Audio Compression ───────────────────────────────────────

  /**
   * Compress audio data for low-bandwidth conditions.
   * MVP: simple downsampling simulation. Production: use ffmpeg or similar.
   */
  static compressAudio(audio: Buffer): Buffer {
    if (audio.length <= COMPRESSION_THRESHOLD_BYTES) {
      return audio;
    }
    // Simulate compression by taking every other byte (50% reduction)
    const compressed = Buffer.alloc(Math.ceil(audio.length / 2));
    for (let i = 0; i < compressed.length; i++) {
      compressed[i] = audio[i * 2] ?? 0;
    }
    return compressed;
  }

  /** Check if a language is supported */
  static isSupportedLanguage(lang: string): lang is SupportedLanguage {
    return ['hi', 'ta', 'te', 'kn', 'en'].includes(lang);
  }
}

// ── SpeechError ─────────────────────────────────────────────────

export type SpeechErrorCode =
  | 'UNSUPPORTED_LANGUAGE'
  | 'EMPTY_AUDIO'
  | 'AUDIO_TOO_LARGE'
  | 'EMPTY_TEXT'
  | 'FALLBACK_TO_TEXT'
  | 'PROVIDER_ERROR';

export class SpeechError extends Error {
  code: SpeechErrorCode;

  constructor(message: string, code: SpeechErrorCode) {
    super(message);
    this.name = 'SpeechError';
    this.code = code;
  }
}
