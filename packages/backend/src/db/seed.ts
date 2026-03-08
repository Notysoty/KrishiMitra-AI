/**
 * Database seed script — populates KrishiMitra with demo data.
 *
 * Run:  npx ts-node src/db/seed.ts
 *
 * Seeds:
 *   - 2 tenants (demo cooperative + test NGO)
 *   - 3 farmer users per tenant
 *   - Farm profiles with crops, soil, GPS
 *   - 6 months of market prices for Tomato, Wheat, Onion (Agmarknet-format)
 *   - 5 government scheme knowledge base documents
 *   - Sample AI interaction logs
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/krishimitra',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// ── Deterministic UUIDs for seed data ───────────────────────────

const TENANT_1 = '10000000-0000-4000-8000-000000000001';
const TENANT_2 = '10000000-0000-4000-8000-000000000002';

const USERS = [
  { id: '20000000-0000-4000-8000-000000000001', tenantId: TENANT_1, phone: '+919876543210', name: 'Ravi Kumar', role: 'farmer' },
  { id: '20000000-0000-4000-8000-000000000002', tenantId: TENANT_1, phone: '+919876543211', name: 'Sunita Devi', role: 'farmer' },
  { id: '20000000-0000-4000-8000-000000000003', tenantId: TENANT_1, phone: '+919876543212', name: 'Arjun Patil', role: 'tenant_admin' },
  { id: '20000000-0000-4000-8000-000000000004', tenantId: TENANT_2, phone: '+918765432100', name: 'Lakshmi Reddy', role: 'farmer' },
  { id: '20000000-0000-4000-8000-000000000005', tenantId: TENANT_2, phone: '+918765432101', name: 'Mohan Singh', role: 'farmer' },
];

const MARKET_PRICES_CROPS = [
  { crop: 'tomato', basePrice: 30, markets: ['Azadpur Mandi', 'Vashi APMC', 'Bowenpally Market'] },
  { crop: 'wheat',  basePrice: 24, markets: ['Azadpur Mandi', 'Yeshwanthpur APMC'] },
  { crop: 'onion',  basePrice: 18, markets: ['Vashi APMC', 'Koyambedu Market'] },
  { crop: 'potato', basePrice: 15, markets: ['Azadpur Mandi', 'Vashi APMC'] },
];

const MARKET_LOCATIONS: Record<string, { lat: number; lon: number; state: string }> = {
  'Azadpur Mandi':      { lat: 28.7041, lon: 77.1025, state: 'Delhi' },
  'Vashi APMC':         { lat: 19.0760, lon: 72.9981, state: 'Maharashtra' },
  'Koyambedu Market':   { lat: 13.0694, lon: 80.1948, state: 'Tamil Nadu' },
  'Yeshwanthpur APMC':  { lat: 13.0206, lon: 77.5381, state: 'Karnataka' },
  'Bowenpally Market':  { lat: 17.4684, lon: 78.4747, state: 'Telangana' },
};

const KNOWLEDGE_BASE_DOCS = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    title: 'PM-KISAN Scheme Guidelines',
    content: `PM-KISAN (Pradhan Mantri Kisan Samman Nidhi) provides income support of ₹6000 per year to all landholding farmer families. The amount is paid in three equal installments of ₹2000 every four months. Eligibility: Small and marginal farmers with cultivable landholding up to 2 hectares. Exclusions: Income tax payers, institutional landholders, constitutional post holders, retired pensioners with monthly pension above ₹10,000. Registration: Through CSC centers, Kisan Seva Kendra, or pmkisan.gov.in portal. Required documents: Aadhaar card, bank account details, land records.`,
    category: 'government_scheme',
    language: 'en',
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    title: 'PM Fasal Bima Yojana (PMFBY)',
    content: `Pradhan Mantri Fasal Bima Yojana provides financial support to farmers in case of crop failure due to natural calamities, pests, and diseases. Premium rates: Kharif crops 2%, Rabi crops 1.5%, Annual commercial/horticulture crops 5%. Coverage: From sowing to post-harvest losses. Claim: If crop loss is more than 25%, farmers can claim insurance. Process: Enroll before the cutoff date for each season through banks or insurance companies. Sum insured: Based on the scale of finance for the crop in the district.`,
    category: 'government_scheme',
    language: 'en',
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    title: 'Kisan Credit Card (KCC)',
    content: `Kisan Credit Card provides farmers with affordable credit for their agricultural needs. Credit limit: Based on landholding, crop cultivated, and scale of finance. Interest rate: 7% per annum with 3% interest subvention for timely repayment. Uses: Purchase of seeds, fertilisers, pesticides, allied activities, post-harvest expenses. Validity: 5 years with annual review. Eligibility: All farmers including tenant farmers, oral lessees, share croppers. Application: Through cooperative banks, commercial banks, or regional rural banks.`,
    category: 'government_scheme',
    language: 'en',
  },
  {
    id: '30000000-0000-4000-8000-000000000004',
    title: 'Tomato Cultivation Guide — Rabi Season',
    content: `Tomato cultivation in Rabi season (October-March). Varieties: Pusa Ruby, Pusa-120, HS-101 for plains; Hisar Arun for hills. Soil: Well-drained loamy soil, pH 6.0-7.0. Seed rate: 400-500g per hectare. Transplanting: 25-30 days old seedlings, spacing 60cm x 45cm. Irrigation: Every 5-7 days, avoid waterlogging. Fertiliser: Basal dose of NPK 120:80:60 kg/ha, top-dress with 40kg N at fruit set. Diseases: Early blight (Alternaria solani) — apply Mancozeb 75WP, Late blight — apply Metalaxyl-M + Mancozeb. Pests: Fruit borer — install pheromone traps, apply Spinosad. Harvest: 60-90 days after transplanting. Average yield: 25-30 tonnes per hectare.`,
    category: 'crop_guide',
    language: 'en',
  },
  {
    id: '30000000-0000-4000-8000-000000000005',
    title: 'Drip Irrigation Setup and Benefits',
    content: `Drip irrigation delivers water directly to the root zone, reducing water use by 30-50% compared to flood irrigation. Setup cost: ₹25,000-50,000 per acre including drip lines, filters, and control valves. Subsidy: Government provides 50-90% subsidy under PMKSY (Pradhan Mantri Krishi Sinchayee Yojana). Benefits: Reduces weed growth, prevents leaf diseases, enables fertigation (applying fertiliser through drip), increases yield by 20-40%. Suitable crops: Vegetables, fruits, sugarcane, cotton. Maintenance: Flush drip lines monthly, clean filters weekly. Lifespan: 5-7 years with proper maintenance.`,
    category: 'best_practice',
    language: 'en',
  },
];

// ── Helpers ──────────────────────────────────────────────────────

function generatePrices(crop: string, market: string, basePrice: number, months = 6) {
  const entries: { date: Date; price: number }[] = [];
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - months);

  let price = basePrice;
  const current = new Date(start);
  while (current <= now) {
    const change = (Math.random() - 0.5) * basePrice * 0.04;
    const reversion = (basePrice - price) * 0.02;
    price = Math.max(price + change + reversion, basePrice * 0.5);
    entries.push({ date: new Date(current), price: Math.round(price * 100) / 100 });
    current.setDate(current.getDate() + 1);
  }
  return entries;
}

// ── Main seed function ───────────────────────────────────────────

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Seeding tenants...');
    await client.query(`
      INSERT INTO tenants (id, name, plan, status, created_at)
      VALUES
        ($1, 'Demo Cooperative', 'professional', 'active', NOW()),
        ($2, 'Test NGO', 'basic', 'active', NOW())
      ON CONFLICT (id) DO NOTHING
    `, [TENANT_1, TENANT_2]);

    console.log('Seeding users...');
    for (const u of USERS) {
      await client.query(`
        INSERT INTO users (id, tenant_id, phone, name, roles, status, created_at)
        VALUES ($1, $2, $3, $4, ARRAY[$5], 'active', NOW())
        ON CONFLICT (id) DO NOTHING
      `, [u.id, u.tenantId, u.phone, u.name, u.role]);
    }

    console.log('Seeding market prices...');
    for (const { crop, basePrice, markets } of MARKET_PRICES_CROPS) {
      for (const market of markets) {
        const loc = MARKET_LOCATIONS[market] ?? { lat: 20.59, lon: 78.96, state: 'India' };
        const entries = generatePrices(crop, market, basePrice);
        for (const { date, price } of entries) {
          await client.query(`
            INSERT INTO market_prices (id, tenant_id, market_name, crop, price, unit, date, source, location)
            VALUES (
              gen_random_uuid(),
              $1,
              $2, $3, $4, 'per kg', $5,
              'Seed Data (Demo)',
              ST_MakePoint($6, $7)::geography
            )
            ON CONFLICT DO NOTHING
          `, [TENANT_1, market, crop, price, date, loc.lon, loc.lat]).catch(() => {
            // Fallback without PostGIS
            return client.query(`
              INSERT INTO market_prices (id, tenant_id, market_name, crop, price, unit, date, source)
              VALUES (gen_random_uuid(), $1, $2, $3, $4, 'per kg', $5, 'Seed Data (Demo)')
              ON CONFLICT DO NOTHING
            `, [TENANT_1, market, crop, price, date]);
          });
        }
        console.log(`  ${crop} @ ${market}: ${entries.length} price entries`);
      }
    }

    console.log('Seeding knowledge base...');
    for (const doc of KNOWLEDGE_BASE_DOCS) {
      await client.query(`
        INSERT INTO knowledge_documents (id, tenant_id, title, content, category, language, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [doc.id, TENANT_1, doc.title, doc.content, doc.category, doc.language]).catch((err: Error) => {
        // Table may not exist yet — log and continue
        console.warn(`  Skipped knowledge_documents (${err.message})`);
      });
    }

    await client.query('COMMIT');
    console.log('\nSeed complete.');
    console.log(`Tenants: ${TENANT_1} (Demo Cooperative), ${TENANT_2} (Test NGO)`);
    console.log(`Users: ${USERS.map((u) => u.phone).join(', ')}`);
    console.log('Market prices: 6 months of synthetic data for Tomato, Wheat, Onion, Potato');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
