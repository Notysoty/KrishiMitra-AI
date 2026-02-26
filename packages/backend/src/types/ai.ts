import { RecommendationType, ConfidenceLevel, EfficiencyRating, RiskLevel } from './enums';

export interface AIResponse {
  text: string;
  confidence: number;
  citations: Citation[];
  disclaimer?: string;
  sources: string[];
}

export interface Citation {
  text: string;
  source: string;
  url?: string;
}

export interface DiseaseClassification {
  disease: string;
  confidence: number;
  message: string;
  recommendations: Recommendation[];
  disclaimer: string;
  alternative_diagnoses?: Array<{
    disease: string;
    confidence: number;
  }>;
}

export interface Recommendation {
  type: RecommendationType;
  title: string;
  description: string;
  priority: number;
}

export interface WaterEfficiency {
  liters_per_hectare: number;
  rating: EfficiencyRating;
  explanation: string;
  benchmark_range: { min: number; max: number };
  confidence: ConfidenceLevel;
}

export interface ClimateRisk {
  risk_level: RiskLevel;
  risks: Array<{
    type: string;
    severity: RiskLevel;
    description: string;
  }>;
  recommendations: string[];
  contributing_factors: string[];
  last_updated: Date;
}
