/**
 * VoiceCommandParser — Parses recognized speech text into voice commands.
 *
 * Supports common actions in all 5 MVP languages:
 * - "check prices" / "कीमत जांचें" / "விலை சரிபார்" / "ధరలు చూడు" / "ಬೆಲೆ ನೋಡಿ"
 * - "weather forecast" / "मौसम पूर्वानुमान" / "வானிலை" / "వాతావరణం" / "ಹವಾಮಾನ"
 * - "my alerts" / "मेरी सूचनाएं" / "என் விழிப்பூட்டல்" / "నా హెచ్చరికలు" / "ನನ್ನ ಎಚ್ಚರಿಕೆ"
 *
 * Requirement: 6.6
 */

import { SupportedLanguage, VoiceCommand, VoiceCommandAction } from '../../types/speech';

interface CommandPattern {
  action: VoiceCommandAction;
  patterns: RegExp[];
}

/** Command patterns per language */
const COMMAND_PATTERNS: Record<SupportedLanguage, CommandPattern[]> = {
  en: [
    {
      action: 'check_prices',
      patterns: [/check\s*prices?/i, /market\s*prices?/i, /price\s*check/i, /show\s*prices?/i],
    },
    {
      action: 'weather_forecast',
      patterns: [/weather\s*forecast/i, /weather\s*report/i, /weather/i, /forecast/i],
    },
    {
      action: 'my_alerts',
      patterns: [/my\s*alerts?/i, /show\s*alerts?/i, /notifications?/i],
    },
  ],
  hi: [
    {
      action: 'check_prices',
      patterns: [/कीमत/i, /भाव/i, /दाम/i, /मूल्य/i, /price/i],
    },
    {
      action: 'weather_forecast',
      patterns: [/मौसम/i, /weather/i, /बारिश/i, /तापमान/i],
    },
    {
      action: 'my_alerts',
      patterns: [/सूचना/i, /अलर्ट/i, /चेतावनी/i, /alert/i],
    },
  ],
  ta: [
    {
      action: 'check_prices',
      patterns: [/விலை/i, /சரிபார்/i, /price/i],
    },
    {
      action: 'weather_forecast',
      patterns: [/வானிலை/i, /weather/i, /மழை/i],
    },
    {
      action: 'my_alerts',
      patterns: [/விழிப்பூட்டல்/i, /எச்சரிக்கை/i, /alert/i],
    },
  ],
  te: [
    {
      action: 'check_prices',
      patterns: [/ధరలు/i, /ధర/i, /price/i],
    },
    {
      action: 'weather_forecast',
      patterns: [/వాతావరణం/i, /weather/i, /వర్షం/i],
    },
    {
      action: 'my_alerts',
      patterns: [/హెచ్చరికలు/i, /హెచ్చరిక/i, /alert/i],
    },
  ],
  kn: [
    {
      action: 'check_prices',
      patterns: [/ಬೆಲೆ/i, /ದರ/i, /price/i],
    },
    {
      action: 'weather_forecast',
      patterns: [/ಹವಾಮಾನ/i, /weather/i, /ಮಳೆ/i],
    },
    {
      action: 'my_alerts',
      patterns: [/ಎಚ್ಚರಿಕೆ/i, /ಸೂಚನೆ/i, /alert/i],
    },
  ],
};

export class VoiceCommandParser {
  /**
   * Parse text for a voice command in the given language.
   * Returns null if no command is recognized.
   */
  parse(text: string, language: SupportedLanguage): VoiceCommand | null {
    if (!text || text.trim().length === 0) {
      return null;
    }

    const patterns = COMMAND_PATTERNS[language] ?? COMMAND_PATTERNS.en;

    for (const command of patterns) {
      for (const pattern of command.patterns) {
        const match = text.match(pattern);
        if (match) {
          return {
            action: command.action,
            matchedText: match[0],
            confidence: 0.9,
          };
        }
      }
    }

    // Fallback: try English patterns for any language
    if (language !== 'en') {
      for (const command of COMMAND_PATTERNS.en) {
        for (const pattern of command.patterns) {
          const match = text.match(pattern);
          if (match) {
            return {
              action: command.action,
              matchedText: match[0],
              confidence: 0.7,
            };
          }
        }
      }
    }

    return null;
  }

  /** Get all supported command actions */
  static getSupportedActions(): VoiceCommandAction[] {
    return ['check_prices', 'weather_forecast', 'my_alerts'];
  }
}
