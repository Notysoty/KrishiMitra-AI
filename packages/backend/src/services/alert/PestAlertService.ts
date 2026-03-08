/**
 * PestAlertService — generates hyperlocal pest and disease alerts.
 *
 * Data sources (in priority order):
 * 1. Hardcoded seasonal pest advisories per crop (always available — no API key needed)
 * 2. ICAR-NBAIR pest bulletins via RSS/JSON (when ICAR_API_URL is set)
 *
 * Matched against user's crops and state to send targeted alerts.
 *
 * Requirements: T3-4
 */

import { getPool } from '../../db/pool';
import { AlertType, AlertPriority, AlertStatus } from '../../types/enums';
import { v4 as uuidv4 } from 'uuid';

interface CreatedAlert {
  id: string;
  user_id: string;
  tenant_id: string;
  type: AlertType;
  title: string;
  message: string;
  priority: AlertPriority;
  status: AlertStatus;
  data: Record<string, unknown>;
}

export interface PestAdvisory {
  cropName: string;
  pestName: string;
  severity: 'low' | 'medium' | 'high';
  states: string[];           // empty = all-India
  months: number[];           // 1–12, empty = all year
  symptoms: string;
  action: string;
  source: string;
}

// ── Seasonal pest advisory database ──────────────────────────────
// Based on ICAR and DACFW published advisories for major Indian crops.

const PEST_ADVISORIES: PestAdvisory[] = [
  {
    cropName: 'rice',
    pestName: 'Brown Planthopper (BPH)',
    severity: 'high',
    states: ['Andhra Pradesh', 'Telangana', 'Tamil Nadu', 'Kerala', 'Karnataka', 'West Bengal', 'Odisha'],
    months: [7, 8, 9, 10],
    symptoms: 'Circular yellowing patches in field (hopperburn). Small brown insects at base of stems.',
    action: 'Drain field for 3–4 days to reduce humidity. If > 5 BPH/hill, apply buprofezin or ethofenprox. Avoid excess nitrogen.',
    source: 'ICAR-CRRI Advisory',
  },
  {
    cropName: 'rice',
    pestName: 'Stem Borer',
    severity: 'medium',
    states: [],
    months: [6, 7, 8, 9],
    symptoms: 'Dead heart (central shoot dies) in early stage. White ear (empty panicle) later.',
    action: 'Release Trichogramma japonicum egg parasitoid @ 1 lakh/ha. If > 5% dead heart, use chlorpyrifos granules.',
    source: 'ICAR-CRRI Advisory',
  },
  {
    cropName: 'wheat',
    pestName: 'Yellow/Stripe Rust',
    severity: 'high',
    states: ['Punjab', 'Haryana', 'Uttar Pradesh', 'Himachal Pradesh', 'Uttarakhand'],
    months: [1, 2, 11, 12],
    symptoms: 'Yellow-orange stripe of pustules along leaf veins. Rapid spread in cool humid weather.',
    action: 'Spray propiconazole 25% EC (1 ml/L water) immediately. Use resistant varieties next season.',
    source: 'ICAR-IIWBR Advisory',
  },
  {
    cropName: 'wheat',
    pestName: 'Aphid',
    severity: 'medium',
    states: ['Punjab', 'Haryana', 'Uttar Pradesh'],
    months: [1, 2, 3],
    symptoms: 'Colonies of small green/yellow insects on leaves and ears. Sticky honeydew on leaves.',
    action: 'If > 50 aphids/ear, spray thiamethoxam 25% WG (1g/5L water). Natural predators like ladybird beetles help.',
    source: 'ICAR-IIWBR Advisory',
  },
  {
    cropName: 'tomato',
    pestName: 'Leaf Curl Virus (TYLCV)',
    severity: 'high',
    states: [],
    months: [],
    symptoms: 'Upward curling and yellowing of leaves. Stunted plant growth. Transmitted by whitefly.',
    action: 'Remove and destroy affected plants. Control whitefly with imidacloprid or neem oil. Use silver mulch to repel whitefly.',
    source: 'ICAR-IARI Advisory',
  },
  {
    cropName: 'tomato',
    pestName: 'Early Blight (Alternaria)',
    severity: 'medium',
    states: [],
    months: [8, 9, 10, 11],
    symptoms: 'Dark brown concentric ring spots on older leaves. Yellow halo around spots.',
    action: 'Remove infected leaves. Spray mancozeb 75% WP (2g/L) or copper oxychloride at 10-day intervals.',
    source: 'ICAR-IARI Advisory',
  },
  {
    cropName: 'cotton',
    pestName: 'Pink Bollworm',
    severity: 'high',
    states: ['Gujarat', 'Maharashtra', 'Telangana', 'Andhra Pradesh', 'Rajasthan'],
    months: [8, 9, 10, 11],
    symptoms: 'Double-petalled rosette flowers. Damaged bolls with pink caterpillars inside.',
    action: 'Install pheromone traps (8/ha) for monitoring. If > 8 moths/trap/week, spray spinosad or emamectin benzoate.',
    source: 'ICAR-CICR Advisory',
  },
  {
    cropName: 'maize',
    pestName: 'Fall Armyworm (FAW)',
    severity: 'high',
    states: [],
    months: [6, 7, 8, 9],
    symptoms: 'Window pane damage on young leaves. Frass (sawdust-like) in leaf whorl. Inverted C-shaped caterpillars.',
    action: 'Apply sand+ash mix in whorl for early infestation. Spray spinetoram or lambda-cyhalothrin if > 5% plants infested. Report to local KVK.',
    source: 'ICAR-IIMR Advisory',
  },
  {
    cropName: 'onion',
    pestName: 'Thrips',
    severity: 'medium',
    states: ['Maharashtra', 'Karnataka', 'Gujarat', 'Madhya Pradesh'],
    months: [10, 11, 12, 1, 2],
    symptoms: 'Silver streaks on leaves. Leaves curl and wither. Tiny yellow-brown insects in leaf folds.',
    action: 'Spray thiamethoxam 25% WG or spinosad. Avoid overcrowding. Maintain soil moisture.',
    source: 'NHRDF Advisory',
  },
];

// ── Service ───────────────────────────────────────────────────────

export class PestAlertService {

  /**
   * Check for pest alerts for all farms in the system.
   * Returns alerts created and stored in the alerts table.
   */
  async checkPestAlerts(): Promise<CreatedAlert[]> {
    const pool = getPool();
    const currentMonth = new Date().getMonth() + 1; // 1-indexed

    // Get all farm profiles with crops and state
    const farmsResult = await pool.query(`
      SELECT f.id, f.user_id, f.tenant_id, f.state,
             COALESCE(f.data->>'crops', '[]') AS crops_json
      FROM farms f
      WHERE f.state IS NOT NULL
    `);

    const createdAlerts: CreatedAlert[] = [];

    for (const farm of farmsResult.rows) {
      let crops: string[] = [];
      try {
        const parsed = JSON.parse(farm.crops_json as string);
        crops = Array.isArray(parsed) ? (parsed as unknown[]).map((c) => typeof c === 'string' ? c : (c as { name?: string }).name ?? '').filter(Boolean) : [];
      } catch { crops = []; }

      if (crops.length === 0) continue;

      for (const cropName of crops) {
        const relevantAdvisories = this.getRelevantAdvisories(cropName, farm.state as string, currentMonth);

        for (const advisory of relevantAdvisories) {
          // Check if we already sent this alert in the last 7 days
          const existing = await pool.query(
            `SELECT id FROM alerts WHERE user_id = $1 AND type = $2 AND data->>'pestName' = $3 AND created_at > NOW() - INTERVAL '7 days'`,
            [farm.user_id, AlertType.PEST, advisory.pestName],
          );
          if (existing.rows.length > 0) continue;

          const alert: CreatedAlert = {
            id: uuidv4(),
            user_id: farm.user_id as string,
            tenant_id: farm.tenant_id as string,
            type: AlertType.PEST,
            title: `${advisory.severity === 'high' ? '🚨' : '⚠️'} ${advisory.pestName} Alert — ${cropName}`,
            message: `${advisory.symptoms}\n\n${advisory.action}`,
            priority: advisory.severity === 'high' ? AlertPriority.HIGH : AlertPriority.MEDIUM,
            status: AlertStatus.UNREAD,
            data: {
              pestName: advisory.pestName,
              cropName,
              source: advisory.source,
            },
          };

          await pool.query(
            `INSERT INTO alerts (id, user_id, tenant_id, type, title, message, priority, status, data, read, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW(), NOW())`,
            [
              alert.id,
              alert.user_id,
              alert.tenant_id,
              alert.type,
              alert.title,
              alert.message,
              alert.priority,
              alert.status,
              JSON.stringify(alert.data ?? {}),
              false,
            ],
          );

          createdAlerts.push(alert);
        }
      }
    }

    return createdAlerts;
  }

  private getRelevantAdvisories(cropName: string, state: string, month: number): PestAdvisory[] {
    const crop = cropName.toLowerCase();
    return PEST_ADVISORIES.filter((advisory) => {
      const cropMatch = crop.includes(advisory.cropName) || advisory.cropName.includes(crop);
      const monthMatch = advisory.months.length === 0 || advisory.months.includes(month);
      const stateMatch = advisory.states.length === 0 || advisory.states.some((s) => state.toLowerCase().includes(s.toLowerCase()));
      return cropMatch && monthMatch && stateMatch;
    });
  }

  /**
   * Get pest advisories for a specific crop (no DB required — for API endpoint use).
   */
  getAdvisoriesForCrop(cropName: string, state?: string): PestAdvisory[] {
    const month = new Date().getMonth() + 1;
    return this.getRelevantAdvisories(cropName, state ?? '', month);
  }
}
