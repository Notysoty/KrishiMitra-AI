import { Citation } from './ai';

export type WorkflowType = 'plan_season' | 'check_eligibility';

export type WorkflowStepStatus = 'completed' | 'incomplete' | 'missing_data';

export interface WorkflowStep {
  step: number;
  title: string;
  description: string;
  status: WorkflowStepStatus;
  /** Present when status is 'missing_data' */
  missingFields?: string[];
  citations?: Citation[];
}

export interface WorkflowResult {
  id: string;
  workflowType: WorkflowType;
  userId: string;
  tenantId: string;
  title: string;
  summary: string;
  steps: WorkflowStep[];
  citations: Citation[];
  createdAt: Date;
}

export interface FarmContext {
  farmId?: string;
  crops?: Array<{
    crop_type: string;
    variety?: string;
    acreage?: number;
    planting_date?: string;
    expected_harvest_date?: string;
    status?: string;
  }>;
  location?: {
    latitude: number;
    longitude: number;
    state?: string;
    district?: string;
  };
  total_acreage?: number;
  irrigation_type?: string;
}

export interface WorkflowRequest {
  farm?: FarmContext;
  language?: string;
}

export interface GovernmentScheme {
  name: string;
  description: string;
  eligibility: 'eligible' | 'not_eligible' | 'insufficient_data';
  reason: string;
  applicationSteps?: string[];
  source: string;
  sourceUrl?: string;
  lastUpdated: Date;
}
