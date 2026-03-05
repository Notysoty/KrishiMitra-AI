import { v4 as uuidv4 } from 'uuid';
import { Citation } from '../../types/ai';
import {
  WorkflowType,
  WorkflowResult,
  WorkflowStep,
  FarmContext,
  GovernmentScheme,
} from '../../types/workflow';

// ── Government Schemes Data (Synthetic / Public) ────────────────

const GOVERNMENT_SCHEMES: Array<{
  name: string;
  description: string;
  source: string;
  sourceUrl: string;
  lastUpdated: Date;
  criteria: {
    maxAcreage?: number;
    irrigationTypes?: string[];
    cropTypes?: string[];
    states?: string[];
  };
}> = [
  {
    name: 'PM-KISAN',
    description:
      'Income support of ₹6,000 per year in three equal installments to all landholding farmer families.',
    source: 'Synthetic Data (Demo)',
    sourceUrl: 'https://pmkisan.gov.in',
    lastUpdated: new Date('2024-01-15'),
    criteria: { maxAcreage: 5 },
  },
  {
    name: 'Pradhan Mantri Fasal Bima Yojana (PMFBY)',
    description:
      'Crop insurance scheme providing financial support to farmers suffering crop loss due to natural calamities.',
    source: 'Synthetic Data (Demo)',
    sourceUrl: 'https://pmfby.gov.in',
    lastUpdated: new Date('2024-02-01'),
    criteria: {},
  },
  {
    name: 'Pradhan Mantri Krishi Sinchayee Yojana (PMKSY)',
    description:
      'Scheme to improve farm productivity by ensuring irrigation access to every farm (Har Khet Ko Pani).',
    source: 'Synthetic Data (Demo)',
    sourceUrl: 'https://pmksy.gov.in',
    lastUpdated: new Date('2024-01-20'),
    criteria: { irrigationTypes: ['rainfed'] },
  },
  {
    name: 'Soil Health Card Scheme',
    description:
      'Provides soil health cards to farmers with crop-wise nutrient recommendations.',
    source: 'Synthetic Data (Demo)',
    sourceUrl: 'https://soilhealth.dac.gov.in',
    lastUpdated: new Date('2024-03-01'),
    criteria: {},
  },
];

// ── Crop Calendar Data (Synthetic) ──────────────────────────────

const CROP_CALENDAR: Record<
  string,
  { kharif: { plant: string; harvest: string }; rabi: { plant: string; harvest: string } }
> = {
  rice: {
    kharif: { plant: 'June-July', harvest: 'October-November' },
    rabi: { plant: 'November-December', harvest: 'March-April' },
  },
  wheat: {
    kharif: { plant: 'N/A', harvest: 'N/A' },
    rabi: { plant: 'October-November', harvest: 'March-April' },
  },
  cotton: {
    kharif: { plant: 'April-May', harvest: 'October-December' },
    rabi: { plant: 'N/A', harvest: 'N/A' },
  },
  sugarcane: {
    kharif: { plant: 'February-March', harvest: 'January-March (next year)' },
    rabi: { plant: 'October', harvest: 'October-December (next year)' },
  },
  tomato: {
    kharif: { plant: 'June-July', harvest: 'September-October' },
    rabi: { plant: 'October-November', harvest: 'January-February' },
  },
};

const DEFAULT_CALENDAR = {
  kharif: { plant: 'June-July', harvest: 'October-November' },
  rabi: { plant: 'October-November', harvest: 'March-April' },
};

// ── Saved Results Store ─────────────────────────────────────────

export class WorkflowResultStore {
  private results: Map<string, WorkflowResult> = new Map();

  save(result: WorkflowResult): WorkflowResult {
    this.results.set(result.id, result);
    return result;
  }

  get(id: string, userId: string, tenantId: string): WorkflowResult | undefined {
    const result = this.results.get(id);
    if (result && result.userId === userId && result.tenantId === tenantId) {
      return result;
    }
    return undefined;
  }

  listByUser(userId: string, tenantId: string): WorkflowResult[] {
    return Array.from(this.results.values()).filter(
      (r) => r.userId === userId && r.tenantId === tenantId,
    );
  }
}

// ── WorkflowService ─────────────────────────────────────────────

export class WorkflowService {
  private store: WorkflowResultStore;

  constructor(store?: WorkflowResultStore) {
    this.store = store ?? new WorkflowResultStore();
  }

  getStore(): WorkflowResultStore {
    return this.store;
  }

  async execute(
    type: WorkflowType,
    userId: string,
    tenantId: string,
    farm?: FarmContext,
  ): Promise<WorkflowResult> {
    switch (type) {
      case 'plan_season':
        return this.planSeason(userId, tenantId, farm);
      case 'check_eligibility':
        return this.checkEligibility(userId, tenantId, farm);
      default:
        throw new WorkflowError(`Unsupported workflow type: ${type}`);
    }
  }

  // ── Plan My Season ──────────────────────────────────────────

  private async planSeason(
    userId: string,
    tenantId: string,
    farm?: FarmContext,
  ): Promise<WorkflowResult> {
    const steps: WorkflowStep[] = [];
    const citations: Citation[] = [];

    // Step 1: Assess farm profile
    steps.push(this.assessFarmProfile(farm));

    // Step 2: Crop selection recommendations
    steps.push(this.recommendCrops(farm, citations));

    // Step 3: Planting schedule
    steps.push(this.generatePlantingSchedule(farm, citations));

    // Step 4: Harvest timing
    steps.push(this.generateHarvestPlan(farm, citations));

    // Step 5: Input planning
    steps.push(this.planInputs(farm));

    const result: WorkflowResult = {
      id: uuidv4(),
      workflowType: 'plan_season',
      userId,
      tenantId,
      title: 'Season Planning',
      summary: this.generateSeasonSummary(steps, farm),
      steps,
      citations,
      createdAt: new Date(),
    };

    return this.store.save(result);
  }

  private assessFarmProfile(farm?: FarmContext): WorkflowStep {
    if (!farm || (!farm.location && !farm.crops && !farm.total_acreage)) {
      return {
        step: 1,
        title: 'Farm Profile Assessment',
        description:
          'Unable to assess your farm profile. Please complete your farm profile to receive personalized recommendations.',
        status: 'missing_data',
        missingFields: ['location', 'crops', 'total_acreage', 'irrigation_type'],
      };
    }

    const missing: string[] = [];
    if (!farm.location) missing.push('location');
    if (!farm.crops || farm.crops.length === 0) missing.push('crops');
    if (!farm.total_acreage) missing.push('total_acreage');
    if (!farm.irrigation_type) missing.push('irrigation_type');

    if (missing.length > 0) {
      return {
        step: 1,
        title: 'Farm Profile Assessment',
        description: `Your farm profile is partially complete. Missing information: ${missing.join(', ')}. Some recommendations may be limited.`,
        status: 'incomplete',
        missingFields: missing,
      };
    }

    const cropList = farm.crops!.map((c) => c.crop_type).join(', ');
    return {
      step: 1,
      title: 'Farm Profile Assessment',
      description: `Farm profile reviewed: ${farm.total_acreage} acres, ${farm.irrigation_type} irrigation, growing ${cropList}.`,
      status: 'completed',
    };
  }

  private recommendCrops(farm: FarmContext | undefined, citations: Citation[]): WorkflowStep {
    if (!farm?.crops || farm.crops.length === 0) {
      return {
        step: 2,
        title: 'Crop Selection',
        description:
          'Unable to provide crop recommendations without current crop information. Please add your crops to your farm profile.',
        status: 'missing_data',
        missingFields: ['crops'],
      };
    }

    const cropNames = farm.crops.map((c) => c.crop_type);
    const citation: Citation = {
      text: 'Crop selection based on regional suitability data',
      source: 'Synthetic Data (Demo)',
      url: 'https://farmer.gov.in/cropstaticsdata.aspx',
    };
    citations.push(citation);

    return {
      step: 2,
      title: 'Crop Selection',
      description: `Based on your profile, your current crops (${cropNames.join(', ')}) are suitable for your region. Consider crop rotation to maintain soil health.`,
      status: 'completed',
      citations: [citation],
    };
  }

  private generatePlantingSchedule(
    farm: FarmContext | undefined,
    citations: Citation[],
  ): WorkflowStep {
    if (!farm?.crops || farm.crops.length === 0) {
      return {
        step: 3,
        title: 'Planting Schedule',
        description:
          'Unable to generate planting schedule without crop information. Please add crops to your farm profile.',
        status: 'missing_data',
        missingFields: ['crops'],
      };
    }

    const scheduleLines = farm.crops.map((crop) => {
      const calendar = CROP_CALENDAR[crop.crop_type.toLowerCase()] ?? DEFAULT_CALENDAR;
      const plantingDate = crop.planting_date
        ? `Planned: ${crop.planting_date}`
        : `Recommended Kharif: ${calendar.kharif.plant}, Rabi: ${calendar.rabi.plant}`;
      return `• ${crop.crop_type}: ${plantingDate}`;
    });

    const citation: Citation = {
      text: 'Planting calendar based on regional agricultural data',
      source: 'Synthetic Data (Demo)',
      url: 'https://farmer.gov.in/cropCalendar.aspx',
    };
    citations.push(citation);

    return {
      step: 3,
      title: 'Planting Schedule',
      description: `Planting schedule for your crops:\n${scheduleLines.join('\n')}`,
      status: 'completed',
      citations: [citation],
    };
  }

  private generateHarvestPlan(
    farm: FarmContext | undefined,
    citations: Citation[],
  ): WorkflowStep {
    if (!farm?.crops || farm.crops.length === 0) {
      return {
        step: 4,
        title: 'Harvest Timing',
        description:
          'Unable to generate harvest plan without crop information. Please add crops to your farm profile.',
        status: 'missing_data',
        missingFields: ['crops'],
      };
    }

    const harvestLines = farm.crops.map((crop) => {
      const calendar = CROP_CALENDAR[crop.crop_type.toLowerCase()] ?? DEFAULT_CALENDAR;
      const harvestDate = crop.expected_harvest_date
        ? `Expected: ${crop.expected_harvest_date}`
        : `Typical Kharif: ${calendar.kharif.harvest}, Rabi: ${calendar.rabi.harvest}`;
      return `• ${crop.crop_type}: ${harvestDate}`;
    });

    const citation: Citation = {
      text: 'Harvest timing based on crop growth cycle data',
      source: 'Synthetic Data (Demo)',
    };
    citations.push(citation);

    return {
      step: 4,
      title: 'Harvest Timing',
      description: `Expected harvest schedule:\n${harvestLines.join('\n')}`,
      status: 'completed',
      citations: [citation],
    };
  }

  private planInputs(farm?: FarmContext): WorkflowStep {
    if (!farm?.crops || farm.crops.length === 0 || !farm.total_acreage) {
      const missing: string[] = [];
      if (!farm?.crops || farm.crops.length === 0) missing.push('crops');
      if (!farm?.total_acreage) missing.push('total_acreage');
      return {
        step: 5,
        title: 'Input Planning',
        description:
          'Unable to plan inputs without crop and acreage information. Please complete your farm profile.',
        status: 'missing_data',
        missingFields: missing,
      };
    }

    const irrigationNote = farm.irrigation_type
      ? `With ${farm.irrigation_type} irrigation, plan water scheduling accordingly.`
      : 'Add irrigation type to your profile for water scheduling recommendations.';

    return {
      step: 5,
      title: 'Input Planning',
      description: `For ${farm.total_acreage} acres: plan fertilizer, seed, and water inputs for each crop. ${irrigationNote} Consult a local agronomist for specific input quantities.`,
      status: 'completed',
    };
  }

  private generateSeasonSummary(steps: WorkflowStep[], farm?: FarmContext): string {
    const completed = steps.filter((s) => s.status === 'completed').length;
    const total = steps.length;
    const missingData = steps.filter((s) => s.status === 'missing_data').length;

    if (missingData === total) {
      return 'Season plan could not be generated due to missing farm profile data. Please complete your farm profile.';
    }

    const cropInfo = farm?.crops?.map((c) => c.crop_type).join(', ') ?? 'unknown crops';
    return `Season plan generated for ${cropInfo}: ${completed}/${total} steps completed.${missingData > 0 ? ` ${missingData} step(s) need additional data.` : ''}`;
  }

  // ── Check Scheme Eligibility ────────────────────────────────

  private async checkEligibility(
    userId: string,
    tenantId: string,
    farm?: FarmContext,
  ): Promise<WorkflowResult> {
    const steps: WorkflowStep[] = [];
    const citations: Citation[] = [];

    const schemes = this.evaluateSchemes(farm, citations);

    // Step 1: Profile check
    steps.push(this.schemeProfileCheck(farm));

    // Step 2+: One step per scheme
    schemes.forEach((scheme, index) => {
      const schemeCitation: Citation = {
        text: `${scheme.name} eligibility data`,
        source: scheme.source,
        url: scheme.sourceUrl,
      };
      citations.push(schemeCitation);

      steps.push({
        step: index + 2,
        title: scheme.name,
        description: this.formatSchemeDescription(scheme),
        status:
          scheme.eligibility === 'eligible'
            ? 'completed'
            : scheme.eligibility === 'insufficient_data'
              ? 'missing_data'
              : 'incomplete',
        missingFields:
          scheme.eligibility === 'insufficient_data'
            ? ['total_acreage', 'location', 'crops']
            : undefined,
        citations: [schemeCitation],
      });
    });

    const eligible = schemes.filter((s) => s.eligibility === 'eligible').length;
    const result: WorkflowResult = {
      id: uuidv4(),
      workflowType: 'check_eligibility',
      userId,
      tenantId,
      title: 'Government Scheme Eligibility',
      summary: farm
        ? `Evaluated ${schemes.length} government schemes: ${eligible} potentially eligible.`
        : 'Unable to evaluate scheme eligibility without farm profile data.',
      steps,
      citations,
      createdAt: new Date(),
    };

    return this.store.save(result);
  }

  private schemeProfileCheck(farm?: FarmContext): WorkflowStep {
    if (!farm || (!farm.location && !farm.crops && !farm.total_acreage)) {
      return {
        step: 1,
        title: 'Profile Verification',
        description:
          'Farm profile data is required to evaluate scheme eligibility. Please complete your farm profile.',
        status: 'missing_data',
        missingFields: ['location', 'crops', 'total_acreage', 'irrigation_type'],
      };
    }

    const missing: string[] = [];
    if (!farm.location) missing.push('location');
    if (!farm.total_acreage) missing.push('total_acreage');

    if (missing.length > 0) {
      return {
        step: 1,
        title: 'Profile Verification',
        description: `Profile partially complete. Missing: ${missing.join(', ')}. Some eligibility checks may be limited.`,
        status: 'incomplete',
        missingFields: missing,
      };
    }

    return {
      step: 1,
      title: 'Profile Verification',
      description: 'Farm profile verified for scheme eligibility evaluation.',
      status: 'completed',
    };
  }

  evaluateSchemes(
    farm: FarmContext | undefined,
    citations: Citation[],
  ): GovernmentScheme[] {
    return GOVERNMENT_SCHEMES.map((scheme) => {
      const citation: Citation = {
        text: `${scheme.name} scheme information`,
        source: scheme.source,
        url: scheme.sourceUrl,
      };

      if (!farm || (!farm.total_acreage && !farm.location && !farm.irrigation_type)) {
        return {
          name: scheme.name,
          description: scheme.description,
          eligibility: 'insufficient_data' as const,
          reason: 'Farm profile data is required to determine eligibility.',
          source: scheme.source,
          sourceUrl: scheme.sourceUrl,
          lastUpdated: scheme.lastUpdated,
        };
      }

      // Check acreage criteria
      if (scheme.criteria.maxAcreage && farm.total_acreage) {
        if (farm.total_acreage > scheme.criteria.maxAcreage) {
          return {
            name: scheme.name,
            description: scheme.description,
            eligibility: 'not_eligible' as const,
            reason: `Land holding exceeds ${scheme.criteria.maxAcreage} acres limit.`,
            source: scheme.source,
            sourceUrl: scheme.sourceUrl,
            lastUpdated: scheme.lastUpdated,
          };
        }
      }

      // Check irrigation type criteria
      if (scheme.criteria.irrigationTypes && farm.irrigation_type) {
        if (!scheme.criteria.irrigationTypes.includes(farm.irrigation_type)) {
          return {
            name: scheme.name,
            description: scheme.description,
            eligibility: 'not_eligible' as const,
            reason: `Scheme targets ${scheme.criteria.irrigationTypes.join(', ')} irrigation. Your farm uses ${farm.irrigation_type}.`,
            source: scheme.source,
            sourceUrl: scheme.sourceUrl,
            lastUpdated: scheme.lastUpdated,
          };
        }
      }

      // Eligible
      citations.push(citation);
      return {
        name: scheme.name,
        description: scheme.description,
        eligibility: 'eligible' as const,
        reason: 'Based on your farm profile, you appear to meet the basic eligibility criteria.',
        applicationSteps: [
          'Visit your nearest Common Service Centre (CSC)',
          'Carry Aadhaar card, land records, and bank passbook',
          'Fill the application form with assistance from CSC operator',
          'Track application status online',
        ],
        source: scheme.source,
        sourceUrl: scheme.sourceUrl,
        lastUpdated: scheme.lastUpdated,
      };
    });
  }

  private formatSchemeDescription(scheme: GovernmentScheme): string {
    let desc = `${scheme.description}\n\nEligibility: ${scheme.eligibility === 'eligible' ? '✓ Potentially Eligible' : scheme.eligibility === 'not_eligible' ? '✗ Not Eligible' : '? Insufficient Data'}\nReason: ${scheme.reason}`;

    if (scheme.applicationSteps && scheme.applicationSteps.length > 0) {
      desc += `\n\nHow to apply:\n${scheme.applicationSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    }

    desc += `\n\nSource: ${scheme.source} (Last updated: ${scheme.lastUpdated.toISOString().split('T')[0]})`;
    return desc;
  }
}

// ── Error class ─────────────────────────────────────────────────

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}
