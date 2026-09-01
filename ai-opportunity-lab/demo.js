#!/usr/bin/env node
'use strict';

/**
 * DEMO: the full loop, end to end.
 *
 *   node demo.js "your idea here"
 *   node demo.js                      (uses a built-in example)
 *
 * Runs in heuristic mode by default. Set ANTHROPIC_API_KEY to use real
 * extraction; see makeAnthropicExtractor below for the four lines that need.
 *
 * The point of the demo is to make the split visible: watch which fields the
 * extractor filled, which questions the engine decided were worth asking and
 * why, and how the verdict moves as answers arrive.
 */

const readline = require('node:readline');
const { extract } = require('./engine/extractor');
const { buildAudit } = require('./engine/audit-engine');
const { evaluate } = require('./engine/evaluate');
const { nextQuestions, shouldStop, applyAnswer } = require('./engine/clarify');
const { isKnown } = require('./engine/contract');

const DEFAULT_IDEA = 'We want AI to review enterprise contract usage and payment history, decide when a customer has materially breached terms, terminate the contract, and send the termination notice automatically.';

/**
 * Adapter for real extraction. Everything downstream is unchanged: the model
 * returns fields, the rules do the rest. Swap in any provider by writing one
 * function of this shape.
 */
function makeAnthropicExtractor(apiKey) {
  return async ({ messages }) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages }),
    });
    const data = await res.json();
    return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  };
}

const ask = (rl, q) => new Promise((r) => rl.question(q, r));

function summarise(record, label) {
  const r = evaluate(record, { allowClarify: true });
  const known = Object.values(record.fields).filter(isKnown).length;
  console.log(`\n${label}`);
  console.log(`  decision      ${r.decision.state}  (confidence ${r.decision.confidence})`);
  console.log(`  approach      ${r.architecture.best_current_fit || 'undetermined'}`);
  console.log(`  risk          ${r.risk.risk_tier}${r.risk.hard_gates.length ? '  gates: ' + r.risk.hard_gates.join(', ') : ''}`);
  console.log(`  fields known  ${known}/${Object.keys(record.fields).length}`);
  console.log(`  reason        ${r.decision.primary_reason}`);
}

(async () => {
  const idea = process.argv.slice(2).join(' ') || DEFAULT_IDEA;
  const key = process.env.ANTHROPIC_API_KEY;

  console.log('AI Opportunity Lab v0.3\n');
  console.log(`Idea: ${idea}\n`);
  console.log(key ? 'Extraction: LLM' : 'Extraction: heuristic priors only (set ANTHROPIC_API_KEY for LLM extraction)');

  const record = await extract(idea, key ? { callModel: makeAnthropicExtractor(key) } : {});
  console.log('\nExtracted fields:');
  for (const [id, c] of Object.entries(record.fields)) {
    if (isKnown(c)) console.log(`  ${id.padEnd(32)} ${JSON.stringify(c.value).padEnd(24)} [${c.evidence_status}]`);
  }

  summarise(record, 'Audit before any clarification:');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const asked = [];
  while (true) {
    const stop = shouldStop(record, asked);
    if (stop.stop) { console.log(`\nNo more questions. ${stop.reason}`); break; }
    const q = stop.next;
    console.log(`\n${q.question}`);
    console.log(`  why asked: ${q.why_asked}`);
    q.options.forEach((o, i) => console.log(`  ${i + 1}) ${o.label}${o.inferred_from_description ? '   (read from your description, confirm or change)' : ''}`));
    const a = await ask(rl, '  > ');
    const pick = q.options[Number(a) - 1];
    const value = pick ? (pick.custom ? await ask(rl, '  your answer (or "I do not know"): ') : pick.value) : a;
    applyAnswer(record, q.field, value, q.question);
    asked.push(q.field);
    summarise(record, `After answering ${q.field}:`);
  }
  rl.close();

  const audit = buildAudit(record);
  console.log(`\n${'='.repeat(64)}\nFINAL AUDIT\n${'='.repeat(64)}`);
  console.log(`Decision      ${audit.decision.state} (${audit.decision.confidence})`);
  console.log(`Approach      ${audit.decision.preferred_current_path}`);
  console.log(`Simpler alt   ${audit.architecture.simpler_alternative || 'none identified'}`);
  console.log(`Risk          ${audit.risk_and_governance.risk_tier}`);
  for (const g of audit.risk_and_governance.hard_gates) {
    console.log(`  GATE ${g}\n       ${audit._trace.gate_rationale[g]}\n       closes if you answer: ${(audit._trace.gate_closing_fields[g] || []).join(', ')}`);
  }
  console.log(`\nWhy: ${audit.decision.primary_reason}`);
  console.log(`Largest uncertainty: ${audit.decision.largest_uncertainty || 'none'}`);
  console.log('\nFirst roadmap steps:');
  audit.roadmap.slice(0, 3).forEach((s) => console.log(`  ${s.step}. ${s.title} — ${s.why}`));
  if (audit.open_questions.length) {
    console.log('\nStill open:');
    audit.open_questions.forEach((q) => console.log(`  ${q.blocking ? '[blocking] ' : ''}${q.question}`));
  }
})();
