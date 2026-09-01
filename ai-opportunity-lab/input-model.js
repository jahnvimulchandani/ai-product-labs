'use strict';

const { matches, tokens, extractQuantities } = require('./text');

/**
 * INPUT CHANNEL SEPARATION
 *
 * WHY THIS IS THE MOST IMPORTANT CHANGE IN v0.2
 *
 * v0.1 did this:
 *     text = [idea, JSON.stringify(confirmed_facts), JSON.stringify(unknowns)]
 *              .join('\n').toLowerCase()
 * ...and then ran every rule against that one blob.
 *
 * Three separate bugs fell out of that single line:
 *
 *   1. Things the user explicitly said they DO NOT KNOW were used as positive
 *      evidence. An unknown called "policy_conflict_rules" fired the
 *      process-change architecture detector. Demonstrated: strip the unknowns
 *      from TC-04 and the audit flips from
 *      USE_SIMPLER_APPROACH / PROCESS_OR_HUMAN_CHANGE to
 *      PROCEED_TO_PILOT / RETRIEVAL_GROUNDED_AI. Same facts, opposite answer.
 *
 *   2. JSON.stringify includes KEYS, so a field named `routing_rules` fired
 *      the deterministic detector even when its value said the opposite.
 *
 *   3. Confirmed facts and raw speculation carried identical weight, which
 *      contradicts framework section 3 (Evidence States), where CONFIRMED and
 *      UNKNOWN are supposed to behave differently.
 *
 * The framework already says unknowns must lower confidence and open
 * questions, never drive a recommendation. This file makes the code agree
 * with the framework.
 */

/** Build-intent detection.
 *
 * WHY: v0.1 classified an empty string, "asdfgh qwerty", and the single word
 * "chatbot" as USE_SIMPLER_APPROACH with a complete roadmap attached. It also
 * rated "I love reading about how to terminate the contract and automatically
 * reject candidates in movies" as HIGH risk with two hard gates.
 *
 * A description has to actually propose doing something before it can be
 * audited. This is the gate that makes INSUFFICIENT_INPUT possible.
 */
const BUILD_INTENT = [
  // first person proposal
  /\b(i|we)\s+(want|need|plan|intend|would like|am thinking|are thinking|was thinking|should build|could use)\b/,
  /\b(our|my)\b[^.?!]{0,40}\b(wants?|needs?|could use|should have)\b/,
  // modal proposal about a system or a recipient
  /\b(should|could|must|will)\s+(get|receive|be|have|use|send|answer|draft|handle|generate)\b/,
  /\b(the\s+)?(system|tool|model|ai|bot|agent|assistant)\s+(should|will|would|must|can)\b/,
  /\ban?\s+(ai\s+)?(agent|bot|assistant|tool|system|copilot|model|workflow)\s+(that|which|to)\b/,
  /\b(use|using|build|create|automate|implement|deploy|set up|roll out|add|want|wants|need)\s+(an?\s+)?(ai|llm|agent|bot|chatbot|copilot|assistant|model|workflow|automation|receptionist)\b/,
  /\b(i|we)\s+think\s+(we|it)\s+should\b/,
  /\bis considering an?\b/, /\bthinking of (building|adding|using)\b/,
  /\bautomatically\b/, /\bwith no (human|manager|person|adjuster|reviewer)\b/,
  /\ban? ai\b[^.?!]{0,60}\b(reviews?|reads?|sends?|decides?|handles?|answers?|drafts?)\b/,
  /\bai\s+to\s+\w+/,
  // imperative instruction ("For each ticket, classify...", "Turn our recordings into...")
  /^(for (each|every)|when|whenever|if)\b[^.?!]{0,120}\b(classify|draft|send|route|escalate|summari[sz]e|score|flag|generate|answer|match|reconcile|create|assign|remind)\b/m,
  /^(classify|draft|summari[sz]e|turn|build|create|generate|score|flag|answer|match|reconcile|escalate|route|assemble)\b/m,
];

/**
 * Descriptive, not proposed. Someone discussing automation in the abstract is
 * not asking for an audit. v0.1 rated
 * "I love reading about how companies terminate contracts and automatically
 *  reject candidates" as HIGH risk with two hard gates.
 * This is a hedge, not a solved problem: intent detection from prose is
 * exactly the job that belongs in the LLM extraction layer, not here.
 */
const DESCRIPTIVE_ONLY = [
  /\b(i|we)\s+(love|enjoy|like|hate|read|heard|saw|find)\b/,
  /\b(fascinating|interesting) stuff\b/,
  /\bhow (companies|other people|firms|teams) (do|handle|manage|terminate|reject)\b/,
];

/** Language that marks something as absent, unverified, or unmeasured. */
/**
 * Purely subjective justification. Framework 6.3 calls this Level 2
 * (anecdotal) evidence, which is explicitly not enough to authorise a pilot.
 * Detecting it lets the engine say "validate first" instead of
 * "pilot this" on a description whose only evidence is a feeling.
 */
const SUBJECTIVE_ONLY = [
  /\b(feels?|seems?|looks?)\s+(repetitive|tedious|annoying|slow|inefficient|painful|manual|wasteful|clunky)\b/,
  /\bit would be (nice|good|great|helpful)\b/,
  /\bi think (it|we|this) (would|could)\b/,
];

const UNKNOWN_MARKERS = [
  /\b(do|does|did)\s+not\s+know\b/, /\bdon'?t know\b/, /\bnot sure\b/, /\bunsure\b/,
  /\bunclear\b/, /\bunknown\b/, /\bhave(n'?t| not)\s+(checked|confirmed|verified|looked)\b/,
  /\bnot\s+(checked|confirmed|verified|measured|tracked)\b/, /\bno idea\b/,
  /\bwe (do not|don'?t) (currently )?(have|track|measure)\b/, /\bnot currently (have|tracked|measured)\b/,
  /\byet to be\b/, /\bto be confirmed\b/, /\btbd\b/,
];

/**
 * Flatten only the VALUES of confirmed_facts, never the keys.
 * Accepts the string / object / array shapes the eval suite actually uses.
 */
function factValues(facts) {
  const out = [];
  const walk = (v) => {
    if (v == null) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === 'object') return Object.values(v).forEach(walk);
    out.push(String(v));
  };
  walk(facts);
  return out;
}

/**
 * Split an unknown entry into (a) the topic it concerns and (b) nothing else.
 * Unknown topics are matched only against the readiness/risk "is this
 * knowable?" checks. They never feed architecture or value scoring.
 */
const UNKNOWN_TOPICS = {
  access: [/\baccess\b/, /\bpermission/, /\bapi\b/, /\bintegration/, /\bcredential/, /\bauth/],
  controls: [/\bcontrol/, /\bguardrail/, /\bsafeguard/, /\bapproval/, /\bgovernance/, /\baudit/],
  data: [/\bdata\b/, /\bquality\b/, /\bhistory\b/, /\blabel/, /\bcorpus\b/, /\bdocument/, /\brecord/],
  baseline: [/\bbaseline\b/, /\bvolume\b/, /\bfrequency\b/, /\bcost\b/, /\btime\b/, /\bmetric/],
  owner: [/\bowner/, /\baccountab/, /\bresponsib/, /\bsign-?off\b/],
  sensitivity: [/\bsensitiv/, /\bpii\b/, /\bprivacy\b/, /\bregulat/, /\bcompliance\b/, /\bconfidential/],
  policy: [/\bpolicy\b/, /\bpolicies\b/, /\brule/, /\bconflict/, /\bexception/],
  recovery: [/\brollback\b/, /\brecovery\b/, /\bundo\b/, /\breversib/],
};

function classifyUnknowns(list) {
  const topics = new Set();
  const labels = [];
  for (const raw of list || []) {
    const s = String(raw).replace(/[_-]+/g, ' ').toLowerCase();
    labels.push(String(raw));
    for (const [topic, pats] of Object.entries(UNKNOWN_TOPICS)) {
      if (pats.some((p) => p.test(s))) topics.add(topic);
    }
  }
  return { topics, labels };
}

function normalizeInput(raw) {
  const idea = String(raw.initial_idea || raw.original_idea || raw.idea || '').trim();
  const factsRaw = raw.confirmed_facts || {};
  const unknownsRaw = raw.intentionally_unknown || raw.unknowns || [];

  const ideaText = idea.toLowerCase();
  const factsText = factValues(factsRaw).join('\n').toLowerCase();
  const unknowns = classifyUnknowns(unknownsRaw);

  // The evidence channel: what the user has actually asserted.
  // This is the ONLY text architecture and value scoring may read.
  const evidence = [ideaText, factsText].filter(Boolean).join('\n');

  // In-prose unknown admissions ("I have not checked whether the API exists")
  // count as unknowns even though they arrived inside the idea text.
  const proseUnknown = UNKNOWN_MARKERS.some((p) => p.test(evidence));
  const proseTopics = new Set();
  if (proseUnknown) {
    const sentences = evidence.split(/[.;\n]/);
    for (const [topic, pats] of Object.entries(UNKNOWN_TOPICS)) {
      for (const sent of sentences) {
        if (UNKNOWN_MARKERS.some((p) => p.test(sent)) && pats.some((p) => p.test(sent))) {
          proseTopics.add(topic);
          unknowns.topics.add(topic);
        }
      }
    }
  }

  const wordCount = tokens(idea).length;
  const descriptiveOnly = DESCRIPTIVE_ONLY.some((p) => p.test(evidence));
  const buildIntent = !descriptiveOnly && BUILD_INTENT.some((p) => p.test(evidence));
  const subjectiveOnly = SUBJECTIVE_ONLY.some((p) => p.test(evidence));

  return {
    original_idea: idea,
    ideaText,
    factsText,
    evidence,               // idea + fact VALUES. Drives architecture + value.
    /**
     * TWO TIERS OF UNKNOWN, and the distinction matters a lot.
     *
     * unknownTopics  = everything the user flagged as not-yet-known, from the
     *                  intentionally_unknown list. These LOWER CONFIDENCE and
     *                  populate open_questions. They do NOT block a pilot,
     *                  because "we have not measured handle time yet" is
     *                  something the pilot itself measures.
     *
     * proseUnknownTopics = the user explicitly said in their own description
     *                  that they do not know something ("I do not know whether
     *                  we can programmatically access either system"). That is
     *                  a stated blocker and CAN block a pilot or fire a gate.
     *
     * v0.1 collapsed these into one bucket, which is why it returned
     * PREPARE_DEPENDENCIES 6 times where the golden set expected
     * PROCEED_TO_PILOT 10 times. Every case has open questions. Only some
     * have admitted blockers.
     */
    unknownTopics: unknowns.topics,
    proseUnknownTopics: proseTopics,
    unknownLabels: unknowns.labels,
    hasFacts: factsText.length > 0,
    wordCount,
    buildIntent,
    subjectiveOnly,
    descriptiveOnly,
    quantities: extractQuantities(evidence),
    unknownAdmittedInProse: proseUnknown,
  };
}

/** Convenience: does the evidence channel contain any of these patterns? */
function ev(input, patterns) {
  return patterns.some((p) => matches(input.evidence, p));
}

module.exports = { normalizeInput, ev, UNKNOWN_MARKERS };
