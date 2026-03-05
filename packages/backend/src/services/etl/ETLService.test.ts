import { ETLService } from './ETLService';
import { ETLAlert, PipelineConfig, ETLRecord } from '../../types/etl';
import { ETLJobType, ETLJobStatus } from '../../types/enums';
import { Logger } from '../observability/Logger';

describe('ETLService', () => {
  let output: string[];
  let logger: Logger;
  let alerts: ETLAlert[];
  let service: ETLService;

  const marketPriceSchema = {
    fields: [
      { name: 'crop', type: 'string' as const, required: true },
      { name: 'price', type: 'number' as const, required: true },
      { name: 'market', type: 'string' as const, required: true },
      { name: 'date', type: 'date' as const, required: true },
    ],
  };

  const weatherSchema = {
    fields: [
      { name: 'location', type: 'string' as const, required: true },
      { name: 'temperature', type: 'number' as const, required: true },
      { name: 'rainfall', type: 'number' as const, required: false },
    ],
  };

  function makeMarketConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
    return {
      name: 'market-prices',
      type: ETLJobType.MARKET_PRICES,
      source: 'Public_Dataset:AgriMarket',
      schema: marketPriceSchema,
      fetchFn: async () => [
        { crop: 'rice', price: 2500, market: 'Delhi', date: '2024-01-15' },
        { crop: 'wheat', price: 2200, market: 'Mumbai', date: '2024-01-15' },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    output = [];
    alerts = [];
    logger = new Logger({ service: 'etl-test', writer: (json) => output.push(json) });
    service = new ETLService({
      logger,
      onAlert: (alert) => alerts.push(alert),
    });
  });

  // ── Pipeline Registration (Req 32.10) ─────────────────────

  describe('registerPipeline', () => {
    it('should register a pipeline configuration', () => {
      const config = makeMarketConfig();
      service.registerPipeline(config);

      expect(service.getPipeline('market-prices')).toBeDefined();
      expect(service.getPipelineNames()).toContain('market-prices');
    });

    it('should support multiple pipeline registrations', () => {
      service.registerPipeline(makeMarketConfig());
      service.registerPipeline({
        name: 'weather',
        type: ETLJobType.WEATHER,
        source: 'IMD_API',
        schema: weatherSchema,
        fetchFn: async () => [{ location: 'Delhi', temperature: 35, rainfall: 0 }],
      });

      expect(service.getPipelineNames()).toHaveLength(2);
    });

    it('should return undefined for unregistered pipeline', () => {
      expect(service.getPipeline('nonexistent')).toBeUndefined();
    });
  });

  // ── Pipeline Execution (Req 32.1, 32.2) ───────────────────

  describe('executePipeline', () => {
    it('should execute a pipeline and return success', async () => {
      service.registerPipeline(makeMarketConfig());

      const result = await service.executePipeline('market-prices');

      expect(result.status).toBe(ETLJobStatus.SUCCESS);
      expect(result.recordsProcessed).toBe(2);
      expect(result.recordsFailed).toBe(0);
      expect(result.pipelineName).toBe('market-prices');
      expect(result.completedAt).toBeDefined();
      expect(result.dataVersion).toBe(1);
    });

    it('should throw for unregistered pipeline', async () => {
      await expect(service.executePipeline('nonexistent')).rejects.toThrow(
        'Pipeline "nonexistent" is not registered',
      );
    });

    it('should increment data version on successive runs', async () => {
      service.registerPipeline(makeMarketConfig());

      const first = await service.executePipeline('market-prices');
      const second = await service.executePipeline('market-prices');

      expect(first.dataVersion).toBe(1);
      expect(second.dataVersion).toBe(2);
    });

    it('should apply transform function when provided', async () => {
      service.registerPipeline(
        makeMarketConfig({
          transformFn: (record) => ({ ...record, price: (record.price as number) * 1.1 }),
        }),
      );

      await service.executePipeline('market-prices');

      const cached = service.getCachedData('market-prices');
      expect(cached[0].data.price).toBeCloseTo(2750);
    });
  });

  // ── Data Validation (Req 32.3, 32.4) ──────────────────────

  describe('validateRecord', () => {
    it('should validate a correct record', () => {
      const result = service.validateRecord(
        { crop: 'rice', price: 2500, market: 'Delhi', date: '2024-01-15' },
        marketPriceSchema,
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject record with missing required field', () => {
      const result = service.validateRecord(
        { crop: 'rice', market: 'Delhi', date: '2024-01-15' },
        marketPriceSchema,
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: price');
    });

    it('should reject record with wrong type', () => {
      const result = service.validateRecord(
        { crop: 'rice', price: 'not-a-number', market: 'Delhi', date: '2024-01-15' },
        marketPriceSchema,
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('expected number');
    });

    it('should reject record with invalid date', () => {
      const result = service.validateRecord(
        { crop: 'rice', price: 2500, market: 'Delhi', date: 'not-a-date' },
        marketPriceSchema,
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('invalid date');
    });

    it('should allow missing optional fields', () => {
      const result = service.validateRecord(
        { location: 'Delhi', temperature: 35 },
        weatherSchema,
      );
      expect(result.valid).toBe(true);
    });

    it('should reject boolean type mismatch', () => {
      const schema = {
        fields: [{ name: 'active', type: 'boolean' as const, required: true }],
      };
      const result = service.validateRecord({ active: 'yes' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('expected boolean');
    });
  });

  // ── Data Quality Handling (Req 32.3) ──────────────────────

  describe('data quality handling', () => {
    it('should skip corrupted records and alert ML_Ops', async () => {
      service.registerPipeline(
        makeMarketConfig({
          fetchFn: async () => [
            { crop: 'rice', price: 2500, market: 'Delhi', date: '2024-01-15' },
            { crop: 'wheat', price: 'invalid', market: 'Mumbai', date: '2024-01-15' }, // corrupted
            { crop: 'corn', price: 1800, market: 'Chennai', date: '2024-01-15' },
          ],
        }),
      );

      const result = await service.executePipeline('market-prices');

      expect(result.status).toBe(ETLJobStatus.SUCCESS);
      expect(result.recordsProcessed).toBe(2);
      expect(result.recordsFailed).toBe(1);

      // Should have emitted a data quality alert
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('data_quality');
      expect(alerts[0].message).toContain('1 corrupted record');
    });

    it('should not alert when all records are valid', async () => {
      service.registerPipeline(makeMarketConfig());

      await service.executePipeline('market-prices');

      expect(alerts).toHaveLength(0);
    });
  });

  // ── Cached Fallback (Req 32.5) ────────────────────────────

  describe('cached fallback', () => {
    it('should use cached data when external API fails', async () => {
      let callCount = 0;
      service.registerPipeline(
        makeMarketConfig({
          fetchFn: async () => {
            callCount++;
            if (callCount > 1) throw new Error('API unavailable');
            return [{ crop: 'rice', price: 2500, market: 'Delhi', date: '2024-01-15' }];
          },
        }),
      );

      // First run succeeds and populates cache
      await service.executePipeline('market-prices');

      // Second run fails but uses cache
      const result = await service.executePipeline('market-prices');

      expect(result.status).toBe(ETLJobStatus.SUCCESS);
      expect(result.recordsProcessed).toBe(1);
      expect(result.errorMessage).toContain('stale cached data');

      // Cached data should be marked as stale
      const cached = service.getCachedData('market-prices');
      expect(cached[0].stale).toBe(true);

      // Should emit stale data alert
      const staleAlert = alerts.find((a) => a.type === 'stale_data');
      expect(staleAlert).toBeDefined();
    });

    it('should fail when API is unavailable and no cache exists', async () => {
      service.registerPipeline(
        makeMarketConfig({
          fetchFn: async () => { throw new Error('API unavailable'); },
        }),
      );

      const result = await service.executePipeline('market-prices');

      expect(result.status).toBe(ETLJobStatus.FAILED);
      expect(result.errorMessage).toContain('API unavailable');

      const failAlert = alerts.find((a) => a.type === 'pipeline_failure');
      expect(failAlert).toBeDefined();
    });
  });

  // ── Pipeline Execution History (Req 32.7) ─────────────────

  describe('execution history and stats', () => {
    it('should track pipeline execution history', async () => {
      service.registerPipeline(makeMarketConfig());

      await service.executePipeline('market-prices');
      await service.executePipeline('market-prices');

      const history = service.getExecutionHistory('market-prices');
      expect(history).toHaveLength(2);
    });

    it('should return all executions when no filter provided', async () => {
      service.registerPipeline(makeMarketConfig());
      service.registerPipeline({
        name: 'weather',
        type: ETLJobType.WEATHER,
        source: 'IMD_API',
        schema: weatherSchema,
        fetchFn: async () => [{ location: 'Delhi', temperature: 35 }],
      });

      await service.executePipeline('market-prices');
      await service.executePipeline('weather');

      expect(service.getExecutionHistory()).toHaveLength(2);
    });

    it('should calculate pipeline stats with success/failure rates', async () => {
      // Pipeline that always returns valid data
      service.registerPipeline(makeMarketConfig());
      await service.executePipeline('market-prices');
      await service.executePipeline('market-prices');

      // Register a separate pipeline that always fails (no cache)
      service.registerPipeline({
        name: 'failing-pipeline',
        type: ETLJobType.WEATHER,
        source: 'IMD_API',
        schema: weatherSchema,
        fetchFn: async () => { throw new Error('fail'); },
      });
      await service.executePipeline('failing-pipeline');

      const marketStats = service.getPipelineStats('market-prices');
      expect(marketStats.totalRuns).toBe(2);
      expect(marketStats.successCount).toBe(2);
      expect(marketStats.failureCount).toBe(0);
      expect(marketStats.successRate).toBe(100);

      const failStats = service.getPipelineStats('failing-pipeline');
      expect(failStats.totalRuns).toBe(1);
      expect(failStats.successCount).toBe(0);
      expect(failStats.failureCount).toBe(1);
      expect(failStats.successRate).toBe(0);
      expect(failStats.lastRun).toBeDefined();
      expect(failStats.lastRun!.status).toBe(ETLJobStatus.FAILED);
    });

    it('should return zero stats for pipeline with no runs', () => {
      const stats = service.getPipelineStats('nonexistent');

      expect(stats.totalRuns).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.lastRun).toBeUndefined();
    });
  });

  // ── Data Versioning & Rollback (Req 32.8) ─────────────────

  describe('data versioning', () => {
    it('should create versioned data snapshots', async () => {
      service.registerPipeline(makeMarketConfig());

      await service.executePipeline('market-prices');
      await service.executePipeline('market-prices');

      const versions = service.getDataVersions('market-prices');
      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe(1);
      expect(versions[1].version).toBe(2);
    });

    it('should return current version', async () => {
      service.registerPipeline(makeMarketConfig());

      await service.executePipeline('market-prices');

      const current = service.getCurrentVersion('market-prices');
      expect(current).toBeDefined();
      expect(current!.version).toBe(1);
      expect(current!.recordCount).toBe(2);
      expect(current!.source).toBe('Public_Dataset:AgriMarket');
    });

    it('should rollback to a previous version', async () => {
      let prices = [2500, 2200];
      service.registerPipeline(
        makeMarketConfig({
          fetchFn: async () => [
            { crop: 'rice', price: prices[0], market: 'Delhi', date: '2024-01-15' },
            { crop: 'wheat', price: prices[1], market: 'Mumbai', date: '2024-01-15' },
          ],
        }),
      );

      await service.executePipeline('market-prices');
      prices = [3000, 2800]; // new prices
      await service.executePipeline('market-prices');

      // Rollback to version 1
      const rolled = service.rollbackToVersion('market-prices', 1);
      expect(rolled).toBeDefined();
      expect(rolled!.version).toBe(1);

      // Cache should reflect version 1 data
      const cached = service.getCachedData('market-prices');
      expect(cached[0].data.price).toBe(2500);

      // Versions after target should be removed
      const versions = service.getDataVersions('market-prices');
      expect(versions).toHaveLength(1);
    });

    it('should return undefined when rolling back to non-existent version', () => {
      expect(service.rollbackToVersion('market-prices', 99)).toBeUndefined();
    });

    it('should return undefined for current version of unknown pipeline', () => {
      expect(service.getCurrentVersion('nonexistent')).toBeUndefined();
    });
  });

  // ── Data Labeling (Req 32.9) ──────────────────────────────

  describe('data labeling', () => {
    it('should label all data with source and timestamp', async () => {
      service.registerPipeline(makeMarketConfig());

      await service.executePipeline('market-prices');

      const cached = service.getCachedData('market-prices');
      expect(cached).toHaveLength(2);

      for (const record of cached) {
        expect(record.source).toBe('Public_Dataset:AgriMarket');
        expect(record.timestamp).toBeDefined();
        expect(record.stale).toBe(false);
        expect(record.data).toBeDefined();
      }
    });
  });

  // ── Error Logging (Req 32.6) ──────────────────────────────

  describe('error logging', () => {
    it('should log detailed error information on pipeline failure', async () => {
      service.registerPipeline(
        makeMarketConfig({
          fetchFn: async () => { throw new Error('Connection timeout'); },
        }),
      );

      await service.executePipeline('market-prices');

      const errorLog = output.find((o) => {
        const parsed = JSON.parse(o);
        return parsed.message === 'ETL pipeline execution failed';
      });
      expect(errorLog).toBeDefined();
    });

    it('should log corrupted record details for debugging', async () => {
      service.registerPipeline(
        makeMarketConfig({
          fetchFn: async () => [
            { crop: 123, price: 2500, market: 'Delhi', date: '2024-01-15' }, // crop should be string
          ],
        }),
      );

      await service.executePipeline('market-prices');

      const warnLog = output.find((o) => {
        const parsed = JSON.parse(o);
        return parsed.message === 'Corrupted record skipped';
      });
      expect(warnLog).toBeDefined();
    });
  });
});
