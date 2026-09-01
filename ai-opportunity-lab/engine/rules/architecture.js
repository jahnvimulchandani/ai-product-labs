'use strict';

const { val, get, isKnown } = require('../contract');

/**
 * ARCHITECTURE SELECTION FROM TASK SHAPE
 *
 * Framework 10.2 already lists the questions that decide an architecture:
 * interpretation complexity, input type, prediction need, knowledge grounding,
 * path variability, dynamic planning, tool use, action requirement, autonomy.
 *
 * v0.1 and v0.2 never asked those questions. They guessed at them from
 * vocabulary, which is why the word "policy" appearing anywhere could select
 * PROCESS_OR_HUMAN_CHANGE over a four-signal retrieval case.
 *
 * This version scores the patterns directly against the framework's own
 * questions. Each rule below maps to a numbered subsection of framework 10.3,
 * so a disagreement with the output is a disagreement with the framework and
 * can be argued on that basis rather than by editing a word list.
 */

const ARCH = {
  PROCESS: 'PROCESS_OR_HUMAN_CHANGE',
  DETERMINISTIC: 'DETERMINISTIC_AUTOMATION',
  PREDICTIVE: 'PREDICTIVE_CLASSICAL_ML',
  ASSISTIVE: 'ASSISTIVE_LLM',
  RAG: 'RETRIEVAL_GROUNDED_AI',
  WORKFLOW: 'STRUCTURED_AI_WORKFLOW',
  AGENTIC: 'AGENTIC_SYSTEM',
};

// Complexity ladder. Framework 14: simpler wins without incremental proof.
const LADDER = [ARCH.PROCESS, ARCH.DETERMINISTIC, ARCH.PREDICTIVE, ARCH.ASSISTIVE, ARCH.RAG, ARCH.WORKFLOW, ARCH.AGENTIC];
const rankOf = (p) => LADDER.indexOf(p);

/** Fields each pattern depends on. clarify.js uses this to target questions. */
const ARCH_INPUTS = [
  'organisational_failure', 'interpretation_complexity', 'prediction_need',
  'labelled_history_available', 'knowledge_grounding', 'source_traceability_required',
  'stage_count', 'path_variability', 'dynamic_planning_required', 'tool_use', 'action_target',
];

const MIN_SCORE = 3;

function score(record) {
  const orgFail = val(record, 'organisational_failure');
  const interp = val(record, 'interpretation_complexity');
  const predict = val(record, 'prediction_need');
  const labels = val(record, 'labelled_history_available');
  const ground = val(record, 'knowledge_grounding');
  const cite = val(record, 'source_traceability_required');
  const stages = val(record, 'stage_count');
  const pathVar = val(record, 'path_variability');
  const planning = val(record, 'dynamic_planning_required');
  const tools = val(record, 'tool_use');

  const s = {}; const why = {};
  const add = (p, n, reason) => { s[p] = (s[p] || 0) + n; (why[p] = why[p] || []).push(`${reason} (+${n})`); };

  // 10.3.1 Process or human change: the failure is organisational.
  if (orgFail === true) add(ARCH.PROCESS, 6, 'The stated bottleneck is ownership or decision rights, not the work');
  if (orgFail === false) add(ARCH.PROCESS, -3, 'The bottleneck is the work itself, not the org');

  // 10.3.2 Deterministic: no interpretation, fixed path.
  if (interp === 'NONE') add(ARCH.DETERMINISTIC, 5, 'No interpretation is needed');
  if (interp === 'LOW') add(ARCH.DETERMINISTIC, 2, 'Interpretation is minimal');
  if (pathVar === 'FIXED') add(ARCH.DETERMINISTIC, 3, 'The path is fixed');
  if (predict === 'NONE' && interp === 'NONE') add(ARCH.DETERMINISTIC, 2, 'No prediction and no interpretation');
  if (interp === 'HIGH') add(ARCH.DETERMINISTIC, -4, 'The task needs language interpretation');
  // A prediction task is by definition not a fixed rule, however mechanical the
  // inputs are. Without this, anomaly detection over 480k events tied with
  // DETERMINISTIC_AUTOMATION and lost on the complexity ladder.
  if (predict && predict !== 'NONE') add(ARCH.DETERMINISTIC, -4, 'A prediction task cannot be expressed as a fixed rule');

  // 10.3.3 Predictive: a prediction task with history to learn from.
  if (['CLASSIFY', 'RANK', 'FORECAST', 'ANOMALY'].includes(predict)) add(ARCH.PREDICTIVE, 5, `The core task is ${predict.toLowerCase()}`);
  if (labels === true) add(ARCH.PREDICTIVE, 3, 'Labelled history exists to learn from');
  if (labels === false && ['CLASSIFY', 'RANK', 'FORECAST', 'ANOMALY'].includes(predict)) {
    add(ARCH.PREDICTIVE, -2, 'Prediction is needed but no labelled history exists yet');
  }
  if (predict === 'NONE') add(ARCH.PREDICTIVE, -4, 'Nothing is being predicted');

  // 10.3.4 Assistive LLM: language work, human keeps the decision.
  if (interp === 'HIGH') add(ARCH.ASSISTIVE, 5, 'The task requires language interpretation or generation');
  if (val(record, 'action_target') === 'NONE') add(ARCH.ASSISTIVE, 3, 'The output is consumed by a person, not acted on');
  if (ground === 'NONE' || ground == null) add(ARCH.ASSISTIVE, 1, 'No document corpus dependency');

  // 10.3.5 Retrieval grounded: proprietary knowledge, freshness or citation.
  if (ground === 'PROPRIETARY_CHANGING') add(ARCH.RAG, 6, 'Answers depend on proprietary knowledge that changes');
  if (ground === 'PROPRIETARY_STATIC') add(ARCH.RAG, 3, 'Answers depend on a proprietary corpus');
  if (cite === true) add(ARCH.RAG, 4, 'Source traceability is a stated requirement');
  if (ground === 'NONE' && cite !== true) add(ARCH.RAG, -3, 'No corpus and no citation requirement');

  // 10.3.6 Structured workflow: several known stages, explicit checkpoints.
  if (typeof stages === 'number' && stages >= 3) add(ARCH.WORKFLOW, 5, `${stages} known stages`);
  if (pathVar === 'BRANCHING') add(ARCH.WORKFLOW, 3, 'A few known branches');
  if (interp === 'HIGH' && typeof stages === 'number' && stages >= 3) add(ARCH.WORKFLOW, 2, 'Interpretation inside a staged pipeline');
  if (val(record, 'human_review_point') === 'EVERY_CASE' && typeof stages === 'number' && stages >= 2) {
    add(ARCH.WORKFLOW, 2, 'An explicit approval checkpoint sits inside the flow');
  }

  // 10.3.7 Agentic: the path genuinely cannot be predetermined.
  if (pathVar === 'VARIABLE') add(ARCH.AGENTIC, 5, 'The path cannot be listed in advance');
  if (planning === true) add(ARCH.AGENTIC, 4, 'The system must choose its own next step');
  if (tools === 'WRITE' && pathVar === 'VARIABLE') add(ARCH.AGENTIC, 2, 'Variable path combined with write access');
  // Framework 10.4: agentic exclusion. A workflow with several steps is not an
  // agent, and a mandatory approval on every case contradicts open-ended agency.
  if (pathVar === 'FIXED' || pathVar === 'BRANCHING') add(ARCH.AGENTIC, -5, 'The stages are known, so this is a workflow not an agent');
  if (val(record, 'human_review_point') === 'EVERY_CASE') add(ARCH.AGENTIC, -3, 'Approval on every case contradicts open-ended agency');

  return { scores: s, why };
}

const ROLES = {
  [ARCH.PROCESS]: { role: 'Clarify ownership, policy, or workflow before automating.', implementation_burden: 'LOW', ongoing_burden: 'LOW', fit_summary: 'The failure is organisational rather than computational.' },
  [ARCH.DETERMINISTIC]: { role: 'Execute stable rules, reminders, templates, routing, or explicit branches.', implementation_burden: 'LOW', ongoing_burden: 'LOW', fit_summary: 'Fixed trigger, fixed action, no interpretation step.' },
  [ARCH.PREDICTIVE]: { role: 'Predict, rank, classify, or flag from historical structured data.', implementation_burden: 'MEDIUM', ongoing_burden: 'MEDIUM', data_needs: ['Historical labelled records'], fit_summary: 'The core task is prediction, not generation.' },
  [ARCH.ASSISTIVE]: { role: 'Summarise, draft, extract, or synthesise for human review.', implementation_burden: 'LOW', ongoing_burden: 'MEDIUM', human_role: 'Human verifies output and owns the decision.', fit_summary: 'Language work without autonomous action.' },
  [ARCH.RAG]: { role: 'Ground answers in approved current knowledge with source references.', implementation_burden: 'MEDIUM', ongoing_burden: 'MEDIUM', data_needs: ['Versioned corpus'], key_risks: ['Stale sources', 'Unsupported answers', 'Citation mismatch'], fit_summary: 'Changing proprietary knowledge with a traceability requirement.' },
  [ARCH.WORKFLOW]: { role: 'Orchestrate known stages with explicit checkpoints.', implementation_burden: 'MEDIUM', ongoing_burden: 'MEDIUM', human_role: 'Human approves high-impact steps.', fit_summary: 'Several known stages, each controllable.' },
  [ARCH.AGENTIC]: { role: 'Investigate dynamically, choose next steps, use tools toward a goal.', implementation_burden: 'HIGH', ongoing_burden: 'HIGH', tool_needs: ['Scoped tools', 'Observability', 'Recovery path'], key_risks: ['Wrong tool use', 'Unsupported conclusions', 'Excessive autonomy'], fit_summary: 'The path cannot be predetermined.' },
};

function candidate(pattern, sc, reasons, fit) {
  const b = ROLES[pattern] || {};
  return {
    pattern, score: sc, evidence: reasons || [],
    role: b.role || '', expected_value: 'Depends on measured baseline and adoption.',
    implementation_burden: b.implementation_burden || 'UNKNOWN', ongoing_burden: b.ongoing_burden || 'UNKNOWN',
    data_needs: b.data_needs || [], tool_needs: b.tool_needs || [],
    human_role: b.human_role || 'Human reviews important outcomes and exceptions.',
    key_risks: b.key_risks || [], fit_summary: b.fit_summary || '', current_fit: fit,
  };
}

function selectArchitecture(record, risk, readiness) {
  const { scores, why } = score(record);
  const ranked = Object.entries(scores)
    .map(([pattern, s]) => ({ pattern, score: s, why: why[pattern] || [] }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || rankOf(a.pattern) - rankOf(b.pattern));

  const known = ARCH_INPUTS.filter((f) => isKnown(get(record, f))).length;
  const top = ranked[0];

  /**
   * Refuse rather than guess. If the shape questions have not been answered,
   * there is no architecture to name. v0.1 filled this hole with
   * PROCESS_OR_HUMAN_CHANGE, which won 9 of 24 golden cases as a pure default.
   */
  if (!top || top.score < MIN_SCORE || known < 3) {
    return {
      best_current_fit: null, undetermined: true,
      reason: known < 3
        ? 'Not enough of the task-shape questions have been answered to select an approach.'
        : 'No pattern reached the evidence threshold.',
      simpler_alternative: null, future_option: null, candidates: [], scores,
      missing_shape_fields: ARCH_INPUTS.filter((f) => !isKnown(get(record, f))),
    };
  }

  const agenticBlocked = risk.autonomousExecutionBlocked || readiness.overall === 'LOW' || readiness.overall === 'UNKNOWN';
  const candidates = ranked.map((c) => {
    let fit = c.score >= top.score * 0.75 ? 'STRONG' : c.score >= MIN_SCORE ? 'VIABLE' : 'WEAK';
    if (c.pattern === ARCH.AGENTIC && agenticBlocked) fit = 'FUTURE_ONLY';
    return candidate(c.pattern, c.score, c.why, fit);
  });

  /**
   * Under a human-led gate the answer is a supporting role, not silence.
   * Framework 16.5. v0.1 answered "should AI fire people" with
   * PROCESS_OR_HUMAN_CHANGE, which reads as advice about the org chart.
   */
  if (risk.humanLedRequired) {
    const support = [ARCH.ASSISTIVE, ARCH.RAG, ARCH.WORKFLOW, ARCH.PREDICTIVE]
      .map((p) => ({ p, s: scores[p] || 0 })).sort((a, b) => b.s - a.s)[0];
    const cands = [ARCH.ASSISTIVE, ARCH.RAG, ARCH.WORKFLOW, ARCH.PREDICTIVE]
      .map((p) => candidate(p, scores[p] || 0, why[p], p === support.p ? 'STRONG' : 'VIABLE'));
    cands.forEach((c) => {
      c.role = `Supporting role only. ${c.role}`;
      c.human_role = 'The accountable decision and any external action remain with a human.';
    });
    return {
      best_current_fit: support.p, undetermined: false, constrained_to_supporting_role: true,
      reason: 'A hard risk gate keeps the critical decision human-led, so AI is scoped to supporting sub-tasks.',
      simpler_alternative: null, future_option: null, candidates: cands, scores,
    };
  }

  let best = candidates.find((c) => c.current_fit === 'STRONG') || candidates[0];
  // Simpler wins on a tie, but only if it also clears the evidence floor.
  for (const c of candidates) {
    if (c.current_fit === 'FUTURE_ONLY') continue;
    if (rankOf(c.pattern) < rankOf(best.pattern) && c.score >= MIN_SCORE && c.score >= best.score - 1) best = c;
  }
  const simpler = candidates.find((c) => rankOf(c.pattern) < rankOf(best.pattern) && c.current_fit !== 'FUTURE_ONLY') || null;
  const future = candidates.find((c) => rankOf(c.pattern) > rankOf(best.pattern)) || null;

  /**
   * Always emit a comparator. Framework 8.2 requires a comparison set, and the
   * schema enforces a minimum of two candidates for the same reason: a single
   * recommendation with nothing to weigh it against is an assertion, not an
   * analysis. If scoring produced only one viable pattern, the simplest
   * plausible option is added explicitly as the thing that must be beaten.
   */
  let out = candidates.slice(0, 4);
  if (out.length < 2) {
    const comparator = best.pattern === ARCH.PROCESS ? ARCH.DETERMINISTIC : ARCH.PROCESS;
    out = [...out, candidate(comparator, scores[comparator] || 0,
      ['Added as the mandatory simpler comparator; the preferred path has to beat this.'], 'WEAK')];
  }

  return {
    best_current_fit: best.pattern, undetermined: false,
    simpler_alternative: simpler ? simpler.pattern : (out[1] ? out[1].pattern : null),
    future_option: future ? future.pattern : null,
    candidates: out, scores,
  };
}

module.exports = { ARCH, ARCH_INPUTS, selectArchitecture, LADDER, rankOf };
