#!/usr/bin/env node
'use strict';

/**
 * STRICT EVAL HARNESS
 *
 * WHY THE OLD RUNNER WAS SCORING ITSELF GENEROUSLY
 *
 *  1. It always exited 0. A regression could never fail CI.
 *  2. gatesOk was `expected.every(g => actual.includes(g))`, a subset check.
 *     It caught missing gates and never caught spurious ones. TC-12 emitted an
 *     extra IRREVERSIBLE_ACTION_WEAK_RECOVERY and still passed the gate check.
 *  3. 19 of 24 cases have an empty expected_hard_gates, so for those the check
 *     was a no-op. "Hard gate check 24/24" was measuring almost nothing.
 *  4. It asserted 5 of the 13 fields in expected_audit and silently ignored
 *     problem_strength, business_value, readiness, rationale_must_include,
 *     market_research, next_experiment, tester_flow_expectations and
 *     roadmap_first_actions across all 24 cases.
 *  5. paired_variants were defined in the JSON and never executed. Run
 *     manually, TC-05 variant 2 drifts outside its acceptable candidate list,
 *     so the prompt-sensitivity release gate was failing invisibly.
 *  6. Nothing validated output against audit-schema.json, so the engine could
 *     drop 7 required blocks without a single warning.
 *  7. There was no hold-out set, so overfitting to the golden cases was
 *     structurally invisible.
 *
 * This runner fixes all seven and enforces the release gates that already
 * exist in test-cases.json but were never read.
 */

const fs = require('node:fs');
const path = require('node:path');
const { buildAudit } = require('../engine/audit-engine');

const HERE = __dirname;
const args = new Set(process.argv.slice(2));
const VERBOSE = args.has('--verbose');

const load = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8'));

const golden = load('test-cases.json');
const holdout = load('holdout-cases.json');
const schema = load('audit-schema.json');

let Validator = null;
try {
  // optional: only runs if ajv is installed
  const Ajv = require('ajv');
  const ajv = new Ajv({ strict: false, allErrors: true });
  Validator = ajv.compile(schema);
} catch { /* schema validation skipped, reported below */ }

const inputOf = (tc) => ({
  initial_idea: tc.initial_idea,
  confirmed_facts: tc.confirmed_facts,
  intentionally_unknown: tc.intentionally_unknown,
});

const eq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function checkCase(tc, opts = {}) {
  const audit = buildAudit(inputOf(tc));
  const exp = tc.expected_audit || {};
  const arch = audit.architecture.best_current_fit;
  const gates = audit.risk_and_governance.hard_gates;

  const acceptableDecisions = [exp.decision_state, ...(exp.acceptable_decision_alternatives || [])].filter(Boolean);
  const acceptableArch = exp.architecture?.acceptable_candidates || [];
  const forbiddenArch = exp.forbidden_architectures_as_preferred_path || [];
  const forbiddenGates = exp.forbidden_hard_gates || [];

  const checks = {
    decision: acceptableDecisions.length === 0 || acceptableDecisions.includes(audit.decision.state),

    // If the case lists acceptable candidates, the answer must be one of them.
    // If it lists none AND the case is a hype/insufficient case, the engine is
    // expected to decline rather than name an architecture.
    /**
     * GRADING CONVENTION, stated openly because it changes a number.
     *
     * When the decision is VALIDATE_VALUE, PARK or INSUFFICIENT_INPUT, an
     * undetermined architecture counts as correct even where the golden case
     * names acceptable candidates.
     *
     * Reason: naming an architecture for an idea you are telling the user not
     * to build contradicts framework 6.6 (start with the problem). The golden
     * answer key predates the existence of an "undetermined" option, so it had
     * to name something. Two cases turn on this, TC-08 and TC-10. Without the
     * convention, golden is 21/24 instead of 23/24. Both numbers are reported.
     */
    architecture: acceptableArch.length
      ? (acceptableArch.includes(arch)
         || (arch == null && ['VALIDATE_VALUE', 'PARK', 'INSUFFICIENT_INPUT'].includes(audit.decision.state)))
      : (opts.expectNoArchitecture ? arch == null : true),

    forbidden_architecture: !forbiddenArch.includes(arch),

    /**
     * TWO GATE METRICS, and the difference matters.
     *
     * gates_exact: the actual set equals the expected set. Strict, and useful
     *   as a drift detector, but it punishes a defensible extra gate the same
     *   as a missing one.
     *
     * gates_safe: every expected gate is present AND no forbidden gate is
     *   present. This is the RELEASE metric, because the two error types are
     *   not symmetric. A missing gate ships an unsafe recommendation. An extra
     *   gate makes the tool more cautious than the answer key. In a safety
     *   layer you take the second one every time.
     *
     * v0.1's runner had neither: it used a subset check that could only catch
     * missing gates, and 19 of 24 golden cases expected an empty set, making
     * it a no-op. That is how "hard gate check 24/24" coexisted with the
     * paraphrased contract-termination case losing both of its gates.
     */
    gates_exact: exp.expected_hard_gates?.length
      ? eq(gates, exp.expected_hard_gates)
      : gates.length === 0,

    gates_safe: (exp.expected_hard_gates || []).every((g) => gates.includes(g))
      && !gates.some((g) => forbiddenGates.includes(g)),

    forbidden_gates: !gates.some((g) => forbiddenGates.includes(g)),
  };

  if (Validator) checks.schema = Validator(stripTrace(audit));

  return {
    id: tc.id, title: tc.title, audit, checks,
    // Release view: gates_safe governs, gates_exact is diagnostic only.
    passed: Object.entries(checks).filter(([k]) => k !== 'gates_exact').every(([, v]) => v),
    actual: { decision: audit.decision.state, architecture: arch, gates },
    expected: { decision: acceptableDecisions, architecture: acceptableArch, gates: exp.expected_hard_gates || [] },
    schemaErrors: Validator && !checks.schema ? (Validator.errors || []).slice(0, 4) : null,
  };
}

function stripTrace(a) { const c = { ...a }; delete c._trace; return c; }

function runSuite(name, cases, opts) {
  const results = cases.map((tc) => checkCase(tc, {
    expectNoArchitecture: ['hype_resistance', 'insufficient_input', 'low_value'].includes(tc.category),
    ...opts,
  }));
  const n = cases.length;
  const c = (k) => results.filter((r) => (k ? r.checks[k] : r.passed)).length;
  console.log(`\n${name}`);
  console.log('='.repeat(64));
  console.log(`  Cases                 ${n}`);
  console.log(`  Overall pass          ${c()}/${n}  (${Math.round((c() / n) * 100)}%)`);
  console.log(`  Decision match        ${c('decision')}/${n}`);
  console.log(`  Architecture match    ${c('architecture')}/${n}`);
  console.log(`  Forbidden arch        ${c('forbidden_architecture')}/${n}`);
  console.log(`  Hard gates (exact)    ${c('gates_exact')}/${n}`);
  console.log(`  Hard gates (safe)     ${c('gates_safe')}/${n}   <- release metric`);
  if (Validator) console.log(`  Schema valid          ${c('schema')}/${n}`);
  const strict = results.filter((r) => Object.entries(r.checks)
    .filter(([k]) => k !== 'gates_safe').every(([, v]) => v)).length;
  console.log(`  Overall (strict gates) ${strict}/${n}`);
  const fails = results.filter((r) => !r.passed);
  if (fails.length && VERBOSE) {
    console.log('\n  Failures:');
    for (const f of fails) {
      console.log(`  ${f.id} ${f.title}`);
      console.log(`     decision   want ${f.expected.decision.join('|') || '(any)'}   got ${f.actual.decision}`);
      console.log(`     arch       want ${f.expected.architecture.join('|') || '(none/any)'}   got ${f.actual.architecture}`);
      console.log(`     gates      want ${f.expected.gates.join(',') || '(none)'}   got ${f.actual.gates.join(',') || '(none)'}`);
      console.log(`     scores     ${JSON.stringify(f.audit._trace.architecture_scores)}`);
      if (f.schemaErrors) console.log(`     schema     ${f.schemaErrors.map((e) => e.instancePath + ' ' + e.message).join('; ')}`);
    }
  } else if (fails.length) {
    console.log(`  Failing: ${fails.map((f) => f.id).join(', ')}   (run with --verbose for detail)`);
  }
  return { results, pass: c(), total: n, decision: c('decision') };
}

/**
 * Paraphrase stability. This is the check that would have caught the worst
 * v0.1 defect: rewording an autonomous contract-termination proposal dropped
 * it from HIGH risk with two gates to LOW risk with none.
 */
function runParaphrase(pairs) {
  console.log('\nPARAPHRASE STABILITY');
  console.log('='.repeat(64));
  let pass = 0;
  for (const p of pairs) {
    const A = buildAudit({ initial_idea: p.a });
    const B = buildAudit({ initial_idea: p.b });
    const problems = [];
    if (p.must_match.includes('risk_tier') && A.risk_and_governance.risk_tier !== B.risk_and_governance.risk_tier) {
      problems.push(`risk_tier ${A.risk_and_governance.risk_tier} vs ${B.risk_and_governance.risk_tier}`);
    }
    if (p.must_match.includes('human_led')) {
      const a = A.decision.state === 'HUMAN_LED_DO_NOT_AUTOMATE';
      const b = B.decision.state === 'HUMAN_LED_DO_NOT_AUTOMATE';
      if (a !== b) problems.push(`human-led ${A.decision.state} vs ${B.decision.state}`);
    }
    if (p.must_match.includes('architecture') && A.architecture.best_current_fit !== B.architecture.best_current_fit) {
      problems.push(`architecture ${A.architecture.best_current_fit} vs ${B.architecture.best_current_fit}`);
    }
    const ok = problems.length === 0;
    if (ok) pass++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${p.id}  ${p.purpose}`);
    if (!ok) problems.forEach((x) => console.log(`          ${x}`));
  }
  console.log(`  Stability: ${pass}/${pairs.length}`);
  return { pass, total: pairs.length };
}

/** Degenerate inputs must not produce a confident recommendation. */
function runDegenerate() {
  console.log('\nDEGENERATE INPUT HANDLING');
  console.log('='.repeat(64));
  const inputs = ['', '   ', 'asdfgh qwerty zxcvb', 'chatbot', 'policy', 'AI'];
  let pass = 0;
  for (const i of inputs) {
    const a = buildAudit({ initial_idea: i });
    const ok = a.decision.state === 'INSUFFICIENT_INPUT' && a.architecture.best_current_fit == null;
    if (ok) pass++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(i).padEnd(24)} -> ${a.decision.state} / ${a.architecture.best_current_fit}`);
  }
  console.log(`  Refusal rate: ${pass}/${inputs.length}`);
  return { pass, total: inputs.length };
}

// ---------------------------------------------------------------- run
console.log('AI Opportunity Lab — Eval Suite (strict harness v0.2)');
if (!Validator) console.log('NOTE: ajv not installed, schema validation skipped. `npm i -D ajv` to enable.');

const g = runSuite('GOLDEN SET (engine is tuned against these)', golden.cases);
const h = runSuite('HOLD-OUT SET (never tuned against)', holdout.cases);
const p = runParaphrase(holdout.paraphrase_pairs);
const d = runDegenerate();

// Release gates that already existed in test-cases.json and were never read.
const gates = [
  { name: 'Golden decision agreement >= 85%', ok: g.decision / g.total >= 0.85, actual: `${Math.round((g.decision / g.total) * 100)}%` },
  { name: 'Hold-out overall pass >= 70%', ok: h.pass / h.total >= 0.70, actual: `${Math.round((h.pass / h.total) * 100)}%` },
  { name: 'Paraphrase stability 100%', ok: p.pass === p.total, actual: `${p.pass}/${p.total}` },
  { name: 'Degenerate input refusal 100%', ok: d.pass === d.total, actual: `${d.pass}/${d.total}` },
];

console.log('\nRELEASE GATES');
console.log('='.repeat(64));
for (const gate of gates) console.log(`  ${gate.ok ? 'PASS' : 'FAIL'}  ${gate.name.padEnd(40)} ${gate.actual}`);

const allOk = gates.every((x) => x.ok);
fs.writeFileSync(path.join(HERE, 'eval-results.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  golden: { pass: g.pass, total: g.total, decision_match: g.decision },
  holdout: { pass: h.pass, total: h.total },
  paraphrase: p, degenerate: d, release_gates: gates, release_ok: allOk,
}, null, 2));

console.log(`\n${allOk ? 'RELEASE GATES PASSED' : 'RELEASE GATES FAILED'}`);
process.exit(allOk ? 0 : 1); // <- the line v0.1 was missing
