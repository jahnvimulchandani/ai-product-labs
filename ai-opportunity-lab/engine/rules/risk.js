'use strict';

const { val, get, isKnown } = require('../contract');

/**
 * RISK AND HARD GATES, FIELD EDITION
 *
 * WHAT CHANGED AND WHY
 *
 * v0.1 and v0.2 both derived gates from prose. Measured consequences:
 *   - Rewording the autonomous contract-termination case, with no change of
 *     fact, dropped it from HIGH with two gates to LOW with none (v0.1).
 *   - "I love reading about how to terminate contracts and automatically
 *     reject candidates" came back HIGH with two gates (v0.1).
 *   - On eight blind cases neither version caught any of the three
 *     safety-critical ones.
 *
 * This version reads fields. Nothing here touches the user's sentence. Two
 * different wordings that extract to the same record produce byte-identical
 * gates, so paraphrase invariance is not a property we test for, it is a
 * property of the design.
 *
 * The other change that matters: UNKNOWN is now a first-class input rather
 * than an absence. A gate can fire BECAUSE something is unknown (Gate C and
 * Gate F both do), and the engine can say which field would close it. Prose
 * matching could never express "we do not know whether a human reviews this",
 * only "no review words appeared", and those are very different claims.
 */

/** Fields that each gate reads. Used by clarify.js to target questions. */
const GATE_INPUTS = {
  HIGH_STAKES_LOW_DETECTABILITY: ['stakes', 'error_detectability', 'human_review_point', 'autonomy_requested'],
  IRREVERSIBLE_ACTION_WEAK_RECOVERY: ['reversibility', 'recovery_path_exists', 'action_target', 'autonomy_requested', 'human_review_point'],
  SENSITIVE_DATA_CONTROLS_UNKNOWN: ['sensitive_data', 'data_controls_confirmed'],
  NO_ACCOUNTABLE_OWNER: ['accountable_owner'],
  UNTRUSTED_CONTENT_WITH_TOOL_ACTIONS: ['untrusted_input', 'tool_use', 'action_target'],
  RISK_CRITICAL_INFORMATION_UNKNOWN: ['stakes', 'error_detectability', 'reversibility', 'autonomy_requested', 'sensitive_data'],
};

const ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function evaluateRisk(record) {
  const stakes = val(record, 'stakes');
  const detect = val(record, 'error_detectability');
  const rev = val(record, 'reversibility');
  const recovery = val(record, 'recovery_path_exists');
  const sensitive = val(record, 'sensitive_data');
  const controlsOk = val(record, 'data_controls_confirmed');
  const rights = val(record, 'rights_impact');
  const untrusted = val(record, 'untrusted_input');
  const tools = val(record, 'tool_use');
  const action = val(record, 'action_target');
  const review = val(record, 'human_review_point');
  const autonomy = val(record, 'autonomy_requested');
  const owner = get(record, 'accountable_owner');

  /**
   * Effective autonomy. Two fields can describe the same thing from different
   * angles (what the user asked for, and where a human actually sits), so the
   * safer reading wins. If either says nobody checks, nobody checks.
   */
  const noHumanCheck = review === 'NONE' || autonomy === 'FULL_AUTONOMY';
  const humanChecks = review === 'EVERY_CASE' || autonomy === 'SUGGEST_ONLY' || autonomy === 'APPROVE_EACH';

  const externalAction = action === 'EXTERNAL_COMMUNICATION' || action === 'EXTERNAL_TRANSACTION';
  const writesAnywhere = tools === 'WRITE' || action === 'INTERNAL_RECORD' || externalAction;

  const highStakes = stakes === 'HIGH' || rights === true;

  /**
   * Detectability is inferred from the review point when it was not stated
   * directly. Written as an explicit inference with its own evidence status
   * rather than silently, because the framework requires visible evidence.
   */
  let effectiveDetect = detect;
  let detectInferred = false;
  if (!isKnown(get(record, 'error_detectability'))) {
    if (review === 'EVERY_CASE') { effectiveDetect = 'HIGH'; detectInferred = true; }
    else if (review === 'SAMPLE') { effectiveDetect = 'MEDIUM'; detectInferred = true; }
    else if (review === 'NONE') { effectiveDetect = 'LOW'; detectInferred = true; }
  }

  const gates = [];
  const why = {};
  const closes = {};
  const fire = (g, reason, closingFields) => {
    if (!gates.includes(g)) { gates.push(g); why[g] = reason; closes[g] = closingFields; }
  };

  // Gate A. High stakes with nothing catching the error before it lands.
  if (highStakes && (effectiveDetect === 'LOW' || (noHumanCheck && effectiveDetect !== 'HIGH'))) {
    fire('HIGH_STAKES_LOW_DETECTABILITY',
      `Stakes are ${rights ? 'rights-affecting' : 'high'} and no reliable check sits between the output and its effect.`,
      ['human_review_point', 'error_detectability']);
  }

  // Gate B. Irreversible action, taken without a person, with no way back.
  if ((rev === 'IRREVERSIBLE' || externalAction) && noHumanCheck && recovery !== true) {
    fire('IRREVERSIBLE_ACTION_WEAK_RECOVERY',
      'An action that cannot be pulled back is taken with no approval step and no defined recovery path.',
      ['recovery_path_exists', 'human_review_point']);
  }

  // Gate C. Sensitive data where nobody has confirmed the access scope.
  // Note the shape: this fires on UNKNOWN, not on absence of keywords. That
  // distinction is the whole reason for the field layer.
  if ((sensitive === 'PERSONAL' || sensitive === 'REGULATED') && controlsOk !== true) {
    fire('SENSITIVE_DATA_CONTROLS_UNKNOWN',
      `${sensitive === 'REGULATED' ? 'Regulated' : 'Personal'} data is in scope and the access scope has not been confirmed.`,
      ['data_controls_confirmed']);
  }

  // Gate D. Nobody is accountable. Present in the framework and the schema
  // enum since v1 and never implemented before this rewrite.
  // 'NONE' is the sentinel for "explicitly nobody". A null value means the
  // question has not been answered, which is a different state and must not
  // fire this gate. Conflating the two is the same class of bug as reading
  // silence about human review as an absence of human review.
  if (isKnown(owner) && String(owner.value).toUpperCase() === 'NONE') {
    fire('NO_ACCOUNTABLE_OWNER', 'No person or team owns the outcome.', ['accountable_owner']);
  }

  // Gate E. Content from outside the trust boundary can reach a write.
  if (untrusted === true && writesAnywhere) {
    fire('UNTRUSTED_CONTENT_WITH_TOOL_ACTIONS',
      'Content from outside the trust boundary can influence an action the system takes.',
      ['untrusted_input', 'tool_use', 'human_review_point']);
  }

  // Gate F. A risk-critical field is genuinely unknown while the proposal is
  // already pointed at something consequential.
  const riskCriticalMissing = GATE_INPUTS.RISK_CRITICAL_INFORMATION_UNKNOWN
    .filter((f) => !isKnown(get(record, f)));
  const consequential = highStakes || noHumanCheck || externalAction || rev === 'IRREVERSIBLE';
  if (consequential && riskCriticalMissing.length > 0) {
    fire('RISK_CRITICAL_INFORMATION_UNKNOWN',
      `Cannot judge risk while these are unknown: ${riskCriticalMissing.join(', ')}.`,
      riskCriticalMissing);
  }

  const humanLedRequired = gates.includes('HIGH_STAKES_LOW_DETECTABILITY')
    || gates.includes('IRREVERSIBLE_ACTION_WEAK_RECOVERY')
    || (rights === true && noHumanCheck);

  const prepareRequired = gates.includes('SENSITIVE_DATA_CONTROLS_UNKNOWN')
    || gates.includes('UNTRUSTED_CONTENT_WITH_TOOL_ACTIONS')
    || gates.includes('NO_ACCOUNTABLE_OWNER')
    || gates.includes('RISK_CRITICAL_INFORMATION_UNKNOWN');

  const tier = humanLedRequired ? 'HIGH'
    : prepareRequired ? 'MODERATE'
      : highStakes && !humanChecks ? 'MODERATE'
        : ORDER[stakes] >= 1 || noHumanCheck ? 'MODERATE' : 'LOW';

  // Confidence is a function of how much of the risk picture is actually
  // known, not a constant. v0.1 hardcoded MEDIUM.
  const riskFields = ['stakes', 'error_detectability', 'reversibility', 'sensitive_data', 'autonomy_requested', 'human_review_point'];
  const known = riskFields.filter((f) => isKnown(get(record, f))).length;
  const confidence = known >= 5 ? 'HIGH' : known >= 3 ? 'MEDIUM' : 'LOW';

  return {
    risk_tier: tier,
    confidence,
    hard_gates: gates,
    gate_rationale: why,
    gate_closing_fields: closes,
    dimensions: {
      stakes: stakes || 'UNKNOWN',
      error_detectability: effectiveDetect || 'UNKNOWN',
      detectability_inferred_from_review_point: detectInferred,
      reversibility: rev || 'UNKNOWN',
      blast_radius: externalAction ? 'EXTERNAL' : writesAnywhere ? 'ORG' : 'TEAM',
      sensitive_data: sensitive || 'UNKNOWN',
      rights_impact: rights === true ? 'YES' : rights === false ? 'NO' : 'UNKNOWN',
      adversarial_exposure: untrusted === true ? 'YES' : untrusted === false ? 'NO' : 'UNKNOWN',
      accountable_owner: isKnown(owner) ? (owner.value || 'NONE') : 'UNKNOWN',
      effective_human_check: humanChecks ? 'PRESENT' : noHumanCheck ? 'ABSENT' : 'UNKNOWN',
    },
    required_controls: [
      humanLedRequired ? 'The accountable decision and any external action stay with a human.' : null,
      (rev === 'IRREVERSIBLE' || externalAction) && recovery !== true ? 'Define a rollback or recall path before any live action.' : null,
      untrusted === true ? 'Treat external content as untrusted. No direct path from it to a write.' : null,
      (sensitive === 'PERSONAL' || sensitive === 'REGULATED') ? 'Confirm access scope and handling before touching real records.' : null,
      gates.includes('NO_ACCOUNTABLE_OWNER') ? 'Name an accountable owner before piloting.' : null,
    ].filter(Boolean),
    autonomy_limit: humanLedRequired
      ? 'No autonomous execution of the high-impact action.'
      : gates.length ? 'Autonomy only within a scope where every gate above is closed.'
        : 'Autonomy may be considered only inside tested limits.',
    human_review_required: highStakes || noHumanCheck || rights === true,
    specialist_review_required: sensitive === 'REGULATED' || rights === true,
    autonomousExecutionBlocked: humanLedRequired || gates.includes('UNTRUSTED_CONTENT_WITH_TOOL_ACTIONS'),
    humanLedRequired,
    prepareRequired,
    unknown_risk_fields: riskCriticalMissing,
  };
}

module.exports = { evaluateRisk, GATE_INPUTS };
