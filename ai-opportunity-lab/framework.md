# AI Opportunity Lab — Audit Framework

**Version:** 1.2  
**Purpose:** Define the exact decision process that turns a clarified AI opportunity into an audit, recommendation, roadmap, and small-scale tester flow.

---

## 1. Framework Objective

The framework answers:

> Given the facts we know about this opportunity, what should the user do next, what solution paths deserve consideration, what remains uncertain, and what should the user test before investing more?

The framework does not produce one composite score.

It keeps these decisions separate:

1. Is the problem real and important?
2. Can the user measure the outcome?
3. Where could business value come from?
4. Does a simpler alternative capture most of the value?
5. What does the user know about data, systems, integrations, controls, and ownership?
6. Which technical patterns fit the task?
7. What risk limits autonomy?
8. How strong is the evidence?
9. What experiment will reduce the most important uncertainty?
10. What roadmap follows from the current decision?

---

# 2. Core Decision Blocks

The audit uses six blocks.

1. **Problem Strength**
2. **Business Value**
3. **Economics and Alternatives**
4. **Feasibility and Operational Readiness**
5. **AI / Architecture Fit**
6. **Risk and Governance**

The audit adds two overlays:

7. **Market Context**
8. **Evidence Confidence**

The roadmap and tester flow use the outputs from all eight components.

---

# 3. Evidence States

Every decision-critical field receives one evidence state.

### Confirmed

The user provided a direct fact or measurement and confirmed it.

### Supported

The user provided repeated qualitative evidence or the research layer found a credible external signal that supports the claim.

### Estimated

The user or framework supplied a reasoned range or approximation and recorded the basis.

### Assumed

The audit needs the statement to continue, but no evidence currently supports it.

### Unknown

The information could matter and the user does not know it.

### Rule

The framework never upgrades `Assumed` or `Unknown` to `Confirmed` without new evidence.

---

# 4. Confidence

Each decision block returns:

- High
- Medium
- Low

### High

The user confirmed the major decision inputs and no critical unknown could reverse the conclusion.

### Medium

The direction looks plausible, but an estimate or assumption could change timing, architecture, or value.

### Low

One or more unknowns could reverse the recommendation.

### Final confidence rule

The final recommendation cannot exceed the confidence of the weakest decision-critical block.

Example:

- Problem Strength: High
- Business Value: High
- Readiness: Low
- Architecture Fit: Medium

Final confidence: **Low**

---

# 5. Conversation Intake Logic

The intake uses a chat flow.

The assistant should ask the fewest questions needed to reach a defensible first decision.

---

## 5.1 Start

Ask:

> What AI opportunity are you considering, and what problem do you want it to solve?

Parse the answer into:

- proposed idea,
- affected user,
- current workflow,
- desired outcome,
- known data,
- known systems,
- known constraints,
- measurable baseline,
- existing alternatives.

Mark every missing field as `Unknown`.

---

## 5.2 Clarification priority

Ask questions in this order because each level can invalidate later analysis.

### Priority 1 — Problem

Ask if missing:

- Who experiences the problem?
- What happens today?
- What specifically goes wrong?
- How often does it happen?
- What would improve if you solved it?

### Priority 2 — Baseline and value

Ask if missing:

- What do you know about current time, cost, volume, quality, errors, revenue, or another baseline?
- Which business or user outcome matters most?

### Priority 3 — Alternative

Ask:

- How do you handle this today?
- Have you tried a simpler process or automation?
- What happens if you do nothing?

### Priority 4 — Data and systems

Ask only what the opportunity needs:

- What information would the solution need?
- Where does that information live?
- Can the proposed solution access it?
- Which systems would it need to read?
- Which systems would it need to update?
- Do those systems expose APIs or another controlled integration path?
- If you do not know, record `Unknown`.

### Priority 5 — Actions and control

Ask:

- What actions could the system take?
- Could an incorrect action cause material harm?
- Can you reverse the action?
- Who approves important actions?
- Who owns exceptions?

### Priority 6 — Constraints

Ask:

- Does the workflow involve sensitive or regulated data?
- Do you have budget, time, vendor, security, or staffing constraints?
- Does a person or team own the result?

---

## 5.3 Question stop rule

Stop asking questions when:

- the framework can determine the next decision state,
- remaining unknowns do not materially change that state,
- and the report can explicitly show the remaining unknowns.

Do not turn the intake into an exhaustive discovery interview.

---

## 5.4 Clarification gate

The system must ask before evaluating readiness when any of these remain unknown and relevant:

- required data,
- system access,
- external actions,
- reversibility,
- human owner,
- sensitive-data exposure.

If the user cannot answer, the report may continue with **Low confidence**, but it must not claim readiness.

---

# 6. Block 1 — Problem Strength

## 6.1 Objective

Decide whether the opportunity addresses a real, meaningful problem.

---

## 6.2 Inputs

Collect:

- affected user,
- current workflow,
- evidence of pain,
- volume or frequency,
- severity,
- reach,
- workaround quality,
- outcome metric.

---

## 6.3 Problem evidence rating

### Level 1 — Hypothesis only

The user has an idea but cannot point to repeated evidence of the problem.

### Level 2 — Anecdotal

The user can name isolated complaints or examples.

### Level 3 — Repeated pattern

The user sees the problem repeatedly across similar cases or users.

### Level 4 — Quantified

The user has measured frequency, time, error, cost, backlog, conversion, or another relevant metric.

### Level 5 — Quantified and segmented

The user can show how the problem varies by segment, workflow, customer type, or period.

---

## 6.4 Severity rating

Do not use emotional wording such as “very painful.”

Ask what the problem causes.

### Low

The problem creates inconvenience with little measurable consequence.

### Medium

The problem creates repeated manual work, delay, moderate quality loss, or measurable operational burden.

### High

The problem causes material cost, revenue loss, user harm, significant delay, large error exposure, or strategically important capacity loss.

---

## 6.5 Reach / scale

Evaluate the number of:

- people,
- customers,
- cases,
- transactions,
- documents,
- decisions,
- or workflow runs.

Do not convert “daily” into a high score automatically.

Use frequency × affected volume × severity together.

---

## 6.6 Problem-strength decision rules

### Strong

Return `Strong` when:

- the user shows at least a repeated pattern,
- the problem produces measurable or clearly material impact,
- and the user can define the outcome they want to improve.

### Moderate

Return `Moderate` when:

- the problem appears real,
- but the evidence or baseline remains incomplete.

### Weak

Return `Weak` when:

- the problem remains primarily hypothetical,
- the user cannot name a meaningful affected user,
- or the desired outcome remains vague.

---

## 6.7 Problem-strength gates

If `Weak` and evidence confidence is Low:

- block `Proceed to Pilot`,
- default toward `Validate Value`.

If the problem has high severity but low frequency:

- do not downgrade automatically,
- inspect stakes and risk.

---

## 6.8 Output

Return:

- strength,
- confidence,
- strongest evidence,
- weak evidence,
- missing baseline,
- affected users,
- measurable outcome,
- recommended evidence collection.

---

# 7. Block 2 — Business Value

## 7.1 Objective

Identify how solving the problem could create value and whether the value looks large enough to justify more work.

---

## 7.2 Value mechanisms

Select the relevant mechanisms:

- time saved,
- labor cost avoided,
- capacity created,
- error reduction,
- revenue generated,
- conversion improvement,
- retention improvement,
- turnaround reduction,
- risk reduction,
- decision quality,
- customer experience,
- strategic capability.

---

## 7.3 Baseline requirement

For each selected value mechanism, ask for the matching baseline.

Examples:

### Time saved

Need:

- current time per case,
- cases per period,
- percentage of work the solution could remove.

Formula when values exist:

`Potential hours saved = current time per case × cases per period × expected reduction`

### Labor cost avoided

Need:

- hours saved,
- loaded hourly cost or approved internal equivalent.

### Error reduction

Need:

- current error rate,
- cost or consequence of error,
- affected volume.

### Revenue

Need:

- current conversion/retention/revenue baseline,
- causal path between the solution and revenue.

The framework must not infer causality from correlation.

---

## 7.4 Value potential rules

### High

Use when:

- the outcome links to a material business/user objective,
- meaningful scale or severity exists,
- and evidence supports a plausible recurring value mechanism.

### Medium

Use when:

- the value mechanism makes sense,
- but magnitude or adoption remains uncertain.

### Low

Use when:

- value looks marginal,
- impact is one-off,
- or the user cannot explain how the outcome improves.

---

## 7.5 Adoption check

Ask:

- Who changes behavior if this solution launches?
- What extra effort does the new workflow require?
- Why would the user adopt it?
- Can the solution fit into the existing workflow?

If adoption requires major behavior change, lower value confidence until the user validates adoption.

---

## 7.6 Ownership check

Ask:

- Who owns the outcome?
- Who decides whether the pilot succeeded?

If nobody owns the outcome:

- record readiness gap,
- block production-oriented recommendations.

---

## 7.7 Output

Return:

- value potential,
- value mechanisms,
- baseline status,
- adoption assumptions,
- outcome owner,
- confidence,
- formulas used,
- missing variables.

---

# 8. Block 3 — Economics and Alternatives

## 8.1 Objective

Compare the proposed solution with realistic alternatives before the framework chooses architecture.

---

## 8.2 Required comparison set

Evaluate whichever options make sense from:

1. Continue current process
2. Improve the human/process workflow
3. Deterministic software/automation
4. Predictive/classical ML
5. Assistive LLM
6. Retrieval-grounded AI
7. Structured AI workflow
8. Agentic execution

The framework does not force every option into every report.

---

## 8.3 Current-process baseline

Capture when known:

- people involved,
- minutes/hours per case,
- cases per period,
- backlog,
- error rate,
- turnaround,
- direct tools/services cost,
- downstream loss.

If unknown:

- state what the user must measure.

---

## 8.4 One-time cost drivers

For each viable solution, inspect:

- discovery,
- product/design work,
- implementation,
- data cleanup,
- integrations,
- API/tool setup,
- eval construction,
- security review,
- change management,
- user training.

Do not produce an exact cost unless the user provides the relevant internal rates or estimates.

---

## 8.5 Ongoing cost drivers

Inspect:

- model usage,
- search/retrieval,
- hosting,
- external tools,
- human review,
- exception handling,
- monitoring,
- retries,
- maintenance,
- data refresh,
- prompt/eval maintenance,
- vendor changes.

---

## 8.6 Cost per accepted outcome

When the workflow uses AI, estimate or measure:

`Total run cost = model + search/tools + infrastructure + retries + human review`

`Cost per accepted outcome = total run cost / accepted outcomes`

Use the tester flow to measure this when production numbers do not exist.

---

## 8.7 Simpler-alternative rule

Flag `Use Simpler Approach` when:

- a simpler option addresses most of the target outcome,
- the more advanced option adds limited incremental value,
- and the advanced option materially increases build, monitoring, or risk burden.

Do not use an arbitrary “70% value” threshold in the first release.

Instead, require a written comparison of the incremental benefit.

---

## 8.8 Opportunity-cost analysis

For each relevant path answer:

### Build proposed solution

- What capacity or roadmap item does the team delay?
- What ongoing burden will the team own?

### Choose simpler option

- What capability does the user give up?
- Does that lost capability matter now?

### Delay

- What pain or lost value continues?
- Does waiting improve readiness?

### Do nothing

- What recurring cost or user problem remains?

---

## 8.9 Output

Return:

- economic attractiveness,
- current-process baseline,
- viable alternatives,
- cost drivers,
- value drivers,
- dominant alternative,
- opportunity-cost comparison,
- missing numbers,
- confidence.

---

# 9. Block 4 — Feasibility and Operational Readiness

## 9.1 Objective

Evaluate only the capabilities and constraints the user confirmed during intake.

The system never claims that the organization has usable data, integrations, controls, or skills without asking.

---

## 9.2 Data readiness

Ask:

1. What data does the solution need?
2. Does that data exist?
3. Where does it live?
4. Can the solution access it?
5. Is the data current enough?
6. Is the quality sufficient for the task?
7. Does the organization have permission to use it this way?

### Rating

**High**  
The user confirms the required data exists, access is available, quality appears fit for the pilot, and no material permission blocker remains.

**Medium**  
Most required data exists, but quality, access, freshness, or permission needs work.

**Low**  
Critical data does not exist, access remains blocked, or quality makes the proposed test unreliable.

**Unknown**  
The user cannot answer.

---

## 9.3 Integration readiness

Ask:

- What systems must the solution read?
- What systems must it update?
- Does each system offer a controlled integration route?
- What authentication or permission does the solution need?
- Can the team test in a sandbox or non-production environment?

Return:

- High / Medium / Low / Unknown.

---

## 9.4 Process readiness

Ask:

- Can the user describe the current workflow consistently?
- Do different people follow different undocumented paths?
- Does the team know the exception cases?

If the process itself remains unstable:

- recommend process mapping before automation.

---

## 9.5 Evaluation readiness

Ask:

- What would count as a correct output?
- Can the team create representative test cases?
- Can a human reviewer judge the result?
- What failures matter most?
- What threshold would justify a pilot?

If the team cannot define “good enough”:

- readiness cannot be High.

---

## 9.6 Observability

Ask:

- Can the team see the inputs, intermediate steps, tool calls, and final output?
- Can the team trace why the system acted?
- Can the team record failures?

For agentic or high-impact workflows, lack of observability lowers readiness.

---

## 9.7 Recovery

Ask:

- Can the team reverse an action?
- Can the system stop before an irreversible step?
- Can a human take over?
- Can the team retry safely?

---

## 9.8 Ownership

Ask:

- Who owns the pilot?
- Who handles exceptions?
- Who monitors the system after launch?

No owner blocks a production-oriented recommendation.

---

## 9.9 Readiness output

Return:

- overall readiness: High / Medium / Low / Unknown,
- data status,
- integration status,
- process status,
- eval status,
- observability status,
- recovery status,
- ownership status,
- blocking dependencies,
- preparation tasks,
- confidence.

---

# 10. Block 5 — AI / Architecture Fit

## 10.1 Objective

Choose the lowest-complexity architecture that can plausibly deliver the required outcome.

---

## 10.2 Task-shape questions

### Interpretation complexity

Does the task require contextual judgment, synthesis, or language understanding?

### Input type

Does the task use:

- structured fields,
- historical numerical data,
- text/documents,
- images/audio,
- mixed inputs?

### Prediction need

Does the task primarily require:

- classification,
- ranking,
- forecasting,
- anomaly detection,
- propensity estimation?

### Knowledge grounding

Does the system need:

- proprietary documents,
- current policies,
- current web information,
- user/company memory?

### Path variability

Does every case follow the same steps?

### Dynamic planning

Must the system decide the next step after seeing intermediate results?

### Tool use

Does the system need external tools?

### Action requirement

Does the system only recommend, or must it act?

### Autonomy

How long can it work before a human reviews it?

---

# 10.3 Architecture rules

## Process / human change

Prefer when the root problem comes from:

- unclear responsibility,
- missing policy,
- bad handoff,
- unnecessary approval,
- training gap,
- duplicated work.

## Deterministic automation

Prefer when:

- rules stay stable,
- inputs remain structured,
- outcomes remain predictable,
- exceptions remain limited.

## Predictive / classical ML

Prefer when:

- historical labeled or feature-rich data exists,
- the central task is prediction/ranking/classification,
- language generation adds little value.

## Assistive LLM

Prefer when:

- the task needs language interpretation or generation,
- the human still makes the important decision or action,
- context fits within known sources.

## Retrieval-grounded AI

Add when:

- the output depends on proprietary or current knowledge,
- source traceability matters,
- and retrieval quality can be tested.

Retrieval can combine with assistive, workflow, or agentic patterns.

## Structured AI workflow

Prefer when:

- the system performs multiple known stages,
- the sequence remains mostly explicit,
- humans or rules can control checkpoints,
- and dynamic planning adds little value.

## Agentic execution

Consider only when:

- the user defines the goal but cannot fully define the path,
- intermediate results determine the next step,
- the system must select tools dynamically,
- the additional autonomy creates material value,
- and the risk/readiness blocks allow it.

---

## 10.4 Agentic exclusion rules

Do not recommend autonomous agentic execution when:

- the workflow is merely multi-step,
- rules can define the sequence,
- the task only needs retrieval + answer generation,
- the action carries high stakes without effective review,
- the user cannot confirm required tool access,
- or recovery remains weak.

---

## 10.5 Architecture comparison output

Compare 2–4 candidates.

For each show:

- role,
- value,
- implementation burden,
- ongoing burden,
- data need,
- tool need,
- human role,
- risk,
- current fit.

Return:

- best current fit,
- simpler alternative,
- optional future architecture.

---

# 11. Block 6 — Risk and Governance

## 11.1 Objective

Apply constraints that business value cannot override.

---

## 11.2 Risk questions

Ask only what applies.

### Stakes

What happens if the system is wrong?

### Error detectability

Will someone notice the error before harm occurs?

### Reversibility

Can the team undo the action?

### Blast radius

How many users, records, transactions, or external parties can one failure affect?

### Sensitive data

Does the system handle regulated, personal, financial, health, employment, confidential, or proprietary information?

### Rights impact

Could the system influence access, ranking, treatment, employment, credit, health, or another material outcome?

### Adversarial exposure

Can untrusted users, files, websites, or tool outputs influence the system?

### Human accountability

Who owns the final decision and incident response?

---

## 11.3 Hard gates

### Gate A — High stakes + low detectability

Block autonomous execution.

Require human approval or a lower-autonomy design.

### Gate B — Irreversible action + weak recovery

Block autonomous execution.

### Gate C — Sensitive/regulated data + unknown controls

Block `Proceed to Pilot` until the user confirms the required controls or specialist review.

### Gate D — No accountable owner

Block production-oriented decisions.

### Gate E — External untrusted content + tool actions

Require isolation between retrieved content and system instructions, scoped permissions, and output validation before an agentic pilot.

### Gate F — Unknown risk information

When the user cannot answer a risk-critical question, lower confidence and choose `Prepare Dependencies` or specialist review instead of guessing.

---

## 11.4 Output

Return:

- risk tier,
- triggered gates,
- required controls,
- autonomy limit,
- human-review requirement,
- specialist review requirement,
- confidence.

---

# 12. Market Context Overlay

## 12.1 Objective

Use external research only where it can change:

- timing,
- technical feasibility,
- differentiation,
- cost assumptions,
- regulation,
- or competitive context.

---

## 12.2 Research queries

Generate targeted queries around:

- comparable solutions,
- recent product launches,
- current enabling technology,
- current adoption signals,
- relevant regulation or standards,
- current cost changes,
- available protocols or platforms.

---

## 12.3 Source hierarchy

Prefer:

1. primary company/product documentation,
2. regulatory or standards bodies,
3. reputable industry research,
4. established news reporting,
5. community discussion only for qualitative signal.

Do not treat SEO listicles as strong evidence.

---

## 12.4 Signal labels

Each signal receives:

- Supports
- Neutral
- Challenges

The report also records:

- source,
- date,
- claim,
- relevance,
- evidence quality.

---

## 12.5 Market-bias rule

Competitor activity cannot upgrade a weak user problem.

It can only change:

- feasibility confidence,
- timing,
- strategic urgency,
- differentiation needs,
- or market-risk discussion.

---

# 13. Decision State Logic

The framework applies hard gates first.

Then it chooses the decision state.

---

## 13.1 Proceed to Pilot

Choose when:

- Problem Strength = Moderate or Strong,
- Business Value = Medium or High,
- the user has enough baseline to define pilot success,
- Readiness = Medium or High,
- a viable architecture exists,
- no blocking hard gate remains,
- and a limited test can resolve the remaining uncertainty.

---

## 13.2 Validate Value

Choose when:

- problem desirability,
- adoption,
- outcome importance,
- or value magnitude remains the largest uncertainty.

Do not build a technical prototype first when the user still needs to prove the problem.

---

## 13.3 Prepare Dependencies

Choose when:

- the opportunity looks valuable,
- but data, integrations, permissions, evals, controls, or ownership block a useful test.

---

## 13.4 Use Simpler Approach

Choose when:

- the simpler option solves the key problem,
- and the advanced AI option cannot justify its additional complexity or risk with incremental value.

---

## 13.5 Human-Led / Do Not Automate

Choose when:

- accountability should remain human,
- risk makes autonomous action inappropriate,
- or the task’s essential value comes from human judgment or relationship.

The report may still suggest assistive AI for safe sub-tasks.

---

## 13.6 Park

Choose when:

- Problem Strength = Weak,
- Value = Low,
- a stronger alternative dominates,
- or the opportunity does not justify more work.

The report should state what new evidence could reopen the idea.

---

# 14. Tie-Breaking Rules

### Evidence beats enthusiasm

If the idea sounds exciting but the problem remains weak, choose `Validate Value` or `Park`.

### Value and readiness stay separate

If value looks strong but readiness stays weak, choose `Prepare Dependencies`.

### Simpler wins without incremental proof

If advanced AI adds unclear incremental value, choose `Use Simpler Approach`.

### Risk outranks value

A hard gate can reduce autonomy or block the pilot.

### Pilot before scale

If AI performance remains materially uncertain, test before full implementation.

---

# 15. Step-by-Step Roadmap Generator

The roadmap uses the decision state and the largest uncertainties.

Each step must include:

- Action
- Why
- Owner type
- Input
- Deliverable
- Metric/evidence
- Exit condition

---

## 15.1 Roadmap for Proceed to Pilot

### Step 1 — Baseline

Measure the current workflow.

Deliver:

- time,
- cost,
- error,
- throughput,
- or relevant baseline.

### Step 2 — Freeze pilot scope

Choose:

- one user segment,
- one workflow,
- one data source set,
- one success outcome.

### Step 3 — Build eval set

Create representative and edge cases.

### Step 4 — Build smallest viable architecture

Do not add optional integrations or autonomy.

### Step 5 — Run offline/sandbox test

Measure quality and failure modes without live consequences.

### Step 6 — Run controlled live pilot

Use limited users/cases and human approval where needed.

### Step 7 — Compare

Compare:

- baseline,
- simpler alternative,
- proposed solution.

### Step 8 — Scale decision

Choose:

- stop,
- iterate,
- prepare dependencies,
- expand pilot,
- scale.

---

## 15.2 Roadmap for Validate Value

1. Define weakest value assumption.
2. Gather user/workflow evidence.
3. Measure baseline.
4. Test adoption manually.
5. Re-run audit.
6. Decide whether a technical pilot now makes sense.

---

## 15.3 Roadmap for Prepare Dependencies

1. List blocking dependencies.
2. Order them by decision impact.
3. Assign owner.
4. Resolve the smallest dependency first.
5. Create evaluation capability.
6. Re-run readiness.
7. Start pilot only when blocking conditions clear.

---

## 15.4 Roadmap for Use Simpler Approach

1. Define simpler solution.
2. Measure expected coverage of target problem.
3. Build/test low-cost version.
4. Compare outcome with advanced option hypothesis.
5. Revisit advanced AI only if meaningful unmet value remains.

---

## 15.5 Roadmap for Human-Led

1. Identify decision that must remain human.
2. Identify safe assistive sub-tasks.
3. Prototype assistance without autonomous action.
4. Measure time/quality improvement.
5. Review whether any further automation can occur safely.

---

## 15.6 Roadmap for Park

1. Record rejection reason.
2. Record missing evidence.
3. Define reopening trigger.
4. Stop active spend.
5. Reassess only when the trigger occurs.

---

# 16. Tester Flow Generator

The tester flow helps the user learn before large investment.

---

## 16.1 Test prerequisites

Before testing, require:

- defined user/problem,
- baseline,
- representative sample,
- expected success condition,
- expected failure conditions,
- reviewer,
- safe test environment.

If one is missing, the tester flow starts by creating it.

---

## 16.2 Small-scale tester sequence

### Step A — Baseline sample

Run the current process on a representative sample.

Record:

- outcome quality,
- time,
- cost,
- errors,
- human effort.

### Step B — Simplest comparator

Test the simplest realistic alternative on the same or comparable sample.

### Step C — Proposed AI prototype

Run the proposed architecture with minimal scope.

### Step D — Human review

Review every result in early testing for:

- correctness,
- usefulness,
- unsupported claims,
- missed cases,
- unsafe action,
- user intervention.

### Step E — Failure analysis

Group failures by:

- data issue,
- retrieval issue,
- reasoning issue,
- prompt/instruction issue,
- tool/integration issue,
- workflow issue,
- user/adoption issue.

### Step F — Cost measurement

Measure:

- model/tool cost,
- retries,
- human review,
- latency,
- accepted outcomes.

### Step G — Go/no-go review

Compare the prototype against:

- current process,
- simpler option,
- pre-set success threshold.

### Step H — Scale condition

Only expand when:

- outcome quality meets threshold,
- risk gates remain satisfied,
- cost remains acceptable,
- the team can observe failures,
- and the next scale step has an owner.

---

# 17. Tester Flow by Architecture

## Deterministic automation

Test rule accuracy and exception handling on historical cases.

## Predictive ML

Use held-out data, relevant classification/ranking metrics, calibration where relevant, and segment-level error review.

## Assistive LLM

Measure human acceptance, correction rate, factuality/grounding, time saved, and quality.

## Retrieval-grounded AI

Measure retrieval relevance, citation accuracy, grounded answer quality, and refusal when evidence is absent.

## Structured workflow

Test each stage separately and end-to-end.

Measure where failures propagate.

## Agentic system

Start in sandbox/read-only mode.

Measure:

- task completion,
- tool selection,
- wrong actions,
- intervention,
- recovery,
- excessive retries,
- cost per accepted outcome.

Do not begin with unrestricted write access.

---

# 18. Model Dependence and Stability

Yes, the model can change parts of the output.

Models differ in:

- extraction accuracy,
- reasoning quality,
- research synthesis,
- clarification behavior,
- architecture explanation,
- and report wording.

The framework therefore separates **model work** from **decision rules**.

---

## 18.1 Model responsibilities

The model handles:

- conversation,
- extraction,
- clarification,
- research summary,
- explanation,
- roadmap wording.

## 18.2 Framework responsibilities

Deterministic logic handles:

- hard gates,
- decision-state eligibility,
- unknown-data handling,
- required comparison rules,
- risk restrictions,
- output schema validation.

---

## 18.3 Reproducibility rule

For the MVP:

- use one fixed model,
- pin model identifier when possible,
- record model name in every run,
- avoid a random free-model router for decision-critical evaluation.

A random router can send identical requests to different models and increase output variance.

---

## 18.4 Cross-model eval

When switching models:

Run the golden set on both models.

Measure:

- decision-state parity,
- architecture parity,
- hard-gate parity,
- clarification quality,
- unsupported assumptions,
- citation quality.

Do not switch the live model if the new model materially changes decision behavior without framework review.

---

# 19. Evaluation Suite

The evaluation suite tests the product, not only the model.

---

## 19.1 Golden scenario structure

Each test case contains:

```text
ID
Opportunity description
Confirmed facts
Unknown facts
Expected clarifying questions
Expected problem strength
Expected value band
Expected readiness
Acceptable architectures
Forbidden architectures
Expected hard gates
Expected decision state
Expected next experiment
```

---

## 19.2 Minimum scenario coverage

Create at least 20 cases.

Include:

1. simple alert,
2. repetitive routing,
3. structured prediction,
4. anomaly detection,
5. summarization,
6. drafting,
7. RAG assistant,
8. structured AI workflow,
9. agentic research/action,
10. multi-step non-agentic workflow,
11. high-value/low-readiness,
12. low-value/high-readiness,
13. high-risk irreversible action,
14. sensitive data,
15. no baseline,
16. unknown integrations,
17. process problem that needs no AI,
18. hype-driven competitor copy,
19. low-volume/high-severity,
20. simpler solution dominates.

---

## 19.3 Clarification eval

Pass when the system:

- asks decision-critical questions,
- avoids irrelevant questioning,
- accepts `Unknown`,
- does not fabricate the answer.

---

## 19.4 Extraction eval

Compare structured fields with source facts.

Track:

- correct,
- partially correct,
- missed,
- invented.

Critical invented facts = failure.

---

## 19.5 Architecture eval

Pass when:

- acceptable candidate set contains the expected solution,
- forbidden architecture does not appear as recommended,
- simpler alternative appears when required.

---

## 19.6 Hard-gate eval

Target:

**100% compliance**

Any violation blocks release.

---

## 19.7 Decision-state eval

Target:

At least **85%** of golden cases reach the expected or explicitly acceptable decision state.

Investigate every disagreement.

Do not change the golden answer simply to improve the score without reviewing the case.

---

## 19.8 Research eval

For sampled market claims:

- source exists,
- source supports claim,
- date is appropriate,
- evidence quality is acceptable,
- system does not exaggerate the source.

Target:

**95% citation support** for sampled material claims.

---

## 19.9 Roadmap eval

Check:

- roadmap matches decision,
- steps follow dependency order,
- each step has an exit condition,
- pilot appears only after required prerequisites.

---

## 19.10 Tester-flow eval

Check:

- baseline exists,
- representative sample exists,
- success threshold exists,
- simpler comparator appears when relevant,
- risk controls apply,
- scale gate exists.

---

## 19.11 Model-stability eval

For each model candidate:

- run identical golden set,
- compare decision-state agreement,
- compare architecture,
- compare hard gates,
- inspect assumption drift.

Record results in the eval report.

---

## 19.12 Prompt-sensitivity eval

Create several paraphrases of the same opportunity.

The decision must not change simply because the user writes:

> “I definitely want an agent.”

The facts, not the requested technology, drive the result.

---

## 19.13 Cost and latency eval

Record:

- search calls,
- model calls,
- retries,
- total latency,
- cost per audit,
- cost per accepted audit if human review rejects some outputs.

---

# 20. Release Gates

The MVP can ship only when:

- hard-gate compliance = 100%,
- critical invented-fact count = 0 in the golden set,
- decision-state agreement >= 85%,
- sampled citation support >= 95%,
- the tester flow appears for all pilot-eligible AI cases,
- paraphrase tests do not materially alter decisions,
- model/version metadata appears in every result.

These thresholds serve as internal acceptance criteria, not production-safety claims.

---

# 21. Output Contract

The final machine-readable output should include:

```json
{
  "framework_version": "",
  "model": "",
  "prompt_version": "",
  "decision": {},
  "confirmed_facts": [],
  "assumptions": [],
  "unknowns": [],
  "problem_strength": {},
  "business_value": {},
  "economics": {},
  "readiness": {},
  "architecture": {},
  "risk": {},
  "market_context": {},
  "opportunity_cost": {},
  "improvements": [],
  "roadmap": [],
  "tester_flow": [],
  "scale_conditions": [],
  "metrics": {},
  "sources": []
}
```

The separate `audit-schema.json` file will define exact field types and validation rules.

---

# 22. Research Sources

The following sources informed the framework:

- Microsoft Learn — *Intake and prioritize agent ideas*
- Microsoft Cloud Adoption Framework — *Business plan for AI agents*
- Microsoft Cloud Adoption Framework — *AI strategy*
- OpenAI — *A practical guide to building agents*
- OpenAI — *How to manage AI investments in the agentic era*
- OpenAI — *A shared playbook for trustworthy third-party evaluations*
- OpenAI Evals — real-world task evaluation work
- NIST — *AI Risk Management Framework*
- NIST — *Expanding the AI Evaluation Toolbox with Statistical Models*
- NIST — *TEVV-Athlon Framework for Evaluating AI Systems*
- Anthropic — *Demystifying evals for AI agents*
