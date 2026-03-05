/**
 * Type definitions for Speech-to-Text and Text-to-Speech services.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

/** Supported MVP languages for voice interaction */
export type SupportedLanguage = 'hi' | 'ta' | 'te' | 'kn' | 'en';

/** BCP-47 language codes for cloud speech APIs */
export const LANGUAGE_CODES: Record<SupportedLanguage, string> = {
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  en: 'en-IN',
};

/** Human-readable language names */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  en: 'English',
};

/** Audio encoding formats */
export type AudioEncoding = 'wav' | 'mp3' | 'ogg' | 'webm' | 'flac';

/** Speech-to-text request */
export interface SpeechToTextRequest {
  audio: Buffer;
  language: SupportedLanguage;
  encoding?: AudioEncoding;
  sampleRateHertz?: number;
  /** Whether to compress audio before sending to cloud API */
  compress?: boolean;
}

/** Speech-to-text result */
export interface SpeechToTextResult {
  text: string;
  confidence: number;
  language: SupportedLanguage;
  /** Detected voice command, if any */
  voiceCommand?: VoiceCommand;
  /** Whether noise was detected that degraded quality */
  noiseDetected: boolean;
  /** Suggestion for the user when quality is poor */
  qualitySuggestion?: string;
}

/** Text-to-speech request */
export interface TextToSpeechRequest {
  text: string;
  language: SupportedLanguage;
  /** Whether to compress output audio for low bandwidth */
  compress?: boolean;
}

/** Text-to-speech result */
export interface TextToSpeechResult {
  audio: Buffer;
  encoding: AudioEncoding;
  durationMs: number;
  language: SupportedLanguage;
}

/** Recognized voice commands */
export type VoiceCommandAction = 'check_prices' | 'weather_forecast' | 'my_alerts';

export interface VoiceCommand {
  action: VoiceCommandAction;
  /** Original text that matched the command */
  matchedText: string;
  /** Confidence of the command match */
  confidence: number;
}

/** Fallback state tracking for speech-to-text attempts */
export interface SpeechAttemptTracker {
  userId: string;
  failedAttempts: number;
  shouldFallbackToText: boolean;
  lastAttemptAt: Date;
}

/** Cloud speech provider interface — abstraction for testability */
export interface CloudSpeechProvider {
  recognize(
    audio: Buffer,
    languageCode: string,
    encoding: AudioEncoding,
    sampleRateHertz: number,
  ): Promise<{ transcript: string; confidence: number }>;

  synthesize(
    text: string,
    languageCode: string,
  ): Promise<{ audio: Buffer; durationMs: number }>;
}
