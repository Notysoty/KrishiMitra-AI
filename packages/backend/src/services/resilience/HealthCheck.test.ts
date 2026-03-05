import { HealthCheck } from './HealthCheck';

describe('HealthCheck', () => {
  describe('register / unregister', () => {
    it('should register and list checks', () => {
      const hc = new HealthCheck();
      hc.register('db', async () => ({
        service: 'db',
        status: 'healthy',
        checkedAt: new Date().toISOString(),
      }));

      expect(hc.getRegisteredChecks()).toEqual(['db']);
    });

    it('should unregister checks', () => {
      const hc = new HealthCheck();
      hc.register('db', async () => ({
        service: 'db',
        status: 'healthy',
        checkedAt: new Date().toISOString(),
      }));
      expect(hc.unregister('db')).toBe(true);
      expect(hc.getRegisteredChecks()).toEqual([]);
    });
  });

  describe('check', () => {
    it('should return healthy when all checks pass', async () => {
      const hc = new HealthCheck();
      hc.register('db', async () => ({
        service: 'db',
        status: 'healthy',
        latencyMs: 5,
        checkedAt: new Date().toISOString(),
      }));
      hc.register('redis', async () => ({
        service: 'redis',
        status: 'healthy',
        latencyMs: 2,
        checkedAt: new Date().toISOString(),
      }));

      const report = await hc.check();
      expect(report.status).toBe('healthy');
      expect(report.services).toHaveLength(2);
    });

    it('should return degraded when one check is degraded', async () => {
      const hc = new HealthCheck();
      hc.register('db', async () => ({
        service: 'db',
        status: 'healthy',
        checkedAt: new Date().toISOString(),
      }));
      hc.register('ai', async () => ({
        service: 'ai',
        status: 'degraded',
        message: 'High latency',
        checkedAt: new Date().toISOString(),
      }));

      const report = await hc.check();
      expect(report.status).toBe('degraded');
    });

    it('should return unhealthy when any check is unhealthy', async () => {
      const hc = new HealthCheck();
      hc.register('db', async () => ({
        service: 'db',
        status: 'unhealthy',
        message: 'Connection refused',
        checkedAt: new Date().toISOString(),
      }));

      const report = await hc.check();
      expect(report.status).toBe('unhealthy');
    });

    it('should handle checker exceptions as unhealthy', async () => {
      const hc = new HealthCheck();
      hc.register('broken', async () => {
        throw new Error('check crashed');
      });

      const report = await hc.check();
      expect(report.status).toBe('unhealthy');
      expect(report.services[0].message).toBe('check crashed');
    });

    it('should return healthy with no registered checks', async () => {
      const hc = new HealthCheck();
      const report = await hc.check();
      expect(report.status).toBe('healthy');
      expect(report.services).toEqual([]);
    });
  });

  describe('checkOne', () => {
    it('should run a single named check', async () => {
      const hc = new HealthCheck();
      hc.register('db', async () => ({
        service: 'db',
        status: 'healthy',
        latencyMs: 3,
        checkedAt: new Date().toISOString(),
      }));

      const result = await hc.checkOne('db');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('healthy');
    });

    it('should return null for unknown check', async () => {
      const hc = new HealthCheck();
      const result = await hc.checkOne('unknown');
      expect(result).toBeNull();
    });

    it('should handle exceptions in single check', async () => {
      const hc = new HealthCheck();
      hc.register('bad', async () => {
        throw new Error('boom');
      });

      const result = await hc.checkOne('bad');
      expect(result!.status).toBe('unhealthy');
      expect(result!.message).toBe('boom');
    });
  });
});
