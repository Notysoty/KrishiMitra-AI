/**
 * ETL (Extract, Transform, Load) Service for market prices, weather, and scheme data.
 *
 * Provides configurable pipeline execution with:
 * - Schema-based data validation before loading
 * - Data quality handling (skip corrupted records, alert ML_Ops)
 * - Cached fallback when external APIs are unavailable
 * - Pipeline execution history with success/failure rates
 * - Data versioning for rollback of bad data loads
 * - Source and timestamp labeling on all data
 * - Configuration-driven pipeline creation
 *
 * Requirements: 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7, 32.8, 32.9, 32.10
 */

import { ETLJobStatus } from '../../types/enums';
import {
  ETLRecord,
  ValidationResult,
  PipelineExecution,
  DataVersion,
  LabeledRecord,
  PipelineConfig,
  ETLAlert,
  PipelineStats,
  DataSchema,
} from '../../types/etl';
import { Logger } from '../observability/Logger';

export interface ETLServiceOptions {
  logger: Logger;
  onAlert?: (alert: ETLAlert) => void;
}

export class ETLService {
  private logger: Logger;
  private onAlert?: (alert: ETLAlert) => void;

  private pipelines: Map<string, PipelineConfig> = new Map();
  private executions: PipelineExecution[] = [];
  private dataVersions: Map<string, DataVersion[]> = new Map();
  private cache: Map<string, LabeledRecord[]> = new Map();

  constructor(options: ETLServiceOptions) {
    this.logger = options.logger;
    this.onAlert = options.onAlert;
  }

  // ── Pipeline Registration (Req 32.10) ─────────────────────

  registerPipeline(config: PipelineConfig): void {
    this.pipelines.set(config.name, config);
    this.logger.info('ETL pipeline registered', {
      pipelineName: config.name,
      type: config.type,
      source: config.source,
    });
  }

  getPipeline(name: string): PipelineConfig | undefined {
    return this.pipelines.get(name);
  }

  getPipelineNames(): string[] {
    return Array.from(this.pipelines.keys());
  }

  // ── Pipeline Execution (Req 32.1, 32.2) ───────────────────

  async executePipeline(pipelineName: string): Promise<PipelineExecution> {
    const config = this.pipelines.get(pipelineName);
    if (!config) {
      throw new Error(`Pipeline "${pipelineName}" is not registered`);
    }

    const execution: PipelineExecution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      pipelineName,
      type: config.type,
      status: ETLJobStatus.RUNNING,
      source: config.source,
      recordsProcessed: 0,
      recordsFailed: 0,
      startedAt: new Date().toISOString(),
      dataVersion: this.getNextVersion(pipelineName),
    };

    this.logger.info('ETL pipeline execution started', {
      executionId: execution.id,
      pipelineName,
      type: config.type,
    });

    try {
      // Extract
      let rawRecords: ETLRecord[];
      try {
        rawRecords = await config.fetchFn();
      } catch (fetchError) {
        // Req 32.5: Use cached data when external APIs are unavailable
        const cached = this.cache.get(pipelineName);
        if (cached && cached.length > 0) {
          this.logger.warn('External API unavailable, using cached data', {
            pipelineName,
            cachedRecords: cached.length,
          });

          // Mark cached data as stale
          const staleRecords = cached.map((r) => ({ ...r, stale: true }));
          this.cache.set(pipelineName, staleRecords);

          this.emitAlert({
            type: 'stale_data',
            pipelineName,
            message: `External API unavailable for "${pipelineName}". Using ${cached.length} cached records marked as stale.`,
            timestamp: new Date().toISOString(),
            details: { cachedRecords: cached.length, error: String(fetchError) },
          });

          execution.status = ETLJobStatus.SUCCESS;
          execution.recordsProcessed = cached.length;
          execution.completedAt = new Date().toISOString();
          execution.errorMessage = 'Used stale cached data due to API unavailability';
          this.executions.push(execution);
          return execution;
        }

        // No cache available — fail
        throw fetchError;
      }

      // Validate & Transform (Req 32.3, 32.4)
      const validRecords: ETLRecord[] = [];
      const corruptedCount = { value: 0 };

      for (const record of rawRecords) {
        const validation = this.validateRecord(record, config.schema);
        if (!validation.valid) {
          corruptedCount.value++;
          execution.recordsFailed++;
          // Req 32.6: Log detailed error information
          this.logger.warn('Corrupted record skipped', {
            pipelineName,
            errors: validation.errors,
            record: this.sanitizeForLog(record),
          });
          continue;
        }

        const transformed = config.transformFn ? config.transformFn(record) : record;
        validRecords.push(transformed);
        execution.recordsProcessed++;
      }

      // Req 32.3: Alert ML_Ops when data quality issues detected
      if (corruptedCount.value > 0) {
        this.emitAlert({
          type: 'data_quality',
          pipelineName,
          message: `${corruptedCount.value} corrupted record(s) skipped in pipeline "${pipelineName}"`,
          timestamp: new Date().toISOString(),
          details: {
            totalRecords: rawRecords.length,
            corruptedRecords: corruptedCount.value,
            validRecords: validRecords.length,
          },
        });
      }

      // Load: Label data with source and timestamp (Req 32.9)
      const labeledRecords: LabeledRecord[] = validRecords.map((data) => ({
        data,
        source: config.source,
        timestamp: new Date().toISOString(),
        stale: false,
      }));

      // Store versioned data (Req 32.8)
      const version: DataVersion = {
        version: execution.dataVersion,
        pipelineName,
        type: config.type,
        loadedAt: new Date().toISOString(),
        recordCount: labeledRecords.length,
        source: config.source,
        data: validRecords,
      };

      const versions = this.dataVersions.get(pipelineName) ?? [];
      versions.push(version);
      this.dataVersions.set(pipelineName, versions);

      // Update cache with fresh data
      this.cache.set(pipelineName, labeledRecords);

      execution.status = ETLJobStatus.SUCCESS;
      execution.completedAt = new Date().toISOString();

      this.logger.info('ETL pipeline execution completed', {
        executionId: execution.id,
        pipelineName,
        recordsProcessed: execution.recordsProcessed,
        recordsFailed: execution.recordsFailed,
        dataVersion: execution.dataVersion,
      });
    } catch (err) {
      execution.status = ETLJobStatus.FAILED;
      execution.errorMessage = err instanceof Error ? err.message : String(err);
      execution.completedAt = new Date().toISOString();

      this.logger.error(
        'ETL pipeline execution failed',
        err instanceof Error ? err : new Error(String(err)),
        { executionId: execution.id, pipelineName },
      );

      this.emitAlert({
        type: 'pipeline_failure',
        pipelineName,
        message: `Pipeline "${pipelineName}" failed: ${execution.errorMessage}`,
        timestamp: new Date().toISOString(),
        details: { executionId: execution.id },
      });
    }

    this.executions.push(execution);
    return execution;
  }

  // ── Data Validation (Req 32.4) ────────────────────────────

  validateRecord(record: ETLRecord, schema: DataSchema): ValidationResult {
    const errors: string[] = [];

    for (const field of schema.fields) {
      const value = record[field.name];

      if (value === undefined || value === null) {
        if (field.required) {
          errors.push(`Missing required field: ${field.name}`);
        }
        continue;
      }

      switch (field.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`Field "${field.name}" expected string, got ${typeof value}`);
          }
          break;
        case 'number':
          if (typeof value !== 'number' || Number.isNaN(value)) {
            errors.push(`Field "${field.name}" expected number, got ${typeof value}`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`Field "${field.name}" expected boolean, got ${typeof value}`);
          }
          break;
        case 'date':
          if (typeof value === 'string') {
            const parsed = Date.parse(value);
            if (Number.isNaN(parsed)) {
              errors.push(`Field "${field.name}" has invalid date value: ${value}`);
            }
          } else if (!(value instanceof Date)) {
            errors.push(`Field "${field.name}" expected date, got ${typeof value}`);
          }
          break;
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ── Pipeline History & Stats (Req 32.7) ───────────────────

  getExecutionHistory(pipelineName?: string): PipelineExecution[] {
    if (pipelineName) {
      return this.executions.filter((e) => e.pipelineName === pipelineName);
    }
    return [...this.executions];
  }

  getPipelineStats(pipelineName: string): PipelineStats {
    const history = this.executions.filter((e) => e.pipelineName === pipelineName);
    const successCount = history.filter((e) => e.status === ETLJobStatus.SUCCESS).length;
    const failureCount = history.filter((e) => e.status === ETLJobStatus.FAILED).length;
    const lastRun = history.length > 0 ? history[history.length - 1] : undefined;

    return {
      pipelineName,
      totalRuns: history.length,
      successCount,
      failureCount,
      successRate: history.length > 0 ? (successCount / history.length) * 100 : 0,
      lastRun,
    };
  }

  // ── Data Versioning & Rollback (Req 32.8) ─────────────────

  getDataVersions(pipelineName: string): DataVersion[] {
    return [...(this.dataVersions.get(pipelineName) ?? [])];
  }

  getCurrentVersion(pipelineName: string): DataVersion | undefined {
    const versions = this.dataVersions.get(pipelineName) ?? [];
    return versions.length > 0 ? versions[versions.length - 1] : undefined;
  }

  rollbackToVersion(pipelineName: string, targetVersion: number): DataVersion | undefined {
    const versions = this.dataVersions.get(pipelineName) ?? [];
    const target = versions.find((v) => v.version === targetVersion);
    if (!target) return undefined;

    // Restore cache from the target version's data
    const labeledRecords: LabeledRecord[] = target.data.map((data) => ({
      data,
      source: target.source,
      timestamp: target.loadedAt,
      stale: false,
    }));
    this.cache.set(pipelineName, labeledRecords);

    // Remove versions after the target
    const filtered = versions.filter((v) => v.version <= targetVersion);
    this.dataVersions.set(pipelineName, filtered);

    this.logger.warn('Data rollback executed', {
      pipelineName,
      targetVersion,
      removedVersions: versions.length - filtered.length,
    });

    return target;
  }

  // ── Cached / Labeled Data Access (Req 32.5, 32.9) ────────

  getCachedData(pipelineName: string): LabeledRecord[] {
    return [...(this.cache.get(pipelineName) ?? [])];
  }

  // ── Helpers ───────────────────────────────────────────────

  private getNextVersion(pipelineName: string): number {
    const versions = this.dataVersions.get(pipelineName) ?? [];
    return versions.length > 0 ? versions[versions.length - 1].version + 1 : 1;
  }

  private emitAlert(alert: ETLAlert): void {
    this.logger.warn(`ETL alert: ${alert.type}`, {
      pipelineName: alert.pipelineName,
      message: alert.message,
    });

    if (this.onAlert) {
      this.onAlert(alert);
    }
  }

  private sanitizeForLog(record: ETLRecord): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string' && value.length > 200) {
        sanitized[key] = value.slice(0, 200) + '…';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}
