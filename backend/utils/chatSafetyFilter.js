/**
 * Chat Safety Filter
 * Screens user queries before they reach the AI or consume API credits.
 *
 * Usage:
 *   const { checkQuerySafety } = require('../utils/chatSafetyFilter');
 *   const { safe, reason, category } = checkQuerySafety(question);
 *
 * To extend: add a new entry to UNSAFE_PATTERNS.
 * Each entry needs: pattern (RegExp), reason (string), category (string).
 */

'use strict';

// ─── Pattern registry ─────────────────────────────────────────────────────────

const UNSAFE_PATTERNS = [
  // 1. Personal case demands — user wants active legal representation
  {
    category: 'personal_case',
    pattern:
      /\b(my case|my lawsuit|my trial|my fir|my chargesheet|sue (for|on behalf of) me|file .{0,25} on my behalf|draft .{0,25} for me to (file|submit)|represent me in|appear for me in)\b/i,
    reason:
      'We cannot provide legal advice or act on your behalf in personal legal matters. Please consult a qualified advocate.',
  },

  // 2. Jailbreak / role override attempts
  {
    category: 'jailbreak',
    pattern:
      /\b(ignore (the )?(disclaimer|warning|instructions|system prompt|education)|act as (my )?(lawyer|advocate|counsel|legal rep)|you are (now |my )?(lawyer|attorney|legal representative|DAN|unrestricted AI)|pretend (you are|you're|to be) (a |an )?(different|evil|uncensored|unrestricted)|disregard (your |the )?(system |)prompt|do anything now)\b/i,
    reason:
      'This platform provides educational content only and cannot override its operating guidelines.',
  },

  // 3. Facilitating crimes / harmful how-to queries
  {
    category: 'harmful_howto',
    pattern:
      /\bhow (to|do I|can I) (commit|cover up|hide|get away with|evade|avoid getting caught (for|after)).{0,40}(crime|fraud|offence|offense|murder|assault|theft|bribery|extortion|money laundering|rape|harassment)\b/i,
    reason: 'This type of query cannot be answered on this platform.',
  },

  // 4. Self-harm / crisis content
  {
    category: 'self_harm',
    pattern:
      /\b(kill (myself|yourself)|end my life|suicide|suicidal|self.harm|hurt (myself|yourself)|want to die|no reason to live)\b/i,
    reason:
      'Please reach out to a crisis helpline. In India you can call iCall: 9152987821 (Mon–Sat, 8 am–10 pm).',
  },

  // 5. Prompt injection / instruction smuggling
  {
    category: 'prompt_injection',
    pattern:
      /(\[INST\]|<\|system\|>|<\|user\|>|<\|assistant\|>|###\s*(System|Instruction)|OVERRIDE:|NEW INSTRUCTIONS:|you must now|from now on (you are|ignore)|forget (all |your )?(previous|prior) instructions)/i,
    reason: 'That type of instruction cannot be processed.',
  },

  // 6. Explicit / adult content requests
  {
    category: 'explicit_content',
    pattern:
      /\b(pornograph|sexual content|nude|explicit (image|video|content)|erotic|obscen)\b/i,
    reason:
      'This platform is a legal education service and cannot process that type of request.',
  },
];

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Check whether a user query is safe to forward to the AI.
 *
 * @param {string} question - Raw user input (pre-trimmed by middleware is fine)
 * @returns {{ safe: boolean, reason?: string, category?: string }}
 *
 * @example
 *   checkQuerySafety('What is Article 21?')
 *   // → { safe: true }
 *
 *   checkQuerySafety('help me cover up my crime')
 *   // → { safe: false, reason: '...', category: 'harmful_howto' }
 */
const checkQuerySafety = (question) => {
  if (typeof question !== 'string' || question.trim().length === 0) {
    return {
      safe: false,
      reason: 'Question must be a non-empty string.',
      category: 'invalid_input',
    };
  }

  for (const { pattern, reason, category } of UNSAFE_PATTERNS) {
    if (pattern.test(question)) {
      return { safe: false, reason, category };
    }
  }

  return { safe: true };
};

/**
 * Add a new safety pattern at runtime (useful for hot-patching in tests).
 *
 * @param {{ pattern: RegExp, reason: string, category: string }} entry
 */
const addSafetyPattern = (entry) => {
  if (!entry?.pattern || !entry?.reason || !entry?.category) {
    throw new Error('addSafetyPattern: entry must have { pattern, reason, category }');
  }
  UNSAFE_PATTERNS.push(entry);
};

module.exports = { checkQuerySafety, addSafetyPattern, UNSAFE_PATTERNS };