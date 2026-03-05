import { VoiceCommandParser } from './VoiceCommandParser';
import { SupportedLanguage } from '../../types/speech';

describe('VoiceCommandParser', () => {
  const parser = new VoiceCommandParser();

  // ── English commands ────────────────────────────────────────

  describe('English commands', () => {
    it('should parse "check prices"', () => {
      const result = parser.parse('check prices', 'en');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('check_prices');
    });

    it('should parse "market prices"', () => {
      const result = parser.parse('show me market prices', 'en');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('check_prices');
    });

    it('should parse "weather forecast"', () => {
      const result = parser.parse('weather forecast for today', 'en');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('weather_forecast');
    });

    it('should parse "my alerts"', () => {
      const result = parser.parse('show my alerts', 'en');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('my_alerts');
    });

    it('should return null for unrecognized text', () => {
      const result = parser.parse('how to grow tomatoes', 'en');
      expect(result).toBeNull();
    });
  });

  // ── Hindi commands ──────────────────────────────────────────

  describe('Hindi commands', () => {
    it('should parse price commands in Hindi', () => {
      const result = parser.parse('कीमत जांचें', 'hi');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('check_prices');
    });

    it('should parse weather commands in Hindi', () => {
      const result = parser.parse('मौसम कैसा है', 'hi');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('weather_forecast');
    });

    it('should parse alert commands in Hindi', () => {
      const result = parser.parse('मेरी सूचनाएं दिखाओ', 'hi');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('my_alerts');
    });
  });

  // ── Tamil commands ──────────────────────────────────────────

  describe('Tamil commands', () => {
    it('should parse price commands in Tamil', () => {
      const result = parser.parse('விலை சரிபார்', 'ta');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('check_prices');
    });

    it('should parse weather commands in Tamil', () => {
      const result = parser.parse('வானிலை அறிக்கை', 'ta');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('weather_forecast');
    });
  });

  // ── Telugu commands ─────────────────────────────────────────

  describe('Telugu commands', () => {
    it('should parse price commands in Telugu', () => {
      const result = parser.parse('ధరలు చూడు', 'te');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('check_prices');
    });

    it('should parse weather commands in Telugu', () => {
      const result = parser.parse('వాతావరణం ఎలా ఉంది', 'te');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('weather_forecast');
    });
  });

  // ── Kannada commands ────────────────────────────────────────

  describe('Kannada commands', () => {
    it('should parse price commands in Kannada', () => {
      const result = parser.parse('ಬೆಲೆ ನೋಡಿ', 'kn');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('check_prices');
    });

    it('should parse weather commands in Kannada', () => {
      const result = parser.parse('ಹವಾಮಾನ ಹೇಗಿದೆ', 'kn');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('weather_forecast');
    });
  });

  // ── Edge cases ──────────────────────────────────────────────

  describe('Edge cases', () => {
    it('should return null for empty text', () => {
      expect(parser.parse('', 'en')).toBeNull();
    });

    it('should return null for whitespace-only text', () => {
      expect(parser.parse('   ', 'en')).toBeNull();
    });

    it('should fallback to English patterns for non-English languages', () => {
      // English command spoken in Hindi context
      const result = parser.parse('check prices please', 'hi');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('check_prices');
    });

    it('should be case-insensitive', () => {
      const result = parser.parse('CHECK PRICES', 'en');
      expect(result).not.toBeNull();
      expect(result!.action).toBe('check_prices');
    });
  });

  // ── Static methods ──────────────────────────────────────────

  describe('getSupportedActions', () => {
    it('should return all 3 supported actions', () => {
      const actions = VoiceCommandParser.getSupportedActions();
      expect(actions).toContain('check_prices');
      expect(actions).toContain('weather_forecast');
      expect(actions).toContain('my_alerts');
      expect(actions).toHaveLength(3);
    });
  });
});
