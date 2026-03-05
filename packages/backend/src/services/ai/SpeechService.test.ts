import {
  SpeechService,
  MockCloudSpeechProvider,
  SpeechError,
} from './SpeechService';
import { VoiceCommandParser } from './VoiceCommandParser';
import {
  CloudSpeechProvider,
  AudioEncoding,
  SupportedLanguage,
} from '../../types/speech';

// ── Helpers ─────────────────────────────────────────────────────

function makeAudio(size = 50_000): Buffer {
  return Buffer.alloc(size, 0xab);
}

/** Stub provider that returns configurable results */
class StubSpeechProvider implements CloudSpeechProvider {
  recognizeResult = { transcript: 'hello world', confidence: 0.92 };
  synthesizeResult = { audio: Buffer.alloc(1000, 0xcc), durationMs: 2000 };
  recognizeCalls: Array<{ audio: Buffer; languageCode: string }> = [];
  synthesizeCalls: Array<{ text: string; languageCode: string }> = [];

  async recognize(
    audio: Buffer,
    languageCode: string,
    _encoding: AudioEncoding,
    _sampleRateHertz: number,
  ) {
    this.recognizeCalls.push({ audio, languageCode });
    return this.recognizeResult;
  }

  async synthesize(text: string, languageCode: string) {
    this.synthesizeCalls.push({ text, languageCode });
    return this.synthesizeResult;
  }
}

// ── SpeechService.speechToText ──────────────────────────────────

describe('SpeechService.speechToText', () => {
  let service: SpeechService;
  let provider: StubSpeechProvider;

  beforeEach(() => {
    provider = new StubSpeechProvider();
    service = new SpeechService(provider, new VoiceCommandParser());
  });

  it('should convert speech to text successfully', async () => {
    const result = await service.speechToText(
      { audio: makeAudio(), language: 'en' },
      'user-1',
    );

    expect(result.text).toBe('hello world');
    expect(result.confidence).toBe(0.92);
    expect(result.language).toBe('en');
    expect(result.noiseDetected).toBe(false);
  });

  it('should support all 5 MVP languages', async () => {
    const languages: SupportedLanguage[] = ['hi', 'ta', 'te', 'kn', 'en'];
    for (const lang of languages) {
      const result = await service.speechToText(
        { audio: makeAudio(), language: lang },
        `user-${lang}`,
      );
      expect(result.language).toBe(lang);
    }
    // Verify correct BCP-47 codes were sent to provider
    expect(provider.recognizeCalls.map((c) => c.languageCode)).toEqual([
      'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'en-IN',
    ]);
  });

  it('should reject unsupported language', async () => {
    await expect(
      service.speechToText({ audio: makeAudio(), language: 'fr' as SupportedLanguage }, 'u1'),
    ).rejects.toThrow(SpeechError);
    await expect(
      service.speechToText({ audio: makeAudio(), language: 'fr' as SupportedLanguage }, 'u1'),
    ).rejects.toThrow('Unsupported language');
  });

  it('should reject empty audio', async () => {
    await expect(
      service.speechToText({ audio: Buffer.alloc(0), language: 'en' }, 'u1'),
    ).rejects.toThrow('empty');
  });

  it('should reject audio exceeding max size', async () => {
    const bigAudio = Buffer.alloc(11 * 1024 * 1024);
    await expect(
      service.speechToText({ audio: bigAudio, language: 'en' }, 'u1'),
    ).rejects.toThrow('exceeds maximum');
  });

  it('should detect noise when confidence is low', async () => {
    provider.recognizeResult = { transcript: 'noisy', confidence: 0.3 };
    const result = await service.speechToText(
      { audio: makeAudio(), language: 'en' },
      'user-noisy',
    );
    expect(result.noiseDetected).toBe(true);
    expect(result.qualitySuggestion).toContain('quieter environment');
  });

  it('should fallback to text after 2 failed attempts', async () => {
    provider.recognizeResult = { transcript: '', confidence: 0.2 };

    // First failed attempt
    await service.speechToText({ audio: makeAudio(), language: 'en' }, 'user-fail');
    // Second failed attempt
    await service.speechToText({ audio: makeAudio(), language: 'en' }, 'user-fail');

    // Third attempt should throw fallback error
    await expect(
      service.speechToText({ audio: makeAudio(), language: 'en' }, 'user-fail'),
    ).rejects.toThrow('text input');

    const tracker = service.getTracker('user-fail');
    expect(tracker.shouldFallbackToText).toBe(true);
    expect(tracker.failedAttempts).toBe(2);
  });

  it('should reset failed attempts on successful recognition', async () => {
    provider.recognizeResult = { transcript: '', confidence: 0.2 };
    await service.speechToText({ audio: makeAudio(), language: 'en' }, 'user-reset');

    // Now succeed
    provider.recognizeResult = { transcript: 'success', confidence: 0.95 };
    await service.speechToText({ audio: makeAudio(), language: 'en' }, 'user-reset');

    const tracker = service.getTracker('user-reset');
    expect(tracker.failedAttempts).toBe(0);
    expect(tracker.shouldFallbackToText).toBe(false);
  });

  it('should compress audio when requested', async () => {
    const largeAudio = Buffer.alloc(600_000, 0xab);
    await service.speechToText(
      { audio: largeAudio, language: 'en', compress: true },
      'user-compress',
    );
    // Provider should receive compressed (smaller) audio
    const sentAudio = provider.recognizeCalls[0].audio;
    expect(sentAudio.length).toBeLessThan(largeAudio.length);
  });

  it('should auto-compress audio above threshold', async () => {
    const largeAudio = Buffer.alloc(600_000, 0xab);
    await service.speechToText(
      { audio: largeAudio, language: 'en' },
      'user-auto-compress',
    );
    const sentAudio = provider.recognizeCalls[0].audio;
    expect(sentAudio.length).toBeLessThan(largeAudio.length);
  });

  it('should parse voice commands from recognized text', async () => {
    provider.recognizeResult = { transcript: 'check prices', confidence: 0.95 };
    const result = await service.speechToText(
      { audio: makeAudio(), language: 'en' },
      'user-cmd',
    );
    expect(result.voiceCommand).toBeDefined();
    expect(result.voiceCommand!.action).toBe('check_prices');
  });

  it('should parse Hindi voice commands', async () => {
    provider.recognizeResult = { transcript: 'मौसम कैसा है', confidence: 0.9 };
    const result = await service.speechToText(
      { audio: makeAudio(), language: 'hi' },
      'user-hi-cmd',
    );
    expect(result.voiceCommand).toBeDefined();
    expect(result.voiceCommand!.action).toBe('weather_forecast');
  });
});

// ── SpeechService.textToSpeech ──────────────────────────────────

describe('SpeechService.textToSpeech', () => {
  let service: SpeechService;
  let provider: StubSpeechProvider;

  beforeEach(() => {
    provider = new StubSpeechProvider();
    service = new SpeechService(provider, new VoiceCommandParser());
  });

  it('should convert text to speech successfully', async () => {
    const result = await service.textToSpeech({
      text: 'Hello farmer',
      language: 'en',
    });
    expect(result.audio).toBeInstanceOf(Buffer);
    expect(result.audio.length).toBeGreaterThan(0);
    expect(result.durationMs).toBe(2000);
    expect(result.language).toBe('en');
    expect(result.encoding).toBe('mp3');
  });

  it('should support all 5 MVP languages', async () => {
    const languages: SupportedLanguage[] = ['hi', 'ta', 'te', 'kn', 'en'];
    for (const lang of languages) {
      const result = await service.textToSpeech({ text: 'test', language: lang });
      expect(result.language).toBe(lang);
    }
  });

  it('should reject unsupported language', async () => {
    await expect(
      service.textToSpeech({ text: 'test', language: 'fr' as SupportedLanguage }),
    ).rejects.toThrow('Unsupported language');
  });

  it('should reject empty text', async () => {
    await expect(
      service.textToSpeech({ text: '', language: 'en' }),
    ).rejects.toThrow('Text is required');
  });

  it('should reject whitespace-only text', async () => {
    await expect(
      service.textToSpeech({ text: '   ', language: 'en' }),
    ).rejects.toThrow('Text is required');
  });

  it('should compress output when requested', async () => {
    provider.synthesizeResult = {
      audio: Buffer.alloc(600_000, 0xcc),
      durationMs: 5000,
    };
    const result = await service.textToSpeech({
      text: 'Hello',
      language: 'en',
      compress: true,
    });
    expect(result.audio.length).toBeLessThan(600_000);
    expect(result.encoding).toBe('ogg');
  });

  it('should pass correct language code to provider', async () => {
    await service.textToSpeech({ text: 'test', language: 'ta' });
    expect(provider.synthesizeCalls[0].languageCode).toBe('ta-IN');
  });
});

// ── SpeechService.compressAudio ─────────────────────────────────

describe('SpeechService.compressAudio', () => {
  it('should not compress audio below threshold', () => {
    const small = Buffer.alloc(100, 0xab);
    const result = SpeechService.compressAudio(small);
    expect(result.length).toBe(small.length);
  });

  it('should compress audio above threshold', () => {
    const large = Buffer.alloc(600_000, 0xab);
    const result = SpeechService.compressAudio(large);
    expect(result.length).toBeLessThan(large.length);
    expect(result.length).toBe(300_000);
  });
});

// ── SpeechService.isSupportedLanguage ───────────────────────────

describe('SpeechService.isSupportedLanguage', () => {
  it('should return true for supported languages', () => {
    expect(SpeechService.isSupportedLanguage('hi')).toBe(true);
    expect(SpeechService.isSupportedLanguage('ta')).toBe(true);
    expect(SpeechService.isSupportedLanguage('te')).toBe(true);
    expect(SpeechService.isSupportedLanguage('kn')).toBe(true);
    expect(SpeechService.isSupportedLanguage('en')).toBe(true);
  });

  it('should return false for unsupported languages', () => {
    expect(SpeechService.isSupportedLanguage('fr')).toBe(false);
    expect(SpeechService.isSupportedLanguage('de')).toBe(false);
    expect(SpeechService.isSupportedLanguage('')).toBe(false);
  });
});

// ── SpeechService.resetTracker ──────────────────────────────────

describe('SpeechService.resetTracker', () => {
  it('should reset the tracker for a user', async () => {
    const provider = new StubSpeechProvider();
    provider.recognizeResult = { transcript: '', confidence: 0.1 };
    const service = new SpeechService(provider);

    // Fail twice
    await service.speechToText({ audio: makeAudio(), language: 'en' }, 'user-r');
    await service.speechToText({ audio: makeAudio(), language: 'en' }, 'user-r');

    expect(service.getTracker('user-r').shouldFallbackToText).toBe(true);

    // Reset
    service.resetTracker('user-r');
    const tracker = service.getTracker('user-r');
    expect(tracker.failedAttempts).toBe(0);
    expect(tracker.shouldFallbackToText).toBe(false);
  });
});

// ── MockCloudSpeechProvider ─────────────────────────────────────

describe('MockCloudSpeechProvider', () => {
  const provider = new MockCloudSpeechProvider();

  it('should return low confidence for very small audio', async () => {
    const result = await provider.recognize(Buffer.alloc(500), 'en-IN', 'wav', 16000);
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.transcript).toBe('');
  });

  it('should return reasonable confidence for normal audio', async () => {
    const result = await provider.recognize(Buffer.alloc(50_000), 'hi-IN', 'wav', 16000);
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.transcript).toContain('hi');
  });

  it('should synthesize audio with duration based on text length', async () => {
    const result = await provider.synthesize('Short text', 'en-IN');
    expect(result.audio.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);
  });
});
