'use strict';

/**
 * THE FIELD REGISTRY
 *
 * This file is the spine of the hybrid architecture. It defines the
 * OpportunityRecord: the structured intermediate that sits between the LLM
 * (which reads prose) and the rule engine (which must never read prose).
 *
 * WHY THIS EXISTS
 *
 * v0.1 and v0.2 both ran rules against text. That capped generalisation at
 * whatever the lexicon covered: v0.2 scored 100% on the sets it was tuned and
 * debugged against and 1/8 on eight cases written afterwards, because judging
 * "is a human reviewing this?" from arbitrary English is a semantic task and
 * no regex reaches it.
 *
 * Splitting on this contract fixes that structurally:
 *   - The LLM does the one job it is good at: reading prose into fields.
 *   - The rules do the one job they are good at: applying the same logic to
 *     the same fields every time, reproducibly, with no model variance.
 *   - Paraphrase invariance stops being something you test for and becomes
 *     something that is true by construction. Two wordings that extract to the
 *     same record CANNOT produce different audits.
 *
 * Every field carries an evidence_status, because framework section 3 says
 * CONFIRMED and UNKNOWN must behave differently, and a bare value cannot
 * express that.
 */

const EVIDENCE = ['CONFIRMED', 'SUPPORTED', 'ESTIMATED', 'ASSUMED', 'UNKNOWN'];

/** A single field value plus how much we trust it. */
function cell(value = null, evidence_status = 'UNKNOWN', source = 'default', note = '') {
  return { value, evidence_status, source, note };
}

const isKnown = (c) => c && c.value !== null && c.value !== undefined && c.evidence_status !== 'UNKNOWN';

/**
 * FIELD DEFINITIONS
 *
 * block            which audit block consumes it
 * type             enum | number | boolean | text
 * values           allowed values for enums. The extractor is constrained to
 *                  these, which is what makes the LLM output checkable.
 * ask              can this be put to the user as a clarification question?
 * prompt           the question goal, used by both the extractor and the MCQ
 * options(record)  three context-aware choices, best guess first (PRD 9.3).
 *                  A fourth "Custom answer" path is appended by clarify.js and
 *                  is never optional.
 */
const FIELDS = {
  // ---------------------------------------------------------------- problem
  affected_user: {
    block: 'problem', type: 'text', ask: true,
    prompt: 'Who specifically feels this problem today?',
    options: () => [
      { label: 'An internal team', value: 'internal team' },
      { label: 'Our customers or end users', value: 'customer' },
      { label: 'One named role or person', value: 'single role' },
    ],
  },
  pain_evidence_level: {
    block: 'problem', type: 'enum', ask: true,
    values: ['HYPOTHESIS', 'ANECDOTAL', 'REPEATED_PATTERN', 'QUANTIFIED', 'QUANTIFIED_SEGMENTED'],
    prompt: 'How strong is the evidence that this problem is real?',
    // Framework 6.3 levels 1 to 5.
    options: () => [
      { label: 'It comes up repeatedly but we have not measured it', value: 'REPEATED_PATTERN' },
      { label: 'We have numbers on how often and how costly it is', value: 'QUANTIFIED' },
      { label: 'One or two people have mentioned it', value: 'ANECDOTAL' },
    ],
  },
  frequency_per_year: {
    block: 'value', type: 'number', ask: true,
    prompt: 'How often does this workflow run?',
    options: () => [
      { label: 'Most working days (about 250 a year)', value: 250 },
      { label: 'A few times a week (about 150 a year)', value: 150 },
      { label: 'Monthly or less (about 12 a year)', value: 12 },
    ],
  },
  minutes_per_occurrence: {
    block: 'value', type: 'number', ask: true,
    prompt: 'How long does one instance take today?',
    options: () => [
      { label: 'Under 15 minutes', value: 10 },
      { label: 'Around an hour', value: 60 },
      { label: 'Half a day or more', value: 240 },
    ],
  },
  people_affected: { block: 'value', type: 'number', ask: true, prompt: 'How many people do this task?',
    options: () => [{ label: 'One person', value: 1 }, { label: 'A small team, under ten', value: 5 }, { label: 'More than ten', value: 20 }] },
  value_mechanism: {
    block: 'value', type: 'enum', ask: true,
    values: ['TIME_SAVED', 'LABOR_COST_AVOIDED', 'CAPACITY_CREATED', 'ERROR_REDUCTION', 'REVENUE', 'CONVERSION', 'RETENTION', 'TURNAROUND_TIME', 'RISK_REDUCTION', 'DECISION_QUALITY', 'CUSTOMER_EXPERIENCE', 'STRATEGIC_CAPABILITY', 'OTHER', 'UNKNOWN'],
    prompt: 'What would measurably improve if this worked?',
    options: () => [
      { label: 'Time or cost of the current work', value: 'TIME_SAVED' },
      { label: 'Quality, errors, or rework', value: 'ERROR_REDUCTION' },
      { label: 'Revenue, conversion, or retention', value: 'REVENUE' },
    ],
  },
  baseline_measured: {
    block: 'value', type: 'boolean', ask: true,
    prompt: 'Has the current process been measured?',
    options: () => [
      { label: 'No, we have not measured it', value: false },
      { label: 'Yes, we have current numbers', value: true },
      { label: 'Partly, we have volume but not cost or quality', value: false },
    ],
  },
  demand_evidence: {
    block: 'problem', type: 'enum', ask: true, values: ['REQUESTED', 'NONE', 'COMPETITOR_DRIVEN'],
    prompt: 'What is driving this idea?',
    options: () => [
      { label: 'Users or the business asked for it', value: 'REQUESTED' },
      { label: 'A competitor has it, or it seems modern', value: 'COMPETITOR_DRIVEN' },
      { label: 'Nobody has asked, it is our own hypothesis', value: 'NONE' },
    ],
  },

  // ------------------------------------------------------------- task shape
  // Framework 10.2. These fields, and only these, decide the architecture.
  organisational_failure: {
    block: 'architecture', type: 'boolean', ask: true,
    prompt: 'Is the delay caused by unclear ownership or decision rights rather than by the work itself?',
    options: () => [
      { label: 'No, the work itself is the bottleneck', value: false },
      { label: 'Yes, nobody is clear who decides or owns it', value: true },
      { label: 'Both, but the work is the bigger part', value: false },
    ],
  },
  interpretation_complexity: {
    block: 'architecture', type: 'enum', values: ['NONE', 'LOW', 'HIGH'], ask: true,
    prompt: 'How much judgement or language interpretation does one case need?',
    options: () => [
      { label: 'Some. It reads text and needs context', value: 'HIGH' },
      { label: 'None. The rule is fixed and mechanical', value: 'NONE' },
      { label: 'A little, mostly consistent cases', value: 'LOW' },
    ],
  },
  prediction_need: {
    block: 'architecture', type: 'enum', values: ['NONE', 'CLASSIFY', 'RANK', 'FORECAST', 'ANOMALY'], ask: true,
    prompt: 'Does the task need to predict, rank, classify, or spot outliers?',
    options: () => [
      { label: 'No, it does not predict anything', value: 'NONE' },
      { label: 'Yes, it classifies or categorises cases', value: 'CLASSIFY' },
      { label: 'Yes, it ranks or scores by likelihood', value: 'RANK' },
    ],
  },
  labelled_history_available: {
    block: 'readiness', type: 'boolean', ask: true,
    prompt: 'Is there historical data with known correct outcomes?',
    options: () => [
      { label: 'Yes, years of past cases with outcomes', value: true },
      { label: 'No, we would be starting from nothing', value: false },
      { label: 'Some, but it has not been checked for quality', value: true },
    ],
  },
  knowledge_grounding: {
    block: 'architecture', type: 'enum', values: ['NONE', 'PUBLIC', 'PROPRIETARY_STATIC', 'PROPRIETARY_CHANGING'], ask: true,
    prompt: 'Do the answers depend on your own documents, and do those change?',
    options: () => [
      { label: 'Yes, our own documents, and they change regularly', value: 'PROPRIETARY_CHANGING' },
      { label: 'Yes, our own documents, but they rarely change', value: 'PROPRIETARY_STATIC' },
      { label: 'No, it does not depend on a document set', value: 'NONE' },
    ],
  },
  source_traceability_required: {
    block: 'architecture', type: 'boolean', ask: true,
    prompt: 'Must the output show which source it came from?',
    options: () => [
      { label: 'Yes, users need to see the source', value: true },
      { label: 'No, the answer alone is enough', value: false },
      { label: 'Only for disputed or high-value cases', value: true },
    ],
  },
  stage_count: { block: 'architecture', type: 'number', ask: false, prompt: 'How many distinct steps does one case pass through?' },
  path_variability: {
    block: 'architecture', type: 'enum', values: ['FIXED', 'BRANCHING', 'VARIABLE'], ask: true,
    prompt: 'Is the sequence of steps the same every time?',
    options: () => [
      { label: 'Mostly the same steps in the same order', value: 'FIXED' },
      { label: 'A few known branches', value: 'BRANCHING' },
      { label: 'It varies. You cannot list the steps up front', value: 'VARIABLE' },
    ],
  },
  dynamic_planning_required: { block: 'architecture', type: 'boolean', ask: false, prompt: 'Must the system decide its own next step?' },
  tool_use: { block: 'architecture', type: 'enum', values: ['NONE', 'READ', 'WRITE'], ask: false, prompt: 'Does it read from or write to other systems?' },
  autonomy_requested: {
    block: 'risk', type: 'enum', values: ['SUGGEST_ONLY', 'APPROVE_EACH', 'APPROVE_EXCEPTIONS', 'FULL_AUTONOMY'], ask: true,
    prompt: 'How much should it be allowed to do without a person?',
    options: () => [
      { label: 'It suggests, a person decides', value: 'SUGGEST_ONLY' },
      { label: 'A person approves every action', value: 'APPROVE_EACH' },
      { label: 'It acts alone, no approval step', value: 'FULL_AUTONOMY' },
    ],
  },

  // ------------------------------------------------------------------- risk
  // Framework 11.2. These fields, and only these, decide the hard gates.
  action_target: {
    block: 'risk', type: 'enum', values: ['NONE', 'INTERNAL_RECORD', 'INTERNAL_DECISION', 'EXTERNAL_COMMUNICATION', 'EXTERNAL_TRANSACTION'], ask: true,
    prompt: 'What does the system actually do at the end?',
    options: () => [
      { label: 'Nothing. It produces something a person uses', value: 'NONE' },
      { label: 'Writes to an internal system or record', value: 'INTERNAL_RECORD' },
      { label: 'Sends something to a customer or third party', value: 'EXTERNAL_COMMUNICATION' },
    ],
  },
  stakes: {
    block: 'risk', type: 'enum', values: ['LOW', 'MEDIUM', 'HIGH'], ask: true,
    prompt: 'How bad is one wrong output, in the worst realistic case?',
    options: () => [
      { label: 'Annoying but easily corrected', value: 'LOW' },
      { label: 'Costly or embarrassing, recoverable', value: 'MEDIUM' },
      { label: 'Serious. Money, rights, health, or legal exposure', value: 'HIGH' },
    ],
  },
  error_detectability: {
    block: 'risk', type: 'enum', values: ['LOW', 'MEDIUM', 'HIGH'], ask: true,
    prompt: 'If it got one wrong, would anyone notice?',
    options: () => [
      { label: 'Yes, a person checks before it lands', value: 'HIGH' },
      { label: 'Probably, but only later', value: 'MEDIUM' },
      { label: 'No, it would go unnoticed', value: 'LOW' },
    ],
  },
  reversibility: {
    block: 'risk', type: 'enum', values: ['REVERSIBLE', 'RECOVERABLE', 'IRREVERSIBLE'], ask: true,
    prompt: 'Can a wrong action be undone?',
    options: () => [
      { label: 'Yes, easily undone internally', value: 'REVERSIBLE' },
      { label: 'It can be corrected, with effort and apology', value: 'RECOVERABLE' },
      { label: 'No. Once it is out, it is out', value: 'IRREVERSIBLE' },
    ],
  },
  recovery_path_exists: {
    block: 'risk', type: 'boolean', ask: true,
    prompt: 'Is there a defined rollback or recall path?',
    options: () => [
      { label: 'No, not yet', value: false },
      { label: 'Yes, we can roll back or recall', value: true },
      { label: 'Not sure, it has not been designed', value: false },
    ],
  },
  sensitive_data: {
    block: 'risk', type: 'enum', values: ['NONE', 'INTERNAL', 'PERSONAL', 'REGULATED'], ask: true,
    prompt: 'What kind of data does it touch?',
    options: () => [
      { label: 'Internal business data only', value: 'INTERNAL' },
      { label: 'Personal data about people', value: 'PERSONAL' },
      { label: 'Regulated data such as health, credit, or employment', value: 'REGULATED' },
    ],
  },
  data_controls_confirmed: {
    block: 'risk', type: 'boolean', ask: true,
    prompt: 'Have you confirmed what the system is allowed to access?',
    options: () => [
      { label: 'No, not checked yet', value: false },
      { label: 'Yes, access scope is confirmed', value: true },
      { label: 'Partly, for some systems only', value: false },
    ],
  },
  rights_impact: {
    block: 'risk', type: 'boolean', ask: true,
    prompt: 'Could the output change something a person is entitled to, such as a job, a claim, or credit?',
    options: () => [
      { label: 'No', value: false },
      { label: 'Yes', value: true },
      { label: 'Only indirectly, a human still decides', value: false },
    ],
  },
  untrusted_input: {
    block: 'risk', type: 'boolean', ask: true,
    prompt: 'Does any input come from outside your trust boundary, such as the public web or inbound email?',
    options: () => [
      { label: 'No, all inputs are internal', value: false },
      { label: 'Yes, external or public content', value: true },
      { label: 'Yes, but only content we already vet', value: false },
    ],
  },
  human_review_point: {
    block: 'risk', type: 'enum', values: ['NONE', 'SAMPLE', 'EVERY_CASE'], ask: true,
    prompt: 'Where does a person check the output?',
    options: () => [
      { label: 'A person approves every case', value: 'EVERY_CASE' },
      { label: 'Spot checks on a sample', value: 'SAMPLE' },
      { label: 'Nobody checks it', value: 'NONE' },
    ],
  },
  accountable_owner: {
    block: 'risk', type: 'text', ask: true,
    prompt: 'Who owns the outcome if this goes wrong?',
    options: () => [
      { label: 'A named person or team already owns it', value: 'named owner' },
      { label: 'Nobody has been assigned yet', value: 'NONE' },
      { label: 'It would sit with me', value: 'requester' },
    ],
  },

  // -------------------------------------------------------------- readiness
  data_available: { block: 'readiness', type: 'boolean', ask: true, prompt: 'Does the data this needs already exist?',
    options: () => [{ label: 'Yes, it exists today', value: true }, { label: 'No, it would have to be created', value: false }, { label: 'It exists but is scattered across systems', value: true }] },
  data_fragmented: { block: 'readiness', type: 'boolean', ask: true, prompt: 'Is the data in one place or spread across systems?',
    options: () => [{ label: 'One or two systems', value: false }, { label: 'Three or more systems', value: true }, { label: 'Not sure yet', value: true }] },
  integration_access_confirmed: {
    block: 'readiness', type: 'boolean', ask: true,
    prompt: 'Have you confirmed you can programmatically reach those systems?',
    options: () => [
      { label: 'No, not checked', value: false },
      { label: 'Yes, APIs and permissions exist', value: true },
      { label: 'Some yes, some unknown', value: false },
    ],
  },
  eval_capability_exists: { block: 'readiness', type: 'boolean', ask: false, prompt: 'Is there a set of representative cases to test against?' },
  existing_alternative: { block: 'economics', type: 'text', ask: true, prompt: 'What are you comparing this against?',
    options: () => [{ label: 'Doing nothing, the current manual process', value: 'current manual process' }, { label: 'A feature in software we already pay for', value: 'existing software' }, { label: 'Hiring or outsourcing', value: 'more people' }] },
};

/** A record with every field present and UNKNOWN. */
function emptyRecord(originalIdea = '') {
  const fields = {};
  for (const id of Object.keys(FIELDS)) fields[id] = cell();
  return { original_idea: originalIdea, fields, history: [] };
}

function get(record, id) { return record.fields[id] || cell(); }
function val(record, id, fallback = null) { const c = get(record, id); return isKnown(c) ? c.value : fallback; }

/**
 * Set a field. Refuses to downgrade a CONFIRMED value with an ASSUMED one,
 * which is the mechanical version of PRD 9.6: an inferred answer must never be
 * silently promoted over something the user actually confirmed.
 */
const RANK = { CONFIRMED: 4, SUPPORTED: 3, ESTIMATED: 2, ASSUMED: 1, UNKNOWN: 0 };
function set(record, id, value, evidence_status = 'SUPPORTED', source = 'extracted', note = '') {
  if (!FIELDS[id]) return record;
  const existing = record.fields[id];
  if (existing && RANK[existing.evidence_status] > RANK[evidence_status]) return record;
  record.fields[id] = cell(value, evidence_status, source, note);
  record.history.push({ id, value, evidence_status, source, at: new Date().toISOString() });
  return record;
}

/** Reject values outside the declared enum. This is the LLM output check. */
function coerce(id, raw) {
  const def = FIELDS[id];
  if (!def || raw === null || raw === undefined || raw === '') return null;
  if (def.type === 'enum') {
    const v = String(raw).toUpperCase().replace(/[\s-]+/g, '_');
    return def.values.includes(v) ? v : null;
  }
  if (def.type === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : null; }
  if (def.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(s)) return true;
    if (['false', 'no', 'n', '0'].includes(s)) return false;
    return null;
  }
  return String(raw);
}

module.exports = { FIELDS, EVIDENCE, cell, emptyRecord, get, val, set, coerce, isKnown, RANK };
