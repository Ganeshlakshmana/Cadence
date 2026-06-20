/**
 * Utilities for reading block.input from Anthropic tool_use responses.
 *
 * Claude intermittently returns array fields (touches, changes, simulatedResponses,
 * risksAndMitigations) as JSON-encoded strings inside the tool argument.
 * The outer tool_use JSON is always valid (handled by the API); the string value
 * may contain literal newlines from multiline content bodies.
 * tryUnwrapArray handles both cases transparently.
 */

function repairJsonStrings(text: string): string {
  const out: string[] = [];
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (!inString) {
      out.push(ch);
      if (ch === '"') inString = true;
      i++;
      continue;
    }
    if (ch === '\\') { out.push(ch); i++; if (i < text.length) { out.push(text[i]); i++; } continue; }
    if (ch === '"') { out.push(ch); inString = false; i++; continue; }
    if (ch === '\n') { out.push('\\n'); i++; continue; }
    if (ch === '\r') { if (i + 1 < text.length && text[i + 1] === '\n') i++; out.push('\\n'); i++; continue; }
    if (ch === '\t') { out.push('\\t'); i++; continue; }
    out.push(ch); i++;
  }
  return out.join('');
}

/**
 * If value is a JSON-encoded string, parse and return the inner value.
 * If it's already an array (or anything else), return it untouched.
 * Zod will catch type mismatches if both parse attempts fail.
 */
export function tryUnwrapArray(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { /* fall through to repair */ }
  const repaired = repairJsonStrings(value).replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(repaired); } catch { /* return as-is; Zod will report the type error */ }
  return value;
}

/** Apply tryUnwrapArray to each listed field name on the input object. */
export function unwrapArrayFields(inp: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out = { ...inp };
  for (const field of fields) {
    out[field] = tryUnwrapArray(out[field]);
  }
  return out;
}
