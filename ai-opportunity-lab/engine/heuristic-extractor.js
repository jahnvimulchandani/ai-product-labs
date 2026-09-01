'use strict';

/**
 * HEURISTIC EXTRACTOR (the fallback prior)
 *
 * This is where the v0.1 and v0.2 keyword work belongs. Not as the decision
 * layer, where it capped generalisation at 1/8 on blind cases, but as a weak
 * prior that fills fields at ASSUMED strength when no model is available.
 *
 * Everything here is overridden by an LLM extraction or a user answer, because
 * contract.set refuses to let a weaker evidence status overwrite a stronger
 * one. So a wrong guess here costs a clarification question, not a wrong
 * verdict. That is the entire difference between v0.2 and v0.3: same patterns,
 * radically lower blast radius.
 *
 * It also keeps the eval suite runnable with no API key, which matters because
 * a rule regression should never be hidden behind model variance.
 */

const m = (t, re) => re.test(t);
const CADENCE = { hour: 2000, day: 250, week: 52, month: 12, quarter: 4, year: 1 };

function quantities(t) {
  const q = {};
  const cadences = [];
  const re = /(\d[\d,]*|\ba\b|\bone\b|\bseveral\b|\bmany\b)\s*(?:[a-z-]+\s+){0,5}?(?:times\s+)?(?:per|a|each|every)\s+(hour|day|week|month|quarter|year)/g;
  let c;
  while ((c = re.exec(t)) !== null) {
    const n = /^(a|one)$/.test(c[1]) ? 1 : /^(several|many)$/.test(c[1]) ? 3 : Number(String(c[1]).replace(/,/g, ''));
    if (Number.isFinite(n)) cadences.push(n * (CADENCE[c[2]] || 1));
  }
  const bare = [[/\b(daily|every day|constantly)\b/, 250], [/\b(weekly|every week)\b/, 52],
    [/\bevery few weeks\b/, 17], [/\b(monthly|once a month)\b/, 12], [/\bquarterly\b/, 4], [/\b(annually|yearly)\b/, 1]];
  for (const [r, v] of bare) if (r.test(t)) cadences.push(v);
  if (cadences.length) q.frequency_per_year = Math.max(...cadences);

  const d = t.match(/(\d[\d,]*|\bone\b|\btwo\b|\bthree\b|\bfour\b|\bfive\b|\bsix\b|\bten\b)\s*(minutes?|mins?|hours?|hrs?)\b/);
  const W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10 };
  if (d) {
    const n = W[d[1]] != null ? W[d[1]] : Number(String(d[1]).replace(/,/g, ''));
    if (Number.isFinite(n)) q.minutes_per_occurrence = /^h/.test(d[2]) ? n * 60 : n;
  } else if (/\b(many hours|several hours|hours)\b/.test(t)) q.minutes_per_occurrence = 120;

  const p = t.match(/(\d[\d,]*)[-\s]person\b/) || t.match(/\b(\d[\d,]*)\s*(?:employees|staff|people|reps|agents|engineers|nurses|researchers|analysts)\b/) || t.match(/\bteam of\s+(\d[\d,]*)\b/);
  if (p) q.people_affected = Number(String(p[1]).replace(/,/g, ''));
  return q;
}

function heuristicExtract(idea) {
  const t = String(idea || '').toLowerCase();
  const f = {};
  const put = (id, value, why) => { if (value !== undefined && value !== null) f[id] = { value, why }; };

  for (const [k, v] of Object.entries(quantities(t))) put(k, v, 'parsed quantity');

  // --- task shape -----------------------------------------------------
  if (m(t, /\b(nobody|no one) knows who\b/) || m(t, /\bunclear (who|ownership)\b/) || m(t, /\bfinal say\b/) || m(t, /\bapprovals? (stall|bounce)\b/)) {
    put('organisational_failure', true, 'ownership language');
  }

  const languageWork = m(t, /\b(summari[sz]e|draft|rewrite|themes|synthesi[sz]e|digest|notes|transcript|memo|narrative|answers?)\b/);
  const mechanical = m(t, /\b(if|when|whenever)\b[^.?!]{0,80}\b(send|escalate|assign|route|remind|raise|flag|create)\b/)
    || m(t, /\bthreshold|reorder point|template|fixed rule\b/);
  if (languageWork && !mechanical) put('interpretation_complexity', 'HIGH', 'language task');
  else if (mechanical && !languageWork) put('interpretation_complexity', 'NONE', 'explicit trigger and action');

  if (m(t, /\b(predict|likelihood|likely to|propensity|forecast|risk score)\b/)) put('prediction_need', 'RANK', 'prediction language');
  else if (m(t, /\banomal(y|ies|ous)|outlier|unusual pattern\b/)) put('prediction_need', 'ANOMALY', 'anomaly language');
  else if (m(t, /\b(classif|categoris|categoriz|rank)\w*\b/)) put('prediction_need', 'CLASSIFY', 'classification language');
  if (m(t, /\byears? of\b.{0,40}\b(outcomes?|labels?|history|results?)\b/) || m(t, /\blabell?ed\b/)) put('labelled_history_available', true, 'stated history');

  const corpus = m(t, /\b(sops?|runbook|knowledge base|documentation|manual|procedures?|policy (library|document)|answer library|help ?cent(er|re))\b/);
  const changing = m(t, /\b(revised|updated|changes?)\b[^.?!]{0,30}\b(quarterly|monthly|weekly|often|frequently|regularly|every)\b/) || m(t, /\bevery few weeks\b/) || m(t, /\bmost months\b/);
  if (corpus) put('knowledge_grounding', changing ? 'PROPRIETARY_CHANGING' : 'PROPRIETARY_STATIC', 'document corpus');
  if (m(t, /\b(cite|citation|source section|page reference|shows? the source|points? back to|points? to the (exact )?(clause|section))\b/)) {
    put('source_traceability_required', true, 'traceability requirement');
  }

  const stageVerbs = [/\bclassif/, /\bretriev/, /\bpulls?\b/, /\bdrafts?\b/, /\breviews?\b/, /\bapproves?\b/, /\bescalat/, /\bsends?\b/, /\bcreates?\b/, /\bdecides?\b/, /\breads?\b/];
  const stages = stageVerbs.filter((r) => r.test(t)).length;
  if (stages >= 2) put('stage_count', stages, `${stages} stage verbs`);
  if (m(t, /\b(decides? (what|which)|works? out which|figure(s)? out|by itself|on its own|whatever it needs)\b/)) {
    put('dynamic_planning_required', true, 'self-directed language');
    put('path_variability', 'VARIABLE', 'self-directed language');
  } else if (stages >= 3) put('path_variability', 'BRANCHING', 'multiple known stages');
  else if (mechanical) put('path_variability', 'FIXED', 'explicit trigger and action');

  if (m(t, /\b(updates?|writes?|creates? (a )?(ticket|record|entry|purchase order)|posts?|sends?|raises?|issues?)\b/)) put('tool_use', 'WRITE', 'write verb');
  else if (m(t, /\b(reads?|pulls?|retrieves?|looks? up)\b/)) put('tool_use', 'READ', 'read verb');

  // --- risk -----------------------------------------------------------
  const external = m(t, /\b(send|post|issue|email|deliver)s?\b[^.?!]{0,50}\b(customer|client|candidate|applicant|policyholder|vendor|supplier|patient|member|them)\b/)
    || m(t, /\b(termination|cancellation|decision|outcome|rejection) (notice|letter)\b/);
  if (external) put('action_target', 'EXTERNAL_COMMUNICATION', 'external send');
  else if (m(t, /\b(updates?|writes? to|creates? (a )?(record|ticket|entry))\b/)) put('action_target', 'INTERNAL_RECORD', 'internal write');

  /**
   * Only positive statements about review are extracted. Silence stays UNKNOWN.
   * This is the fix for the worst class of v0.1 bug: treating "no review words
   * appeared" as "no review happens" produced both false HIGH-risk gates on
   * harmless text and false LOW-risk clears on dangerous text.
   */
  if (m(t, /\b(no|without|nobody|no one)\b[^.?!]{0,40}\b(human|person|approval|review|check|checking|adjuster|manager|oversight|sign-?off)\b/)
    || m(t, /\b(fully )?autonomous(ly)?\b/) || m(t, /\bby itself\b/) || m(t, /\bend to end with no\b/)) {
    put('human_review_point', 'NONE', 'explicit no-review statement');
    put('autonomy_requested', 'FULL_AUTONOMY', 'explicit no-review statement');
  } else if (m(t, /\b(approve|review|check)s?\b[^.?!]{0,30}\b(every|each|all|before)\b/) || m(t, /\b(rep|manager|engineer|human|person)s?\s+(approve|review|verif)\w*/)) {
    put('human_review_point', 'EVERY_CASE', 'explicit approval step');
    put('autonomy_requested', 'APPROVE_EACH', 'explicit approval step');
  }

  if (m(t, /\b(terminat|dismiss|reject)\w*\b[^.?!]{0,30}\b(contract|candidate|applicant|employee|application)\b/)
    || m(t, /\b(deny|denies|denied|approve or deny)\b[^.?!]{0,25}\b(claim|application|request)\b/)
    || m(t, /\b(credit|loan) (decision|score|limit)\b/) || m(t, /\beligibilit/)) {
    put('rights_impact', true, 'rights-affecting decision');
    put('stakes', 'HIGH', 'rights-affecting decision');
  }
  if (m(t, /\b(medical|clinical|patient|health record)\b/) && !m(t, /\bno(t)? .{0,25}medical advice\b/)) put('sensitive_data', 'REGULATED', 'health data');
  else if (m(t, /\b(resumes?|cvs?|job applications?|loan applications?|credit (history|file)|payroll|salar\w+|insurance claims?)\b/)) put('sensitive_data', 'REGULATED', 'regulated records');
  else if (m(t, /\b(personal data|customer records?|employee records?|pii|privacy)\b/)) put('sensitive_data', 'PERSONAL', 'personal data');

  if (m(t, /\b(public web|the internet|crawls?|scrapes?|third-?party (review )?sites?|incoming|inbound|external)\b[^.?!]{0,30}\b(email|content|site|review|message)?\b/)
    && m(t, /\b(public web|internet|crawl|scrape|third-?party|external email|inbound email|vendor emails?|review sites?)\b/)) {
    put('untrusted_input', true, 'external content source');
  }
  if (m(t, /\b(irreversible|cannot be undone|once sent)\b/) || external) put('reversibility', 'IRREVERSIBLE', 'external or stated irreversible');
  if (m(t, /\b(rollback|roll back|undo|recall|revert)\b/)) put('recovery_path_exists', true, 'stated recovery');

  // --- problem and value ----------------------------------------------
  if (m(t, /\b(everyone is|competitors? (have|launched)|look modern|keep up|agents are the future)\b/)) put('demand_evidence', 'COMPETITOR_DRIVEN', 'hype framing');
  else if (m(t, /\b(no|nobody|no one)\b[^.?!]{0,30}\b(customer|user)s?\b[^.?!]{0,20}\b(asked|requested|complained)\b/) || m(t, /\bno strong customer requests\b/)) put('demand_evidence', 'NONE', 'stated absence of demand');
  else if (m(t, /\b(keeps? asking|complain|requested|asked for)\b/)) put('demand_evidence', 'REQUESTED', 'stated demand');

  const quantified = f.frequency_per_year != null && f.minutes_per_occurrence != null;
  if (quantified) put('pain_evidence_level', 'QUANTIFIED', 'frequency and duration stated');
  else if (m(t, /\b(feels?|seems?) (repetitive|tedious|slow|inefficient)\b/)) put('pain_evidence_level', 'ANECDOTAL', 'subjective framing');
  else if (m(t, /\b(keeps?|constantly|every week|repeatedly|always)\b/) || f.frequency_per_year != null) put('pain_evidence_level', 'REPEATED_PATTERN', 'recurring language');

  if (m(t, /\b(revenue|conversion|upsell|deal)\b/)) put('value_mechanism', 'REVENUE', 'revenue language');
  else if (m(t, /\b(churn|retention|renewal)\b/)) put('value_mechanism', 'RETENTION', 'retention language');
  else if (m(t, /\b(error|mistake|accuracy|rework|missed)\b/)) put('value_mechanism', 'ERROR_REDUCTION', 'quality language');
  else if (m(t, /\b(hours?|minutes?|time|faster|manual|manually|by hand)\b/)) put('value_mechanism', 'TIME_SAVED', 'effort language');

  if (m(t, /\b(employees?|staff|team|nurses?|engineers?|reps?|writers?|clerks?|supervisors?|managers?|researchers?)\b/)) put('affected_user', 'internal team', 'internal role named');
  else if (m(t, /\b(customers?|callers?|applicants?|users?|policyholders?)\b/)) put('affected_user', 'customer', 'external role named');

  // --- readiness -------------------------------------------------------
  if (m(t, /\b(lives?|spread|scattered) (in|across)\b/) || m(t, /\b(three|four|five|multiple|several) (systems?|tools?|spreadsheets?)\b/)) put('data_fragmented', true, 'fragmentation language');
  if (m(t, /\b(we (have|keep|log|store)|years? of|access already exists)\b/)) put('data_available', true, 'stated data');
  if (m(t, /\b(do not|don'?t|have not|haven'?t)\b[^.?!]{0,50}\b(know|checked|confirmed)\b[^.?!]{0,50}\b(access|api|permission)/)) put('integration_access_confirmed', false, 'admitted access gap');
  else if (m(t, /\b(api|access|permissions?)\b[^.?!]{0,25}\b(exists?|available|already)\b/)) put('integration_access_confirmed', true, 'stated access');

  return f;
}

module.exports = { heuristicExtract };
