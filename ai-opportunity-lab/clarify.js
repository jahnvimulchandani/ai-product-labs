'use strict';

const { FIELDS, emptyRecord, get, set, isKnown, coerce } = require('./contract');
const { evaluate } = require('./evaluate');

/**
 * DYNAMIC CLARIFICATION (the MCQ engine)
 *
 * PRD 6.2 says "ask only decision-relevant questions". PRD 9.5 says skip
 * anything the description already answered. Both are stated as instructions
 * to a model, which means in practice they are hopes: an LLM asked to judge
 * its own question relevance will happily ask six questions because six feels
 * like a thorough number.
 *
 * This implements them as arithmetic instead.
 *
 * HOW A QUESTION EARNS ITS PLACE
 *
 * For each unanswered field, take its candidate values, clone the record, set
 * the field, and re-run the pure evaluation. If every candidate value produces
 * the same decision, the same architecture and the same gate set, the answer
 * cannot change the audit and the question is not asked. If the outcomes
 * differ, the question is scored by how much they differ, weighted so that
 * safety-relevant divergence dominates.
 *
 * That is value of information, and it gives three things the prompt-based
 * version could not:
 *
 *   1. A defensible reason for every question. "This is asked because the
 *      answer moves the verdict between PROCEED_TO_PILOT and
 *      HUMAN_LED_DO_NOT_AUTOMATE" is a reason. "The model thought it was
 *      relevant" is not.
 *   2. A real stop rule. Stop when nothing left can change the outcome, not
 *      after an arbitrary count.
 *   3. Correct ordering for free. The question that splits the decision comes
 *      before the one that only shifts confidence, because the scoring says so.
 *
 * Cost: a few hundred synchronous evaluations per turn. On this rule set that
 * is single-digit milliseconds, and it replaces a model call.
 */

const MAX_QUESTIONS = 8;

/** Values worth testing for each field type. */
function candidateValues(id, record) {
  const def = FIELDS[id];
  if (!def) return [];
  if (def.type === 'boolean') return [true, false];
  if (def.type === 'enum') return def.values;
  if (def.type === 'number') return (def.options ? def.options(record).map((o) => o.value) : [1, 60, 250]);
  if (def.options) return def.options(record).map((o) => o.value);
  return [];
}

function signature(result) {
  return {
    decision: result.decision.state,
    architecture: result.architecture.best_current_fit,
    gates: [...result.risk.hard_gates].sort().join('|'),
    tier: result.risk.risk_tier,
    value: result.value.value_potential,
  };
}

/**
 * Weighted divergence between the outcomes a field's possible answers produce.
 * Safety divergence is weighted an order of magnitude above value divergence,
 * because "does this need a human in the loop" is a more urgent question than
 * "is this worth 40 hours a year or 400".
 */
function informationValue(record, id, opts) {
  const values = candidateValues(id, record);
  if (values.length < 2) return { score: 0, outcomes: [] };

  const outcomes = values.map((v) => {
    const clone = JSON.parse(JSON.stringify(record));
    set(clone, id, coerce(id, v), 'CONFIRMED', 'hypothetical');
    return { value: v, sig: signature(evaluate(clone, opts)) };
  });

  const uniq = (k) => new Set(outcomes.map((o) => o.sig[k])).size;
  const score =
    (uniq('decision') - 1) * 10 +
    (uniq('gates') - 1) * 8 +
    (uniq('tier') - 1) * 6 +
    (uniq('architecture') - 1) * 4 +
    (uniq('value') - 1) * 2;

  return { score, outcomes };
}

/**
 * Build the three offered choices, best guess first (PRD 9.3).
 *
 * "Best guess" is not the model's opinion. It is whatever the heuristic or
 * LLM extraction already leaned toward, surfaced for confirmation rather than
 * silently adopted. That is PRD 9.6: an inferred answer must never become a
 * confirmed fact without the user saying so. v0.1 had no mechanism for this at
 * all, which is how an unknown ended up steering an architecture choice.
 */
function buildOptions(record, id) {
  const def = FIELDS[id];
  const base = (def.options ? def.options(record) : []).slice(0, 3);
  const current = get(record, id);
  const guessed = current && current.value !== null && current.value !== undefined
    && ['ASSUMED', 'ESTIMATED', 'SUPPORTED'].includes(current.evidence_status)
    ? current.value : undefined;

  let opts = base;
  if (guessed !== undefined) {
    const idx = opts.findIndex((o) => JSON.stringify(o.value) === JSON.stringify(guessed));
    if (idx > 0) opts = [opts[idx], ...opts.filter((_, i) => i !== idx)];
    else if (idx === -1) {
      opts = [{ label: `From your description: ${String(guessed)}`, value: guessed }, ...opts].slice(0, 3);
    }
    opts = opts.map((o, i) => (i === 0 ? { ...o, inferred_from_description: true } : o));
  }

  // The fourth path is not optional. PRD 6.5 and 9.7: "I do not know" must be
  // a first-class answer, not a dead end, and the user must always be able to
  // say something the options did not anticipate.
  return [
    ...opts,
    { label: 'Custom answer', value: null, custom: true, accepts_unknown: true },
  ];
}

/**
 * Next batch of questions.
 *
 * @param {object} record
 * @param {object} opts.max          how many to return (default 3)
 * @param {number} opts.minScore     ignore questions below this VOI (default 1)
 * @param {string[]} opts.asked      field ids already put to the user
 */
/**
 * MANDATORY QUESTIONS: the fix for value-of-information myopia.
 *
 * VOI compares one field at a time. On a cold record that breaks down, because
 * no SINGLE answer flips the verdict: the audit is INSUFFICIENT_INPUT until
 * two or three fields land together, so every field individually scores zero
 * and the engine cheerfully concludes there is nothing worth asking.
 *
 * Measured: before this, the clarification pass recovered 4 of 16 convergence
 * cases. The loop was terminating immediately on exactly the records that
 * needed it most.
 *
 * So three tiers of question sit above pure VOI, each tied to a specific
 * defect the audit currently has rather than to a generic checklist:
 *
 *   TIER 0  the audit cannot run at all       -> auditability fields
 *   TIER 1  a risk-critical field is unknown  -> gate inputs
 *   TIER 2  no architecture can be selected   -> task-shape fields
 *
 * A field only becomes mandatory while its defect is live, so the moment the
 * audit becomes determinate the tiers empty out and VOI takes over again.
 * This is not "ask everything", it is "ask what is blocking".
 */
function mandatoryFields(record, evalOpts) {
  const r = evaluate(record, evalOpts);
  const out = [];
  const unknown = (f) => !isKnown(get(record, f));

  if (r.decision.state === 'INSUFFICIENT_INPUT') {
    out.push(...['affected_user', 'value_mechanism', 'interpretation_complexity', 'pain_evidence_level'].filter(unknown)
      .map((field) => ({ field, tier: 0, why: 'The audit cannot run until a user, a workflow, and an outcome are identified.' })));
  }
  if (r.risk.unknown_risk_fields.length) {
    out.push(...r.risk.unknown_risk_fields.filter(unknown)
      .map((field) => ({ field, tier: 1, why: 'Risk cannot be judged while this is unknown, and the proposal is already consequential.' })));
  }
  for (const g of r.risk.hard_gates) {
    out.push(...(r.risk.gate_closing_fields[g] || []).filter(unknown)
      .map((field) => ({ field, tier: 1, why: `Answering this could close ${g}.` })));
  }
  if (r.architecture.undetermined) {
    out.push(...(r.architecture.missing_shape_fields || []).slice(0, 4).filter(unknown)
      .map((field) => ({ field, tier: 2, why: 'No approach can be selected until the task shape is established.' })));
  }
  const seen = new Set();
  return out.filter((m) => { if (seen.has(m.field)) return false; seen.add(m.field); return true; });
}

function nextQuestions(record, opts = {}) {
  const max = opts.max || 3;
  const minScore = opts.minScore != null ? opts.minScore : 1;
  const asked = new Set(opts.asked || []);
  const evalOpts = { allowClarify: true };

  const mandatory = new Map(mandatoryFields(record, evalOpts).map((m) => [m.field, m]));

  const ranked = [];
  for (const [id, def] of Object.entries(FIELDS)) {
    if (!def.ask) continue;
    if (asked.has(id)) continue;

    // PRD 9.5 skip logic, mechanically: a field the user confirmed, or that the
    // extractor read straight out of the text, is not asked again. Only weak
    // evidence (ASSUMED, or nothing) is eligible.
    const c = get(record, id);
    if (isKnown(c) && ['CONFIRMED', 'SUPPORTED'].includes(c.evidence_status)) continue;

    const { score, outcomes } = informationValue(record, id, evalOpts);
    const must = mandatory.get(id);
    // Mandatory questions get a floor that puts them above any VOI-only
    // question, ordered by tier, with VOI still breaking ties inside a tier.
    const finalScore = must ? (100 - must.tier * 10) + Math.min(score, 9) : score;
    if (!must && score < minScore) continue;

    ranked.push({
      field: id,
      score: finalScore,
      voi: score,
      mandatory: must ? must.tier : null,
      question: def.prompt,
      why_asked: must ? must.why : describeWhy(outcomes),
      options: buildOptions(record, id),
      block: def.block,
    });
  }

  // Safety-relevant fields break ties, so an unresolved gate input is asked
  // before an unresolved value input at the same score.
  const SAFETY = new Set(['stakes', 'error_detectability', 'reversibility', 'human_review_point',
    'autonomy_requested', 'sensitive_data', 'data_controls_confirmed', 'untrusted_input',
    'rights_impact', 'recovery_path_exists', 'accountable_owner', 'action_target']);
  ranked.sort((a, b) => b.score - a.score || (SAFETY.has(b.field) ? 1 : 0) - (SAFETY.has(a.field) ? 1 : 0));

  return ranked.slice(0, max);
}

function describeWhy(outcomes) {
  const states = [...new Set(outcomes.map((o) => o.sig.decision))];
  const gates = [...new Set(outcomes.map((o) => o.sig.gates).filter(Boolean))];
  if (states.length > 1) return `The answer moves the recommendation between ${states.join(' and ')}.`;
  if (gates.length > 1) return 'The answer changes which risk gates apply.';
  const archs = [...new Set(outcomes.map((o) => o.sig.architecture))];
  if (archs.length > 1) return `The answer changes the recommended approach between ${archs.filter(Boolean).join(' and ')}.`;
  return 'The answer changes how confident the audit can be.';
}

/**
 * Stop rule (PRD 9.8). Stop when nothing left changes anything, or when the
 * budget is spent. Explicitly NOT "stop after N questions" alone, because a
 * fixed count both over-asks on clear ideas and under-asks on dangerous ones.
 */
function shouldStop(record, asked = []) {
  if (asked.length >= MAX_QUESTIONS) {
    return { stop: true, reason: `Question budget of ${MAX_QUESTIONS} reached.` };
  }
  const remaining = nextQuestions(record, { max: 1, asked });
  if (!remaining.length) {
    return { stop: true, reason: 'No remaining question can change the decision, the architecture, or the gate set.' };
  }
  return { stop: false, reason: null, next: remaining[0] };
}

/** Record an answer. Custom answers arrive as free text or an explicit unknown. */
function applyAnswer(record, field, value, questionText = '') {
  if (value === null || value === undefined || String(value).trim() === '' || /^(i (do not|don'?t) know|unknown|not sure|no idea)$/i.test(String(value))) {
    // An explicit "I do not know" is information. It is recorded as a
    // deliberate unknown so the audit can cite it as an open question rather
    // than silently re-asking it or, worse, filling it with a default.
    record.fields[field] = { value: null, evidence_status: 'UNKNOWN', source: 'user_declined', note: 'User stated this is not known.' };
    record.history.push({ id: field, value: null, evidence_status: 'UNKNOWN', source: 'user_declined', at: new Date().toISOString() });
    return record;
  }
  return set(record, field, coerce(field, value), 'CONFIRMED', 'user_answer', questionText);
}

/** Run the whole loop against an answer function. Used by evals and demos. */
async function runClarification(record, answerFn, opts = {}) {
  const asked = [];
  const transcript = [];
  for (let i = 0; i < (opts.max || MAX_QUESTIONS); i++) {
    const stop = shouldStop(record, asked);
    if (stop.stop) { transcript.push({ stopped: stop.reason }); break; }
    const q = stop.next;
    const answer = await answerFn(q, record);
    asked.push(q.field);
    transcript.push({ field: q.field, question: q.question, score: q.score, why: q.why_asked, answer });
    applyAnswer(record, q.field, answer, q.question);
  }
  return { record, asked, transcript };
}

module.exports = { nextQuestions, shouldStop, applyAnswer, runClarification, informationValue, buildOptions, MAX_QUESTIONS };
