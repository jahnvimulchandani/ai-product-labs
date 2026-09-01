'use strict';

const { ARCH } = require('./architecture-rules');

/**
 * DECISION STATE LOGIC
 *
 * Changes from v0.1, with reasons:
 *
 * 1. INSUFFICIENT_INPUT added as a seventh state.
 *    v0.1 returned a full audit with roadmap and tester flow for an empty
 *    string, for "asdfgh qwerty", and for the single word "chatbot". For a
 *    product whose selling point is refusing to guess, silently emitting a
 *    confident decision from no evidence is the worst possible default.
 *    This state requires a one-line addition to the schema's decision enum.
 *
 * 2. Order of checks now follows the framework's own tie-breaks
 *    (section 14): risk outranks value, value and readiness stay separate,
 *    simpler wins without incremental proof. v0.1 checked value before
 *    readiness in a way that let a valuable-but-unready idea be parked.
 *
 * 3. PREPARE no longer swallows PILOT.
 *    v0.1 returned PREPARE_DEPENDENCIES whenever readiness was anything other
 *    than confidently good, which is why it predicted PROCEED_TO_PILOT 5
 *    times where the golden set expected 10. A missing baseline is something
 *    a pilot MEASURES, not a blocker that prevents one. Only access, data,
 *    integration, control, and ownership gaps block a pilot now.
 *
 * 4. Every state carries a written reason and the largest open uncertainty,
 *    because "keep evidence visible" is a framework principle and a reviewer
 *    cannot challenge a verdict they cannot see the basis for.
 */

const DECISION = {
  PILOT: 'PROCEED_TO_PILOT',
  VALIDATE: 'VALIDATE_VALUE',
  PREPARE: 'PREPARE_DEPENDENCIES',
  SIMPLER: 'USE_SIMPLER_APPROACH',
  HUMAN_LED: 'HUMAN_LED_DO_NOT_AUTOMATE',
  PARK: 'PARK',
  INSUFFICIENT: 'INSUFFICIENT_INPUT',
};

const LOW_COMPLEXITY = [ARCH.PROCESS, ARCH.DETERMINISTIC];

function minConfidence(s) {
  const all = [s.readinessConfidence, s.problemConfidence, s.valueConfidence];
  if (all.includes('LOW')) return 'LOW';
  if (all.includes('MEDIUM')) return 'MEDIUM';
  return 'HIGH';
}

function decideState(input, scores, architecture, risk) {
  // 0. Can this even be audited?
  if (!input.original_idea || input.wordCount < 6 || !input.buildIntent) {
    return {
      state: DECISION.INSUFFICIENT,
      confidence: 'LOW',
      primary_reason: !input.original_idea
        ? 'No idea description was provided.'
        : !input.buildIntent
          ? 'The description does not propose building or automating anything, so there is nothing to audit.'
          : 'The description is too short to identify a user, a workflow, or an outcome.',
      largest_uncertainty: 'What problem this is meant to solve, for whom, and what would change.',
    };
  }

  // 1. Risk outranks value (framework 14).
  if (risk.humanLedRequired) {
    return {
      state: DECISION.HUMAN_LED,
      confidence: minConfidence(scores),
      primary_reason: 'Risk and accountability constraints require the critical decision or action to remain human-led.',
      largest_uncertainty: risk.riskCriticalUnknown
        ? 'Risk-critical information is still unknown.'
        : 'Which sub-tasks can safely be assisted without moving the decision.',
    };
  }

  // 2. Value and problem are both weak. Park, unless a cheap non-AI path is
  //    already sitting there, in which case tell them to just do that.
  //    v0.1 could not make this distinction and returned PARK or SIMPLER
  //    based on which architecture happened to be first in the array.
  const lowComplexityAvailable = LOW_COMPLEXITY.includes(architecture.best_current_fit);

  if (scores.problem === 'WEAK' && scores.value === 'LOW') {
    return lowComplexityAvailable
      ? {
        state: DECISION.SIMPLER,
        confidence: minConfidence(scores),
        primary_reason: 'The value is small, but a low-complexity path already covers the workflow, so use that rather than parking it.',
        largest_uncertainty: null,
      }
      : {
        state: DECISION.PARK,
        confidence: minConfidence(scores),
        primary_reason: 'Neither the problem evidence nor the expected value justifies active investment now.',
        largest_uncertainty: 'Whether a meaningful user or business problem exists at all.',
      };
  }

  // 3. Weak problem or unknown value: validate before building anything.
  if (scores.problem === 'WEAK' || scores.value === 'UNKNOWN') {
    return {
      state: DECISION.VALIDATE,
      confidence: 'LOW',
      primary_reason: 'The idea needs stronger problem, user, or value evidence before technical investment.',
      largest_uncertainty: 'Problem definition and measurable value.',
    };
  }

  // 4. The only stated justification is a feeling, and no baseline exists.
  //    Framework 6.3 calls this Level 2 anecdotal evidence, which is
  //    explicitly not sufficient to authorise a pilot. v0.1 had no way to
  //    tell "reporting feels repetitive" apart from a measured workflow.
  if (scores.subjectiveOnly && scores.baselineStatus !== 'AVAILABLE') {
    return {
      state: DECISION.VALIDATE,
      confidence: 'LOW',
      primary_reason: 'The only stated evidence is a subjective impression and no baseline exists to test it against.',
      largest_uncertainty: 'Whether the perceived pain is real and large enough to act on.',
    };
  }

  // 5. No architecture signal at all: the idea is not specific enough yet.
  if (architecture.undetermined) {
    return {
      state: DECISION.VALIDATE,
      confidence: 'LOW',
      primary_reason: 'The description does not yet identify a task shape specific enough to select an approach.',
      largest_uncertainty: 'The concrete workflow, its trigger, and the output a user would act on.',
    };
  }

  // 6. Real but small value: do the cheap version.
  if (scores.value === 'LOW') {
    return {
      state: DECISION.SIMPLER,
      confidence: minConfidence(scores),
      primary_reason: 'The measured or implied value is too small to justify AI build and operating burden.',
      largest_uncertainty: null,
    };
  }

  // 7. Blocked readiness. Note carefully what counts as blocking and what does
  //    not: a missing BASELINE is not blocking, because measuring it is step
  //    one of the pilot. A missing ACCESS, DATA, CONTROL or OWNER is blocking.
  //    v0.1 treated every open question as a blocker, which is why it said
  //    PREPARE_DEPENDENCIES on ideas the golden set wanted piloted.
  if (scores.readiness === 'LOW' || scores.readiness === 'UNKNOWN' || risk.prepareRequired) {
    return {
      state: DECISION.PREPARE,
      confidence: minConfidence(scores),
      primary_reason: 'The opportunity may be worth pursuing, but an admitted readiness gap blocks a meaningful pilot.',
      largest_uncertainty: 'Data, integration, permission, control, or ownership readiness.',
    };
  }

  // 8a. The user asked for a more complex architecture than the task shape
  //     needs. Framework 10.4 and 13.4: the answer is the simpler path, and
  //     saying so is the whole point of the audit. v0.1 returned
  //     PROCEED_TO_PILOT here, quietly rubber-stamping the over-build.
  if (scores.userRequestedAgent && architecture.best_current_fit !== 'AGENTIC_SYSTEM') {
    return {
      state: DECISION.SIMPLER,
      confidence: minConfidence(scores),
      primary_reason: `The request names an agent, but the task shape is served by ${architecture.best_current_fit} at materially lower cost and risk.`,
      largest_uncertainty: 'Whether any part of the workflow genuinely needs dynamic tool selection.',
    };
  }

  // 8b. Simpler wins without incremental proof (framework 14).
  if (lowComplexityAvailable) {
    return {
      state: DECISION.SIMPLER,
      confidence: minConfidence(scores),
      primary_reason: 'A lower-complexity path can address the core workflow without AI operating burden.',
      largest_uncertainty: scores.baselineMissing ? 'Workflow volume and baseline impact.' : null,
    };
  }

  // 9. Pilot.
  return {
    state: DECISION.PILOT,
    confidence: minConfidence(scores),
    primary_reason: 'The problem and value are plausible, a viable architecture exists, and the remaining uncertainty can be tested at small scale.',
    largest_uncertainty: scores.baselineMissing
      ? 'Measured baseline and the accepted-outcome threshold.'
      : 'Quality of the model output on representative cases.',
  };
}

module.exports = { DECISION, decideState };
