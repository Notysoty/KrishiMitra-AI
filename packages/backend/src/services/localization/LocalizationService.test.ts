import {
  LocalizationService,
  CROP_CALENDARS,
  AGRICULTURAL_TERMS,
  getAgriculturalTerm,
  IndianRegion,
  Season,
  MeasurementUnit,
} from './LocalizationService';

describe('LocalizationService', () => {
  let service: LocalizationService;

  beforeEach(() => {
    service = new LocalizationService();
  });

  // ── Date Formatting (Req 38.4) ─────────────────────────────

  describe('formatDate', () => {
    it('should format date as DD/MM/YYYY', () => {
      const date = new Date(2024, 0, 15); // Jan 15, 2024
      expect(service.formatDate(date)).toBe('15/01/2024');
    });

    it('should pad single-digit day and month', () => {
      const date = new Date(2024, 2, 5); // Mar 5, 2024
      expect(service.formatDate(date)).toBe('05/03/2024');
    });

    it('should handle end of year', () => {
      const date = new Date(2024, 11, 31); // Dec 31, 2024
      expect(service.formatDate(date)).toBe('31/12/2024');
    });
  });

  describe('formatDateTime', () => {
    it('should format date and time as DD/MM/YYYY HH:mm', () => {
      const date = new Date(2024, 5, 15, 14, 30); // Jun 15, 2024 14:30
      expect(service.formatDateTime(date)).toBe('15/06/2024 14:30');
    });

    it('should pad single-digit hours and minutes', () => {
      const date = new Date(2024, 0, 1, 9, 5);
      expect(service.formatDateTime(date)).toBe('01/01/2024 09:05');
    });
  });

  describe('parseDate', () => {
    it('should parse DD/MM/YYYY string into Date', () => {
      const result = service.parseDate('15/01/2024');
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(15);
      expect(result!.getMonth()).toBe(0);
      expect(result!.getFullYear()).toBe(2024);
    });

    it('should return null for invalid format', () => {
      expect(service.parseDate('2024-01-15')).toBeNull();
      expect(service.parseDate('01/15/2024')).toBeNull(); // MM/DD/YYYY with day>12
      expect(service.parseDate('abc')).toBeNull();
      expect(service.parseDate('')).toBeNull();
    });

    it('should return null for invalid date values', () => {
      expect(service.parseDate('31/02/2024')).toBeNull(); // Feb 31
      expect(service.parseDate('00/01/2024')).toBeNull(); // Day 0
    });
  });

  // ── Currency Formatting (Req 38.8) ─────────────────────────

  describe('formatCurrency', () => {
    it('should format small amounts with rupee symbol', () => {
      expect(service.formatCurrency(100)).toBe('₹100.00');
    });

    it('should format amounts with Indian grouping (lakhs/crores)', () => {
      expect(service.formatCurrency(1234.56)).toBe('₹1,234.56');
      expect(service.formatCurrency(12345.67)).toBe('₹12,345.67');
      expect(service.formatCurrency(123456.78)).toBe('₹1,23,456.78');
      expect(service.formatCurrency(1234567.89)).toBe('₹12,34,567.89');
      expect(service.formatCurrency(12345678.90)).toBe('₹1,23,45,678.90');
    });

    it('should handle zero', () => {
      expect(service.formatCurrency(0)).toBe('₹0.00');
    });

    it('should handle negative amounts', () => {
      expect(service.formatCurrency(-1234.56)).toBe('-₹1,234.56');
    });

    it('should round to 2 decimal places', () => {
      expect(service.formatCurrency(99.999)).toBe('₹100.00');
    });
  });

  // ── Measurement Unit Conversion (Req 38.3) ─────────────────

  describe('convertUnit', () => {
    it('should convert acres to hectares', () => {
      const result = service.convertUnit(1, 'acres', 'hectares');
      expect(result).toBeCloseTo(0.404686, 4);
    });

    it('should convert hectares to acres', () => {
      const result = service.convertUnit(1, 'hectares', 'acres');
      expect(result).toBeCloseTo(2.47105, 4);
    });

    it('should convert quintals to kg', () => {
      expect(service.convertUnit(1, 'quintals', 'kg')).toBe(100);
    });

    it('should convert kg to quintals', () => {
      expect(service.convertUnit(100, 'kg', 'quintals')).toBe(1);
    });

    it('should convert liters to ml', () => {
      expect(service.convertUnit(1, 'liters', 'ml')).toBe(1000);
    });

    it('should convert ml to liters', () => {
      expect(service.convertUnit(1000, 'ml', 'liters')).toBe(1);
    });

    it('should return same value for same unit', () => {
      expect(service.convertUnit(5, 'acres', 'acres')).toBe(5);
    });

    it('should throw for unsupported conversion', () => {
      expect(() => service.convertUnit(1, 'acres', 'kg')).toThrow('No conversion available');
    });
  });

  describe('formatWithUnit', () => {
    it('should format value with unit label', () => {
      expect(service.formatWithUnit(5.5, 'acres')).toBe('5.50 acres');
      expect(service.formatWithUnit(10, 'quintals')).toBe('10.00 quintals');
      expect(service.formatWithUnit(100, 'liters')).toBe('100.00 liters');
    });
  });

  // ── Crop Calendar (Req 38.1, 38.5) ─────────────────────────

  describe('getCropCalendar', () => {
    it('should return crop calendar for a region', () => {
      const calendar = service.getCropCalendar('north');
      expect(calendar).toBeDefined();
      expect(calendar!.region).toBe('north');
      expect(calendar!.entries.length).toBeGreaterThan(0);
    });

    it('should return undefined for invalid region', () => {
      expect(service.getCropCalendar('invalid' as IndianRegion)).toBeUndefined();
    });

    it('should use default region from preferences', () => {
      const s = new LocalizationService({ region: 'south' });
      const calendar = s.getCropCalendar();
      expect(calendar!.region).toBe('south');
    });
  });

  describe('getAllCropCalendars', () => {
    it('should return all 6 regional calendars', () => {
      const calendars = service.getAllCropCalendars();
      expect(calendars).toHaveLength(6);
      const regions = calendars.map((c) => c.region);
      expect(regions).toContain('north');
      expect(regions).toContain('south');
      expect(regions).toContain('east');
      expect(regions).toContain('west');
      expect(regions).toContain('central');
      expect(regions).toContain('northeast');
    });
  });

  describe('getCropsForSeason', () => {
    it('should return kharif crops for north region', () => {
      const crops = service.getCropsForSeason('kharif', 'north');
      expect(crops.length).toBeGreaterThan(0);
      crops.forEach((c) => expect(c.season).toBe('kharif'));
    });

    it('should return rabi crops for south region', () => {
      const crops = service.getCropsForSeason('rabi', 'south');
      expect(crops.length).toBeGreaterThan(0);
      crops.forEach((c) => expect(c.season).toBe('rabi'));
    });

    it('should return empty array for invalid region', () => {
      expect(service.getCropsForSeason('kharif', 'invalid' as IndianRegion)).toEqual([]);
    });
  });

  describe('getCurrentSeason', () => {
    it('should return kharif for June-October', () => {
      expect(service.getCurrentSeason(new Date(2024, 5, 1))).toBe('kharif');  // June
      expect(service.getCurrentSeason(new Date(2024, 7, 15))).toBe('kharif'); // August
      expect(service.getCurrentSeason(new Date(2024, 9, 31))).toBe('kharif'); // October
    });

    it('should return rabi for November-March', () => {
      expect(service.getCurrentSeason(new Date(2024, 10, 1))).toBe('rabi');  // November
      expect(service.getCurrentSeason(new Date(2024, 0, 15))).toBe('rabi');  // January
      expect(service.getCurrentSeason(new Date(2024, 2, 31))).toBe('rabi');  // March
    });

    it('should return zaid for April-May', () => {
      expect(service.getCurrentSeason(new Date(2024, 3, 1))).toBe('zaid');  // April
      expect(service.getCurrentSeason(new Date(2024, 4, 31))).toBe('zaid'); // May
    });
  });

  // ── Regional Preferences (Req 38.7) ────────────────────────

  describe('getPreferences', () => {
    it('should return default preferences', () => {
      const prefs = service.getPreferences();
      expect(prefs.region).toBe('north');
      expect(prefs.date_format).toBe('DD/MM/YYYY');
      expect(prefs.currency).toBe('INR');
      expect(prefs.measurement_units.area).toBe('acres');
      expect(prefs.measurement_units.weight).toBe('quintals');
      expect(prefs.measurement_units.volume).toBe('liters');
    });

    it('should return custom preferences when initialized', () => {
      const s = new LocalizationService({ region: 'south', language: 'ta' });
      const prefs = s.getPreferences();
      expect(prefs.region).toBe('south');
      expect(prefs.language).toBe('ta');
    });
  });

  describe('updatePreferences', () => {
    it('should update and return new preferences', () => {
      const updated = service.updatePreferences({ region: 'east', language: 'hi' });
      expect(updated.region).toBe('east');
      expect(updated.language).toBe('hi');
      // Other defaults preserved
      expect(updated.currency).toBe('INR');
    });
  });

  describe('getSupportedRegions', () => {
    it('should return all supported regions', () => {
      const regions = service.getSupportedRegions();
      expect(regions).toHaveLength(6);
      expect(regions.find((r) => r.code === 'north')?.name).toBe('North India');
      expect(regions.find((r) => r.code === 'south')?.name).toBe('South India');
    });
  });
});

// ── Agricultural Terminology (Req 38.6) ──────────────────────

describe('Agricultural Terminology', () => {
  describe('AGRICULTURAL_TERMS', () => {
    it('should have terms for all 5 supported languages', () => {
      expect(Object.keys(AGRICULTURAL_TERMS)).toEqual(
        expect.arrayContaining(['en', 'hi', 'ta', 'te', 'kn']),
      );
    });

    it('should have consistent keys across all languages', () => {
      const enKeys = Object.keys(AGRICULTURAL_TERMS.en);
      for (const lang of ['hi', 'ta', 'te', 'kn']) {
        const langKeys = Object.keys(AGRICULTURAL_TERMS[lang]);
        expect(langKeys).toEqual(enKeys);
      }
    });
  });

  describe('getAgriculturalTerm', () => {
    it('should return term in specified language', () => {
      expect(getAgriculturalTerm('kharif', 'hi')).toBe('खरीफ (बरसात)');
      expect(getAgriculturalTerm('rabi', 'ta')).toBe('ரபி (குளிர்காலம்)');
    });

    it('should fall back to English for unknown language', () => {
      expect(getAgriculturalTerm('kharif', 'fr')).toBe('Kharif (Monsoon)');
    });

    it('should return key for unknown term', () => {
      expect(getAgriculturalTerm('unknown_term', 'en')).toBe('unknown_term');
    });
  });
});

// ── Crop Calendar Data Integrity ─────────────────────────────

describe('Crop Calendar Data', () => {
  it('should have valid date ranges for all entries', () => {
    for (const calendar of CROP_CALENDARS) {
      for (const entry of calendar.entries) {
        expect(entry.sowingStart).toMatch(/^\d{2}-\d{2}$/);
        expect(entry.sowingEnd).toMatch(/^\d{2}-\d{2}$/);
        expect(entry.harvestStart).toMatch(/^\d{2}-\d{2}$/);
        expect(entry.harvestEnd).toMatch(/^\d{2}-\d{2}$/);
      }
    }
  });

  it('should have at least one practice per entry', () => {
    for (const calendar of CROP_CALENDARS) {
      for (const entry of calendar.entries) {
        expect(entry.practices.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have valid season values', () => {
    const validSeasons: Season[] = ['kharif', 'rabi', 'zaid'];
    for (const calendar of CROP_CALENDARS) {
      for (const entry of calendar.entries) {
        expect(validSeasons).toContain(entry.season);
      }
    }
  });
});
