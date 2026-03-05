import { Citation } from '../../types/ai';
import { FarmContext } from '../../types/workflow';
import {
  SchemeDefinition,
  SchemeEligibility,
  SchemeCheckResult,
  EligibilityStatus,
  DataSource,
} from '../../types/scheme';

// ── Government Schemes Data ─────────────────────────────────────

const SCHEMES: SchemeDefinition[] = [
  {
    name: 'PM-KISAN',
    description:
      'Income support of ₹6,000 per year in three equal installments to all landholding farmer families.',
    dataSource: 'Synthetic_Dataset',
    sourceUrl: 'https://pmkisan.gov.in',
    lastUpdated: new Date('2024-01-15'),
    criteria: { maxAcreage: 5 },
  },
  {
    name: 'Pradhan Mantri Fasal Bima Yojana (PMFBY)',
    description:
      'Crop insurance scheme providing financial support to farmers suffering crop loss due to natural calamities.',
    dataSource: 'Synthetic_Dataset',
    sourceUrl: 'https://pmfby.gov.in',
    lastUpdated: new Date('2024-02-01'),
    criteria: {},
  },
  {
    name: 'Pradhan Mantri Krishi Sinchayee Yojana (PMKSY)',
    description:
      'Scheme to improve farm productivity by ensuring irrigation access to every farm (Har Khet Ko Pani).',
    dataSource: 'Synthetic_Dataset',
    sourceUrl: 'https://pmksy.gov.in',
    lastUpdated: new Date('2024-01-20'),
    criteria: { irrigationTypes: ['rainfed'] },
  },
  {
    name: 'Soil Health Card Scheme',
    description:
      'Provides soil health cards to farmers with crop-wise nutrient recommendations.',
    dataSource: 'Synthetic_Dataset',
    sourceUrl: 'https://soilhealth.dac.gov.in',
    lastUpdated: new Date('2024-03-01'),
    criteria: {},
  },
];

const STALE_THRESHOLD_DAYS = 30;

// ── SchemeService ───────────────────────────────────────────────

export class SchemeService {
  private schemes: SchemeDefinition[];

  constructor(schemes?: SchemeDefinition[]) {
    this.schemes = schemes ?? SCHEMES;
  }

  /**
   * Evaluate all known government schemes against the given farm profile.
   * Returns eligibility status, application guidance, citations, and staleness warnings.
   */
  checkEligibility(farm?: FarmContext): SchemeCheckResult {
    const results = this.schemes.map((scheme) =>
      this.evaluateScheme(scheme, farm),
    );

    const eligible = results.filter((r) => r.eligibilityStatus === 'Eligible').length;
    const insufficient = results.filter((r) => r.eligibilityStatus === 'Insufficient Data').length;

    let summary: string;
    if (!farm || insufficient === results.length) {
      summary =
        'Unable to evaluate scheme eligibility without sufficient farm profile data.';
    } else {
      summary = `Evaluated ${results.length} government schemes: ${eligible} eligible, ${results.length - eligible - insufficient} not eligible, ${insufficient} need more data.`;
    }

    return {
      schemes: results,
      summary,
      checkedAt: new Date(),
    };
  }

  /**
   * Evaluate a single scheme against the farm profile.
   */
  evaluateScheme(
    scheme: SchemeDefinition,
    farm?: FarmContext,
  ): SchemeEligibility {
    const citation: Citation = {
      text: `${scheme.name} scheme information`,
      source: `Source: ${this.formatDataSource(scheme.dataSource)}`,
      url: scheme.sourceUrl,
    };

    const staleWarning = this.getStaleWarning(scheme.lastUpdated);

    // Insufficient data case
    if (
      !farm ||
      (!farm.total_acreage && !farm.location && !farm.irrigation_type)
    ) {
      return {
        schemeName: scheme.name,
        description: scheme.description,
        eligibilityStatus: 'Insufficient Data',
        reason:
          'Farm profile data (acreage, location, or irrigation type) is required to determine eligibility.',
        dataSource: scheme.dataSource,
        citations: [citation],
        lastUpdated: scheme.lastUpdated,
        staleWarning,
      };
    }

    // Check acreage criteria
    if (scheme.criteria.maxAcreage != null && farm.total_acreage != null) {
      if (farm.total_acreage > scheme.criteria.maxAcreage) {
        return {
          schemeName: scheme.name,
          description: scheme.description,
          eligibilityStatus: 'Not Eligible',
          reason: `Your land holding (${farm.total_acreage} acres) exceeds the scheme limit of ${scheme.criteria.maxAcreage} acres.`,
          dataSource: scheme.dataSource,
          citations: [citation],
          lastUpdated: scheme.lastUpdated,
          staleWarning,
        };
      }
    }

    // Check irrigation type criteria
    if (scheme.criteria.irrigationTypes && farm.irrigation_type) {
      if (!scheme.criteria.irrigationTypes.includes(farm.irrigation_type)) {
        return {
          schemeName: scheme.name,
          description: scheme.description,
          eligibilityStatus: 'Not Eligible',
          reason: `This scheme targets ${scheme.criteria.irrigationTypes.join(', ')} irrigation. Your farm uses ${farm.irrigation_type} irrigation.`,
          dataSource: scheme.dataSource,
          citations: [citation],
          lastUpdated: scheme.lastUpdated,
          staleWarning,
        };
      }
    }

    // Check state criteria
    if (scheme.criteria.states && farm.location?.state) {
      if (
        !scheme.criteria.states
          .map((s) => s.toLowerCase())
          .includes(farm.location.state.toLowerCase())
      ) {
        return {
          schemeName: scheme.name,
          description: scheme.description,
          eligibilityStatus: 'Not Eligible',
          reason: `This scheme is available in ${scheme.criteria.states.join(', ')} only. Your farm is in ${farm.location.state}.`,
          dataSource: scheme.dataSource,
          citations: [citation],
          lastUpdated: scheme.lastUpdated,
          staleWarning,
        };
      }
    }

    // Eligible
    return {
      schemeName: scheme.name,
      description: scheme.description,
      eligibilityStatus: 'Eligible',
      reason:
        'Based on your farm profile, you appear to meet the basic eligibility criteria.',
      applicationSteps: this.getApplicationSteps(scheme.name),
      dataSource: scheme.dataSource,
      citations: [citation],
      lastUpdated: scheme.lastUpdated,
      staleWarning,
    };
  }

  /**
   * Return step-by-step application guidance for a given scheme.
   */
  private getApplicationSteps(schemeName: string): string[] {
    const commonSteps = [
      'Visit your nearest Common Service Centre (CSC) or use the official portal.',
      'Carry Aadhaar card, land records, and bank passbook.',
      'Fill the application form with assistance from CSC operator.',
      'Submit required documents for verification.',
      'Track application status online using your application ID.',
    ];

    const schemeSpecific: Record<string, string[]> = {
      'PM-KISAN': [
        'Register on the PM-KISAN portal (https://pmkisan.gov.in) or visit your local CSC.',
        'Provide Aadhaar number, bank account details, and land ownership documents.',
        'Complete eKYC verification through the portal.',
        'Submit the application and note your registration number.',
        'Track installment status on the PM-KISAN portal using your Aadhaar or phone number.',
      ],
      'Pradhan Mantri Fasal Bima Yojana (PMFBY)': [
        'Contact your bank branch or insurance company before the crop season deadline.',
        'Provide crop sowing details, land records, and bank account information.',
        'Pay the premium amount (subsidized rates for farmers).',
        'Collect the insurance policy document and note the policy number.',
        'In case of crop loss, report to the insurance company within 72 hours.',
      ],
    };

    return schemeSpecific[schemeName] ?? commonSteps;
  }

  /**
   * Format data source label per requirement 36.4.
   */
  private formatDataSource(ds: DataSource): string {
    return ds === 'Public_Dataset' ? 'Public Dataset' : 'Synthetic Data (Demo)';
  }

  /**
   * Return a staleness warning if the scheme info is older than 30 days.
   */
  private getStaleWarning(lastUpdated: Date): string | undefined {
    const ageMs = Date.now() - lastUpdated.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > STALE_THRESHOLD_DAYS) {
      return `Information may be outdated. Last updated: ${lastUpdated.toISOString().split('T')[0]}`;
    }
    return undefined;
  }
}
