import {
  WorkflowService,
  WorkflowError,
  WorkflowResultStore,
} from './WorkflowService';
import { FarmContext } from '../../types/workflow';

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

// ── WorkflowResultStore ─────────────────────────────────────────

describe('WorkflowResultStore', () => {
  let store: WorkflowResultStore;

  beforeEach(() => {
    store = new WorkflowResultStore();
  });

  it('should save and retrieve a result', () => {
    const result = {
      id: 'r-1',
      workflowType: 'plan_season' as const,
      userId: 'u1',
      tenantId: 't1',
      title: 'Test',
      summary: 'Summary',
      steps: [],
      citations: [],
      createdAt: new Date(),
    };

    store.save(result);
    expect(store.get('r-1', 'u1', 't1')).toEqual(result);
  });

  it('should not return result for wrong user', () => {
    const result = {
      id: 'r-2',
      workflowType: 'plan_season' as const,
      userId: 'u1',
      tenantId: 't1',
      title: 'Test',
      summary: 'Summary',
      steps: [],
      citations: [],
      createdAt: new Date(),
    };

    store.save(result);
    expect(store.get('r-2', 'u2', 't1')).toBeUndefined();
  });

  it('should not return result for wrong tenant', () => {
    const result = {
      id: 'r-3',
      workflowType: 'plan_season' as const,
      userId: 'u1',
      tenantId: 't1',
      title: 'Test',
      summary: 'Summary',
      steps: [],
      citations: [],
      createdAt: new Date(),
    };

    store.save(result);
    expect(store.get('r-3', 'u1', 't2')).toBeUndefined();
  });

  it('should list results by user and tenant', () => {
    const base = {
      workflowType: 'plan_season' as const,
      title: 'Test',
      summary: 'Summary',
      steps: [],
      citations: [],
      createdAt: new Date(),
    };

    store.save({ ...base, id: 'r-a', userId: 'u1', tenantId: 't1' });
    store.save({ ...base, id: 'r-b', userId: 'u1', tenantId: 't1' });
    store.save({ ...base, id: 'r-c', userId: 'u2', tenantId: 't1' });

    expect(store.listByUser('u1', 't1')).toHaveLength(2);
    expect(store.listByUser('u2', 't1')).toHaveLength(1);
    expect(store.listByUser('u1', 't2')).toHaveLength(0);
  });
});

// ── WorkflowService.execute ─────────────────────────────────────

describe('WorkflowService.execute', () => {
  let service: WorkflowService;

  beforeEach(() => {
    service = new WorkflowService();
  });

  it('should reject unsupported workflow type', async () => {
    await expect(
      service.execute('invalid_type' as any, 'u1', 't1'),
    ).rejects.toThrow(WorkflowError);
    await expect(
      service.execute('invalid_type' as any, 'u1', 't1'),
    ).rejects.toThrow('Unsupported workflow type');
  });
});

// ── Plan Season Workflow ────────────────────────────────────────

describe('WorkflowService - Plan Season', () => {
  let service: WorkflowService;

  beforeEach(() => {
    service = new WorkflowService();
  });

  it('should generate a complete season plan with full farm data', async () => {
    const result = await service.execute('plan_season', 'u1', 't1', makeFarm());

    expect(result.workflowType).toBe('plan_season');
    expect(result.userId).toBe('u1');
    expect(result.tenantId).toBe('t1');
    expect(result.id).toBeDefined();
    expect(result.title).toBe('Season Planning');
    expect(result.steps.length).toBe(5);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('should mark all steps completed with full farm data', async () => {
    const result = await service.execute('plan_season', 'u1', 't1', makeFarm());

    const completedSteps = result.steps.filter((s) => s.status === 'completed');
    expect(completedSteps.length).toBe(5);
  });

  it('should include crop-specific planting schedule', async () => {
    const result = await service.execute('plan_season', 'u1', 't1', makeFarm());

    const plantingStep = result.steps.find((s) => s.title === 'Planting Schedule');
    expect(plantingStep).toBeDefined();
    expect(plantingStep!.description).toContain('rice');
    expect(plantingStep!.citations).toBeDefined();
    expect(plantingStep!.citations!.length).toBeGreaterThan(0);
  });

  it('should include harvest timing', async () => {
    const result = await service.execute('plan_season', 'u1', 't1', makeFarm());

    const harvestStep = result.steps.find((s) => s.title === 'Harvest Timing');
    expect(harvestStep).toBeDefined();
    expect(harvestStep!.description).toContain('rice');
  });

  it('should indicate missing data when no farm provided', async () => {
    const result = await service.execute('plan_season', 'u1', 't1');

    const missingSteps = result.steps.filter((s) => s.status === 'missing_data');
    expect(missingSteps.length).toBeGreaterThan(0);
    expect(result.summary).toContain('missing');
  });

  it('should indicate missing data when farm has no crops', async () => {
    const result = await service.execute(
      'plan_season',
      'u1',
      't1',
      makeFarm({ crops: [] }),
    );

    const cropStep = result.steps.find((s) => s.title === 'Crop Selection');
    expect(cropStep!.status).toBe('missing_data');
    expect(cropStep!.missingFields).toContain('crops');
  });

  it('should handle partial farm data with incomplete status', async () => {
    const result = await service.execute(
      'plan_season',
      'u1',
      't1',
      makeFarm({ location: undefined }),
    );

    const profileStep = result.steps.find((s) => s.title === 'Farm Profile Assessment');
    expect(profileStep!.status).toBe('incomplete');
    expect(profileStep!.missingFields).toContain('location');
  });

  it('should use default calendar for unknown crops', async () => {
    const result = await service.execute(
      'plan_season',
      'u1',
      't1',
      makeFarm({
        crops: [{ crop_type: 'exotic_fruit', acreage: 1 }],
      }),
    );

    const plantingStep = result.steps.find((s) => s.title === 'Planting Schedule');
    expect(plantingStep!.status).toBe('completed');
    expect(plantingStep!.description).toContain('exotic_fruit');
  });

  it('should save result for future reference', async () => {
    const result = await service.execute('plan_season', 'u1', 't1', makeFarm());

    const saved = service.getStore().get(result.id, 'u1', 't1');
    expect(saved).toBeDefined();
    expect(saved!.id).toBe(result.id);
  });

  it('should provide citations with external data', async () => {
    const result = await service.execute('plan_season', 'u1', 't1', makeFarm());

    expect(result.citations.length).toBeGreaterThan(0);
    result.citations.forEach((c) => {
      expect(c.text).toBeDefined();
      expect(c.source).toBeDefined();
    });
  });
});

// ── Check Eligibility Workflow ──────────────────────────────────

describe('WorkflowService - Check Eligibility', () => {
  let service: WorkflowService;

  beforeEach(() => {
    service = new WorkflowService();
  });

  it('should evaluate government schemes with full farm data', async () => {
    const result = await service.execute('check_eligibility', 'u1', 't1', makeFarm());

    expect(result.workflowType).toBe('check_eligibility');
    expect(result.title).toBe('Government Scheme Eligibility');
    // Step 1 is profile check, then one step per scheme
    expect(result.steps.length).toBeGreaterThan(1);
    expect(result.citations.length).toBeGreaterThan(0);
  });

  it('should mark eligible schemes correctly', async () => {
    const farm = makeFarm({ total_acreage: 3 }); // Under PM-KISAN 5 acre limit
    const result = await service.execute('check_eligibility', 'u1', 't1', farm);

    const pmKisanStep = result.steps.find((s) => s.title === 'PM-KISAN');
    expect(pmKisanStep).toBeDefined();
    expect(pmKisanStep!.status).toBe('completed'); // eligible
    expect(pmKisanStep!.description).toContain('Eligible');
  });

  it('should mark ineligible schemes with reason', async () => {
    const farm = makeFarm({ total_acreage: 10 }); // Over PM-KISAN 5 acre limit
    const result = await service.execute('check_eligibility', 'u1', 't1', farm);

    const pmKisanStep = result.steps.find((s) => s.title === 'PM-KISAN');
    expect(pmKisanStep).toBeDefined();
    expect(pmKisanStep!.status).toBe('incomplete'); // not_eligible
    expect(pmKisanStep!.description).toContain('Not Eligible');
  });

  it('should mark PMKSY not eligible for non-rainfed farms', async () => {
    const farm = makeFarm({ irrigation_type: 'drip' });
    const result = await service.execute('check_eligibility', 'u1', 't1', farm);

    const pmksyStep = result.steps.find((s) =>
      s.title.includes('PMKSY'),
    );
    expect(pmksyStep).toBeDefined();
    expect(pmksyStep!.description).toContain('Not Eligible');
  });

  it('should mark PMKSY eligible for rainfed farms', async () => {
    const farm = makeFarm({ irrigation_type: 'rainfed' });
    const result = await service.execute('check_eligibility', 'u1', 't1', farm);

    const pmksyStep = result.steps.find((s) =>
      s.title.includes('PMKSY'),
    );
    expect(pmksyStep).toBeDefined();
    expect(pmksyStep!.description).toContain('Eligible');
  });

  it('should indicate insufficient data when no farm provided', async () => {
    const result = await service.execute('check_eligibility', 'u1', 't1');

    const profileStep = result.steps[0];
    expect(profileStep.status).toBe('missing_data');
    expect(result.summary).toContain('Unable to evaluate');
  });

  it('should include application steps for eligible schemes', async () => {
    const result = await service.execute('check_eligibility', 'u1', 't1', makeFarm());

    const eligibleStep = result.steps.find(
      (s) => s.status === 'completed' && s.step > 1,
    );
    expect(eligibleStep).toBeDefined();
    expect(eligibleStep!.description).toContain('How to apply');
  });

  it('should include citations with source information', async () => {
    const result = await service.execute('check_eligibility', 'u1', 't1', makeFarm());

    expect(result.citations.length).toBeGreaterThan(0);
    result.citations.forEach((c) => {
      expect(c.source).toBeDefined();
    });
  });

  it('should save result for future reference', async () => {
    const result = await service.execute('check_eligibility', 'u1', 't1', makeFarm());

    const saved = service.getStore().get(result.id, 'u1', 't1');
    expect(saved).toBeDefined();
    expect(saved!.workflowType).toBe('check_eligibility');
  });
});

// ── evaluateSchemes ─────────────────────────────────────────────

describe('WorkflowService.evaluateSchemes', () => {
  let service: WorkflowService;

  beforeEach(() => {
    service = new WorkflowService();
  });

  it('should return all schemes as insufficient_data when no farm', () => {
    const schemes = service.evaluateSchemes(undefined, []);
    schemes.forEach((s) => {
      expect(s.eligibility).toBe('insufficient_data');
    });
  });

  it('should return 4 government schemes', () => {
    const schemes = service.evaluateSchemes(makeFarm(), []);
    expect(schemes.length).toBe(4);
  });

  it('should include lastUpdated for all schemes', () => {
    const schemes = service.evaluateSchemes(makeFarm(), []);
    schemes.forEach((s) => {
      expect(s.lastUpdated).toBeInstanceOf(Date);
    });
  });
});
