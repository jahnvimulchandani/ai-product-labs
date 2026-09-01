#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { extract } = require('../engine/extractor');
const { buildAudit } = require('../engine/audit-engine');
const { evaluate } = require('../engine/evaluate');
const { nextQuestions, shouldStop, applyAnswer, runClarification } = require('../engine/clarify');
const { emptyRecord, set, FIELDS, get, isKnown } = require('../engine/contract');
const gateUnits = require('./gate-units');
const convergence = require('./convergence-cases');

/**
 * EVAL SUITE v0.3
 *
 * Four things are measured separately, because in a hybrid they fail
 * separately and a single blended score hides which half is broken.
 *
 *   1. RULE CORRECTNESS      gate unit tests on constructed records
 *   2. REPRODUCIBILITY       same record in, identical audit out
 *   3. CLARIFICATION QUALITY does the MCQ layer ask the right things,
 *                            skip what it knows, and terminate
 *   4. CONVERGENCE           given correct fields, does the system reach the
 *                            correct verdict, and how far does the heuristic
 *                            extractor get on its own
 *
 * (4) is the number that tells you whether to invest in rules or extraction.
 * Every previous version could only report one blended figure, which is why
 * it took a purpose-built blind set to discover that v0.2's real
 * generalisation was 1/8.
 */

const args = new Set(process.argv.slice(2));
const VERBOSE = args.has('--verbose');
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'audit-schema.json'), 'utf8'));
let validate = null;
try {
  // The schema declares draft 2020-12, which needs ajv/dist/2020.
  const Ajv = require('ajv/dist/2020');
  validate = new Ajv({ strict: false, allErrors: true }).compile(patchSchema(schema));
} catch { /* optional */ }

/** The two enum additions v0.3 needs. See evals/schema-patch-v0.3.json. */
function patchSchema(s) {
  const c = JSON.parse(JSON.stringify(s));
  const e = c.properties.decision.properties.state.enum;
  for (const extra of ['INSUFFICIENT_INPUT', 'NEEDS_CLARIFICATION']) if (!e.includes(extra)) e.push(extra);
  return c;
}

const line = (n = 66) => '='.repeat(n);
const pct = (a, b) => `${Math.round((a / b) * 100)}%`;
const results = {};

// ---------------------------------------------------------------- 1. rules
function section1() {
  const r = gateUnits.run();
  console.log(`\n1. RULE CORRECTNESS (gate unit tests on constructed records)\n${line()}`);
  console.log(`  Passed  ${r.pass}/${r.total}`);
  if (r.fails.length) {
    for (const f of r.fails) console.log(`  FAIL  ${f.name}\n        expected ${JSON.stringify(f.expected)} got ${JSON.stringify(f.got)}${f.wantTier ? ` | tier want ${f.wantTier} got ${f.tier}` : ''}`);
  }
  results.rules = r;
  return r.pass === r.total;
}

// ------------------------------------------------------- 2. reproducibility
function section2() {
  console.log(`\n2. REPRODUCIBILITY AND PARAPHRASE INVARIANCE\n${line()}`);

  // (a) The audit is a pure function of the record.
  const strip = (a) => { const c = JSON.parse(JSON.stringify(a)); delete c.run_metadata; return JSON.stringify(c); };
  let pureOk = 0;
  const samples = convergence.cases.slice(0, 6);
  for (const c of samples) {
    const r1 = buildRecord(c.oracle_fields);
    const r2 = buildRecord(c.oracle_fields);
    if (strip(buildAudit(r1)) === strip(buildAudit(r2))) pureOk++;
  }
  console.log(`  Same record produces an identical audit      ${pureOk}/${samples.length}`);

  /**
   * (b) The structural claim. Paraphrase invariance is not tested by feeding
   * the engine reworded sentences and hoping. It follows from the fact that
   * the rules never see a sentence. Demonstrated here by extracting two
   * wordings and asserting: IF the records match, the audits match. When they
   * do not match, the failure is attributed to extraction, not to the rules,
   * which is exactly the diagnostic that was missing before.
   */
  const SAFETY_FIELDS = ['stakes', 'error_detectability', 'reversibility', 'sensitive_data',
    'rights_impact', 'untrusted_input', 'human_review_point', 'autonomy_requested', 'action_target'];
  let sameRecord = 0; let sameAudit = 0; let sameSafety = 0; let sameGates = 0;
  for (const p of convergence.paraphrases) {
    const a = extractSync(p.a);
    const b = extractSync(p.b);
    const fa = JSON.stringify(fieldMap(a));
    const fb = JSON.stringify(fieldMap(b));
    const auditMatch = strip(buildAudit(a)) === strip(buildAudit(b));
    if (fa === fb) sameRecord++;
    if (auditMatch) sameAudit++;
    const sf = (r) => JSON.stringify(SAFETY_FIELDS.map((f) => (isKnown(get(r, f)) ? get(r, f).value : null)));
    if (sf(a) === sf(b)) sameSafety++;
    const ga = evaluate(a); const gb = evaluate(b);
    const must = p.must_match || ['gates', 'tier'];
    let invariantOk = true;
    if (must.includes('gates')) invariantOk = invariantOk && [...ga.risk.hard_gates].sort().join() === [...gb.risk.hard_gates].sort().join();
    if (must.includes('tier')) invariantOk = invariantOk && ga.risk.risk_tier === gb.risk.risk_tier;
    if (must.includes('architecture')) invariantOk = invariantOk && ga.architecture.best_current_fit === gb.architecture.best_current_fit;
    if (invariantOk) sameGates++;
    else if (VERBOSE) console.log(`  ${p.id} invariant broken on ${must.join(', ')}`);
    if (VERBOSE && !auditMatch) {
      console.log(`  DIVERGED ${p.id}: extraction differs on ${diffFields(a, b).join(', ') || '(none)'}`);
      console.log(`     a -> ${evaluate(a).decision.state} / ${evaluate(a).risk.hard_gates.join(',') || 'no gates'}`);
      console.log(`     b -> ${evaluate(b).decision.state} / ${evaluate(b).risk.hard_gates.join(',') || 'no gates'}`);
    }
  }
  const n = convergence.paraphrases.length;
  console.log(`  Paraphrases: declared invariants hold        ${sameGates}/${n}   <- the one that matters`);
  console.log(`  Paraphrases: identical safety fields          ${sameSafety}/${n}  (extraction layer)`);
  console.log(`  Paraphrases: identical full record            ${sameRecord}/${n}  (extraction layer)`);
  console.log(`  Paraphrases: identical full audit             ${sameAudit}/${n}`);
  console.log('  Divergence above is attributable to extraction, never to the rules:');
  console.log('  the rules read fields, so identical fields cannot yield different audits.');
  results.repro = { pureOk, samples: samples.length, sameRecord, sameAudit, sameSafety, sameGates, n };
  return pureOk === samples.length && sameGates === n;
}

const extractSync = (idea) => {
  let out;
  extract(idea).then((r) => { out = r; });
  // extract is synchronous in heuristic mode; the promise resolves immediately
  return out || syncFallback(idea);
};
function syncFallback(idea) {
  const { heuristicExtract } = require('../engine/heuristic-extractor');
  const r = emptyRecord(idea);
  for (const [id, v] of Object.entries(heuristicExtract(idea))) set(r, id, v.value, 'ASSUMED', 'heuristic', v.why);
  return r;
}
const fieldMap = (r) => Object.fromEntries(Object.entries(r.fields).filter(([, c]) => isKnown(c)).map(([k, c]) => [k, c.value]));
const diffFields = (a, b) => {
  const fa = fieldMap(a); const fb = fieldMap(b);
  return [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter((k) => JSON.stringify(fa[k]) !== JSON.stringify(fb[k]));
};

function buildRecord(fields, idea = 'oracle record') {
  const r = emptyRecord(idea);
  for (const [k, v] of Object.entries(fields)) set(r, k, v, 'CONFIRMED', 'oracle');
  return r;
}

// ---------------------------------------------------- 3. clarification layer
function section3() {
  console.log(`\n3. CLARIFICATION QUALITY\n${line()}`);
  const checks = { customAlways: 0, noReask: 0, relevant: 0, terminates: 0, total: 0 };
  const counts = [];

  for (const c of convergence.cases) {
    checks.total++;
    const record = syncFallback(c.idea);

    // Confirm three fields, then verify none of them is asked again (PRD 9.5).
    const confirmed = Object.keys(c.oracle_fields).slice(0, 3);
    for (const f of confirmed) set(record, f, c.oracle_fields[f], 'CONFIRMED', 'test');

    const qs = nextQuestions(record, { max: 8 });
    if (qs.every((q) => q.options.some((o) => o.custom))) checks.customAlways++;
    if (!qs.some((q) => confirmed.includes(q.field))) checks.noReask++;
    if (qs.every((q) => q.score >= 1)) checks.relevant++;

    // Terminates: answer everything with the oracle, loop must stop on its own.
    const loop = runClarificationSync(record, c.oracle_fields);
    counts.push(loop.asked.length);
    if (loop.stopped || loop.budgetHit) checks.terminates++;
    if (loop.stopped) checks.naturalStop = (checks.naturalStop || 0) + 1;
  }

  /**
   * Stop-rule demonstration. On a cold record there is genuinely always
   * another useful question, so the budget is what ends the loop and that is
   * correct behaviour, not a bug. To show the stop rule actually works, run it
   * on near-complete records: drop two fields from the oracle and the loop
   * should ask about those and then stop by itself.
   */
  let naturalStops = 0; const nearCounts = [];
  for (const c of convergence.cases) {
    const keys = Object.keys(c.oracle_fields);
    const near = { ...c.oracle_fields };
    delete near[keys[2]]; delete near[keys[5]];
    const loop = runClarificationSync(buildRecord(near, c.idea), c.oracle_fields);
    nearCounts.push(loop.asked.length);
    if (loop.stopped) naturalStops++;
  }
  const nearAvg = (nearCounts.reduce((a, b) => a + b, 0) / nearCounts.length).toFixed(1);

  const avg = (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1);
  console.log(`  Every question offers a Custom answer path   ${checks.customAlways}/${checks.total}`);
  console.log(`  Never re-asks an already confirmed field     ${checks.noReask}/${checks.total}`);
  console.log(`  Every question can change the outcome        ${checks.relevant}/${checks.total}`);
  console.log(`  Loop always terminates                       ${checks.terminates}/${checks.total}`);
  console.log(`  ...of which by the stop rule, not the budget ${checks.naturalStop || 0}/${checks.total}`);
  console.log(`  Questions asked from a cold heuristic record ${avg} average (budget is ${require('../engine/clarify').MAX_QUESTIONS})`);
  console.log(`  Stops by itself on a near-complete record    ${naturalStops}/${checks.total}, after ${nearAvg} questions on average`);
  results.clarify = { ...checks, avgQuestions: Number(avg), naturalStops, nearAvgQuestions: Number(nearAvg) };
  return checks.customAlways === checks.total && checks.noReask === checks.total
    && checks.relevant === checks.total && checks.terminates === checks.total
    && naturalStops === checks.total;
}

const { MAX_QUESTIONS } = require('../engine/clarify');
function runClarificationSync(record, oracle, max = MAX_QUESTIONS) {
  const asked = [];
  let stopped = false;
  for (let i = 0; i < max; i++) {
    const s = shouldStop(record, asked);
    if (s.stop) { stopped = true; break; }
    const q = s.next;
    asked.push(q.field);
    const answer = Object.prototype.hasOwnProperty.call(oracle, q.field) ? oracle[q.field] : null;
    applyAnswer(record, q.field, answer, q.question);
  }
  return { record, asked, stopped, budgetHit: !stopped && asked.length >= max };
}

// -------------------------------------------------------- 4. convergence
function section4() {
  console.log(`\n4. CONVERGENCE: where the system succeeds and where it fails\n${line()}`);
  console.log('  Three passes over the same cases, isolating each layer.\n');
  console.log('  ID    Case                       heuristic only        + clarification       partial extract+MCQ   oracle fields');
  console.log('  ' + '-'.repeat(118));

  let hOK = 0; let cOK = 0; let oOK = 0; let pOK = 0;
  let safeH = 0; let safeC = 0; let safeO = 0; let safeP = 0; let safeN = 0;
  const partialQ = [];

  for (const c of convergence.cases) {
    // Pass 1: heuristic extraction only. No questions. This is roughly what
    // v0.2 was, and the number should be low.
    const r1 = syncFallback(c.idea);
    const a1 = evaluate(r1);

    // Pass 2: heuristic extraction, then the MCQ loop answered from oracle.
    // This is the real product: extract, ask, decide.
    const r2 = runClarificationSync(syncFallback(c.idea), c.oracle_fields).record;
    const a2 = evaluate(r2);

    // Pass 3: perfect extraction. Isolates the rule layer completely. A
    // failure here is a rule bug; a pass here with a pass-2 failure means the
    // gap is extraction or question coverage.
    const r3 = buildRecord(c.oracle_fields, c.idea);
    const a3 = evaluate(r3);


    const ok = (a) => c.expect_decision.includes(a.decision.state)
      && (c.expect_gates || []).every((g) => a.risk.hard_gates.includes(g));
    const gateOk = (a) => (c.expect_gates || []).every((g) => a.risk.hard_gates.includes(g));

    /**
     * Pass 2b: what a competent LLM extractor plus the MCQ loop looks like.
     * Take the oracle, drop 40% of the fields deterministically, then clarify.
     * This is the realistic operating point: the model gets most of it, the
     * questions close the rest, and the question count is what a user would
     * actually sit through.
     */
    const keys = Object.keys(c.oracle_fields);
    const partial = {};
    keys.forEach((k, i) => { if (i % 5 !== 0 && i % 5 !== 3) partial[k] = c.oracle_fields[k]; });
    const rp = runClarificationSync(buildRecord(partial, c.idea), c.oracle_fields);
    const ap = evaluate(rp.record);
    partialQ.push(rp.asked.length);
    if (ok(ap)) pOK++;
    if (c.safety_critical && gateOk(ap)) safeP++;

    if (ok(a1)) hOK++;
    if (ok(a2)) cOK++;
    if (ok(a3)) oOK++;
    if (c.safety_critical) {
      safeN++;
      if (gateOk(a1)) safeH++;
      if (gateOk(a2)) safeC++;
      if (gateOk(a3)) safeO++;
    }

    const fmt = (a, good) => `${good ? ' ' : 'X'}${a.decision.state.slice(0, 19).padEnd(20)}`;
    console.log(`  ${c.id}  ${c.title.slice(0, 26).padEnd(27)}${fmt(a1, ok(a1))}  ${fmt(a2, ok(a2))}  ${fmt(ap, ok(ap))}  ${fmt(a3, ok(a3))}`);
  }

  const n = convergence.cases.length;
  console.log('  ' + '-'.repeat(118));
  const avgPQ = (partialQ.reduce((a, b) => a + b, 0) / partialQ.length).toFixed(1);
  console.log(`  Correct verdict:      heuristic ${hOK}/${n} (${pct(hOK, n)})   +MCQ ${cOK}/${n} (${pct(cOK, n)})   partial+MCQ ${pOK}/${n} (${pct(pOK, n)})   oracle ${oOK}/${n} (${pct(oOK, n)})`);
  console.log(`  Safety gates caught:  heuristic ${safeH}/${safeN}          +MCQ ${safeC}/${safeN}          partial+MCQ ${safeP}/${safeN}          oracle ${safeO}/${safeN}`);
  console.log(`  Questions needed:     from a cold record, see section 3.   From a partial extraction: ${avgPQ} average`);
  results.convergence = { n, heuristic: hOK, clarified: cOK, partial: pOK, oracle: oOK, partial_questions_avg: Number(avgPQ), safety: { n: safeN, heuristic: safeH, clarified: safeC, partial: safeP, oracle: safeO } };
  return oOK === n && safeO === safeN;
}

// ------------------------------------------------------------ 5. schema
function section5() {
  console.log(`\n5. SCHEMA CONFORMANCE\n${line()}`);
  if (!validate) { console.log('  ajv not installed, skipped. npm i -D ajv to enable.'); return true; }
  let ok = 0; const errs = [];
  for (const c of convergence.cases) {
    const audit = buildAudit(buildRecord(c.oracle_fields, c.idea));
    const copy = JSON.parse(JSON.stringify(audit)); delete copy._trace;
    if (validate(copy)) ok++;
    else errs.push({ id: c.id, e: (validate.errors || []).slice(0, 3).map((x) => `${x.instancePath} ${x.message}`) });
  }
  console.log(`  Valid against audit-schema.json (patched)    ${ok}/${convergence.cases.length}`);
  if (errs.length && VERBOSE) errs.forEach((e) => console.log(`  ${e.id}: ${e.e.join('; ')}`));
  else if (errs.length) console.log(`  Failing: ${errs.map((e) => e.id).join(', ')} (--verbose for detail)`);
  results.schema = { ok, total: convergence.cases.length };
  return ok === convergence.cases.length;
}

// ------------------------------------------------------------------- run
console.log('AI Opportunity Lab — hybrid engine v0.3 eval suite');
const s1 = section1();
const s2 = section2();
const s3 = section3();
const s4 = section4();
const s5 = section5();

console.log(`\nRELEASE GATES\n${line()}`);
const gates = [
  { name: 'Gate unit tests 100%', ok: s1 },
  { name: 'Audit is a pure function of the record', ok: s2 },
  { name: 'Clarification layer sound', ok: s3 },
  { name: 'Rule layer correct given correct fields', ok: s4 },
  { name: 'Schema conformance', ok: s5 },
];
for (const g of gates) console.log(`  ${g.ok ? 'PASS' : 'FAIL'}  ${g.name}`);
const allOk = gates.every((g) => g.ok);
fs.writeFileSync(path.join(__dirname, 'eval-results.json'), JSON.stringify({ generated_at: new Date().toISOString(), results, release_ok: allOk }, null, 2));
console.log(`\n${allOk ? 'RELEASE GATES PASSED' : 'RELEASE GATES FAILED'}`);
process.exit(allOk ? 0 : 1);
