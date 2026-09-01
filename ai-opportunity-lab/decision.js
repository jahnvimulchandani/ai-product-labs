'use strict';

const { ARCH, rankOf } = require('./architecture');
const { val, get, isKnown } = require('../contract');

/**
 * DECISION STATE
 *
 * Ordering follows framework 14's own tie-breaks, in this order:
 *   risk outranks value
 *   evidence beats enthusiasm
 *   value and readiness stay separate
 *   simpler wins without incremental proof
 *   pilot before scale
 *
 * Two states beyond the framework's six:
 *
 *   INSUFFICIENT_INPUT   the description does not identify a user, a workflow
 *                        or an outcome, so there is nothing to audit. v0.1
 *                        returned USE_SIMPLER_APPROACH with a full roadmap for
 *                        an empty string.
 *
 *   NEEDS_CLARIFICATION  the audit is genuinely undecided and a specific
 *                        question would settle it. This is what makes the MCQ
 *                        layer honest: the engine names the field it is stuck
 *                        on instead of picking a verdict and hiding the doubt.
 *
 * Both need one enum addition each to audit-schema.json. Patch supplied.
 */

const DECISION = {
  PILOT: 'PROCEED_TO_PILOT',
  VALIDATE: 'VALIDATE_VALUE',
  PREPARE: 'PREPARE_DEPENDENCIES',
  SIMPLER: 'USE_SIMPLER_APPROACH',
  HUMAN_LED: 'HUMAN_LED_DO_NOT_AUTOMATE',
  PARK: 'PARK',
  INSUFFICIENT: 'INSUFFICIENT_INPUT',
  CLARIFY: 'NEEDS_CLARIFICATION',
};

const LOW_COMPLEXITY = [ARCH.PROCESS, ARCH.DETERMINISTIC];

function minConfidence(...cs) {
  if (cs.includes('LOW')) return 'LOW';
  if (cs.includes('MEDIUM')) return 'MEDIUM';
  return 'HIGH';
}

const out = (state, confidence, primary_reason, largest_uncertainty = null, extra = {}) =>
  ({ state, confidence, primary_reason, largest_uncertainty, ...extra });

/**
 * @param {object} opts.allowClarify  When false (the final audit pass) the
 *   engine must commit to one of the framework's states rather than deferring.
 *   When true (during clarification) it may say NEEDS_CLARIFICATION.
 */
function decideState(record, blocks, opts = {}) {
  const { problem, value, readiness, architecture, risk } = blocks;
  const conf = minConfidence(problem.confidence, value.confidence, readiness.confidence);

  // 0. Risk outranks EVERYTHING, including whether the rest is auditable.
  //
  //    This ordering matters. A thin description can still contain enough to
  //    fire a hard gate: "decide eligibility and post the outcome letter with
  //    nobody checking it" says almost nothing about value or volume, and
  //    everything about autonomy over a rights-affecting decision.
  //
  //    Returning INSUFFICIENT_INPUT there, with two gates quietly attached to
  //    the report, is the worst of both worlds: it reads as "we could not
  //    assess this" when the truthful answer is "we cannot assess the value
  //    yet, and separately, this must not run unattended".
  if (risk.humanLedRequired) {
    return out(DECISION.HUMAN_LED, conf,
      'Risk and accountability constraints require the critical decision or action to stay human-led.',
      risk.unknown_risk_fields.length
        ? `Risk-critical fields are still unknown: ${risk.unknown_risk_fields.join(', ')}.`
        : 'Which sub-tasks can be safely assisted without moving the decision.');
  }

  // 1. Auditable at all? Reached only when no gate has already answered the
  //    question. Three things are needed: someone affected, something
  //    happening, and something that would change. Three things are needed: someone affected, something
  //    happening, and something that would change.
  const auditable = [
    isKnown(get(record, 'affected_user')),
    isKnown(get(record, 'interpretation_complexity')) || isKnown(get(record, 'prediction_need')) || isKnown(get(record, 'knowledge_grounding')),
    isKnown(get(record, 'value_mechanism')) || isKnown(get(record, 'pain_evidence_level')),
  ].filter(Boolean).length;
  if (auditable < 2) {
    return out(DECISION.INSUFFICIENT, 'LOW',
      'The description does not identify a user, a workflow, and an outcome, so there is nothing to audit yet.',
      'What problem this solves, for whom, and what would measurably change.');
  }

  // 2. Evidence beats enthusiasm.
  if (value.raw_potential === 'UNKNOWN' && problem.rating === 'WEAK') {
    return out(DECISION.VALIDATE, 'LOW',
      'Neither the problem nor the value has evidence behind it yet.',
      'Whether a real user problem exists and what it is worth.');
  }
  if (problem.rating === 'WEAK' && value.value_potential === 'LOW') {
    return LOW_COMPLEXITY.includes(architecture.best_current_fit)
      ? out(DECISION.SIMPLER, conf, 'The value is small, but a low-complexity path already covers it, so use that instead of parking it.')
      : out(DECISION.PARK, conf, 'Neither the problem evidence nor the expected value justifies investment now.',
        'Whether a meaningful problem exists at all.');
  }
  if (problem.rating === 'WEAK' || value.raw_potential === 'UNKNOWN') {
    return out(DECISION.VALIDATE, 'LOW',
      'The idea needs stronger problem, user, or value evidence before technical investment.',
      'Problem definition and measurable value.');
  }

  // 3. Undecided, and a question would settle it.
  if (architecture.undetermined) {
    if (opts.allowClarify) {
      return out(DECISION.CLARIFY, 'LOW',
        'The task shape is not established well enough to select an approach.',
        'Task shape.', { blocked_on: architecture.missing_shape_fields || [] });
    }
    return out(DECISION.VALIDATE, 'LOW',
      'The task shape is not specific enough to select an approach, so define the workflow before committing.',
      'The concrete workflow, its trigger, and the output a user would act on.');
  }

  // 4. Real but small value.
  if (value.value_potential === 'LOW') {
    return out(DECISION.SIMPLER, conf,
      'The sized value is too small to justify AI build and operating burden.');
  }

  // 5. Readiness blocks a pilot. Only admitted blockers count. See value.js.
  if (readiness.blocking_dependencies.length) {
    return out(DECISION.PREPARE, conf,
      'The opportunity may be worth pursuing, but a readiness gap blocks a meaningful pilot.',
      readiness.blocking_dependencies[0]);
  }

  // 6. The user asked for more machinery than the task shape needs.
  //    Framework 10.4 and 13.4. v0.1 returned PROCEED_TO_PILOT here, which
  //    quietly rubber-stamped the over-build.
  const wantsAgent = val(record, 'dynamic_planning_required') === true || val(record, 'autonomy_requested') === 'FULL_AUTONOMY';
  if (wantsAgent && architecture.best_current_fit !== ARCH.AGENTIC && rankOf(architecture.best_current_fit) < rankOf(ARCH.AGENTIC)) {
    return out(DECISION.SIMPLER, conf,
      `The request implies an agent, but the task shape is served by ${architecture.best_current_fit} at lower cost and risk.`,
      'Whether any part of the workflow genuinely needs dynamic tool selection.');
  }

  // 7. Simpler wins without incremental proof.
  if (LOW_COMPLEXITY.includes(architecture.best_current_fit)) {
    return out(DECISION.SIMPLER, conf,
      'A lower-complexity path addresses the workflow without AI operating burden.',
      value.baseline_status !== 'AVAILABLE' ? 'Workflow volume and baseline impact.' : null);
  }

  // 8. Pilot.
  return out(DECISION.PILOT, conf,
    'The problem and value are plausible, a viable architecture exists, and the remaining uncertainty is testable at small scale.',
    value.baseline_status === 'AVAILABLE'
      ? 'Output quality on representative cases.'
      : 'Measured baseline and the accepted-outcome threshold.');
}

module.exports = { DECISION, decideState };
