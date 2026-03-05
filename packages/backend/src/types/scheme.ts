import { Citation } from './ai';

export type EligibilityStatus = 'Eligible' | 'Not Eligible' | 'Insufficient Data';

export type DataSource = 'Public_Dataset' | 'Synthetic_Dataset';

export interface SchemeEligibility {
  schemeName: string;
  description: string;
  eligibilityStatus: EligibilityStatus;
  reason: string;
  applicationSteps?: string[];
  dataSource: DataSource;
  citations: Citation[];
  lastUpdated: Date;
  staleWarning?: string;
}

export interface SchemeCheckResult {
  schemes: SchemeEligibility[];
  summary: string;
  checkedAt: Date;
}

export interface SchemeDefinition {
  name: string;
  description: string;
  dataSource: DataSource;
  sourceUrl: string;
  lastUpdated: Date;
  criteria: {
    maxAcreage?: number;
    irrigationTypes?: string[];
    cropTypes?: string[];
    states?: string[];
  };
}
