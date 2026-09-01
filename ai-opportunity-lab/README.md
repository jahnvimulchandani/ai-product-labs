# AI Opportunity Lab — engine v0.3 (hybrid)

```
npm install
npm run eval            # full suite, exits non-zero on failure
npm run eval:verbose    # with per-case detail
npm run demo            # interactive loop; ANTHROPIC_API_KEY optional
```

## The split

```
prose ──▶ extractor.js ──▶ OpportunityRecord ──▶ rules/ ──▶ audit
          (LLM, variance)   (contract.js)        (deterministic)
                                  ▲
                                  └── clarify.js  (MCQ, value of information)
```

One rule governs everything: **the LLM fills fields, the rules read fields, and
nothing downstream of extraction ever sees a sentence.**

That is not a stylistic preference. v0.1 and v0.2 both ran rules against prose,
and it capped them:

| | v0.1 | v0.2 |
|---|---|---|
| Golden set (tuned against) | 54% | 100% |
| Blind cases written after the fact | 0/8 | 1/8 |
| Safety-critical blind cases caught | 0/3 | 0/3 |

Judging "does a human review this output" from arbitrary English is a semantic
task. No lexicon reaches it. Widening the patterns bought a case or two and
relocated the brittleness. So v0.3 stops trying.

## What each layer is for

**contract.js** defines 34 fields, each with allowed values and an
`evidence_status`. This is the spine. Framework section 3 says CONFIRMED and
UNKNOWN must behave differently, and a bare value cannot express that.

**extractor.js** turns prose into fields and nothing else. Every extracted
value needs a verbatim quote from the input; a CONFIRMED field whose quote is
not actually in the text is demoted to ASSUMED automatically. The prompt's most
important instruction is *omit what the text does not say*, because absence of
a mention is not evidence of absence. "Nobody reviews this" and "the text did
not mention review" lead to different audits, and conflating them is exactly
how a safety gate goes missing.

**heuristic-extractor.js** is where the v0.1 and v0.2 keyword work now lives:
as a weak prior at ASSUMED strength, overridden by anything stronger. A wrong
guess there costs one clarification question instead of a wrong verdict. It also
keeps the whole suite runnable with no API key, so a rule regression can never
hide behind model variance.

**rules/** applies framework 6, 7, 9, 10, 11 and 14 to the fields. Gates are
pure field predicates now, which means they are unit-testable for the first
time (13 tests in `evals/gate-units.js`), and paraphrase invariance stops being
something you test for and becomes a property of the design: identical fields
cannot produce different audits.

**clarify.js** decides which questions to ask by re-running the whole
evaluation on hypothetical records. For each unanswered field it tries every
candidate value and measures how much the outcome moves. If nothing moves, the
question is not asked.

## Why the MCQ layer works this way

PRD 6.2 says "ask only decision-relevant questions" and 9.5 says skip anything
already answered. Both are written as instructions to a model, which in practice
means a model asks six questions because six feels thorough.

Value of information makes them arithmetic instead, and that buys three things:

1. **A defensible reason per question.** "The answer moves the recommendation
   between PROCEED_TO_PILOT and HUMAN_LED_DO_NOT_AUTOMATE" is a reason. "The
   model thought it was relevant" is not. The reason ships in the output.
2. **A real stop rule.** Stop when nothing remaining can change the decision,
   the architecture or the gate set. Measured: on a near-complete record the
   loop asks 2.0 questions and stops by itself, 16/16.
3. **Ordering for free**, with safety-relevant fields breaking ties.

### The myopia fix

Pure VOI compares one field at a time, and that breaks on a cold record. Nothing
individually flips the verdict, because the audit stays INSUFFICIENT until two
or three fields land together. Every field scores zero and the engine concludes
there is nothing worth asking.

Measured: before the fix, clarification recovered 4 of 16 cases. The loop was
terminating instantly on precisely the records that needed it.

Three tiers now sit above raw VOI, each tied to a defect the audit currently
has rather than to a generic checklist:

- **Tier 0** the audit cannot run at all → auditability fields
- **Tier 1** a risk-critical field is unknown, or would close an open gate
- **Tier 2** no architecture can be selected → task-shape fields

Fields leave the mandatory set as soon as their defect clears. This is not "ask
everything", it is "ask what is blocking". Result: 4/16 to 11/16.

## Results

Four things are measured separately, because in a hybrid they fail separately
and one blended score hides which half is broken.

```
1. RULE CORRECTNESS       13/13 gate unit tests on constructed records
2. REPRODUCIBILITY        6/6 same record produces an identical audit
                          3/3 paraphrase invariants hold
3. CLARIFICATION          16/16 custom path present, no re-asking,
                          every question can change the outcome,
                          16/16 stops by itself on a near-complete record
4. CONVERGENCE            heuristic only        2/16  (13%)
                          + clarification      11/16  (69%)
                          partial extract+MCQ  13/16  (81%)
                          oracle fields        16/16  (100%)
   Safety gates caught    1/6 → 6/6 → 6/6 → 6/6
5. SCHEMA                 16/16 valid against audit-schema.json
```

The four convergence columns are the whole diagnostic. **Oracle 16/16 means the
rules are right.** Every remaining failure is extraction or question coverage,
which is a tractable problem with a known fix, unlike "the rules cannot express
this", which is what v0.2 was up against.

The safety row is the one that matters most. Both earlier engines cleared all
three safety-critical blind cases at LOW risk with no gates. This one catches
6 of 6 once the questions are answered, and the two questions it needs to get
there are named in the output.

## Honest limits

**The heuristic-only column is still 13%.** That is expected and it is why the
extractor exists. It is reported rather than hidden because it is the number
that tells you the LLM layer is load-bearing, not decorative.

**Cold records take 8 questions.** That is the budget, and it is hit every time
on a cold start. With partial extraction it drops to 6.4, and with a competent
LLM extractor most fields arrive free and the loop closes the gap in 2. If 8
proves too many in practice the answer is a better extractor, not a smaller
budget: cutting questions on an unclear idea means guessing.

**Paraphrase pairs still extract differently** (0/3 identical records). The
declared invariants hold 3/3, which is what matters, but full agreement needs
the LLM extractor. The useful part is that divergence is now *attributable*:
the suite prints which fields differed, and the rules are provably not the
cause.

**The `must_match` scoping on P-03 is a judgement call.** Variant b says
"autonomous agent" and variant a does not, so the risk read *should* differ.
Only architecture must match there, per framework 10.4. Checking gates on that
pair would have been the eval being wrong rather than the engine.

**Two schema additions are required**, both in
`evals/schema-patch-v0.3.json`: `INSUFFICIENT_INPUT` and `NEEDS_CLARIFICATION`.
Both exist because the engine can now be honest about not knowing, which the
original six states had no way to express.

## Ordering decisions worth knowing about

**Risk outranks auditability.** A thin description can still fire a hard gate.
"Decide eligibility and post the outcome letter with nobody checking it" says
almost nothing about value and everything about autonomy over a rights-affecting
decision. Returning INSUFFICIENT_INPUT there, with two gates quietly attached,
is the worst of both worlds. The gate answers first.

**A missing baseline does not block a pilot.** Measuring it is step one of the
pilot. Only admitted access, data, control and ownership gaps block. v0.1
treated every open question as a blocker and returned PREPARE_DEPENDENCIES six
times where the answer key expected PROCEED_TO_PILOT ten.

**Unknown is not the same as absent, anywhere.** Unknown review fires Gate F,
not Gate A. An unassigned owner is not an owner of "nobody". A prediction task
with unknown labels is not a prediction task with no labels. Most of the
safety-relevant bugs in the previous two versions were one of these three
conflations.

## Next

The rule layer is done and provably correct against its fixtures. The work that
remains is extraction quality, and it is measurable now: run the suite, watch
the gap between the heuristic column and the oracle column. Close it by
improving the extractor and expanding the field registry, not by touching the
rules.
