import { SchemeService } from './SchemeService';
import { FarmContext } from '../../types/workflow';
import { SchemeDefinition } from '../../types/scheme';

// ── Helpers ─────────────────────────────────────────────────────

function makeFarm(overrides: Partial<FarmContext> = {}): FarmContext {
  return {
    farmId: 'farm-1',
    crops: [
      {
        crop_type: 'rice',
        variety: 'Basmati',
        acreage: 2,
        planting_date: '2024-06-15',
        expected_harvest_date: '2024-10-20',
        status: 'planted',
      },
    ],
    location: { latitude: 20.5, longitude: 78.9, state: 'Maharashtra', district: 'Nagpur' },
    total_acreage: 3,
    irrigation_type: 'drip',
    ...overrides,
  };
}

function makeScheme(overrides: Partial<SchemeDefinition> = {}): SchemeDefinition {
  return {
    name: 'Test Scheme',
    description: 'A test scheme.',
    dataSource: 'Synthetic_Dataset',
    sourceUrl: 'https://example.gov.in',
    lastUpdated: new Date(),
    criteria: {},
    ...overrides,
  };
}

// ── SchemeService.checkEligibility ──────────────────────────────

describe('SchemeService', () => {
  let service: SchemeService;

  beforeEach(() => {
    service = new SchemeService();
  });

  describe('checkEligibility', () => {
    it('should return all schemes with eligibility status', () => {
      const result = service.checkEligibility(makeFarm());
      expect(result.schemes.length).toBe(4);
      result.schemes.forEach((s) => {
        expect(['Eligible', 'Not Eligible', 'Insufficient Data']).toContain(
          s.eligibilityStatus,
        );
      });
    });

    it('should return checkedAt timestamp', () => {
      const result = service.checkEligibility(makeFarm());
      expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it('should return a summary', () => {
      const result = service.checkEligibility(makeFarm());
      expect(result.summary).toContain('Evaluated');
      expect(result.summary).toContain('eligible');
    });

    it('should return insufficient data summary when no farm provided', () => {
      const result = service.checkEligibility(undefined);
      expect(result.summary).toContain('Unable to evaluate');
      result.schemes.forEach((s) => {
        expect(s.eligibilityStatus).toBe('Insufficient Data');
      });
    });

    it('should return insufficient data when farm has no meaningful fields', () => {
      const result = service.checkEligibility({} as FarmContext);
      result.schemes.forEach((s) => {
        expect(s.eligibilityStatus).toBe('Insufficient Data');
      });
    });
  });

  // ── Eligibility evaluation ──────────────────────────────────

  describe('eligibility evaluation', () => {
    it('should mark PM-KISAN eligible for small farms', () => {
      const result = service.checkEligibility(makeFarm({ total_acreage: 3 }));
      const pmKisan = result.schemes.find((s) => s.schemeName === 'PM-KISAN');
      expect(pmKisan).toBeDefined();
      expect(pmKisan!.eligibilityStatus).toBe('Eligible');
    });

    it('should mark PM-KISAN not eligible for large farms', () => {
      const result = service.checkEligibility(makeFarm({ total_acreage: 10 }));
      const pmKisan = result.schemes.find((s) => s.schemeName === 'PM-KISAN');
      expect(pmKisan).toBeDefined();
      expect(pmKisan!.eligibilityStatus).toBe('Not Eligible');
      expect(pmKisan!.reason).toContain('10 acres');
      expect(pmKisan!.reason).toContain('5 acres');
    });

    it('should mark PMKSY not eligible for non-rainfed farms', () => {
      const result = service.checkEligibility(makeFarm({ irrigation_type: 'drip' }));
      const pmksy = result.schemes.find((s) => s.schemeName.includes('PMKSY'));
      expect(pmksy).toBeDefined();
      expect(pmksy!.eligibilityStatus).toBe('Not Eligible');
      expect(pmksy!.reason).toContain('rainfed');
      expect(pmksy!.reason).toContain('drip');
    });

    it('should mark PMKSY eligible for rainfed farms', () => {
      const result = service.checkEligibility(makeFarm({ irrigation_type: 'rainfed' }));
      const pmksy = result.schemes.find((s) => s.schemeName.includes('PMKSY'));
      expect(pmksy).toBeDefined();
      expect(pmksy!.eligibilityStatus).toBe('Eligible');
    });

    it('should mark PMFBY eligible for any farm with data', () => {
      const result = service.checkEligibility(makeFarm());
      const pmfby = result.schemes.find((s) => s.schemeName.includes('PMFBY'));
      expect(pmfby).toBeDefined();
      expect(pmfby!.eligibilityStatus).toBe('Eligible');
    });

    it('should mark Soil Health Card eligible for any farm with data', () => {
      const result = service.checkEligibility(makeFarm());
      const shc = result.schemes.find((s) => s.schemeName.includes('Soil Health'));
      expect(shc).toBeDefined();
      expect(shc!.eligibilityStatus).toBe('Eligible');
    });
  });

  // ── Application steps ─────────────────────────────────────────

  describe('application steps', () => {
    it('should provide application steps for eligible schemes', () => {
      const result = service.checkEligibility(makeFarm());
      const eligible = result.schemes.filter(
        (s) => s.eligibilityStatus === 'Eligible',
      );
      eligible.forEach((s) => {
        expect(s.applicationSteps).toBeDefined();
        expect(s.applicationSteps!.length).toBeGreaterThan(0);
      });
    });

    it('should not provide application steps for ineligible schemes', () => {
      const result = service.checkEligibility(makeFarm({ total_acreage: 10 }));
      const pmKisan = result.schemes.find((s) => s.schemeName === 'PM-KISAN');
      expect(pmKisan!.applicationSteps).toBeUndefined();
    });

    it('should provide PM-KISAN specific steps', () => {
      const result = service.checkEligibility(makeFarm({ total_acreage: 3 }));
      const pmKisan = result.schemes.find((s) => s.schemeName === 'PM-KISAN');
      expect(pmKisan!.applicationSteps).toBeDefined();
      expect(pmKisan!.applicationSteps!.some((s) => s.includes('pmkisan.gov.in'))).toBe(true);
    });

    it('should provide PMFBY specific steps', () => {
      const result = service.checkEligibility(makeFarm());
      const pmfby = result.schemes.find((s) => s.schemeName.includes('PMFBY'));
      expect(pmfby!.applicationSteps).toBeDefined();
      expect(pmfby!.applicationSteps!.some((s) => s.includes('insurance'))).toBe(true);
    });
  });

  // ── Data source labeling ──────────────────────────────────────

  describe('data source labeling', () => {
    it('should label data source on every scheme result', () => {
      const result = service.checkEligibility(makeFarm());
      result.schemes.forEach((s) => {
        expect(['Public_Dataset', 'Synthetic_Dataset']).toContain(s.dataSource);
      });
    });

    it('should include data source in citation text', () => {
      const result = service.checkEligibility(makeFarm());
      result.schemes.forEach((s) => {
        expect(s.citations.length).toBeGreaterThan(0);
        const hasSrc = s.citations.some(
          (c) => c.source.includes('Synthetic Data') || c.source.includes('Public Dataset'),
        );
        expect(hasSrc).toBe(true);
      });
    });
  });

  // ── Citations ─────────────────────────────────────────────────

  describe('citations', () => {
    it('should include citations with URL for every scheme', () => {
      const result = service.checkEligibility(makeFarm());
      result.schemes.forEach((s) => {
        expect(s.citations.length).toBeGreaterThan(0);
        s.citations.forEach((c) => {
          expect(c.text).toBeDefined();
          expect(c.source).toBeDefined();
          expect(c.url).toBeDefined();
        });
      });
    });

    it('should link to official government sources', () => {
      const result = service.checkEligibility(makeFarm());
      const pmKisan = result.schemes.find((s) => s.schemeName === 'PM-KISAN');
      expect(pmKisan!.citations[0].url).toBe('https://pmkisan.gov.in');
    });
  });

  // ── Ineligibility reasons ─────────────────────────────────────

  describe('ineligibility reasons', () => {
    it('should explain acreage-based ineligibility clearly', () => {
      const result = service.checkEligibility(makeFarm({ total_acreage: 10 }));
      const pmKisan = result.schemes.find((s) => s.schemeName === 'PM-KISAN');
      expect(pmKisan!.reason).toContain('land holding');
      expect(pmKisan!.reason).toContain('exceeds');
    });

    it('should explain irrigation-based ineligibility clearly', () => {
      const result = service.checkEligibility(makeFarm({ irrigation_type: 'sprinkler' }));
      const pmksy = result.schemes.find((s) => s.schemeName.includes('PMKSY'));
      expect(pmksy!.reason).toContain('rainfed');
      expect(pmksy!.reason).toContain('sprinkler');
    });

    it('should explain insufficient data reason', () => {
      const result = service.checkEligibility(undefined);
      result.schemes.forEach((s) => {
        expect(s.reason).toContain('Farm profile data');
        expect(s.reason).toContain('required');
      });
    });
  });

  // ── Last Updated and staleness ────────────────────────────────

  describe('lastUpdated and staleness', () => {
    it('should include lastUpdated for every scheme', () => {
      const result = service.checkEligibility(makeFarm());
      result.schemes.forEach((s) => {
        expect(s.lastUpdated).toBeInstanceOf(Date);
      });
    });

    it('should warn when scheme info is older than 30 days', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);

      const svc = new SchemeService([
        makeScheme({ lastUpdated: oldDate }),
      ]);
      const result = svc.checkEligibility(makeFarm());
      expect(result.schemes[0].staleWarning).toBeDefined();
      expect(result.schemes[0].staleWarning).toContain('Information may be outdated');
    });

    it('should not warn when scheme info is recent', () => {
      const svc = new SchemeService([
        makeScheme({ lastUpdated: new Date() }),
      ]);
      const result = svc.checkEligibility(makeFarm());
      expect(result.schemes[0].staleWarning).toBeUndefined();
    });
  });

  // ── State criteria ────────────────────────────────────────────

  describe('state criteria', () => {
    it('should mark not eligible when farm is in wrong state', () => {
      const svc = new SchemeService([
        makeScheme({
          name: 'State Scheme',
          criteria: { states: ['Karnataka'] },
        }),
      ]);
      const result = svc.checkEligibility(
        makeFarm({ location: { latitude: 20, longitude: 78, state: 'Maharashtra' } }),
      );
      expect(result.schemes[0].eligibilityStatus).toBe('Not Eligible');
      expect(result.schemes[0].reason).toContain('Karnataka');
      expect(result.schemes[0].reason).toContain('Maharashtra');
    });

    it('should mark eligible when farm is in correct state', () => {
      const svc = new SchemeService([
        makeScheme({
          name: 'State Scheme',
          criteria: { states: ['Maharashtra'] },
        }),
      ]);
      const result = svc.checkEligibility(
        makeFarm({ location: { latitude: 20, longitude: 78, state: 'Maharashtra' } }),
      );
      expect(result.schemes[0].eligibilityStatus).toBe('Eligible');
    });
  });
});
