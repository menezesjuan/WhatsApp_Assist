const InputNormalizer = require('./InputNormalizer');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * RuleEngine
 * Evaluates step options deterministically without NLP or AI.
 * Completely explainable, robust and reproducible.
 */

class RuleEngine {
  /**
   * Evaluates a list of options for a given raw input
   * @param {Array<object>} options List of options configured for the step
   * @param {string} rawInput Raw message body from memory
   * @returns {{ matchedOption: object|null, reason: string }}
   */
  static evaluate(options, rawInput) {
    if (!options || options.length === 0) {
      return { matchedOption: null, reason: 'NO_OPTIONS_CONFIGURED' };
    }

    const normalizedInput = InputNormalizer.normalize(rawInput);
    const extractedNum = InputNormalizer.extractNumber(rawInput);

    // Sort options by order_index ascending
    const sortedOptions = [...options].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    // 1. Pass: Evaluate explicit rules first (NUMERIC_OPTION, EXACT_MATCH, KEYWORD, or ANY_TEXT with specific value)
    for (const opt of sortedOptions) {
      const type = (opt.condition_type || '').toUpperCase();
      const conditionValue = (opt.condition_value || '').trim();
      const normalizedCondVal = InputNormalizer.normalize(conditionValue);
      const condNum = InputNormalizer.extractNumber(conditionValue);

      if (type === 'NUMERIC_OPTION') {
        const condNumbers = conditionValue.split(/[,|]/).map(v => InputNormalizer.extractNumber(v)).filter(Boolean);
        if (extractedNum) {
          if (condNumbers.includes(extractedNum) || (condNum && extractedNum === condNum)) {
            return { matchedOption: opt, reason: `NUMERIC_OPTION_MATCH: ${extractedNum}` };
          }
        }
        if (normalizedInput === normalizedCondVal) {
          return { matchedOption: opt, reason: `NUMERIC_EXACT_MATCH: ${conditionValue}` };
        }
      } else if (type === 'EXACT_MATCH') {
        if (normalizedInput === normalizedCondVal) {
          return { matchedOption: opt, reason: `EXACT_MATCH: ${conditionValue}` };
        }
      } else if (type === 'KEYWORD') {
        // Keyword check: split multiple keywords by comma or pipe, then normalize each
        const keywords = conditionValue.split(/[,|]/).map(k => InputNormalizer.normalize(k)).filter(Boolean);
        for (const kw of keywords) {
          const safeKw = escapeRegex(kw);
          const regex = new RegExp(`(^|\\s)${safeKw}($|\\s)`, 'i');
          if (regex.test(normalizedInput) || normalizedInput === kw || new RegExp(`\\b${safeKw}\\b`, 'i').test(normalizedInput)) {
            return { matchedOption: opt, reason: `KEYWORD_MATCH: ${kw}` };
          }
        }
      } else if (type === 'ANY_TEXT' && conditionValue !== '' && conditionValue !== '*') {
        // If an option has condition_value specified (e.g. "1" or "2"), evaluate against it
        // so it never acts as an accidental catch-all swallowing other options!
        if (condNum && extractedNum && condNum === extractedNum) {
          return { matchedOption: opt, reason: `NUMERIC_OPTION_MATCH: ${condNum}` };
        }
        if (normalizedInput === normalizedCondVal) {
          return { matchedOption: opt, reason: `EXACT_MATCH: ${conditionValue}` };
        }
      }
    }

    // 2. Pass: Label Match Fallback (if user typed the title/label of an option)
    for (const opt of sortedOptions) {
      if (opt.label && opt.label.trim()) {
        const normLabel = InputNormalizer.normalize(opt.label);
        if (normLabel && normLabel === normalizedInput) {
          return { matchedOption: opt, reason: `LABEL_MATCH: ${opt.label}` };
        } else if (normLabel && normLabel.length >= 3) {
          const labelWords = normLabel.split(/\s+/).filter(w => w.length >= 3 && !/^\d+$/.test(w));
          for (const lw of labelWords) {
            if (normalizedInput === lw || new RegExp(`\\b${escapeRegex(lw)}\\b`, 'i').test(normalizedInput)) {
              return { matchedOption: opt, reason: `LABEL_MATCH: ${opt.label}` };
            }
          }
        }
      }
    }

    // 3. Pass: Universal Fallback options (ANY_TEXT without value or with '*', and EMPTY)
    for (const opt of sortedOptions) {
      const type = (opt.condition_type || '').toUpperCase();
      const conditionValue = (opt.condition_value || '').trim();

      // Only catch-all if condition_value is empty, whitespace, or '*'
      if (type === 'ANY_TEXT' && (conditionValue === '' || conditionValue === '*') && normalizedInput.length > 0) {
        return { matchedOption: opt, reason: 'ANY_TEXT_MATCH' };
      }

      if (type === 'EMPTY' && normalizedInput.length === 0) {
        return { matchedOption: opt, reason: 'EMPTY_MATCH' };
      }
    }

    return { matchedOption: null, reason: 'NO_MATCHING_RULE' };
  }
}

module.exports = RuleEngine;
