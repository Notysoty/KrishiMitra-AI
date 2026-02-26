import { Router, Response } from 'express';
import express from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';
import { DiseaseClassifier } from '../services/ai/DiseaseClassifier';

const router = Router();
const classifier = new DiseaseClassifier();

// All disease routes require authentication
router.use(authenticate);

/** Parse raw image bodies (JPEG, PNG) up to 6 MB so we can validate the limit ourselves */
const rawParser = express.raw({ type: ['image/jpeg', 'image/png', 'image/*'], limit: '6mb' });

/**
 * POST /api/v1/disease/classify
 *
 * Classify a crop image for diseases / pests.
 * Expects a raw image body with Content-Type header (image/jpeg or image/png).
 *
 * Headers:
 *   Content-Type: image/jpeg | image/png
 *   X-Crop-Type: string (e.g. "rice", "wheat")
 *   X-Store-Consent: "true" | "false" (optional, default false)
 *
 * Requirements: 7.1 – 7.10
 */
router.post(
  '/classify',
  rawParser,
  requirePermissions(Permission.AI_CLASSIFY_DISEASE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const contentType = (req.headers['content-type'] ?? '').split(';')[0].trim();
      const cropType = (req.headers['x-crop-type'] as string) ?? 'unknown';
      const storeConsent = req.headers['x-store-consent'] === 'true';

      const image = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

      // Validate format & size (Req 7.8)
      const validation = classifier.validateImage(contentType, image.length);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      // Check image quality (Req 7.9)
      const quality = classifier.checkImageQuality(image);
      if (!quality.acceptable) {
        res.status(422).json({ error: quality.message });
        return;
      }

      // Classify (Req 7.1 – 7.7, 7.10)
      const result = await classifier.classify(
        image,
        cropType,
        user.id,
        user.tenant_id,
        storeConsent,
      );

      res.json(result);
    } catch (err) {
      console.error('Disease classify error:', err);
      res.status(500).json({ error: 'An error occurred while classifying the image.' });
    }
  },
);

/**
 * GET /api/v1/disease/history
 *
 * Get the user's disease classification history.
 * Query params: limit (default 50, max 100)
 */
router.get(
  '/history',
  requirePermissions(Permission.AI_CLASSIFY_DISEASE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const limit = Math.min(Number(req.query.limit) || 50, 100);

      const history = classifier.getHistory(user.id, user.tenant_id, limit);

      res.json({ history, count: history.length });
    } catch (err) {
      console.error('Disease history error:', err);
      res.status(500).json({ error: 'An error occurred while fetching classification history.' });
    }
  },
);

export default router;
