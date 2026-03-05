/**
 * Localization and Cultural Adaptation Service
 *
 * Provides region-specific crop calendars, Indian measurement unit support,
 * DD/MM/YYYY date formatting, INR currency formatting, and culturally
 * appropriate agricultural terminology.
 *
 * Requirements: 38.1, 38.2, 38.3, 38.4, 38.5, 38.6, 38.7, 38.8
 */

// ── Types ──────────────────────────────────────────────────────

export type IndianRegion =
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'central'
  | 'northeast';

export type Season = 'kharif' | 'rabi' | 'zaid';

export interface CropCalendarEntry {
  crop: string;
  season: Season;
  sowingStart: string;   // MM-DD
  sowingEnd: string;     // MM-DD
  harvestStart: string;  // MM-DD
  harvestEnd: string;    // MM-DD
  practices: string[];
}

export interface RegionCropCalendar {
  region: IndianRegion;
  displayName: string;
  climate: string;
  entries: CropCalendarEntry[];
}

export type MeasurementUnit = 'acres' | 'hectares' | 'quintals' | 'kg' | 'liters' | 'ml';

export interface UnitConversion {
  from: MeasurementUnit;
  to: MeasurementUnit;
  factor: number;
}

export interface RegionalPreferencesConfig {
  region: IndianRegion;
  language: string;
  measurement_units: {
    area: 'acres' | 'hectares';
    weight: 'quintals' | 'kg';
    volume: 'liters' | 'ml';
  };
  date_format: string;
  currency: string;
}

// ── Crop Calendars ─────────────────────────────────────────────

export const CROP_CALENDARS: RegionCropCalendar[] = [
  {
    region: 'north',
    displayName: 'North India',
    climate: 'Semi-arid to sub-humid, hot summers, cold winters',
    entries: [
      { crop: 'wheat', season: 'rabi', sowingStart: '10-15', sowingEnd: '11-30', harvestStart: '03-15', harvestEnd: '04-30', practices: ['Irrigated cultivation', 'Zero tillage recommended'] },
      { crop: 'rice', season: 'kharif', sowingStart: '06-15', sowingEnd: '07-15', harvestStart: '10-15', harvestEnd: '11-30', practices: ['Transplanting method', 'Puddled fields'] },
      { crop: 'mustard', season: 'rabi', sowingStart: '10-01', sowingEnd: '10-31', harvestStart: '02-15', harvestEnd: '03-31', practices: ['Rainfed or irrigated', 'Intercropping with wheat'] },
      { crop: 'sugarcane', season: 'kharif', sowingStart: '02-15', sowingEnd: '03-31', harvestStart: '01-01', harvestEnd: '03-31', practices: ['Sett planting', 'Ratoon management'] },
      { crop: 'maize', season: 'kharif', sowingStart: '06-15', sowingEnd: '07-15', harvestStart: '09-15', harvestEnd: '10-31', practices: ['Ridge planting', 'Intercropping with pulses'] },
    ],
  },
  {
    region: 'south',
    displayName: 'South India',
    climate: 'Tropical, warm year-round, monsoon-dependent',
    entries: [
      { crop: 'rice', season: 'kharif', sowingStart: '06-01', sowingEnd: '07-15', harvestStart: '10-01', harvestEnd: '11-30', practices: ['SRI method popular', 'Tank irrigation'] },
      { crop: 'rice', season: 'rabi', sowingStart: '11-01', sowingEnd: '12-15', harvestStart: '03-01', harvestEnd: '04-15', practices: ['Second crop with canal irrigation'] },
      { crop: 'ragi', season: 'kharif', sowingStart: '06-15', sowingEnd: '07-31', harvestStart: '10-15', harvestEnd: '11-30', practices: ['Transplanting in raised beds', 'Rainfed cultivation'] },
      { crop: 'coconut', season: 'kharif', sowingStart: '06-01', sowingEnd: '09-30', harvestStart: '01-01', harvestEnd: '12-31', practices: ['Perennial crop', 'Basin irrigation'] },
      { crop: 'cotton', season: 'kharif', sowingStart: '06-01', sowingEnd: '07-15', harvestStart: '11-01', harvestEnd: '01-31', practices: ['Bt cotton varieties', 'Drip irrigation'] },
    ],
  },
  {
    region: 'east',
    displayName: 'East India',
    climate: 'Sub-tropical, high rainfall, humid',
    entries: [
      { crop: 'rice', season: 'kharif', sowingStart: '06-01', sowingEnd: '07-15', harvestStart: '10-15', harvestEnd: '11-30', practices: ['Transplanting in lowlands', 'Direct seeding in uplands'] },
      { crop: 'jute', season: 'kharif', sowingStart: '03-15', sowingEnd: '05-15', harvestStart: '07-15', harvestEnd: '09-30', practices: ['Broadcast sowing', 'Retting in ponds'] },
      { crop: 'potato', season: 'rabi', sowingStart: '10-15', sowingEnd: '11-30', harvestStart: '02-01', harvestEnd: '03-15', practices: ['Ridge planting', 'Cold storage post-harvest'] },
      { crop: 'lentil', season: 'rabi', sowingStart: '10-15', sowingEnd: '11-15', harvestStart: '02-15', harvestEnd: '03-31', practices: ['Rainfed cultivation', 'Residual moisture'] },
      { crop: 'maize', season: 'kharif', sowingStart: '06-15', sowingEnd: '07-15', harvestStart: '09-15', harvestEnd: '10-31', practices: ['Upland cultivation', 'Intercropping with pulses'] },
    ],
  },
  {
    region: 'west',
    displayName: 'West India',
    climate: 'Arid to semi-arid, low rainfall, hot',
    entries: [
      { crop: 'cotton', season: 'kharif', sowingStart: '06-01', sowingEnd: '07-15', harvestStart: '11-01', harvestEnd: '01-31', practices: ['Bt cotton dominant', 'Furrow irrigation'] },
      { crop: 'groundnut', season: 'kharif', sowingStart: '06-15', sowingEnd: '07-15', harvestStart: '10-15', harvestEnd: '11-30', practices: ['Rainfed cultivation', 'Bunch and spreading types'] },
      { crop: 'bajra', season: 'kharif', sowingStart: '06-15', sowingEnd: '07-15', harvestStart: '09-15', harvestEnd: '10-31', practices: ['Drought-tolerant varieties', 'Rainfed'] },
      { crop: 'cumin', season: 'rabi', sowingStart: '11-01', sowingEnd: '11-30', harvestStart: '02-15', harvestEnd: '03-31', practices: ['Light irrigation', 'Sandy loam soils preferred'] },
      { crop: 'castor', season: 'kharif', sowingStart: '07-01', sowingEnd: '08-15', harvestStart: '12-01', harvestEnd: '02-28', practices: ['Rainfed', 'Wide spacing'] },
    ],
  },
  {
    region: 'central',
    displayName: 'Central India',
    climate: 'Semi-arid, moderate rainfall, extreme temperatures',
    entries: [
      { crop: 'soybean', season: 'kharif', sowingStart: '06-15', sowingEnd: '07-15', harvestStart: '10-01', harvestEnd: '10-31', practices: ['Seed treatment essential', 'Ridge and furrow'] },
      { crop: 'wheat', season: 'rabi', sowingStart: '11-01', sowingEnd: '11-30', harvestStart: '03-01', harvestEnd: '04-15', practices: ['Irrigated cultivation', 'Timely sowing critical'] },
      { crop: 'chickpea', season: 'rabi', sowingStart: '10-15', sowingEnd: '11-15', harvestStart: '02-15', harvestEnd: '03-31', practices: ['Rainfed on residual moisture', 'Wilt-resistant varieties'] },
      { crop: 'cotton', season: 'kharif', sowingStart: '06-01', sowingEnd: '07-15', harvestStart: '11-01', harvestEnd: '01-31', practices: ['Bt cotton', 'Protective irrigation'] },
      { crop: 'pigeon_pea', season: 'kharif', sowingStart: '06-15', sowingEnd: '07-15', harvestStart: '12-01', harvestEnd: '01-31', practices: ['Intercropping with soybean', 'Long duration varieties'] },
    ],
  },
  {
    region: 'northeast',
    displayName: 'Northeast India',
    climate: 'Sub-tropical to tropical, very high rainfall, humid',
    entries: [
      { crop: 'rice', season: 'kharif', sowingStart: '05-15', sowingEnd: '06-30', harvestStart: '10-01', harvestEnd: '11-30', practices: ['Jhum cultivation in hills', 'Wet rice in valleys'] },
      { crop: 'tea', season: 'kharif', sowingStart: '06-01', sowingEnd: '09-30', harvestStart: '03-01', harvestEnd: '11-30', practices: ['Perennial plantation', 'Shade tree management'] },
      { crop: 'orange', season: 'kharif', sowingStart: '06-01', sowingEnd: '08-31', harvestStart: '11-01', harvestEnd: '01-31', practices: ['Khasi mandarin variety', 'Terrace planting'] },
      { crop: 'ginger', season: 'kharif', sowingStart: '03-15', sowingEnd: '05-15', harvestStart: '12-01', harvestEnd: '01-31', practices: ['Raised bed planting', 'Mulching essential'] },
      { crop: 'turmeric', season: 'kharif', sowingStart: '04-01', sowingEnd: '05-31', harvestStart: '01-01', harvestEnd: '02-28', practices: ['Rhizome planting', 'Shade-tolerant'] },
    ],
  },
];

// ── Unit Conversions ───────────────────────────────────────────

const UNIT_CONVERSIONS: UnitConversion[] = [
  { from: 'acres', to: 'hectares', factor: 0.404686 },
  { from: 'hectares', to: 'acres', factor: 2.47105 },
  { from: 'quintals', to: 'kg', factor: 100 },
  { from: 'kg', to: 'quintals', factor: 0.01 },
  { from: 'liters', to: 'ml', factor: 1000 },
  { from: 'ml', to: 'liters', factor: 0.001 },
];

// ── Default Regional Preferences ───────────────────────────────

const DEFAULT_PREFERENCES: RegionalPreferencesConfig = {
  region: 'north',
  language: 'en',
  measurement_units: {
    area: 'acres',
    weight: 'quintals',
    volume: 'liters',
  },
  date_format: 'DD/MM/YYYY',
  currency: 'INR',
};

// ── Localization Service ───────────────────────────────────────

export class LocalizationService {
  private preferences: RegionalPreferencesConfig;

  constructor(preferences?: Partial<RegionalPreferencesConfig>) {
    this.preferences = { ...DEFAULT_PREFERENCES, ...preferences };
  }

  // ── Date Formatting ────────────────────────────────────────

  /**
   * Formats a Date to DD/MM/YYYY string.
   * Requirement 38.4: Use DD/MM/YYYY date format.
   */
  formatDate(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Formats a Date to DD/MM/YYYY HH:mm string.
   */
  formatDateTime(date: Date): string {
    const datePart = this.formatDate(date);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${datePart} ${hours}:${minutes}`;
  }

  /**
   * Parses a DD/MM/YYYY string into a Date.
   * Returns null if the string is invalid.
   */
  parseDate(dateStr: string): Date | null {
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (
      d.getFullYear() !== Number(year) ||
      d.getMonth() !== Number(month) - 1 ||
      d.getDate() !== Number(day)
    ) {
      return null;
    }
    return d;
  }

  // ── Currency Formatting ────────────────────────────────────

  /**
   * Formats a number as INR currency: ₹1,23,456.78
   * Uses Indian numbering system (lakhs/crores grouping).
   * Requirement 38.8: Display currency in INR with appropriate formatting.
   */
  formatCurrency(amount: number): string {
    const isNegative = amount < 0;
    const abs = Math.abs(amount);
    const [intPart, decPart] = abs.toFixed(2).split('.');

    let formatted: string;
    if (intPart.length <= 3) {
      formatted = intPart;
    } else {
      // Indian grouping: last 3 digits, then groups of 2
      const lastThree = intPart.slice(-3);
      const remaining = intPart.slice(0, -3);
      const groups: string[] = [];
      for (let i = remaining.length; i > 0; i -= 2) {
        groups.unshift(remaining.slice(Math.max(0, i - 2), i));
      }
      formatted = groups.join(',') + ',' + lastThree;
    }

    return `${isNegative ? '-' : ''}₹${formatted}.${decPart}`;
  }

  // ── Measurement Unit Conversion ────────────────────────────

  /**
   * Converts a value between Indian measurement units.
   * Requirement 38.3: Support measurement units common in India.
   */
  convertUnit(value: number, from: MeasurementUnit, to: MeasurementUnit): number {
    if (from === to) return value;
    const conversion = UNIT_CONVERSIONS.find((c) => c.from === from && c.to === to);
    if (!conversion) {
      throw new Error(`No conversion available from ${from} to ${to}`);
    }
    return value * conversion.factor;
  }

  /**
   * Formats a value with its unit label.
   */
  formatWithUnit(value: number, unit: MeasurementUnit): string {
    const labels: Record<MeasurementUnit, string> = {
      acres: 'acres',
      hectares: 'hectares',
      quintals: 'quintals',
      kg: 'kg',
      liters: 'liters',
      ml: 'ml',
    };
    return `${value.toFixed(2)} ${labels[unit]}`;
  }

  // ── Crop Calendar ──────────────────────────────────────────

  /**
   * Returns the crop calendar for a given region.
   * Requirement 38.1: Support region-specific crop calendars.
   */
  getCropCalendar(region?: IndianRegion): RegionCropCalendar | undefined {
    const r = region ?? this.preferences.region;
    return CROP_CALENDARS.find((c) => c.region === r);
  }

  /**
   * Returns all available crop calendars.
   */
  getAllCropCalendars(): RegionCropCalendar[] {
    return CROP_CALENDARS;
  }

  /**
   * Returns crops for a given season in a region.
   * Requirement 38.5: Provide content that respects local crop preferences.
   */
  getCropsForSeason(season: Season, region?: IndianRegion): CropCalendarEntry[] {
    const calendar = this.getCropCalendar(region);
    if (!calendar) return [];
    return calendar.entries.filter((e) => e.season === season);
  }

  /**
   * Returns the current season based on the month.
   * Kharif: June-October, Rabi: November-March, Zaid: April-May
   */
  getCurrentSeason(date?: Date): Season {
    const month = (date ?? new Date()).getMonth() + 1;
    if (month >= 6 && month <= 10) return 'kharif';
    if (month >= 11 || month <= 3) return 'rabi';
    return 'zaid';
  }

  // ── Regional Preferences ───────────────────────────────────

  /**
   * Returns the current regional preferences.
   * Requirement 38.7: Allow Tenant_Admins to configure regional preferences.
   */
  getPreferences(): RegionalPreferencesConfig {
    return { ...this.preferences };
  }

  /**
   * Updates regional preferences.
   */
  updatePreferences(updates: Partial<RegionalPreferencesConfig>): RegionalPreferencesConfig {
    this.preferences = { ...this.preferences, ...updates };
    return this.getPreferences();
  }

  /**
   * Returns the list of supported Indian regions.
   */
  getSupportedRegions(): { code: IndianRegion; name: string }[] {
    return CROP_CALENDARS.map((c) => ({ code: c.region, name: c.displayName }));
  }
}

// ── Agricultural Terminology ───────────────────────────────────

/**
 * Culturally appropriate agricultural terminology per language.
 * Requirement 38.6: Use culturally appropriate terminology for agricultural concepts.
 */
export const AGRICULTURAL_TERMS: Record<string, Record<string, string>> = {
  en: {
    kharif: 'Kharif (Monsoon)',
    rabi: 'Rabi (Winter)',
    zaid: 'Zaid (Summer)',
    mandi: 'Mandi (Market)',
    quintal: 'Quintal',
    bigha: 'Bigha',
    acre: 'Acre',
    hectare: 'Hectare',
    sowing: 'Sowing',
    harvesting: 'Harvesting',
    transplanting: 'Transplanting',
    irrigation: 'Irrigation',
    fertilizer: 'Fertilizer',
    pesticide: 'Pesticide',
    yield: 'Yield',
    crop_cycle: 'Crop Cycle',
  },
  hi: {
    kharif: 'खरीफ (बरसात)',
    rabi: 'रबी (सर्दी)',
    zaid: 'जायद (गर्मी)',
    mandi: 'मंडी',
    quintal: 'क्विंटल',
    bigha: 'बीघा',
    acre: 'एकड़',
    hectare: 'हेक्टेयर',
    sowing: 'बुवाई',
    harvesting: 'कटाई',
    transplanting: 'रोपाई',
    irrigation: 'सिंचाई',
    fertilizer: 'खाद',
    pesticide: 'कीटनाशक',
    yield: 'उपज',
    crop_cycle: 'फसल चक्र',
  },
  ta: {
    kharif: 'கரிப் (பருவமழை)',
    rabi: 'ரபி (குளிர்காலம்)',
    zaid: 'சாய்த் (கோடை)',
    mandi: 'மண்டி (சந்தை)',
    quintal: 'குவிண்டால்',
    bigha: 'பிகா',
    acre: 'ஏக்கர்',
    hectare: 'ஹெக்டேர்',
    sowing: 'விதைப்பு',
    harvesting: 'அறுவடை',
    transplanting: 'நடவு',
    irrigation: 'பாசனம்',
    fertilizer: 'உரம்',
    pesticide: 'பூச்சிக்கொல்லி',
    yield: 'மகசூல்',
    crop_cycle: 'பயிர் சுழற்சி',
  },
  te: {
    kharif: 'ఖరీఫ్ (వర్షాకాలం)',
    rabi: 'రబీ (శీతాకాలం)',
    zaid: 'జాయిద్ (వేసవి)',
    mandi: 'మండి (మార్కెట్)',
    quintal: 'క్వింటాల్',
    bigha: 'బీఘా',
    acre: 'ఎకరం',
    hectare: 'హెక్టార్',
    sowing: 'విత్తనం',
    harvesting: 'కోత',
    transplanting: 'నాట్లు',
    irrigation: 'నీటిపారుదల',
    fertilizer: 'ఎరువు',
    pesticide: 'పురుగుమందు',
    yield: 'దిగుబడి',
    crop_cycle: 'పంట చక్రం',
  },
  kn: {
    kharif: 'ಖರೀಫ್ (ಮಳೆಗಾಲ)',
    rabi: 'ರಬಿ (ಚಳಿಗಾಲ)',
    zaid: 'ಜಾಯ್ದ್ (ಬೇಸಿಗೆ)',
    mandi: 'ಮಂಡಿ (ಮಾರುಕಟ್ಟೆ)',
    quintal: 'ಕ್ವಿಂಟಾಲ್',
    bigha: 'ಬೀಘಾ',
    acre: 'ಎಕರೆ',
    hectare: 'ಹೆಕ್ಟೇರ್',
    sowing: 'ಬಿತ್ತನೆ',
    harvesting: 'ಕೊಯ್ಲು',
    transplanting: 'ನಾಟಿ',
    irrigation: 'ನೀರಾವರಿ',
    fertilizer: 'ಗೊಬ್ಬರ',
    pesticide: 'ಕೀಟನಾಶಕ',
    yield: 'ಇಳುವರಿ',
    crop_cycle: 'ಬೆಳೆ ಚಕ್ರ',
  },
};

/**
 * Returns the agricultural term for a given key in the specified language.
 * Falls back to English if the language or key is not found.
 */
export function getAgriculturalTerm(key: string, language: string): string {
  return AGRICULTURAL_TERMS[language]?.[key] ?? AGRICULTURAL_TERMS.en?.[key] ?? key;
}
