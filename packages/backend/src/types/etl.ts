import { ETLJobType, ETLJobStatus } from './enums';

export interface ETLJob {
  id: string;
  name: string;
  type: ETLJobType;
  status: ETLJobStatus;
  source: string;
  records_processed: number;
  records_failed: number;
  error_message?: string;
  started_at?: Date;
  completed_at?: Date;
  next_run_at: Date;
}

/** Schema definition for validating incoming data records */
export interface DataSchema {
  fields: SchemaField[];
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  required: boolean;
}

/** A single record flowing through the ETL pipeline */
export interface ETLRecord {
  [key: string]: unknown;
}

/** Result of validating a single record against a schema */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Tracks a single pipeline execution run */
export interface PipelineExecution {
  id: string;
  pipelineName: string;
  type: ETLJobType;
  status: ETLJobStatus;
  source: string;
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  dataVersion: number;
}

/** A versioned snapshot of loaded data for rollback support */
export interface DataVersion {
  version: number;
  pipelineName: string;
  type: ETLJobType;
  loadedAt: string;
  recordCount: number;
  source: string;
  data: ETLRecord[];
}

/** A labeled data record with source and timestamp metadata */
export interface LabeledRecord {
  data: ETLRecord;
  source: string;
  timestamp: string;
  stale: boolean;
}

/** Configuration for a single ETL pipeline */
export interface PipelineConfig {
  name: string;
  type: ETLJobType;
  source: string;
  schema: DataSchema;
  /** Function that fetches raw data from the external source */
  fetchFn: () => Promise<ETLRecord[]>;
  /** Optional transform applied to each valid record */
  transformFn?: (record: ETLRecord) => ETLRecord;
}

/** Alert emitted when data quality issues are detected */
export interface ETLAlert {
  type: 'data_quality' | 'pipeline_failure' | 'stale_data';
  pipelineName: string;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

/** Summary statistics for pipeline execution history */
export interface PipelineStats {
  pipelineName: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastRun?: PipelineExecution;
}
