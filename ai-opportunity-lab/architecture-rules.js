'use strict';

const { matches } = require('./text');

/**
 * WEIGHTED ARCHITECTURE SCORER
 *
 * WHY THIS REPLACES v0.1's SELECTOR
 *
 * v0.1 pushed candidates into an array in a fixed order, marked every match
 * as 'STRONG', then stable-sorted. Because sort is stable and all fits were
 * equal, the winner was simply whichever pattern got pushed first, and
 * PROCESS_OR_HUMAN_CHANGE was pushed first. Consequences measured on the
 * golden set:
 *
 *   - TC-04 had four RAG signals (sop, source section, latest approved) and
 *     one incidental hit on the word "policy". It returned PROCESS.
 *   - PROCESS won 9 of 24 golden cases and 6 of 8 hold-out cases. It was an
 *     attractor state, not a recommendation.
 *   - There was no way to express "RAG at 9 points, ASSISTIVE at 4" so
 *     `simpler_alternative` was picked by array position too.
 *
 * v0.2 scores every pattern independently, applies combination bonuses where
 * the framework says two signals together mean something the individual
 * signals do not, and ranks by score. Scores are returned in the output so a
 * reviewer can see WHY a pattern won, which is a framework requirement
 * (section 8, keep evidence visible) that v0.1 could not satisfy.
 *
 * A floor is applied: if nothing clears MIN_SCORE the answer is UNDETERMINED,
 * not "process change". Guessing an architecture from no signal is exactly
 * the failure mode this product exists to prevent.
 */

const ARCH = {
  PROCESS: 'PROCESS_OR_HUMAN_CHANGE',
  DETERMINISTIC: 'DETERMINISTIC_AUTOMATION',
  PREDICTIVE: 'PREDICTIVE_CLASSICAL_ML',
  ASSISTIVE: 'ASSISTIVE_LLM',
  RAG: 'RETRIEVAL_GROUNDED_AI',
  WORKFLOW: 'STRUCTURED_AI_WORKFLOW',
  AGENTIC: 'AGENTIC_SYSTEM',
};

const MIN_SCORE = 3;

/**
 * Lexicons are [pattern, weight].
 * Weight 3   = near-decisive for this pattern
 * Weight 2   = strong indicator
 * Weight 1   = weak, only meaningful in combination
 *
 * Deliberately NO verbatim strings lifted from the golden cases. v0.1 scored
 * on literals like 'i want to add an ai copilot to our app' and '25 calls per
 * week', which is why it hit 54% in-sample and 12% out-of-sample.
 */
const LEXICON = {
  [ARCH.PROCESS]: [
    [/\b(nobody|no one|not clear who|unclear who)\s+(knows who\s+)?(owns|approves|decides|is responsible)/, 3],
    ['unclear ownership', 3], ['no clear owner', 3], ['decision rights', 3],
    ['final say', 2], [/\bapprovals?\s+(stall|bounce|sit|get stuck)/, 3],
    [/\b(bounce|ping-?pong)\s+between\b/, 2], ['bad handoff', 2], ['handoff', 1],
    [/\bnobody (owns|is accountable)/, 3],
    [/\b(process|workflow) is (unclear|undefined|broken)/, 2],
    [/\b(training|onboarding) (gap|issue|problem)/, 2],
    [/\bpeople (forget|skip|ignore) the\b/, 2],
  ],
  [ARCH.DETERMINISTIC]: [
    [/\bif\b[^.?!]{0,90}\bthen\b/, 3],
    [/\b(if|when|whenever|once)\b[^.?!]{0,70}\b(send|escalate|notify|assign|flag|remind|create|route|trigger)\b/, 3],
    [/\b\d+\s*(minutes?|hours?|days?|weeks?)\s*(after|past|later|overdue|unassigned|without)/, 3],
    [/\b(after|past)\s+(its\s+|the\s+)?(due date|deadline)/, 3],
    ['threshold', 2], ['fixed rule', 3], ['rule-based', 3], ['routing rules', 3],
    [/\broute (them )?based on\b/, 2], ['spreadsheet formula', 3], ['explicit branches', 3],
    ['reminder', 2], ['template', 2], [/\bsame (email|message|steps) every time\b/, 3],
    [/\bstill (unpaid|open|unassigned|pending)\b/, 2],
    [/\bspreadsheet\b/, 2], [/\bcombin(e|es|ing) .{0,30}\b(numbers|figures|columns|cells|fields)\b/, 3],
    [/\breads? the (sheet|spreadsheet|file|csv)\b/, 2],
    [/\bfixed (sequence|schedule|cadence)\b/, 3],
    [/\bday\s*[0-9]+\b/, 2], [/\bno (judgement|judgment|interpretation) (is )?(needed|required)\b/, 3],
  ],
  [ARCH.PREDICTIVE]: [
    ['predict', 3], ['prediction', 3], ['propensity', 3], ['forecast', 3],
    [/\banomal(y|ies|ous)\b/, 3], [/\bflag(s|ging)? (anomalous|unusual|outlier|suspicious)\b/, 3],
    [/\bpatterns?\b/, 1], [/\bevents?\b/, 1],
    [/\blikelihood\b/, 3], [/\blikely to\b/, 2], [/\brisk score\b/, 3], [/\bscore (new|each|every|incoming)\b/, 3],
    [/\brank(ing)? (new |the )?(leads|accounts|cases|applicants|customers)\b/, 3],
    ['classification', 2], ['classify', 1], [/\bcategoriz(e|ing|ation)\b/, 2],
    [/\b(labelled|labeled|corrected) (data|labels|categories|outcomes|examples)\b/, 3],
    [/\bhistorical\b/, 2], [/\byears? of\b/, 1], [/\boutcome labels?\b/, 3],
    [/\bwhich (ones?|customers?|leads?|accounts?) (will|are likely)/, 3],
  ],
  [ARCH.ASSISTIVE]: [
    [/\bsummari[sz]e\b/, 3], [/\bsummar(y|ies)\b/, 2], [/\bsynthesi[sz]e\b/, 3],
    ['draft', 2], [/\bre-?write\b/, 2], [/\bthemes?\b/, 2], ['digest', 2],
    [/\bextract (the )?(key|main|common)\b/, 2], ['transcript', 2],
    [/\b(interview|survey) (recordings|responses|notes|transcripts)\b/, 3],
    ['pain points', 2], [/\bturn .{0,40}(notes|recordings|calls|responses) into\b/, 3],
    [/\bwrite(s)? (a|the) (memo|summary|update|note|report|paragraph|narrative)\b/, 3],
    [/\bdraft (a |the )?(postmortem|report|summary|memo|response|reply|update)\b/, 3],
    [/\binsight digest\b/, 3],
  ],
  [ARCH.RAG]: [
    [/\bsops?\b/, 3], ['runbook', 3], ['knowledge base', 3], [/\bdocumentation\b/, 2],
    [/\b(equipment |user |operating )?manual\b/, 2], [/\bpolicy (document|library|pages?)\b/, 3],
    ['source section', 3], [/\bcitations?\b/, 3], [/\bcite\b/, 3], [/\bpage reference\b/, 3],
    [/\bshows? the source\b/, 3], [/\blatest approved\b/, 3], [/\bapproved source\b/, 3],
    [/\bhelp[- ]cent(er|re)\b/, 3], [/\banswers? questions? (about|using|from)\b/, 2],
    [/\brefuse\b/, 2], [/\b(current|latest|newest|up to date) (version|approved|policy|document)/, 3],
    [/\b(revised|updated|changes) (every|quarterly|monthly|often|frequently)/, 2],
    [/\b\d{2,}[- ]page\b/, 2], [/\bwhere (it|the answer) came from\b/, 3],
    [/\b(newest|latest|current|most recent)\s+(\w+\s+){0,2}(version|approved|signed-?off|copy|document)\b/, 3],
    [/\bpoints? to the (exact )?(clause|section|paragraph|page|source|article)\b/, 3],
    [/\b(written )?procedures?\b/, 2], [/\bsigned-?off\b/, 2],
    [/\b(revised|updated|changes?) (often|frequently|regularly|every)\b/, 2],
    [/\bask(s|ing)? for (opening )?(hours|availability|pricing|information|details)\b/, 2],
  ],
  [ARCH.WORKFLOW]: [
    [/\bhuman approval\b/, 3], [/\b(rep|agent|manager|reviewer)s? (approve|review)s? (every|each|all)\b/, 3],
    [/\bapproves? before\b/, 3], [/\breview(s|ed)? before (it|they|the)\b/, 3],
    [/\bthen (draft|send|route|escalate|create)\b/, 2],
    [/\bmulti-?step\b/, 2], [/\bstages?\b/, 1], [/\bflag exceptions?\b/, 3],
    [/\bprepare (the )?refund\b/, 3], ['refund', 1], ['postmortem', 2], ['status report', 2],
    [/\bescalate\b/, 1], [/\bretrieve (the )?(account|customer|order|record)\b/, 3],
    [/\bstatus report\b/, 2], [/\bblockers?\b/, 1], [/\bmilestones?\b/, 1],
    [/\bassembles? .{0,60}\binto a draft\b/, 3],
    [/\bpulls? (the )?(customer|account|order)\b/, 2],
    [/\breceptionist\b/, 2], [/\bcallbacks?\b/, 2],
    [/\bappointment (availability|booking|request|slot)\b/, 2],
    [/\bmissed calls?\b/, 2], [/\breconcile\b/, 2], [/\bmatch(ing)? .{0,25}\bto\b.{0,25}\b(invoices?|records?|orders?)\b/, 3],
  ],
  [ARCH.AGENTIC]: [
    // "so supervisors can investigate" is a human investigating, not the
    // system. Only the system investigating is an agentic signal.
    [/\b(agent|system|ai|model|it)\s+(can |should |will |would |to )?investigat/, 3],
    [/\binvestigat/, 1],
    [/\bdecide (what|which|how much|whether)\b/, 3],
    [/\bfigure(s)? out (on its own|by itself|what)\b/, 3], [/\bchooses? (the )?next\b/, 3],
    [/\bon its own\b/, 2], [/\bacross (multiple |several |different )?systems\b/, 3],
    [/\bmultiple systems\b/, 3], [/\bresearch(es|ing)? (competitors|the market|online)\b/, 3],
    [/\bpublic web\b/, 3], [/\bbrowse(s)? the (web|internet)\b/, 3],
    [/\bwhatever (data|information|tools) it needs\b/, 3],
    [/\bpath (is|cannot be) (variable|unpredictable|predetermined)\b/, 3],
  ],
};

/**
 * Combination bonuses.
 * The framework's architecture rules are conjunctive: retrieval grounding is
 * indicated by "proprietary corpus AND (freshness OR traceability)", not by
 * either alone. v0.1 could not express this because every hit was flat.
 */
const COMBOS = [
  {
    pattern: ARCH.RAG, bonus: 3,
    when: (t) => matches(t, /\b(sop|runbook|knowledge base|documentation|manual|policy (document|library))/)
      && matches(t, /\b(cite|citation|source section|page reference|latest approved|current version|shows? the source|revised|updated)/),
    why: 'Proprietary corpus combined with freshness or source-traceability requirements.',
  },
  {
    pattern: ARCH.PREDICTIVE, bonus: 3,
    when: (t) => matches(t, /\b(years? of|historical|labell?ed|corrected|outcomes?|history)\b/)
      && matches(t, /\b(predict|likelihood|likely to|rank|score|classif|categoriz|propensity|forecast)/),
    why: 'Historical labelled data combined with a prediction or ranking task.',
  },
  {
    pattern: ARCH.WORKFLOW, bonus: 3,
    when: (t) => {
      const verbs = [/\bclassif/, /\bretriev/, /\bdraft/, /\breview/, /\bapprov/, /\bescalat/, /\bsend/, /\bcreate/, /\blook ?up/];
      return verbs.filter((v) => matches(t, v)).length >= 3;
    },
    why: 'Three or more known, orderable stages, which is a workflow rather than open-ended agency.',
  },
  {
    pattern: ARCH.AGENTIC, bonus: 2,
    when: (t) => {
      const sources = [/\bcrm\b/, /\bsupport (history|tickets)\b/, /\busage (events|data)\b/, /\bbilling\b/, /\bemail/, /\bcalendar/, /\bproduct database\b/, /\bweb\b/];
      return sources.filter((s) => matches(t, s)).length >= 3;
    },
    why: 'Three or more distinct data sources implies dynamic tool selection.',
  },
  {
    pattern: ARCH.DETERMINISTIC, bonus: 2,
    when: (t) => matches(t, /\b(if|when|whenever|once|after)\b/)
      && matches(t, /\b(send|escalate|notify|assign|flag|remind|route)\b/)
      && !matches(t, /\b(judgement|judgment|interpret|nuance|tone|context-dependent)\b/),
    why: 'Explicit trigger and explicit action with no interpretation step.',
  },
];

/**
 * Penalties. Framework section 10.4 (agentic exclusion) says an agent must
 * not be preferred merely because a workflow has several steps.
 */
const PENALTIES = [
  {
    pattern: ARCH.AGENTIC, amount: -3,
    when: (t) => matches(t, /\b(human approval|approves? (every|each|all)|reviews? before|read-?only)\b/),
    why: 'Mandatory human approval on every step contradicts open-ended agency.',
  },
  {
    pattern: ARCH.PROCESS, amount: -2,
    when: (t) => matches(t, /\b(volume|per week|per day|thousands|hours (a|per) week)\b/),
    why: 'A quantified volume problem is less likely to be purely organisational.',
  },
];

const ROLES = {
  [ARCH.PROCESS]: {
    role: 'Clarify ownership, policy, or workflow before automating.',
    expected_value: 'Can remove delay caused by unclear responsibility or handoffs.',
    implementation_burden: 'LOW', ongoing_burden: 'LOW',
    fit_summary: 'The failure looks organisational rather than computational.',
  },
  [ARCH.DETERMINISTIC]: {
    role: 'Execute stable rules, reminders, templates, routing, or explicit branches.',
    expected_value: 'Can remove repetitive work where the trigger and action are both fixed.',
    implementation_burden: 'LOW', ongoing_burden: 'LOW',
    fit_summary: 'The workflow has explicit triggers and no interpretation step.',
  },
  [ARCH.PREDICTIVE]: {
    role: 'Predict, rank, classify, or flag cases from historical structured data.',
    expected_value: 'Can improve prioritisation or categorisation where labels exist.',
    implementation_burden: 'MEDIUM', ongoing_burden: 'MEDIUM',
    data_needs: ['Historical labelled or feature-rich records'],
    fit_summary: 'The core task is prediction or classification, not generation.',
  },
  [ARCH.ASSISTIVE]: {
    role: 'Summarise, draft, extract themes, or synthesise language for human review.',
    expected_value: 'Can reduce manual synthesis effort while a human keeps the decision.',
    implementation_burden: 'LOW', ongoing_burden: 'MEDIUM',
    human_role: 'Human verifies outputs and owns the final decision.',
    fit_summary: 'Language interpretation is needed but autonomous action is not.',
  },
  [ARCH.RAG]: {
    role: 'Ground answers or drafts in approved current knowledge with source references.',
    expected_value: 'Can improve self-service where traceability to a source matters.',
    implementation_burden: 'MEDIUM', ongoing_burden: 'MEDIUM',
    data_needs: ['Versioned knowledge base or document corpus'],
    key_risks: ['Outdated sources', 'Unsupported answers', 'Citation mismatch'],
    fit_summary: 'Answers depend on changing proprietary knowledge and must cite a source.',
  },
  [ARCH.WORKFLOW]: {
    role: 'Orchestrate known stages such as classify, retrieve, draft, review, escalate.',
    expected_value: 'Can reduce cycle time while keeping checkpoints explicit.',
    implementation_burden: 'MEDIUM', ongoing_burden: 'MEDIUM',
    human_role: 'Human approves external or high-impact actions.',
    fit_summary: 'Multiple known stages that can each be controlled explicitly.',
  },
  [ARCH.AGENTIC]: {
    role: 'Dynamically investigate, choose next steps, and use tools toward a goal.',
    expected_value: 'Can handle investigations whose path cannot be predetermined.',
    implementation_burden: 'HIGH', ongoing_burden: 'HIGH',
    tool_needs: ['Scoped tool access', 'Observability', 'Recovery path'],
    key_risks: ['Wrong tool use', 'Unsupported conclusions', 'Excessive autonomy'],
    fit_summary: 'The task requires dynamic investigation or tool selection.',
  },
};

function makeCandidate(pattern, score, why, fit) {
  const base = ROLES[pattern] || {};
  return {
    pattern,
    score: Math.round(score * 10) / 10,
    matched_signals: why.signals,
    bonuses_applied: why.bonuses,
    role: base.role || '',
    expected_value: base.expected_value || 'Depends on measured baseline and adoption.',
    implementation_burden: base.implementation_burden || 'UNKNOWN',
    ongoing_burden: base.ongoing_burden || 'UNKNOWN',
    data_needs: base.data_needs || [],
    tool_needs: base.tool_needs || [],
    human_role: base.human_role || 'Human reviews important outcomes and exceptions.',
    key_risks: base.key_risks || [],
    fit_summary: base.fit_summary || '',
    current_fit: fit,
  };
}

function selectArchitecture(input, scores, risk) {
  // Only the evidence channel is read. Unknowns are deliberately excluded.
  const t = input.evidence;

  const raw = {};
  for (const [pattern, entries] of Object.entries(LEXICON)) {
    let score = 0;
    const signals = [];
    for (const [pat, w] of entries) {
      if (matches(t, pat)) {
        score += w;
        signals.push(pat instanceof RegExp ? pat.source.slice(0, 44) : pat);
      }
    }
    raw[pattern] = { score, signals, bonuses: [] };
  }

  for (const c of COMBOS) {
    if (c.when(t)) { raw[c.pattern].score += c.bonus; raw[c.pattern].bonuses.push(c.why); }
  }
  for (const p of PENALTIES) {
    if (p.when(t)) { raw[p.pattern].score += p.amount; raw[p.pattern].bonuses.push('PENALTY: ' + p.why); }
  }

  const ranked = Object.entries(raw)
    .map(([pattern, w]) => ({ pattern, ...w }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  /**
   * HUMAN-LED FALLBACK
   *
   * Framework 16.5 says that when the critical decision must stay human, the
   * answer is not "no architecture", it is "AI only in a supporting role:
   * evidence gathering, drafting, summarisation, review support".
   *
   * v0.1 returned PROCESS_OR_HUMAN_CHANGE for TC-11 and TC-12 because nothing
   * matched and PROCESS was the default. That reads as "fix your org chart"
   * in response to "should I let AI fire people", which is the wrong advice
   * even though the decision state was right.
   */
  if (risk.humanLedRequired) {
    const supportOrder = [ARCH.ASSISTIVE, ARCH.RAG, ARCH.WORKFLOW, ARCH.PREDICTIVE];
    const scored = supportOrder
      .map((pattern) => ({ pattern, ...raw[pattern] }))
      .sort((a, b) => b.score - a.score);
    const pick = scored[0];
    const cands = scored.map((c) => makeCandidate(c.pattern, c.score, c,
      c.pattern === pick.pattern ? 'STRONG' : 'VIABLE'));
    cands.forEach((c) => {
      c.role = 'Supporting role only. ' + c.role;
      c.human_role = 'The accountable decision and the external action remain with a human.';
    });
    return {
      best_current_fit: pick.pattern,
      undetermined: false,
      constrained_to_supporting_role: true,
      reason: 'A hard risk gate keeps the critical decision human-led, so AI is scoped to supporting sub-tasks.',
      simpler_alternative: null,
      future_option: null,
      candidates: cands.slice(0, 4),
      scores: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.score]).filter(([, v]) => v > 0)),
    };
  }

  const top = ranked[0];
  if (!top || top.score < MIN_SCORE) {
    return {
      best_current_fit: null,
      undetermined: true,
      reason: 'No architecture signal reached the minimum evidence threshold.',
      simpler_alternative: null,
      future_option: null,
      candidates: ranked.slice(0, 3).map((c) => makeCandidate(c.pattern, c.score, c, 'WEAK')),
      scores: Object.fromEntries(ranked.map((c) => [c.pattern, Math.round(c.score * 10) / 10])),
    };
  }

  // Framework 10.4: agentic is never the current path when readiness is
  // unproven or a risk gate blocks autonomous execution.
  const agenticBlocked = risk.autonomousExecutionBlocked
    || scores.readiness === 'LOW' || scores.readiness === 'UNKNOWN';

  const candidates = ranked.map((c) => {
    let fit = c.score >= top.score * 0.75 ? 'STRONG' : c.score >= MIN_SCORE ? 'VIABLE' : 'WEAK';
    if (c.pattern === ARCH.AGENTIC && agenticBlocked) fit = 'FUTURE_ONLY';
    return makeCandidate(c.pattern, c.score, c, fit);
  });

  let best = candidates.find((c) => c.current_fit === 'STRONG')
    || candidates.find((c) => c.current_fit === 'VIABLE')
    || candidates[0];

  // Complexity ladder (framework tie-break: "simpler wins without incremental
  // proof"). If a simpler pattern is within one point of the winner, prefer it.
  const LADDER = [ARCH.PROCESS, ARCH.DETERMINISTIC, ARCH.PREDICTIVE, ARCH.ASSISTIVE, ARCH.RAG, ARCH.WORKFLOW, ARCH.AGENTIC];
  const rankOf = (p) => LADDER.indexOf(p);
  for (const c of candidates) {
    if (c.current_fit === 'FUTURE_ONLY') continue;
    // The simpler candidate must ALSO clear the evidence floor. Without this
    // guard a 2-point RETRIEVAL signal displaced a 3-point WORKFLOW signal on
    // TC-14 purely because it sits earlier on the complexity ladder.
    if (rankOf(c.pattern) < rankOf(best.pattern) && c.score >= MIN_SCORE && c.score >= best.score - 1) best = c;
  }

  const simpler = candidates.find((c) => rankOf(c.pattern) < rankOf(best.pattern) && c.current_fit !== 'FUTURE_ONLY') || null;
  const future = candidates.find((c) => rankOf(c.pattern) > rankOf(best.pattern)) || null;

  return {
    best_current_fit: best.pattern,
    undetermined: false,
    simpler_alternative: simpler ? simpler.pattern : null,
    future_option: future ? future.pattern : null,
    candidates: candidates.slice(0, 4),
    scores: Object.fromEntries(ranked.map((c) => [c.pattern, Math.round(c.score * 10) / 10])),
  };
}

module.exports = { ARCH, selectArchitecture, MIN_SCORE };
