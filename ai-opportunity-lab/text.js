'use strict';

/**
 * Low-level text utilities.
 *
 * WHY THIS FILE EXISTS
 * v0.1 matched with `String.includes()`. That has no word boundaries, so
 * 'rule' matched 'policy_conflict_rules', 'predict' matched 'unpredictable',
 * and 'sop' matched 'gossip'. Every downstream rule inherited those false
 * positives. Matching is now boundary-aware and phrase-aware.
 */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const RE_CACHE = new Map();

/**
 * Turn a phrase into a boundary-anchored regex.
 * Spaces become \s+ so "help center" also matches "help  center".
 * Boundaries are only applied where the edge character is a word character,
 * so phrases like "day 0" or "c++" still behave.
 */
function phraseToRegex(phrase) {
  if (RE_CACHE.has(phrase)) return RE_CACHE.get(phrase);
  const body = escapeRe(phrase.toLowerCase()).replace(/\\?\s+/g, '\\s+');
  const left = /^\w/.test(phrase) ? '\\b' : '';
  const right = /\w$/.test(phrase) ? '\\b' : '';
  const re = new RegExp(left + body + right, 'i');
  RE_CACHE.set(phrase, re);
  return re;
}

/** Does this text contain the phrase (or match the regex) as a whole token? */
function matches(text, pattern) {
  return pattern instanceof RegExp ? pattern.test(text) : phraseToRegex(pattern).test(text);
}

/** Return the subset of patterns that hit. Used for explainability. */
function hits(text, patterns) {
  return patterns.filter((p) => matches(text, p)).map((p) => (p instanceof RegExp ? p.source : p));
}

const WORD_RE = /[a-z0-9][a-z0-9'-]*/g;

function tokens(text) {
  return (String(text || '').toLowerCase().match(WORD_RE) || []);
}

const NUM_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000,
};

function toNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).toLowerCase().replace(/,/g, '').trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  if (NUM_WORDS[s] != null) return NUM_WORDS[s];
  return null;
}

const CADENCE_PER_YEAR = {
  hour: 2000, day: 250, week: 52, fortnight: 26, month: 12, quarter: 4, year: 1,
};

/**
 * Extract order-of-magnitude quantities from free text.
 *
 * WHY: the framework's own rule is "measure the baseline before you claim
 * value". v0.1 faked this by hardcoding the literal strings '25 calls per
 * week' and 'once a month' from the golden cases. Parsing generic
 * number+unit patterns gives the same signal on text nobody has seen before,
 * which is the entire point.
 *
 * These are deliberately coarse. They are used for LOW / MEDIUM / HIGH bands,
 * never for a currency figure. False precision is a framework violation.
 */
function extractQuantities(text) {
  const t = String(text || '').toLowerCase();
  const q = {
    occurrencesPerYear: null,
    minutesPerOccurrence: null,
    peopleAffected: null,
    historyYears: null,
    recordCount: null,
    hasExplicitNumber: /\d/.test(t),
  };

  // Cadence. Collect every candidate and take the MAX, because a sentence can
  // contain two ("a 900-page manual revised quarterly ... they call several
  // times a day") and the first match is not necessarily the workload driver.
  const cadences = [];
  const cadRe = /(\d[\d,]*|\ba\b|\bone\b|\bseveral\b|\bmany\b)\s*(?:[a-z-]+\s+){0,5}?(?:times\s+)?(?:per|a|each|every)\s+(hour|day|week|fortnight|month|quarter|year)/g;
  let cm;
  while ((cm = cadRe.exec(t)) !== null) {
    const n = /^(a|one)$/.test(cm[1]) ? 1 : /^(several|many)$/.test(cm[1]) ? 3 : toNumber(cm[1]);
    if (n != null) cadences.push(n * (CADENCE_PER_YEAR[cm[2]] || 1));
  }
  const bare = [
    [/\b(hourly|several times an hour)\b/, 2000],
    [/\b(daily|every day|each day|multiple times a day|constantly|all day)\b/, 250],
    [/\b(weekly|every week|each week)\b/, 52],
    [/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/, 52],
    [/\bevery few weeks\b/, 17],
    [/\b(monthly|every month|once a month|each month)\b/, 12],
    [/\b(quarterly|every quarter)\b/, 4],
    [/\b(annually|once a year|yearly)\b/, 1],
  ];
  for (const [re, v] of bare) if (re.test(t)) cadences.push(v);
  if (cadences.length) q.occurrencesPerYear = Math.max(...cadences);

  // "spends 30 minutes", "takes two hours"
  let m = t.match(/(\d[\d,]*|\bone\b|\btwo\b|\bthree\b|\bfour\b|\bfive\b|\bten\b)\s*(minutes?|mins?|hours?|hrs?)\b/);
  if (m) {
    const n = toNumber(m[1]);
    if (n != null) q.minutesPerOccurrence = /^h/.test(m[2]) ? n * 60 : n;
  }
  if (q.minutesPerOccurrence == null && /\b(hours|many hours|several hours)\b/.test(t)) {
    q.minutesPerOccurrence = 120;
  }

  // "8-person team", "40 employees", "a team of 12"
  m = t.match(/(\d[\d,]*)[-\s]person\b/) || t.match(/\b(\d[\d,]*)\s*(?:employees|staff|people|reps|agents|engineers|analysts|users|managers)\b/) || t.match(/\bteam of\s+(\d[\d,]*)\b/);
  if (m) q.peopleAffected = toNumber(m[1]);

  // "3 years of CRM history", "five years of applications"
  m = t.match(/(\d[\d,]*|\bone\b|\btwo\b|\bthree\b|\bfour\b|\bfive\b|\bten\b)\s*years?\s+of\b/);
  if (m) q.historyYears = toNumber(m[1]);

  // "20,000 transactions", "thousands of tickets"
  m = t.match(/\b(\d{1,3}(?:,\d{3})+|\d{4,})\b/);
  if (m) q.recordCount = toNumber(m[1]);
  else if (/\b(thousands|tens of thousands|millions)\s+of\b/.test(t)) q.recordCount = 10000;

  return q;
}

module.exports = { matches, hits, tokens, phraseToRegex, extractQuantities, toNumber };
