/**
 * InputNormalizer
 * Normalizes user input in-memory strictly for deterministic rule evaluation.
 * Principle: Never persists input. Used immediately and discarded.
 */

class InputNormalizer {
  /**
   * Normalizes an input string
   * @param {string|any} rawInput
   * @param {object} [options]
   * @returns {string} Normalized string
   */
  static normalize(rawInput, options = {}) {
    if (rawInput === null || rawInput === undefined) {
      return '';
    }

    let text = String(rawInput);

    // 1. Convert keycap number emojis (e.g. 1️⃣ -> 1, 2️⃣ -> 2, 🔟 -> 10)
    text = text
      .replace(/1\uFE0F?\u20E3/g, '1')
      .replace(/2\uFE0F?\u20E3/g, '2')
      .replace(/3\uFE0F?\u20E3/g, '3')
      .replace(/4\uFE0F?\u20E3/g, '4')
      .replace(/5\uFE0F?\u20E3/g, '5')
      .replace(/6\uFE0F?\u20E3/g, '6')
      .replace(/7\uFE0F?\u20E3/g, '7')
      .replace(/8\uFE0F?\u20E3/g, '8')
      .replace(/9\uFE0F?\u20E3/g, '9')
      .replace(/0\uFE0F?\u20E3/g, '0')
      .replace(/🔟/g, '10');

    // 2. Trim surrounding whitespace
    text = text.trim();

    // 3. Lowercase
    text = text.toLowerCase();

    // 4. Remove accents and diacritics (e.g., 'orçamento' -> 'orcamento')
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 5. Strip punctuation if configured (default: true)
    if (options.stripPunctuation !== false) {
      text = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, ' ');
      // Collapse multiple whitespace
      text = text.replace(/\s+/g, ' ').trim();
    }

    return text;
  }

  /**
   * Extracts purely numeric tokens from string
   * Handles direct digits, leading numbers, explicit prefixes ("opcao 2"),
   * and textual numbers in Portuguese ("um", "dois", "tres").
   * @param {string} rawInput
   * @returns {string|null} Normalized integer string or null
   */
  static extractNumber(rawInput) {
    if (rawInput === null || rawInput === undefined) return null;

    const norm = this.normalize(rawInput);
    if (!norm) return null;

    // 1. Direct leading digits (e.g. "1", " 2 ", "1 - orcamento", "01")
    const leadingMatch = norm.match(/^(\d+)/);
    if (leadingMatch) {
      return String(parseInt(leadingMatch[1], 10));
    }

    // 2. Explicit prefix pattern: "opcao 2", "opcao: 3", "numero 1", "item 2"
    const prefixMatch = norm.match(/\b(?:opcao|numero|num|item|n|no)\s*(\d+)\b/);
    if (prefixMatch) {
      return String(parseInt(prefixMatch[1], 10));
    }

    // 3. Word numbers in Portuguese
    const wordNumbers = {
      'um': '1', 'uma': '1',
      'dois': '2', 'duas': '2',
      'tres': '3',
      'quatro': '4',
      'cinco': '5',
      'seis': '6',
      'sete': '7',
      'oito': '8',
      'nove': '9',
      'dez': '10'
    };

    // 3a. Exact single word number: "um", "dois", "tres"
    if (wordNumbers[norm]) {
      return wordNumbers[norm];
    }

    // 3b. "opcao um", "quero a opcao dois", "item tres"
    const wordPrefixMatch = norm.match(/\b(?:opcao|numero|num|item)\s+(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/);
    if (wordPrefixMatch && wordNumbers[wordPrefixMatch[1]]) {
      return wordNumbers[wordPrefixMatch[1]];
    }

    // 4. Standalone single number token in string (e.g. "quero a 2", "2 por favor")
    const allNumbers = norm.match(/\b(\d+)\b/g);
    if (allNumbers && allNumbers.length === 1) {
      return String(parseInt(allNumbers[0], 10));
    }

    return null;
  }
}

module.exports = InputNormalizer;
