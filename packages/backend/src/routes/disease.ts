import { Router, Response } from 'express';
import express from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';
import { registry } from '../services/ServiceRegistry';
import { getPool } from '../db/pool';

const router = Router();
const classifier = registry.diseaseClassifier;

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
        contentType,
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

/**
 * POST /api/v1/disease/detections
 *
 * Persist a disease detection result for the Crop Health Timeline.
 * Body (JSON):
 *   cropType       string   — e.g. "wheat"
 *   diseaseName    string   — disease label from classifier
 *   confidence     number   — 0–1
 *   severity       string   — "healthy" | "mild" | "severe"
 *   treatmentPlan  string   — free-text treatment summary
 *   imageS3Key     string?  — optional S3 key when image was stored
 */
router.post(
  '/detections',
  requirePermissions(Permission.AI_CLASSIFY_DISEASE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { cropType, diseaseName, confidence, severity, treatmentPlan, imageS3Key } = req.body;

      if (!cropType || typeof cropType !== 'string') {
        res.status(400).json({ error: 'cropType is required.' });
        return;
      }

      let pool: ReturnType<typeof getPool> | null = null;
      try {
        pool = getPool();
      } catch {
        // DB not available in dev — return 201 with a mock id
        res.status(201).json({ id: `mock_${Date.now()}`, message: 'Detection recorded (mock).' });
        return;
      }

      const result = await pool.query(
        `INSERT INTO disease_detections
           (tenant_id, user_id, crop_type, image_s3_key, disease_name, confidence, severity, treatment_plan)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, detected_at`,
        [
          user.tenant_id,
          user.id,
          cropType,
          imageS3Key ?? null,
          diseaseName ?? null,
          confidence != null ? Number(confidence) : null,
          severity ?? null,
          treatmentPlan ?? null,
        ],
      );

      res.status(201).json({
        id: result.rows[0].id,
        detectedAt: result.rows[0].detected_at,
        message: 'Detection recorded.',
      });
    } catch (err) {
      console.error('Disease detections POST error:', err);
      res.status(500).json({ error: 'Failed to save detection.' });
    }
  },
);

/**
 * GET /api/v1/disease/detections
 *
 * Return the last 50 disease detections for the authenticated user.
 * Query params:
 *   cropType  string?  — filter by crop type (case-insensitive)
 *   limit     number?  — max results (default 50, max 100)
 */
router.get(
  '/detections',
  requirePermissions(Permission.AI_CLASSIFY_DISEASE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const cropType = req.query.cropType as string | undefined;

      let pool: ReturnType<typeof getPool> | null = null;
      try {
        pool = getPool();
      } catch {
        // DB not initialised — return mock history for dev
        const mockHistory = [
          {
            id: 'mock-1',
            crop_type: 'wheat',
            disease_name: 'Leaf Blight',
            confidence: 0.82,
            severity: 'mild',
            treatment_plan: 'Apply copper-based fungicide. Remove infected leaves.',
            detected_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
          {
            id: 'mock-2',
            crop_type: 'rice',
            disease_name: 'Healthy',
            confidence: 0.95,
            severity: 'healthy',
            treatment_plan: null,
            detected_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ].filter((r) => !cropType || r.crop_type.toLowerCase() === cropType.toLowerCase());
        res.json({ detections: mockHistory, count: mockHistory.length });
        return;
      }

      let query: string;
      let params: unknown[];

      if (cropType) {
        query = `
          SELECT id, crop_type, image_s3_key, disease_name, confidence, severity, treatment_plan, detected_at
          FROM disease_detections
          WHERE user_id = $1 AND tenant_id = $2 AND LOWER(crop_type) = LOWER($3)
          ORDER BY detected_at DESC
          LIMIT $4`;
        params = [user.id, user.tenant_id, cropType, limit];
      } else {
        query = `
          SELECT id, crop_type, image_s3_key, disease_name, confidence, severity, treatment_plan, detected_at
          FROM disease_detections
          WHERE user_id = $1 AND tenant_id = $2
          ORDER BY detected_at DESC
          LIMIT $3`;
        params = [user.id, user.tenant_id, limit];
      }

      const result = await pool.query(query, params);
      res.json({ detections: result.rows, count: result.rows.length });
    } catch (err) {
      console.error('Disease detections GET error:', err);
      res.status(500).json({ error: 'Failed to fetch detections.' });
    }
  },
);

export default router;
