'use strict';

const { FIELDS, emptyRecord, set, coerce } = require('./contract');
const { heuristicExtract } = require('./heuristic-extractor');

/**
 * EXTRACTION LAYER
 *
 * The LLM's only job in this system is turning prose into the fields defined
 * in contract.js. It never decides anything. Every judgement, gate and verdict
 * is made downstream by deterministic code reading those fields.
 *
 * That split is what buys reproducibility. PRD section 18 asks for the same
 * idea, phrased differently, to produce the same decision. You cannot get that
 * from an LLM that reasons all the way to a verdict, because sampling variance
 * lands directly on the answer. You can get it from an LLM that only fills in
 * slots, because a slot value is either in the allowed enum or it is rejected,
 * and two wordings that fill the same slots produce identical output by
 * construction.
 *
 * THREE RULES ENFORCED HERE
 *
 * 1. The model may only return declared fields with declared values.
 *    Anything else is dropped, not coerced into something plausible.
 * 2. The model must return UNKNOWN when the text does not say. This is the
 *    single most important instruction in the prompt. An extractor that
 *    guesses moves the hallucination one layer earlier and makes it harder
 *    to see, because a confident field looks the same whether it was read or
 *    invented.
 * 3. Every extracted value carries an evidence_status and a verbatim quote.
 *    No quote, no CONFIRMED. This is the mechanical version of framework
 *    section 3 and it is what makes the extraction auditable after the fact.
 */

function fieldSpec() {
  const lines = [];
  for (const [id, def] of Object.entries(FIELDS)) {
    let t;
    if (def.type === 'enum') t = def.values.join(' | ');
    else if (def.type === 'boolean') t = 'true | false';
    else if (def.type === 'number') t = 'number';
    else t = 'short string';
    lines.push(`- ${id} (${t}): ${def.prompt}`);
  }
  return lines.join('\n');
}

const SYSTEM_PROMPT = `You extract structured facts from a description of a proposed AI or automation idea. You do not evaluate the idea, recommend anything, or decide whether it is a good idea. Another system does that.

Return ONLY a JSON object. No prose, no markdown fences.

Shape:
{
  "fields": {
    "<field_id>": { "value": <value>, "evidence": "CONFIRMED" | "SUPPORTED" | "ESTIMATED", "quote": "<verbatim span from the input that supports this>" }
  }
}

RULES, in order of importance:

1. OMIT any field the text does not support. Do not guess. Do not infer from what would be typical. An omitted field is correct; an invented field is a serious error, because downstream logic treats a present field as evidence.

2. Use the exact allowed values listed for each field. Never invent a new value.

3. "quote" must be a verbatim substring of the input. If you cannot quote it, omit the field.

4. Evidence status:
   CONFIRMED  the text states it directly ("a rep approves every reply")
   SUPPORTED  the text clearly implies it in one step ("the rep sends it" implies a human is in the loop)
   ESTIMATED  you converted a stated quantity into the field's unit ("a few times a week" to 150 per year)
   Anything weaker than this: omit the field.

5. Numbers: convert to the field's unit. Frequencies are per year. Durations are minutes. State the conversion in "quote" by quoting the original phrase.

6. Absence of a mention is NOT evidence of absence. If the text never mentions human review, omit human_review_point. Do NOT set it to NONE. This one matters more than it looks: "nobody reviews this" and "the text did not say" lead to different audits, and conflating them is how a safety gate gets missed.

FIELDS:
${fieldSpec()}`;

function buildMessages(idea, priorAnswers = []) {
  const prior = priorAnswers.length
    ? `\n\nThe user has already answered these clarification questions. Treat them as CONFIRMED:\n${priorAnswers.map((a) => `- ${a.field}: ${JSON.stringify(a.value)} (asked: "${a.question}")`).join('\n')}`
    : '';
  return [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n---\n\nIDEA DESCRIPTION:\n${idea}${prior}` }];
}

/** Strip fences, parse, and reject anything the contract does not allow. */
function parseAndValidate(raw, idea) {
  const text = String(raw || '').replace(/```json|```/g, '').trim();
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { fields: {}, rejected: [{ reason: 'unparseable JSON' }] }; }

  const accepted = {};
  const rejected = [];
  const lowerIdea = String(idea || '').toLowerCase();

  for (const [id, entry] of Object.entries(parsed.fields || {})) {
    if (!FIELDS[id]) { rejected.push({ id, reason: 'field not in contract' }); continue; }
    const value = coerce(id, entry && entry.value);
    if (value === null && entry && entry.value !== null) {
      rejected.push({ id, reason: `value not in allowed set: ${JSON.stringify(entry.value)}` });
      continue;
    }
    let evidence = ['CONFIRMED', 'SUPPORTED', 'ESTIMATED'].includes(entry.evidence) ? entry.evidence : 'ASSUMED';

    /**
     * Quote check. A CONFIRMED field whose quote is not actually in the input
     * is a fabricated citation, so it gets demoted rather than trusted. This
     * catches the most common extraction failure without needing a second
     * model call.
     */
    const quote = String(entry.quote || '').toLowerCase().trim();
    if (evidence === 'CONFIRMED' && (!quote || !lowerIdea.includes(quote.slice(0, Math.min(40, quote.length))))) {
      evidence = 'ASSUMED';
      rejected.push({ id, reason: 'quote not found in input, demoted to ASSUMED' });
    }
    accepted[id] = { value, evidence, quote: entry.quote || '' };
  }
  return { fields: accepted, rejected };
}

/**
 * Extract into an OpportunityRecord.
 *
 * @param {string} idea
 * @param {object} opts
 * @param {function} opts.callModel  async ({messages}) => string. Omit to run
 *   in deterministic mode, which uses the heuristic extractor only. Every eval
 *   in this repo runs in deterministic mode so the rule layer can be tested
 *   without a model in the loop, and so a rule regression is never masked by
 *   model variance.
 * @param {array} opts.answers  clarification answers already collected.
 */
async function extract(idea, opts = {}) {
  const record = emptyRecord(idea);
  const trace = { mode: opts.callModel ? 'llm' : 'heuristic', rejected: [], llm_fields: 0, heuristic_fields: 0 };

  /**
   * The heuristic pass runs FIRST and at ASSUMED strength. Its values are the
   * weakest evidence in the system, so anything the model or the user supplies
   * overrides it (contract.set refuses downgrades). This is the honest home
   * for the v0.2 lexicons: useful as a prior, never as a source of truth.
   */
  const h = heuristicExtract(idea);
  for (const [id, v] of Object.entries(h)) {
    set(record, id, v.value, 'ASSUMED', 'heuristic', v.why || '');
    trace.heuristic_fields++;
  }

  if (opts.callModel) {
    try {
      const raw = await opts.callModel({ messages: buildMessages(idea, opts.answers || []) });
      const { fields, rejected } = parseAndValidate(raw, idea);
      trace.rejected = rejected;
      for (const [id, e] of Object.entries(fields)) {
        set(record, id, e.value, e.evidence, 'llm', e.quote);
        trace.llm_fields++;
      }
    } catch (err) {
      trace.error = String(err && err.message ? err.message : err);
      // Deliberately no rethrow. A failed extraction degrades to heuristic
      // priors, and the audit will report low confidence and ask questions,
      // which is the correct behaviour when you know less than you hoped.
    }
  }

  // User answers are CONFIRMED and outrank everything, per PRD 6.4 and 9.6.
  for (const a of opts.answers || []) {
    const v = coerce(a.field, a.value);
    if (v !== null || a.value === null) set(record, a.field, v, 'CONFIRMED', 'user_answer', a.question || '');
  }

  record.extraction_trace = trace;
  return record;
}

module.exports = { extract, buildMessages, parseAndValidate, SYSTEM_PROMPT, fieldSpec };
