import { DiseaseClassification, Recommendation, RecommendationType } from '../../types';
import { BedrockMultimodalClient, isBedrockConfigured } from './BedrockLLMClient';

/** Supported image MIME types */
const SUPPORTED_FORMATS = ['image/jpeg', 'image/png'];

/** Maximum image size in bytes (5 MB) */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Confidence threshold below which we return an uncertain diagnosis */
const UNCERTAINTY_THRESHOLD = 0.6;

/** Confidence threshold above which a high-risk disease triggers extension officer recommendation */
const HIGH_RISK_THRESHOLD = 0.8;

/** High-risk diseases that warrant immediate expert contact */
const HIGH_RISK_DISEASES = [
  'bacterial_blight',
  'late_blight',
  'blast',
  'panama_disease',
  'citrus_canker',
];

/**
 * Mock disease knowledge base.
 * In production this would be backed by a real ML model + knowledge store.
 */
const DISEASE_DB: Record<string, { label: string; recommendations: Recommendation[] }> = {
  leaf_blight: {
    label: 'Leaf Blight',
    recommendations: [
      { type: RecommendationType.ORGANIC, title: 'Remove infected leaves', description: 'Prune and destroy infected leaves to reduce spread.', priority: 1 },
      { type: RecommendationType.CULTURAL, title: 'Improve air circulation', description: 'Space plants adequately and avoid overhead irrigation.', priority: 2 },
      { type: RecommendationType.CHEMICAL, title: 'Fungicide application', description: 'Apply copper-based fungicide at [consult agronomist for dosage].', priority: 3 },
    ],
  },
  powdery_mildew: {
    label: 'Powdery Mildew',
    recommendations: [
      { type: RecommendationType.ORGANIC, title: 'Neem oil spray', description: 'Apply neem oil solution to affected areas.', priority: 1 },
      { type: RecommendationType.CULTURAL, title: 'Reduce humidity', description: 'Ensure good ventilation around plants.', priority: 2 },
    ],
  },
  bacterial_blight: {
    label: 'Bacterial Blight',
    recommendations: [
      { type: RecommendationType.ORGANIC, title: 'Remove infected plants', description: 'Uproot and destroy severely infected plants.', priority: 1 },
      { type: RecommendationType.CULTURAL, title: 'Crop rotation', description: 'Rotate with non-host crops for 2-3 seasons.', priority: 2 },
      { type: RecommendationType.CHEMICAL, title: 'Bactericide treatment', description: 'Apply streptomycin-based treatment at [consult agronomist for dosage].', priority: 3 },
    ],
  },
};

/** Result of image validation */
export interface ImageValidation {
  valid: boolean;
  error?: string;
}

/** Result of image quality check */
export interface ImageQualityResult {
  acceptable: boolean;
  message?: string;
}

/** Stored classification record for history */
export interface ClassificationRecord {
  id: string;
  userId: string;
  tenantId: string;
  result: DiseaseClassification;
  cropType: string;
  imageStored: boolean;
  createdAt: Date;
}

/**
 * DiseaseClassifier – MVP implementation using deterministic mock inference.
 *
 * In production, `classify` would delegate to a real ResNet/EfficientNet model.
 * For MVP we derive a deterministic prediction from image metadata (buffer size)
 * so the service is fully testable without a GPU or model weights.
 */
export class DiseaseClassifier {
  private history: ClassificationRecord[] = [];
  private bedrockClient: BedrockMultimodalClient | null = null;

  constructor() {
    if (isBedrockConfigured()) {
      this.bedrockClient = new BedrockMultimodalClient();
    }
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Validate that the image meets format and size constraints.
   * Requirement 7.8
   */
  validateImage(mimeType: string, size: number): ImageValidation {
    if (!SUPPORTED_FORMATS.includes(mimeType)) {
      return { valid: false, error: `Unsupported image format. Supported formats: JPEG, PNG.` };
    }
    if (size > MAX_IMAGE_SIZE) {
      return { valid: false, error: `Image exceeds maximum size of 5 MB.` };
    }
    if (size === 0) {
      return { valid: false, error: 'Image file is empty.' };
    }
    return { valid: true };
  }

  /**
   * Detect poor image quality (blur / low light).
   * MVP heuristic: images smaller than 10 KB are likely too low-quality.
   * Requirement 7.9
   */
  checkImageQuality(image: Buffer): ImageQualityResult {
    if (image.length < 10_000) {
      return {
        acceptable: false,
        message: 'Please retake the photo with better lighting and focus on the affected area',
      };
    }
    return { acceptable: true };
  }

  /**
   * Classify a crop image for diseases / pests.
   * Requirements 7.1 – 7.7
   */
  async classify(
    image: Buffer,
    cropType: string,
    userId: string,
    tenantId: string,
    storeConsent: boolean = false,
    mimeType: string = 'image/jpeg',
  ): Promise<DiseaseClassification> {
    if (this.bedrockClient) {
      try {
        return await this.classifyWithBedrock(image, cropType, userId, tenantId, storeConsent, mimeType);
      } catch (err) {
        console.warn('Bedrock classification failed, falling back to mock:', (err as Error).message);
      }
    }

    return this.classifyWithMock(image, cropType, userId, tenantId, storeConsent);
  }

  private async classifyWithBedrock(
    image: Buffer,
    cropType: string,
    userId: string,
    tenantId: string,
    storeConsent: boolean,
    mimeType: string = 'image/jpeg',
  ): Promise<DiseaseClassification> {
    const imageBase64 = image.toString('base64');
    const mediaType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';

    const rawResponse = await this.bedrockClient!.classifyImage(imageBase64, mediaType, cropType);

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from Bedrock response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0));
    const disease = parsed.disease ?? 'unknown';
    const disclaimer =
      'For chemical treatments, consult a licensed agronomist or agricultural extension officer for proper dosage, safety equipment, and application methods.';

    if (confidence < UNCERTAINTY_THRESHOLD) {
      const result: DiseaseClassification = {
        disease: 'unknown',
        confidence,
        message: parsed.message ?? 'Uncertain diagnosis. Please consult a local agronomist for accurate identification.',
        recommendations: [],
        disclaimer: 'For accurate diagnosis, please consult an agricultural expert.',
      };
      this.storeRecord(userId, tenantId, result, cropType, storeConsent);
      return result;
    }

    const mapRecommendationType = (t: string): RecommendationType => {
      const lower = t.toLowerCase();
      if (lower === 'chemical') return RecommendationType.CHEMICAL;
      if (lower === 'cultural') return RecommendationType.CULTURAL;
      return RecommendationType.ORGANIC;
    };

    const recommendations: Recommendation[] = (parsed.recommendations ?? []).map(
      (r: { type?: string; title?: string; description?: string; priority?: number }) => ({
        type: mapRecommendationType(r.type ?? 'organic'),
        title: r.title ?? '',
        description: this.sanitizeChemicalInfo(r.description ?? ''),
        priority: r.priority ?? 3,
      }),
    );

    const message = parsed.message ?? this.generateMessage(disease, confidence);

    const result: DiseaseClassification = {
      disease,
      confidence,
      message,
      recommendations,
      disclaimer,
      alternative_diagnoses: (parsed.alternative_diagnoses ?? []).map(
        (a: { disease?: string; confidence?: number }) => ({
          disease: a.disease ?? 'unknown',
          confidence: a.confidence ?? 0,
        }),
      ),
    };

    this.storeRecord(userId, tenantId, result, cropType, storeConsent);
    return result;
  }

  private async classifyWithMock(
    image: Buffer,
    cropType: string,
    userId: string,
    tenantId: string,
    storeConsent: boolean,
  ): Promise<DiseaseClassification> {
    const preprocessed = this.preprocessImage(image);
    const predictions = this.mockInference(preprocessed, cropType);
    const top = predictions[0];
    const confidence = top.probability;

    if (confidence < UNCERTAINTY_THRESHOLD) {
      const result: DiseaseClassification = {
        disease: 'unknown',
        confidence,
        message: 'Uncertain diagnosis. Please consult a local agronomist for accurate identification.',
        recommendations: [],
        disclaimer: 'For accurate diagnosis, please consult an agricultural expert.',
      };
      this.storeRecord(userId, tenantId, result, cropType, storeConsent);
      return result;
    }

    const recommendations = this.getRecommendations(top.disease);
    const message = this.generateMessage(top.disease, confidence);
    const disclaimer =
      'For chemical treatments, consult a licensed agronomist or agricultural extension officer for proper dosage, safety equipment, and application methods.';

    const result: DiseaseClassification = {
      disease: top.disease,
      confidence,
      message,
      recommendations,
      disclaimer,
      alternative_diagnoses: predictions.slice(1, 3).map((p) => ({
        disease: p.disease,
        confidence: p.probability,
      })),
    };

    this.storeRecord(userId, tenantId, result, cropType, storeConsent);
    return result;
  }

  /**
   * Return classification history for a user.
   */
  getHistory(userId: string, tenantId: string, limit: number = 50): ClassificationRecord[] {
    return this.history
      .filter((r) => r.userId === userId && r.tenantId === tenantId)
      .slice(-limit);
  }

  // ── Private helpers ─────────────────────────────────────────

  /**
   * Preprocess image: in production this would decode, resize to 224×224,
   * and normalise pixel values. MVP returns a numeric hash for deterministic mock.
   */
  private preprocessImage(image: Buffer): number {
    let hash = 0;
    const sample = image.subarray(0, Math.min(image.length, 256));
    for (let i = 0; i < sample.length; i++) {
      hash = (hash * 31 + sample[i]) | 0;
    }
    return Math.abs(hash);
  }

  /**
   * Mock inference: deterministic predictions based on preprocessed hash.
   * Returns sorted predictions (highest probability first).
   */
  private mockInference(
    hash: number,
    _cropType: string,
  ): Array<{ disease: string; probability: number }> {
    const diseases = Object.keys(DISEASE_DB);
    const index = hash % diseases.length;

    // Derive a confidence from the hash – spread across 0.3 – 0.95
    const baseConfidence = 0.3 + ((hash % 650) / 1000);
    const confidence = Math.min(baseConfidence, 0.95);

    return diseases.map((d, i) => ({
      disease: d,
      probability: i === index ? confidence : Math.max(0.05, confidence - 0.2 - i * 0.1),
    })).sort((a, b) => b.probability - a.probability);
  }

  /**
   * Get recommendations for a disease, sanitising chemical info.
   * Requirement 7.4, 7.6
   */
  private getRecommendations(disease: string): Recommendation[] {
    const entry = DISEASE_DB[disease];
    if (!entry) return [];
    return entry.recommendations.map((r) => ({
      ...r,
      description: this.sanitizeChemicalInfo(r.description),
    }));
  }

  /**
   * Strip specific chemical dosages / mixing ratios from text.
   * Requirement 7.6
   */
  sanitizeChemicalInfo(text: string): string {
    return text.replace(/\d+\s*(ml|g|kg|l|cc|oz)\s*\/(acre|hectare|ha|liter|litre)/gi, '[consult agronomist for dosage]');
  }

  /**
   * Generate a human-readable message based on disease and confidence.
   * Requirement 7.7
   */
  private generateMessage(disease: string, confidence: number): string {
    const label = DISEASE_DB[disease]?.label ?? disease;
    const isHighRisk = HIGH_RISK_DISEASES.includes(disease);

    if (confidence > HIGH_RISK_THRESHOLD && isHighRisk) {
      return `Likely diagnosis: ${label}. Confidence: High. Contact your nearest agricultural extension officer immediately.`;
    }
    if (confidence > HIGH_RISK_THRESHOLD) {
      return `Likely diagnosis: ${label}. Confidence: High.`;
    }
    if (confidence > UNCERTAINTY_THRESHOLD) {
      return `Possible diagnosis: ${label}. Confidence: Medium. Consider consulting an expert for confirmation.`;
    }
    return 'Uncertain diagnosis. Please consult a local agronomist.';
  }

  /**
   * Store a classification record (image storage is consent-gated).
   * Requirement 7.10
   */
  private storeRecord(
    userId: string,
    tenantId: string,
    result: DiseaseClassification,
    cropType: string,
    imageStored: boolean,
  ): void {
    this.history.push({
      id: `cls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      tenantId,
      result,
      cropType,
      imageStored,
      createdAt: new Date(),
    });
  }
}
