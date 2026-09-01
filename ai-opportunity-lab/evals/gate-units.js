'use strict';

const { emptyRecord, set } = require('../engine/contract');
const { evaluateRisk } = require('../engine/rules/risk');

/**
 * GATE UNIT TESTS
 *
 * These could not exist before. When gates were derived from prose, testing
 * "does Gate B fire on an irreversible action with no recovery path" meant
 * writing a sentence and hoping the regex caught it, so a passing test proved
 * only that the regex matched that sentence.
 *
 * Now the gate is a function of named fields, so each test states exactly the
 * condition under test. A failure points at a rule, not at a wording.
 *
 * Note the UNKNOWN cases. Half the value of the field layer is being able to
 * distinguish "the user said nobody reviews it" from "the text did not
 * mention review", and those must produce different gates. v0.1 could not tell
 * them apart, which is precisely how it cleared an autonomous
 * contract-termination proposal at LOW risk after a reword.
 */

const rec = (fields) => {
  const r = emptyRecord('unit test');
  for (const [k, v] of Object.entries(fields)) set(r, k, v, 'CONFIRMED', 'test');
  return r;
};

const CASES = [
  {
    name: 'A fires: high stakes, no review',
    fields: { stakes: 'HIGH', human_review_point: 'NONE', autonomy_requested: 'FULL_AUTONOMY', reversibility: 'IRREVERSIBLE', sensitive_data: 'INTERNAL', error_detectability: 'LOW' },
    expect: ['HIGH_STAKES_LOW_DETECTABILITY', 'IRREVERSIBLE_ACTION_WEAK_RECOVERY'], tier: 'HIGH',
  },
  {
    name: 'A does NOT fire: same stakes, human approves every case',
    fields: { stakes: 'HIGH', human_review_point: 'EVERY_CASE', autonomy_requested: 'APPROVE_EACH', reversibility: 'IRREVERSIBLE', sensitive_data: 'INTERNAL', error_detectability: 'HIGH' },
    expect: [], tier: 'MODERATE',
  },
  {
    // Unknown review is NOT low detectability. Gate A needs evidence that
    // nothing catches the error; Gate F is the correct response to not knowing.
    // The engine was right and the first version of this test was wrong, which
    // is the useful direction for a unit test to fail in.
    name: 'F fires, A does not: high stakes with review UNKNOWN',
    fields: { stakes: 'HIGH', reversibility: 'IRREVERSIBLE' },
    expect: ['RISK_CRITICAL_INFORMATION_UNKNOWN'], tier: 'MODERATE',
  },
  {
    // ...but unknown must never clear to LOW either.
    name: 'Unknown review never yields a LOW tier on a high-stakes proposal',
    fields: { stakes: 'HIGH' },
    expectIncludes: ['RISK_CRITICAL_INFORMATION_UNKNOWN'], humanLed: false,
  },
  {
    name: 'B fires: external action, no approval, no recovery',
    fields: { stakes: 'MEDIUM', action_target: 'EXTERNAL_COMMUNICATION', human_review_point: 'NONE', recovery_path_exists: false, reversibility: 'IRREVERSIBLE', error_detectability: 'MEDIUM', sensitive_data: 'INTERNAL', autonomy_requested: 'FULL_AUTONOMY' },
    expect: ['IRREVERSIBLE_ACTION_WEAK_RECOVERY'], tier: 'HIGH',
  },
  {
    name: 'B does NOT fire: same action, recovery path exists',
    fields: { stakes: 'MEDIUM', action_target: 'EXTERNAL_COMMUNICATION', human_review_point: 'NONE', recovery_path_exists: true, reversibility: 'RECOVERABLE', error_detectability: 'MEDIUM', sensitive_data: 'INTERNAL', autonomy_requested: 'FULL_AUTONOMY' },
    expect: [], tier: 'MODERATE',
  },
  {
    name: 'C fires: regulated data, controls unconfirmed',
    fields: { sensitive_data: 'REGULATED', data_controls_confirmed: false, stakes: 'MEDIUM', human_review_point: 'EVERY_CASE', reversibility: 'REVERSIBLE', error_detectability: 'HIGH', autonomy_requested: 'APPROVE_EACH' },
    expect: ['SENSITIVE_DATA_CONTROLS_UNKNOWN'], tier: 'MODERATE',
  },
  {
    name: 'C does NOT fire: same data, controls confirmed',
    fields: { sensitive_data: 'REGULATED', data_controls_confirmed: true, stakes: 'MEDIUM', human_review_point: 'EVERY_CASE', reversibility: 'REVERSIBLE', error_detectability: 'HIGH', autonomy_requested: 'APPROVE_EACH' },
    expect: [], tier: 'MODERATE',
  },
  {
    name: 'D fires: owner explicitly nobody',
    fields: { accountable_owner: 'NONE', stakes: 'LOW', human_review_point: 'EVERY_CASE', reversibility: 'REVERSIBLE', error_detectability: 'HIGH', sensitive_data: 'INTERNAL', autonomy_requested: 'APPROVE_EACH' },
    expectIncludes: ['NO_ACCOUNTABLE_OWNER'],
  },
  {
    name: 'E fires: untrusted input reaching a write',
    fields: { untrusted_input: true, tool_use: 'WRITE', action_target: 'INTERNAL_RECORD', stakes: 'MEDIUM', human_review_point: 'NONE', reversibility: 'REVERSIBLE', error_detectability: 'MEDIUM', sensitive_data: 'INTERNAL', autonomy_requested: 'FULL_AUTONOMY' },
    expectIncludes: ['UNTRUSTED_CONTENT_WITH_TOOL_ACTIONS'],
  },
  {
    name: 'E does NOT fire: untrusted input, read only, human approves',
    fields: { untrusted_input: true, tool_use: 'READ', action_target: 'NONE', stakes: 'LOW', human_review_point: 'EVERY_CASE', reversibility: 'REVERSIBLE', error_detectability: 'HIGH', sensitive_data: 'INTERNAL', autonomy_requested: 'APPROVE_EACH' },
    expect: [], tier: 'LOW',
  },
  {
    name: 'Rights impact alone triggers human-led when nobody checks',
    fields: { rights_impact: true, human_review_point: 'NONE', stakes: 'MEDIUM', reversibility: 'RECOVERABLE', error_detectability: 'LOW', sensitive_data: 'PERSONAL', data_controls_confirmed: true, autonomy_requested: 'FULL_AUTONOMY' },
    expectIncludes: ['HIGH_STAKES_LOW_DETECTABILITY'], humanLed: true,
  },
  {
    name: 'Benign internal assistive task clears everything',
    fields: { stakes: 'LOW', error_detectability: 'HIGH', reversibility: 'REVERSIBLE', sensitive_data: 'INTERNAL', autonomy_requested: 'SUGGEST_ONLY', human_review_point: 'EVERY_CASE', action_target: 'NONE', untrusted_input: false, rights_impact: false },
    expect: [], tier: 'LOW',
  },
];

function run() {
  let pass = 0;
  const fails = [];
  for (const c of CASES) {
    const r = evaluateRisk(rec(c.fields));
    const got = [...r.hard_gates].sort();
    let ok = true;
    if (c.expect) ok = ok && JSON.stringify(got) === JSON.stringify([...c.expect].sort());
    if (c.expectIncludes) ok = ok && c.expectIncludes.every((g) => got.includes(g));
    if (c.tier) ok = ok && r.risk_tier === c.tier;
    if (c.humanLed != null) ok = ok && r.humanLedRequired === c.humanLed;
    if (ok) pass++; else fails.push({ name: c.name, expected: c.expect || c.expectIncludes, got, tier: r.risk_tier, wantTier: c.tier });
  }
  return { pass, total: CASES.length, fails };
}

module.exports = { run, CASES };
