/**
 * Agmarknet API client — fetches real mandi prices from India's data.gov.in open data platform.
 *
 * API: https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070
 * Prices are returned in ₹/quintal (100 kg). We convert to ₹/kg.
 *
 * Set DATA_GOV_API_KEY in backend .env to enable real prices.
 * Falls back gracefully (returns empty array) if key is missing or API is unreachable.
 */

const AGMARKNET_ENDPOINT =
  'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';

const QUINTAL_TO_KG = 100;

// Map our internal crop names to Agmarknet commodity names
const CROP_TO_COMMODITY: Record<string, string> = {
  tomato: 'Tomato',
  wheat: 'Wheat',
  rice: 'Rice',
  onion: 'Onion',
  potato: 'Potato',
};

export interface AgmarknetRecord {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  arrival_date: string;
  min_price: string;
  max_price: string;
  modal_price: string;
}

export interface AgmarknetPrice {
  marketName: string;
  state: string;
  district: string;
  crop: string;
  pricePerKg: number;
  minPricePerKg: number;
  maxPricePerKg: number;
  date: Date;
  source: 'agmarknet';
}

export class AgmarknetClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.DATA_GOV_API_KEY ?? '';
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * Fetch current prices for a commodity. Returns empty array if not configured or on error.
   */
  async fetchPrices(crop: string, limit = 50): Promise<AgmarknetPrice[]> {
    if (!this.isConfigured()) return [];

    const commodity = CROP_TO_COMMODITY[crop.toLowerCase()] ?? crop;

    const params = new URLSearchParams({
      'api-key': this.apiKey,
      format: 'json',
      limit: String(limit),
      'filters[commodity]': commodity,
    });

    const url = `${AGMARKNET_ENDPOINT}?${params}`;

    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.warn(`Agmarknet API returned ${res.status} for ${commodity}`);
        return [];
      }

      const data = await res.json() as { records?: AgmarknetRecord[] };
      const records = data.records ?? [];

      return records
        .map((r): AgmarknetPrice | null => {
          const modal = parseFloat(r.modal_price);
          const min = parseFloat(r.min_price);
          const max = parseFloat(r.max_price);
          if (isNaN(modal) || modal <= 0) return null;

          // Parse DD/MM/YYYY arrival date
          const [dd, mm, yyyy] = r.arrival_date.split('/');
          const date = new Date(`${yyyy}-${mm}-${dd}`);
          if (isNaN(date.getTime())) return null;

          return {
            marketName: r.market,
            state: r.state,
            district: r.district,
            crop: crop.toLowerCase(),
            pricePerKg: Math.round((modal / QUINTAL_TO_KG) * 100) / 100,
            minPricePerKg: Math.round((min / QUINTAL_TO_KG) * 100) / 100,
            maxPricePerKg: Math.round((max / QUINTAL_TO_KG) * 100) / 100,
            date,
            source: 'agmarknet',
          };
        })
        .filter((r): r is AgmarknetPrice => r !== null);
    } catch (err) {
      console.warn('Agmarknet API error:', (err as Error).message);
      return [];
    }
  }
}
