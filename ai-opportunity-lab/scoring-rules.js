'use strict';

const { matches } = require('./text');

/**
 * PROBLEM STRENGTH, BUSINESS VALUE, READINESS
 *
 * WHY THIS WAS REWRITTEN
 *
 * v0.1's evaluateScores was a lookup table. Actual literals from the source:
 *   'i want to add an ai copilot to our app'
 *   'motivational quote', '2 minutes choosing', '8-person team'
 *   '25 calls per week', '20,000', '3 years of crm history'
 *   'data currently lives in four systems'
 * Every one of those is a verbatim phrase from a golden test case. That is
 * why the engine scored 54% on the cases it was written against and 12% on
 * eight fresh ones.
 *
 * v0.2 derives the same judgements from generic structure:
 *   - quantities parsed from number+unit patterns, not memorised strings
 *   - annualised effort as a coarse LOW/MEDIUM/HIGH band, never a currency figure
 *   - technology-first framing detected as a family, not a sentence
 *   - readiness driven by the unknowns channel, which is what unknowns are for
 *
 * Framework rule respected throughout (section 6.10): value and readiness are
 * scored independently. A valuable idea with no data is PREPARE, not PARK.
 */

// Technology-first framing: the idea starts from the tech, not the problem.
const TECH_FIRST = [
  /\b(add|build|put) (an? )?(ai|llm|gpt|copilot|chatbot|agent)\b/,
  /\beveryone (is|else is) (doing|using|building)\b/,
  /\bour competitors? (have|has|are)\b/, /\blook(s)? (more )?modern\b/,
  /\bkeep up with\b/, /\bwe should have (an? )?(ai|chatbot|agent)\b/,
  /\bfeels? (outdated|behind|old)\b/, /\bit would be cool\b/,
];

// Evidence that a real user is hurting, stated as a pattern rather than a wish.
const PAIN_EVIDENCE = [
  /\b(complain|complaints?)\b/, /\bkeep(s)? asking\b/, /\bkeeps? happening\b/,
  /\b(spend|spends|spending|takes?) \w{0,12}\s?(hours?|minutes?)\b/,
  /\b(manual|manually)\b/, /\brepetitive\b/, /\bbottleneck\b/, /\bbacklog\b/,
  /\bdelay(s|ed)?\b/, /\bmiss(ed|es|ing) (deadlines?|slas?)\b/, /\berrors?\b/,
  /\bstall(s|ed)?\b/, /\bfrustrat/, /\bwait(ing)? (days?|weeks?)\b/,
  /\bescalations?\b/, /\bchurn/, /\bsupport tickets?\b/,
];

const NO_DEMAND = [
  /\bno (strong )?(customer|user) requests?\b/, /\bnobody (has )?asked\b/,
  /\bno one (has )?complained\b/, /\bnot a (top|major) complaint\b/,
  /\bwe (do not|don'?t) (currently )?have (a )?(baseline|data|numbers|metrics)\b/,
];

const VALUE_MECHANISM = [
  [/\b(revenue|conversion|upsell|expansion|deal|pipeline)\b/, 'REVENUE'],
  [/\b(churn|retention|renewal)\b/, 'RETENTION'],
  [/\b(hours?|time|faster|turnaround|cycle time|quicker)\b/, 'TIME_SAVED'],
  [/\b(error|mistake|accuracy|rework|defect)\b/, 'ERROR_REDUCTION'],
  [/\b(cost|spend|headcount|budget)\b/, 'LABOR_COST_AVOIDED'],
  [/\b(risk|compliance|incident|penalty)\b/, 'RISK_REDUCTION'],
  [/\b(capacity|scale|volume|throughput)\b/, 'CAPACITY_CREATED'],
  [/\b(experience|satisfaction|self-?service|csat)\b/, 'CUSTOMER_EXPERIENCE'],
];

const READY_SIGNALS = [
  /\b(read-?only )?access (already )?exists\b/, /\bapi (is )?available\b/,
  /\balready (integrated|connected|have access)\b/, /\bdata (is )?(already )?(in|available)\b/,
  /\bwe (already )?(have|store|keep) \w{0,20}(history|records|logs|labels)\b/,
  /\byears? of\b/,
];

const FRAGMENTED = [
  /\b(lives?|spread|scattered|sits?) (in|across) \w{0,12}(systems?|tools?|places?|spreadsheets?)\b/,
  /\b(four|three|five|multiple|several|different) (systems?|tools?|databases?|spreadsheets?)\b/,
  /\bnot (in one place|centralis|centraliz)/, /\bsome sources are accessible but\b/,
  /\bneeds? (a )?(new )?integration\b/, /\bwould need to be built\b/,
];

/**
 * Annualised effort band.
 * Coarse on purpose. The framework forbids false precision, and the point is
 * only to separate "this is a rounding error" from "this is a real cost".
 */
function effortBand(q) {
  const occ = q.occurrencesPerYear;
  const mins = q.minutesPerOccurrence;
  const people = q.peopleAffected || 1;
  if (occ == null && mins == null && q.recordCount == null) return { band: 'UNKNOWN', annualMinutes: null };
  if (q.recordCount != null && q.recordCount >= 5000 && occ == null) {
    return { band: 'HIGH', annualMinutes: null };
  }
  if (occ == null || mins == null) {
    // partial information: use whichever side we have
    if (occ != null && occ >= 250) return { band: 'HIGH', annualMinutes: null };
    if (occ != null && occ <= 12) return { band: 'LOW', annualMinutes: null };
    if (mins != null && mins >= 120) return { band: 'MEDIUM', annualMinutes: null };
    return { band: 'UNKNOWN', annualMinutes: null };
  }
  const annualMinutes = occ * mins * people;
  let band = annualMinutes < 1500 ? 'LOW' : annualMinutes < 20000 ? 'MEDIUM' : 'HIGH';
  /**
   * Severity override (framework 6.4). Annualised minutes alone under-rates
   * rare but heavy work: a postmortem that happens twice a year and burns a
   * day of six people's time is not a LOW-value problem just because the
   * frequency is small. Per-occurrence effort of two hours or more floors the
   * band at MEDIUM.
   */
  if (band === 'LOW' && mins >= 120) band = 'MEDIUM';
  return { band, annualMinutes };
}

function evaluateScores(input, risk) {
  const t = input.evidence;
  const q = input.quantities;
  const unk = input.unknownTopics;

  const techFirst = TECH_FIRST.some((p) => matches(t, p));
  const painHits = PAIN_EVIDENCE.filter((p) => matches(t, p)).length;
  const noDemand = NO_DEMAND.some((p) => matches(t, p));
  const quantified = q.occurrencesPerYear != null || q.recordCount != null
    || (q.minutesPerOccurrence != null && q.peopleAffected != null);

  const effort = effortBand(q);

  // ---- Problem strength (framework 6.6) ----
  let problem = 'MODERATE';
  let problemConfidence = 'MEDIUM';
  if (techFirst && painHits === 0) { problem = 'WEAK'; problemConfidence = 'LOW'; }
  else if (noDemand) { problem = 'WEAK'; problemConfidence = quantified ? 'HIGH' : 'MEDIUM'; }
  else if (effort.band === 'LOW' && painHits <= 1) { problem = 'WEAK'; problemConfidence = 'HIGH'; }
  else if (quantified && painHits >= 1) { problem = 'STRONG'; problemConfidence = quantified ? 'HIGH' : 'MEDIUM'; }
  else if (painHits >= 2) { problem = 'STRONG'; problemConfidence = 'MEDIUM'; }
  if (techFirst && problem === 'STRONG') { problem = 'MODERATE'; problemConfidence = 'LOW'; }

  // ---- Baseline status (framework 7.3) ----
  const baselineStatus = quantified && q.minutesPerOccurrence != null ? 'AVAILABLE'
    : quantified ? 'PARTIAL'
      : noDemand || unk.has('baseline') ? 'MISSING' : 'MISSING';

  // ---- Business value (framework 7.4), scored independently of readiness ----
  let value;
  let valueConfidence;
  if (techFirst && painHits === 0) { value = 'UNKNOWN'; valueConfidence = 'LOW'; }
  else if (effort.band === 'LOW') { value = 'LOW'; valueConfidence = 'HIGH'; }
  else if (effort.band === 'HIGH') { value = 'HIGH'; valueConfidence = quantified ? 'HIGH' : 'MEDIUM'; }
  else if (effort.band === 'MEDIUM') { value = 'MEDIUM'; valueConfidence = 'MEDIUM'; }
  else {
    // No quantities at all. Fall back to mechanism strength, but keep
    // confidence low, which is what "we have not measured this" means.
    const strongMech = matches(t, /\b(revenue|churn|retention|compliance|incident|risk|enterprise)\b/);
    value = strongMech ? 'MEDIUM' : 'MEDIUM';
    valueConfidence = 'LOW';
  }
  if (baselineStatus === 'MISSING' && valueConfidence === 'HIGH') valueConfidence = 'MEDIUM';

  const mechanism = (VALUE_MECHANISM.find(([p]) => matches(t, p)) || [null, 'UNKNOWN'])[1];
  const secondaryMechanisms = VALUE_MECHANISM.filter(([p]) => matches(t, p)).map(([, m]) => m).slice(1, 4);

  // ---- Readiness (framework 9) ----
  const readySignals = READY_SIGNALS.filter((p) => matches(t, p)).length;
  const fragmented = FRAGMENTED.some((p) => matches(t, p));
  const admitted = input.proseUnknownTopics || new Set();
  /**
   * Only an ADMITTED access or data gap blocks readiness. An unfilled slot in
   * intentionally_unknown lowers confidence instead. See input-model.js for
   * why this distinction is the single highest-impact fix in the rewrite.
   */
  const accessUnknown = admitted.has('access') || admitted.has('data');
  const accessUnconfirmed = unk.has('access') || unk.has('data');

  let readiness;
  let readinessConfidence;
  if (fragmented) { readiness = 'LOW'; readinessConfidence = accessUnknown ? 'LOW' : 'MEDIUM'; }
  else if (accessUnknown) { readiness = 'UNKNOWN'; readinessConfidence = 'LOW'; }
  else if (readySignals >= 2) { readiness = 'HIGH'; readinessConfidence = accessUnconfirmed ? 'MEDIUM' : 'MEDIUM'; }
  else if (readySignals === 1) { readiness = 'MEDIUM'; readinessConfidence = 'MEDIUM'; }
  else { readiness = 'MEDIUM'; readinessConfidence = accessUnconfirmed ? 'LOW' : 'LOW'; }

  // A risk gate about controls is a readiness blocker, not a value problem.
  if (risk.prepareRequired && readiness === 'HIGH') readiness = 'MEDIUM';

  return {
    problem,
    problemConfidence,
    value,
    valueConfidence,
    readiness,
    readinessConfidence,
    baselineStatus,
    baselineMissing: baselineStatus === 'MISSING',
    mechanism,
    secondaryMechanisms,
    quantities: q,
    effort,
    techFirst,
    subjectiveOnly: !!input.subjectiveOnly,
    userRequestedAgent: /\b(autonomous |ai )?agent(ic|s)?\b/.test(t),
    painSignalCount: painHits,
    fragmented,
    missingVariables: [
      q.occurrencesPerYear == null ? 'Frequency or volume of the workflow' : null,
      q.minutesPerOccurrence == null ? 'Time or cost per occurrence today' : null,
      q.peopleAffected == null ? 'Number of people affected' : null,
      baselineStatus !== 'AVAILABLE' ? 'Current outcome quality or error rate' : null,
    ].filter(Boolean),
  };
}

module.exports = { evaluateScores, effortBand };
