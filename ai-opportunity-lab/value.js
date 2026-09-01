'use strict';

const { val, get, isKnown } = require('../contract');

/**
 * PROBLEM STRENGTH, BUSINESS VALUE, READINESS
 *
 * Framework 6, 7 and 9, applied to fields.
 *
 * The change that matters here: value is now computed from three numbers the
 * user (or the extractor) actually supplied, and when those numbers are absent
 * the answer is UNKNOWN rather than a guess. v0.1 hardcoded the golden cases'
 * literal phrases ('25 calls per week', '2 minutes choosing', '8-person team')
 * so it appeared to reason about volume while doing nothing of the kind.
 *
 * Bands only. Never a currency figure. Framework 6.9 forbids false precision,
 * and an ROI number computed from an unmeasured baseline is exactly that.
 */

const EVIDENCE_LEVEL = { HYPOTHESIS: 1, ANECDOTAL: 2, REPEATED_PATTERN: 3, QUANTIFIED: 4, QUANTIFIED_SEGMENTED: 5 };

function effortBand(record) {
  const f = val(record, 'frequency_per_year');
  const m = val(record, 'minutes_per_occurrence');
  const p = val(record, 'people_affected') || 1;
  if (f == null && m == null) return { band: 'UNKNOWN', annualMinutes: null, basis: 'No frequency or duration known' };
  if (f == null || m == null) {
    if (f != null && f >= 250) return { band: 'HIGH', annualMinutes: null, basis: 'High frequency, duration unknown' };
    if (f != null && f <= 12) return { band: 'LOW', annualMinutes: null, basis: 'Low frequency, duration unknown' };
    if (m != null && m >= 120) return { band: 'MEDIUM', annualMinutes: null, basis: 'Heavy per-case effort, frequency unknown' };
    return { band: 'UNKNOWN', annualMinutes: null, basis: 'Partial quantities only' };
  }
  const annualMinutes = f * m * p;
  let band = annualMinutes < 1500 ? 'LOW' : annualMinutes < 20000 ? 'MEDIUM' : 'HIGH';
  /**
   * Severity override, framework 6.4. Annualised minutes under-rate rare heavy
   * work: a postmortem twice a year that burns a day across six people is not
   * a LOW-value problem just because the frequency is small.
   */
  if (band === 'LOW' && m >= 120) band = 'MEDIUM';
  return { band, annualMinutes, basis: `${f}/yr x ${m}min x ${p} people` };
}

function evaluateProblem(record) {
  const level = val(record, 'pain_evidence_level');
  const demand = val(record, 'demand_evidence');
  const user = val(record, 'affected_user');
  const effort = effortBand(record);
  const n = EVIDENCE_LEVEL[level] || 0;

  let rating; let confidence;
  if (demand === 'COMPETITOR_DRIVEN' && n <= 2) { rating = 'WEAK'; confidence = 'MEDIUM'; }
  else if (demand === 'NONE' && n <= 2) { rating = 'WEAK'; confidence = 'MEDIUM'; }
  else if (n >= 4) { rating = 'STRONG'; confidence = 'HIGH'; }
  else if (n === 3 && effort.band !== 'LOW') { rating = 'STRONG'; confidence = 'MEDIUM'; }
  else if (n === 3) { rating = 'MODERATE'; confidence = 'MEDIUM'; }
  else if (n === 2) { rating = 'MODERATE'; confidence = 'LOW'; }
  else if (n === 1) { rating = 'WEAK'; confidence = 'LOW'; }
  else { rating = 'MODERATE'; confidence = 'LOW'; }

  if (effort.band === 'LOW' && n < 4) { rating = 'WEAK'; confidence = 'MEDIUM'; }

  return {
    rating,
    confidence,
    evidence_level: level || 'UNKNOWN',
    severity: rating === 'STRONG' ? 'HIGH' : rating === 'WEAK' ? 'LOW' : 'MEDIUM',
    affected_user: user,
    outcome_measurability: val(record, 'baseline_measured') === true ? 'HIGH' : effort.band !== 'UNKNOWN' ? 'MEDIUM' : 'LOW',
    missing_evidence: [
      !isKnown(get(record, 'pain_evidence_level')) ? 'How strong the evidence for the problem is' : null,
      !isKnown(get(record, 'affected_user')) ? 'Who is affected' : null,
      !isKnown(get(record, 'frequency_per_year')) ? 'How often it happens' : null,
      !isKnown(get(record, 'minutes_per_occurrence')) ? 'How long one case takes today' : null,
    ].filter(Boolean),
  };
}

function evaluateValue(record, problem) {
  const effort = effortBand(record);
  const measured = val(record, 'baseline_measured');
  const mech = val(record, 'value_mechanism') || 'UNKNOWN';
  const demand = val(record, 'demand_evidence');

  let potential; let confidence;
  if (demand === 'COMPETITOR_DRIVEN' && problem.rating === 'WEAK') { potential = 'UNKNOWN'; confidence = 'LOW'; }
  else if (effort.band === 'UNKNOWN') { potential = 'UNKNOWN'; confidence = 'LOW'; }
  else { potential = effort.band; confidence = measured === true ? 'HIGH' : 'MEDIUM'; }

  const baseline_status = measured === true ? 'AVAILABLE'
    : effort.band !== 'UNKNOWN' ? 'PARTIAL' : 'MISSING';

  return {
    value_potential: potential === 'UNKNOWN' ? 'LOW' : potential,
    raw_potential: potential,
    confidence,
    primary_value_mechanism: mech,
    baseline_status,
    effort,
    value_hypothesis: effort.annualMinutes != null
      ? `About ${Math.round(effort.annualMinutes / 60)} hours a year of current effort sit in scope, before adoption losses (${effort.basis}).`
      : 'Value cannot be sized until frequency and per-case effort are known.',
    missing_variables: [
      val(record, 'frequency_per_year') == null ? 'Frequency of the workflow' : null,
      val(record, 'minutes_per_occurrence') == null ? 'Effort per occurrence today' : null,
      measured !== true ? 'A measured baseline for the current outcome' : null,
    ].filter(Boolean),
  };
}

function evaluateReadiness(record, risk) {
  const dataAvailable = val(record, 'data_available');
  const fragmented = val(record, 'data_fragmented');
  const accessOk = val(record, 'integration_access_confirmed');
  const evals = val(record, 'eval_capability_exists');
  const owner = val(record, 'accountable_owner');

  /**
   * BLOCKING vs OPEN.
   *
   * A missing baseline is not a blocker, it is step one of the pilot.
   * Unconfirmed access, absent data, and no owner ARE blockers.
   * v0.1 treated every unknown as a blocker and returned
   * PREPARE_DEPENDENCIES 6 times where the answer key expected
   * PROCEED_TO_PILOT 10 times.
   */
  const blockers = [];
  if (dataAvailable === false) blockers.push('The required data does not exist yet.');
  if (accessOk === false) blockers.push('Programmatic access to the source systems is not confirmed.');
  if (fragmented === true && accessOk !== true) blockers.push('Data is spread across systems with no confirmed integration path.');
  if (risk.prepareRequired) blockers.push('An open risk gate must be closed before a pilot.');

  const knownCount = ['data_available', 'data_fragmented', 'integration_access_confirmed']
    .filter((f) => isKnown(get(record, f))).length;

  let overall;
  if (blockers.length) overall = 'LOW';
  else if (knownCount === 0) overall = 'UNKNOWN';
  else if (dataAvailable === true && accessOk === true) overall = 'HIGH';
  else overall = 'MEDIUM';

  return {
    overall,
    confidence: knownCount >= 2 ? 'MEDIUM' : 'LOW',
    data: { rating: dataAvailable === true ? (fragmented ? 'MEDIUM' : 'HIGH') : dataAvailable === false ? 'LOW' : 'UNKNOWN' },
    integration: { rating: accessOk === true ? 'HIGH' : accessOk === false ? 'LOW' : 'UNKNOWN' },
    evaluation: { rating: evals === true ? 'MEDIUM' : 'UNKNOWN' },
    ownership: { rating: owner ? 'MEDIUM' : 'UNKNOWN' },
    blocking_dependencies: blockers,
    preparation_tasks: risk.required_controls,
  };
}

module.exports = { evaluateProblem, evaluateValue, evaluateReadiness, effortBand };
