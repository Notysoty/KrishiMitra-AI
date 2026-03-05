/**
 * Speech API routes — POST /api/v1/ai/speech-to-text, POST /api/v1/ai/text-to-speech
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';
import { SpeechService, SpeechError } from '../services/ai/SpeechService';
import { SupportedLanguage } from '../types/speech';

const router = Router();
const speechService = new SpeechService();

// All speech routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/ai/speech-to-text
 *
 * Convert speech audio to text.
 * Accepts raw audio in the request body.
 *
 * Headers:
 *   Content-Type: audio/wav | audio/mp3 | audio/ogg | audio/webm | audio/flac
 *   X-Language: hi | ta | te | kn | en
 *   X-Compress: true (optional, for low-bandwidth)
 *
 * Returns: { text, confidence, language, voiceCommand?, noiseDetected, qualitySuggestion?, fallbackToText }
 */
router.post(
  '/speech-to-text',
  requirePermissions(Permission.AI_CHAT),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const language = (req.headers['x-language'] as string) || 'en';
      const compress = req.headers['x-compress'] === 'true';

      if (!SpeechService.isSupportedLanguage(language)) {
        res.status(400).json({
          error: `Unsupported language: ${language}. Supported: hi, ta, te, kn, en`,
        });
        return;
      }

      // Get raw audio from body
      const audioChunks: Buffer[] = [];
      // Express with raw body parser or JSON with base64
      let audio: Buffer;

      if (Buffer.isBuffer(req.body)) {
        audio = req.body;
      } else if (req.body?.audio && typeof req.body.audio === 'string') {
        audio = Buffer.from(req.body.audio, 'base64');
      } else {
        res.status(400).json({ error: 'Audio data is required. Send raw audio or { audio: "<base64>" }' });
        return;
      }

      if (audio.length === 0) {
        res.status(400).json({ error: 'Audio data is empty' });
        return;
      }

      // Determine encoding from content-type
      const contentType = req.headers['content-type'] || '';
      let encoding: 'wav' | 'mp3' | 'ogg' | 'webm' | 'flac' = 'wav';
      if (contentType.includes('mp3') || contentType.includes('mpeg')) encoding = 'mp3';
      else if (contentType.includes('ogg')) encoding = 'ogg';
      else if (contentType.includes('webm')) encoding = 'webm';
      else if (contentType.includes('flac')) encoding = 'flac';

      const result = await speechService.speechToText(
        {
          audio,
          language: language as SupportedLanguage,
          encoding,
          compress,
        },
        user.id,
      );

      const tracker = speechService.getTracker(user.id);

      res.json({
        ...result,
        fallbackToText: tracker.shouldFallbackToText,
        failedAttempts: tracker.failedAttempts,
      });
    } catch (err) {
      if (err instanceof SpeechError) {
        const status = err.code === 'FALLBACK_TO_TEXT' ? 422 : 400;
        res.status(status).json({
          error: err.message,
          code: err.code,
          fallbackToText: err.code === 'FALLBACK_TO_TEXT',
        });
        return;
      }
      console.error('Speech-to-text error:', err);
      res.status(500).json({ error: 'An error occurred during speech recognition.' });
    }
  },
);

/**
 * POST /api/v1/ai/text-to-speech
 *
 * Convert text to speech audio.
 *
 * Body: { text: string, language: "hi"|"ta"|"te"|"kn"|"en", compress?: boolean }
 *
 * Returns: audio buffer with appropriate content-type header
 */
router.post(
  '/text-to-speech',
  requirePermissions(Permission.AI_CHAT),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { text, language, compress } = req.body;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'text is required and must be a non-empty string.' });
        return;
      }

      const lang = language || 'en';
      if (!SpeechService.isSupportedLanguage(lang)) {
        res.status(400).json({
          error: `Unsupported language: ${lang}. Supported: hi, ta, te, kn, en`,
        });
        return;
      }

      const result = await speechService.textToSpeech({
        text: text.trim(),
        language: lang as SupportedLanguage,
        compress: compress === true,
      });

      const contentTypeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        ogg: 'audio/ogg',
        wav: 'audio/wav',
        webm: 'audio/webm',
        flac: 'audio/flac',
      };

      res.set('Content-Type', contentTypeMap[result.encoding] || 'audio/mpeg');
      res.set('X-Audio-Duration-Ms', String(result.durationMs));
      res.set('X-Audio-Language', result.language);
      res.send(result.audio);
    } catch (err) {
      if (err instanceof SpeechError) {
        res.status(400).json({ error: err.message, code: err.code });
        return;
      }
      console.error('Text-to-speech error:', err);
      res.status(500).json({ error: 'An error occurred during speech synthesis.' });
    }
  },
);

/**
 * POST /api/v1/ai/speech-reset
 *
 * Reset the speech attempt tracker for the current user.
 * Allows switching back from text fallback to voice input.
 */
router.post(
  '/speech-reset',
  requirePermissions(Permission.AI_CHAT),
  async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    speechService.resetTracker(user.id);
    res.json({ message: 'Speech attempt tracker reset. Voice input is available again.' });
  },
);

export default router;
export { speechService };
