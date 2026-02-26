import { SafetyRefusal } from '../../types/errors';

/**
 * Safety guardrail for AI interactions.
 * Detects prompt injection, prohibited topics, chemical dosage requests,
 * and toxic/abusive input.
 */
export class SafetyGuardrail {
  private static readonly INJECTION_PATTERNS: RegExp[] = [
    /ignore\s+(previous|above)\s+instructions/i,
    /pretend\s+(you\s+are|to\s+be)/i,
    /roleplay\s+as/i,
    /\bsimulate\b/i,
    /act\s+as\s+if/i,
    /you\s+are\s+now/i,
  ];

  private static readonly PROHIBITED_TOPICS: string[] = [
    'explosive',
    'bomb',
    'weapon',
    'illegal',
    'self-harm',
    'suicide',
  ];

  private static readonly CHEMICAL_KEYWORDS: string[] = [
    'dosage',
    'mixing ratio',
    'application rate',
    'how much',
    'how to mix',
  ];

  private static readonly CHEMICAL_CONTEXT_KEYWORDS: string[] = [
    'pesticide',
    'chemical',
    'herbicide',
    'insecticide',
    'fungicide',
  ];

  private static readonly TOXIC_PATTERNS: RegExp[] = [
    /\b(fuck|shit|damn|bastard|asshole|bitch)\b/i,
    /\b(idiot|stupid|moron|dumb)\b.*\b(you|system|bot|ai)\b/i,
    /\b(you|system|bot|ai)\b.*\b(idiot|stupid|moron|dumb)\b/i,
  ];

  /**
   * Detects prompt injection attempts in user input.
   */
  isPromptInjection(query: string): boolean {
    return SafetyGuardrail.INJECTION_PATTERNS.some((p) => p.test(query));
  }

  /**
   * Detects prohibited/dangerous topics in user input.
   */
  isProhibitedTopic(query: string): boolean {
    const lower = query.toLowerCase();
    return SafetyGuardrail.PROHIBITED_TOPICS.some((t) => lower.includes(t));
  }

  /**
   * Detects requests for chemical dosage / mixing ratio information.
   * Returns true when the query contains both a chemical-context keyword
   * AND a dosage/mixing keyword.
   */
  requiresChemicalRefusal(query: string): boolean {
    const lower = query.toLowerCase();
    const hasChemical = SafetyGuardrail.CHEMICAL_CONTEXT_KEYWORDS.some((k) =>
      lower.includes(k),
    );
    const hasDosage = SafetyGuardrail.CHEMICAL_KEYWORDS.some((k) =>
      lower.includes(k),
    );
    return hasChemical && hasDosage;
  }

  /**
   * Detects toxic or abusive language directed at the system.
   */
  isToxicInput(query: string): boolean {
    return SafetyGuardrail.TOXIC_PATTERNS.some((p) => p.test(query));
  }

  /**
   * Run all guardrails and return a SafetyRefusal if any trigger,
   * or null if the input is safe.
   */
  check(query: string): SafetyRefusal | null {
    if (this.isPromptInjection(query)) {
      return {
        refused: true,
        reason: 'I can only provide agricultural information and support',
      };
    }

    if (this.isProhibitedTopic(query)) {
      return {
        refused: true,
        reason: 'I cannot provide information on this topic.',
      };
    }

    if (this.requiresChemicalRefusal(query)) {
      return {
        refused: true,
        reason:
          'For chemical applications, please consult a licensed agronomist or dealer for safe dosage and mixing instructions',
        alternative: 'Consult a licensed agronomist',
      };
    }

    if (this.isToxicInput(query)) {
      return {
        refused: true,
        reason:
          'I am unable to process abusive language. Please rephrase your question.',
      };
    }

    return null;
  }
}
