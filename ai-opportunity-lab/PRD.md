# AI Opportunity Lab — Product Requirements Document

**Version:** 1.3  
**Status:** MVP definition  
**Product form:** Portable AI opportunity-audit framework that can run as a reusable skill, API-backed workflow, or interactive demo.

---

## 1. Product Summary

AI Opportunity Lab helps a user evaluate an AI idea before they commit substantial engineering time, integration effort, operating spend, or organizational change.

The user begins by describing the idea in their own words. The language model first extracts every usable fact from that description. It then asks only the clarification questions that could materially change the audit.

For each clarification question, the model presents four response paths:

1. a context-aware answer that best matches the information already provided,
2. a second plausible answer,
3. a third plausible answer,
4. **Custom answer**, which lets the user type a different response.

The system skips any question that the original description already answers clearly.

After the clarification stage, the framework audits the opportunity across:

- problem strength,
- business value,
- economics and alternatives,
- feasibility and operational readiness,
- AI and architecture fit,
- risk and governance,
- market context,
- and evidence confidence.

The final output gives the user:

- a decision,
- the reasoning behind that decision,
- viable solution options,
- a comparison of simpler and more advanced approaches,
- missing evidence and readiness gaps,
- cost-benefit and opportunity-cost considerations,
- a step-by-step roadmap,
- a small-scale tester flow,
- scale conditions,
- success and stop criteria,
- and source-backed market evidence where relevant.

The framework should help the user learn as much as possible before they commit large amounts of time, money, or technical effort to an idea that may fail for avoidable reasons.

---

## 2. Problem

People can generate AI ideas quickly. They often struggle to evaluate those ideas with the same discipline they would apply to a major product, workflow, or investment decision.

Common failure modes include:

- starting with the desired technology instead of the underlying problem,
- copying a competitor’s AI feature without confirming whether the same user need exists,
- choosing an agent because the workflow has several steps even though a deterministic workflow could handle it,
- ignoring classical analytics or predictive ML because generative AI appears more current,
- assuming required data, integrations, permissions, or APIs exist without checking,
- underestimating human review, monitoring, retries, exception handling, or model/tool costs,
- calculating ROI before measuring the current baseline,
- spending heavily on a full workflow before testing whether the model can handle representative cases,
- and treating a technically feasible idea as a business priority without comparing the expected value against simpler alternatives.

A general-purpose LLM can discuss these questions, but an ordinary conversation does not automatically create a repeatable decision process.

The user may phrase the same opportunity differently and receive different advice. The model may follow the user’s framing, skip missing evidence, produce unsupported market claims, or recommend an architecture without comparing the alternatives.

AI Opportunity Lab adds a structured audit process around the model so the system asks the right missing questions, applies the same decision rules, exposes uncertainty, and ends with a practical test plan.

---

## 3. Product Goal

The product should help the user move from:

> “I have an AI idea.”

to:

> “I understand the problem, the evidence, the likely value, the realistic solution paths, the missing information, the risks, and the smallest useful test I should run before I invest further.”

The framework should help the user reduce avoidable resource waste by testing uncertain assumptions at small scale before moving into a larger implementation.

---

## 4. Users

### 4.1 Product managers and associate product managers

They can use the framework to evaluate AI features, workflow automations, internal tools, data products, and product concepts before committing them to a roadmap or technical build.

### 4.2 Indie hackers

They can use the framework to pressure-test an AI product idea before spending limited build time, API budget, or hosting cost on an implementation that may solve a weak problem or use unnecessary architecture.

### 4.3 Small businesses

They can use the framework to compare an AI solution with process redesign, existing software, deterministic automation, outsourcing, or additional human capacity before committing resources.

### 4.4 Data analysts

They can use the framework to assess opportunities involving forecasting, classification, anomaly detection, reporting, search, or AI-assisted analysis and to distinguish cases where conventional analytics or predictive ML may fit better than generative AI.

### 4.5 Product leads and functional managers

They can use completed audits to compare opportunities, review assumptions, and decide which ideas deserve validation, preparation, or a pilot.

### 4.6 AI transformation and innovation teams

They can use the framework as an intake and triage layer before a deeper technical, security, governance, or implementation process.

### 4.7 Founders and operators

They can use the framework to compare AI investment against simpler operational alternatives and understand which assumptions need validation before they scale.

### 4.8 Engineering and AI leads

They can use the output as a starting point for technical discovery after the user confirms the business context and the framework identifies the viable solution paths.

---

## 5. Jobs To Be Done

### Evaluate an idea

When I have an AI idea, help me determine whether the underlying problem deserves further investment and what evidence I still need.

### Compare solution paths

When several ways could solve the problem, help me compare them on expected value, complexity, readiness, risk, human involvement, and ongoing operating burden.

### Test before scaling

When I am unsure whether the idea will work, give me the smallest representative test that can reduce uncertainty before I commit substantial resources.

### Prepare the next stage

When I decide to move forward, give me a clear sequence of actions, outputs, metrics, and decision gates so I know what must happen before the next level of investment.

### Reassess later

When new evidence, market conditions, technology, cost, or readiness changes, let me rerun the same framework and compare the new decision with the previous one.

---

## 6. Product Principles

### 6.1 Extract before asking

The model must first extract every answer it can reasonably derive from the user’s initial idea description.

The system must not ask a question again when the user has already provided a clear answer.

### 6.2 Ask only decision-relevant questions

The system asks a clarification question only when the answer could materially change:

- problem strength,
- business value,
- economics,
- feasibility,
- architecture,
- risk,
- confidence,
- or the recommended next step.

### 6.3 Use context-aware multiple choice

Each clarification question gives the user three plausible context-aware choices plus a fourth **Custom answer** option.

The model should generate the three choices from the opportunity context rather than reuse generic answer sets when the context supports better options.

### 6.4 Keep the user in control

The user can choose a suggested answer, provide a custom answer, correct an extracted fact, or say that they do not know.

### 6.5 Treat “I do not know” as valid input

The framework records unknown information instead of forcing the user to guess.

Unknown information lowers confidence only when it matters to the decision.

### 6.6 Start with the problem

The audit begins with the problem, current workflow, desired outcome, and existing alternatives.

The user does not need to know the desired AI architecture before starting.

### 6.7 Compare realistic alternatives

The framework compares the proposed AI approach with relevant alternatives, including:

- process improvement,
- human execution,
- deterministic automation,
- conventional analytics,
- predictive ML,
- assistive LLM,
- retrieval-grounded AI,
- structured AI workflow,
- and agentic execution.

### 6.8 Keep evidence visible

The report distinguishes:

- user-confirmed facts,
- external evidence,
- framework-derived conclusions,
- estimates,
- assumptions,
- and unknowns.

### 6.9 Avoid false precision

The product does not invent exact ROI, implementation cost, market size, or probability of success.

When the user provides enough baseline information, the system can calculate transparent ranges or formulas.

When the user does not provide enough information, the system explains which numbers the user should measure.

### 6.10 Separate value from readiness

A valuable idea can lack the data, controls, or integrations required for a meaningful test today.

The framework should preserve the opportunity while identifying the preparation work.

### 6.11 Prefer learning before scale

When important uncertainty remains, the framework should recommend a small representative test before a larger rollout.

---

## 7. Initial Idea Capture

The user starts with one open input:

> **Describe the AI idea you are considering. Include as much or as little context as you currently have.**

The product should accept:

- a short sentence,
- a detailed paragraph,
- a workflow description,
- a product idea,
- a feature request,
- a business problem,
- or a rough concept.

The model should not require the user to understand the framework categories before they begin.

---

## 8. First-Pass Extraction

Before asking any question, the model extracts the information already present in the idea.

The structured extraction includes:

- proposed idea,
- affected user,
- current problem,
- current workflow,
- desired outcome,
- frequency or volume,
- known baseline,
- existing workaround,
- existing alternatives,
- required data,
- known systems,
- likely actions,
- known permissions,
- known constraints,
- sensitive-data indicators,
- business owner,
- and uncertainty.

Each extracted field receives one status:

- **Explicit** — the user stated it directly.
- **Inferred** — the model can reasonably infer it but the user did not state it directly.
- **Missing** — the idea does not provide enough information.
- **Not applicable** — the field does not apply to this opportunity.

The system must not treat an inferred field as confirmed.

---

## 9. Clarification Engine

### 9.1 Purpose

The clarification engine fills only the information gaps that could change the decision.

### 9.2 Question selection

The system ranks missing or ambiguous fields by decision impact.

It asks the highest-impact question first.

The system should usually need fewer questions for a detailed idea and more questions for a vague idea.

### 9.3 Question format

Every clarification question uses:

- one concise question,
- three context-aware suggested choices,
- one **Custom answer** option.

Example:

**What outcome matters most if this idea works?**

A. Reduce the time your support team spends triaging tickets  
B. Improve routing accuracy so fewer tickets reach the wrong team  
C. Increase support capacity without adding equivalent headcount  
D. Custom answer

The user can select one answer or type a custom response.

### 9.4 Dynamic question behavior

The next question changes based on:

- the original idea,
- previous answers,
- already confirmed information,
- the current framework gaps,
- and the risk level of the opportunity.

The assistant must not follow a fixed questionnaire when the opportunity does not require it.

### 9.5 Skip logic

The system skips a question when:

- the user already stated the answer clearly,
- the user confirmed an extracted answer,
- the field does not affect the current decision,
- or the field does not apply to the opportunity.

### 9.6 Confirmation behavior

The system does not force the user to reconfirm every explicit fact.

It only asks for confirmation when:

- the model inferred a fact that materially affects the decision,
- the user’s statements conflict,
- or the answer remains ambiguous.

### 9.7 Unknown behavior

The user can choose **I don’t know yet** inside the Custom answer path.

The system records the answer as `Unknown`.

It then decides whether to:

- continue with lower confidence,
- ask a more answerable follow-up,
- or mark the unknown as a prerequisite in the roadmap.

### 9.8 Clarification stop rule

The system stops asking questions when:

- it can produce a defensible decision state,
- it can compare the relevant solution paths,
- it can identify the major risks,
- and the remaining unknowns do not materially change the immediate next step.

---

## 10. Clarification Areas

The system can ask from the following areas when the initial description does not already answer them.

### 10.1 Affected user

The system identifies who experiences the problem or receives the value.

### 10.2 Current workflow

The system identifies how the work happens today.

### 10.3 Current pain

The system identifies where the existing workflow loses:

- time,
- money,
- accuracy,
- quality,
- capacity,
- customer value,
- or decision quality.

### 10.4 Frequency or volume

The system asks about scale only when scale affects the value or architecture decision.

### 10.5 Baseline

The system asks for the current measurable state when the user can reasonably know it.

Relevant baselines can include:

- minutes per task,
- cases per week,
- error rate,
- backlog,
- response time,
- conversion,
- cost,
- revenue,
- human review time,
- or another outcome metric.

### 10.6 Desired outcome

The system asks what should improve if the opportunity succeeds.

### 10.7 Existing alternatives

The system asks how the user currently handles the problem and whether they already tried a simpler process or tool.

### 10.8 Data

The system asks:

- what information the solution would need,
- whether the user knows where that information lives,
- and whether the user knows if the system can access it.

### 10.9 Systems and integrations

The system asks about systems only when the solution needs to read from or act through them.

It asks the user whether they know:

- which systems matter,
- whether controlled access exists,
- and whether the solution would need read-only or write access.

The framework records unknown answers rather than claiming readiness.

### 10.10 Permissions and control

The system asks what the solution could do, who approves important actions, and whether the team could reverse an incorrect action.

### 10.11 Sensitive information

The system asks whether the workflow involves regulated, personal, financial, employment, health, confidential, or proprietary information when the idea suggests that this may apply.

### 10.12 Ownership

The system asks who owns the outcome and who would decide whether a test succeeded.

### 10.13 Constraints

The system asks about relevant:

- budget,
- timeline,
- security,
- legal,
- vendor,
- infrastructure,
- or staffing constraints.

---

## 11. Structured Opportunity Summary

After the clarification stage, the product creates a structured summary.

The summary includes:

- the opportunity,
- the affected user,
- the problem,
- the current workflow,
- the desired outcome,
- the current baseline,
- existing alternatives,
- required data,
- required systems,
- expected actions,
- known constraints,
- confirmed facts,
- assumptions,
- and unknowns.

The user can edit any incorrect field before starting the audit.

The audit begins only after the user confirms the summary or accepts the remaining unknowns.

---

## 12. Audit Stages

### Stage 1 — Problem Strength

The framework tests whether the opportunity addresses a real, meaningful, and measurable problem.

### Stage 2 — Business Value

The framework identifies the expected value mechanism and the evidence required to quantify it.

### Stage 3 — Economics and Alternatives

The framework compares the proposed solution with simpler technology, human/process improvement, and the current process where relevant.

### Stage 4 — Feasibility and Operational Readiness

The framework evaluates only the data, integrations, permissions, process maturity, evaluation capability, ownership, and controls that the user confirmed during intake.

The system marks missing information as unknown.

### Stage 5 — Architecture Fit

The framework compares the technical patterns that fit the task shape.

### Stage 6 — Risk and Governance

The framework applies risk restrictions that can reduce autonomy, require human review, require preparation, or trigger specialist review.

### Stage 7 — Market Context

The research layer retrieves current external evidence when market context can materially change:

- feasibility,
- timing,
- differentiation,
- cost assumptions,
- regulation,
- or competitive context.

### Stage 8 — Recommendation

The framework produces the current decision state and identifies the largest remaining uncertainty.

### Stage 9 — Roadmap and Tester Flow

The system converts the recommendation into:

- a step-by-step action plan,
- a small-scale validation flow,
- go/no-go criteria,
- and scale conditions.

---

## 13. Decision States

The framework returns one of six decision states.

### Proceed to Pilot

The opportunity has enough evidence and readiness to justify a controlled representative test.

### Validate Value

The user needs stronger evidence about the problem, adoption, value magnitude, or baseline before technical investment makes sense.

### Prepare Dependencies

The opportunity looks valuable, but missing data, integrations, controls, ownership, or evaluation capability prevents a useful pilot.

### Use Simpler Approach

A lower-complexity solution can solve the important part of the problem with lower cost, risk, or operating burden.

### Human-Led / Do Not Automate

The critical decision or action should remain with a human because the stakes, accountability, or nature of the work makes autonomous execution inappropriate.

### Park

The current evidence does not justify further investment.

The report explains what would need to change before the user should reopen the idea.

---

## 14. Audit Report

The final report contains:

### 14.1 Executive Decision

The report states:

- the decision state,
- preferred current solution path,
- main reason,
- largest uncertainty,
- and confidence level.

### 14.2 Opportunity Definition

The report summarizes the confirmed problem, user, workflow, desired outcome, scope, and unresolved questions.

### 14.3 Problem Strength

The report shows:

- evidence,
- frequency,
- severity,
- reach,
- workaround,
- and measurable baseline.

### 14.4 Market Context

The report groups current external signals as:

- Supports
- Neutral
- Challenges

Each material claim includes a source.

### 14.5 Business Value

The report identifies the expected value mechanisms and the baseline required to measure them.

### 14.6 Economics and Alternatives

The report compares the relevant solution options.

For each option, it shows:

- expected benefit,
- implementation burden,
- ongoing cost drivers,
- human involvement,
- maintainability,
- reversibility,
- and confidence.

### 14.7 Feasibility and Readiness

The report shows what the user confirmed about:

- data,
- systems,
- integrations,
- permissions,
- process clarity,
- evaluation capability,
- observability,
- recovery,
- ownership,
- and operating capacity.

The report leaves unknown items visible.

### 14.8 Architecture Comparison

The report compares the strongest viable architectures and explains:

- how each would work,
- where each creates value,
- what each requires,
- what each costs operationally,
- what the human still owns,
- and why one path currently fits better than another.

### 14.9 Risk and Controls

The report lists:

- stakes,
- reversibility,
- blast radius,
- sensitive-data concerns,
- required human review,
- hard gates,
- and specialist-review needs.

### 14.10 Opportunity Cost

The report compares:

- build the proposed solution,
- choose a simpler option,
- delay,
- or continue the current process.

### 14.11 Opportunity Improvement Suggestions

The report suggests concrete changes that could strengthen the idea.

### 14.12 Step-by-Step Roadmap

The report turns the decision into a sequence of actions.

Every step includes:

- action,
- reason,
- required input,
- expected output,
- metric or evidence,
- and exit condition.

### 14.13 Tester Flow

The report gives the user a small-scale validation flow so they can learn before committing substantial resources.

The tester flow includes:

1. measure the current baseline,
2. choose a representative sample,
3. define success and failure thresholds before testing,
4. test the simplest realistic comparator,
5. test the proposed AI solution at limited scope,
6. keep high-risk actions read-only or human-approved,
7. measure outcome quality, errors, latency, cost, retries, and human intervention,
8. inspect failure cases,
9. compare results against the baseline and simpler alternative,
10. decide whether to stop, revise, prepare dependencies, expand the pilot, or scale.

### 14.14 Scale Path

When the small-scale tester succeeds, the report provides a staged scale path:

> representative test → controlled pilot → limited live use → broader rollout

Each stage includes an entry condition and an exit condition.

### 14.15 Success Metrics

The report recommends:

- one primary outcome metric,
- supporting operational/product metrics,
- AI quality metrics where relevant,
- human-control metrics where relevant,
- and cost per accepted outcome where appropriate.

### 14.16 Evidence Register

The report labels each material conclusion as:

- Confirmed by user
- External evidence
- Estimated
- Assumed
- Unknown
- Framework-derived

---

## 15. Model Dependence

The product uses a language model for:

- extracting information,
- selecting clarification questions,
- generating context-aware answer choices,
- summarizing market evidence,
- explaining architecture trade-offs,
- and drafting the report, roadmap, and tester flow.

Different models may phrase questions differently, identify different ambiguities, or interpret weak evidence differently.

The framework reduces decision drift by:

1. using the same required information model,
2. skipping fields the user already answered,
3. applying the same deterministic decision rules after extraction,
4. enforcing the same risk gates,
5. returning the same structured output schema,
6. recording assumptions and unknowns,
7. and running the same evaluation suite whenever the model changes.

The first release should use one fixed model so the team can measure behavior consistently.

The system should record:

- model identifier,
- prompt version,
- framework version,
- search provider,
- and timestamp.

A model change requires regression testing before release.

---

## 16. Roadmap Logic

### 16.1 Proceed to Pilot

The roadmap should:

1. confirm the baseline,
2. freeze the pilot scope,
3. create representative evaluation cases,
4. build the smallest viable architecture,
5. run offline or sandbox tests,
6. run a controlled pilot,
7. compare outcomes with the current process and simpler alternative,
8. review failures, human intervention, latency, and cost,
9. make the next scale decision.

### 16.2 Validate Value

The roadmap should:

1. identify the weakest value assumption,
2. gather user or workflow evidence,
3. measure the current baseline,
4. test desirability or adoption manually,
5. update the opportunity summary,
6. rerun the audit.

### 16.3 Prepare Dependencies

The roadmap should:

1. list blocking dependencies,
2. sequence them by decision impact,
3. assign ownership,
4. resolve the smallest blocker first,
5. create the required evaluation capability,
6. rerun readiness,
7. begin a pilot only after blocking conditions clear.

### 16.4 Use Simpler Approach

The roadmap should:

1. define the simpler solution,
2. identify how much of the target problem it can cover,
3. test it at low scope,
4. compare the result with the advanced solution hypothesis,
5. revisit more complex AI only when important unmet value remains.

### 16.5 Human-Led / Do Not Automate

The roadmap should:

1. identify the decision that must remain human,
2. identify safe assistive sub-tasks,
3. test assistance without autonomous action,
4. measure time or quality improvement,
5. review whether any additional automation can occur safely.

### 16.6 Park

The roadmap should:

1. record the reason,
2. record the missing evidence,
3. define a reopening trigger,
4. stop active spend,
5. reassess only when the trigger occurs.

---

## 17. Evaluation Requirements

The MVP must include a repeatable evaluation suite.

### 17.1 Clarification efficiency

The system should:

- avoid asking questions that the user already answered,
- ask only decision-critical questions,
- generate relevant answer choices,
- and accept a custom answer when none fit.

### 17.2 Extraction accuracy

The model must preserve the meaning of the original idea.

Critical invented facts count as failures.

### 17.3 Unknown handling

The system must keep missing:

- data,
- integrations,
- permissions,
- baselines,
- costs,
- and constraints

as unknown until the user confirms them.

### 17.4 Decision stability

Equivalent opportunity descriptions should produce materially similar decisions.

### 17.5 Architecture quality

The system should consider simpler and non-generative options when they fit.

### 17.6 Risk-gate compliance

Hard safety and governance gates must remain intact even when the opportunity has high business value.

### 17.7 Market citation quality

Material market claims must link to sources that actually support the claim.

### 17.8 Roadmap quality

The roadmap must match the decision state and sequence dependencies before implementation.

### 17.9 Tester-flow quality

The tester flow must include:

- baseline,
- representative sample,
- pre-defined success criteria,
- comparator,
- risk controls,
- failure analysis,
- cost measurement,
- and an explicit scale decision.

### 17.10 Cross-model stability

When the team changes models, the team reruns the same golden scenarios and compares:

- clarification behavior,
- decision state,
- architecture recommendation,
- hard gates,
- unsupported assumptions,
- and roadmap quality.

---

## 18. Guardrails

1. The system must not ask a question that the user already answered clearly.
2. The system must not present an inferred answer as confirmed.
3. The system must let the user provide a custom answer to every clarification question.
4. The system must record unknown information instead of forcing a guess.
5. The system must ask about data, integrations, controls, and permissions before it evaluates those dimensions.
6. The system must source material external claims.
7. The system must compare a simpler alternative whenever one plausibly exists.
8. The system must not treat agentic architecture as an automatic end state.
9. The system must not generate exact ROI without sufficient baseline data.
10. The system must recommend a limited test when important uncertainty remains.
11. The system must record model and framework versions.
12. The system must rerun evals after a model, prompt, search-provider, or framework change.

---

## 19. MVP Scope

### Included

- initial free-text idea description,
- model-driven information extraction,
- dynamic clarification questions,
- three context-aware answer choices plus Custom answer,
- skip logic for already answered fields,
- structured opportunity summary,
- user correction,
- current market research,
- structured audit,
- architecture comparison,
- economics and opportunity cost,
- readiness and risk review,
- decision state,
- step-by-step roadmap,
- tester flow,
- staged scale path,
- success and stop criteria,
- evidence register,
- evaluation suite,
- structured machine-readable output.

### Excluded

- automatic access to a company’s private systems,
- automatic discovery of company data or integrations,
- user accounts,
- organization workspaces,
- portfolio-wide prioritization in the first release,
- automatic security or legal approval,
- exact engineering estimates without sufficient inputs,
- autonomous pilot execution,
- direct enterprise integrations in the first release.

---

## 20. Future Scope

A later version can add:

- saved opportunities,
- side-by-side comparison,
- company-specific rules,
- internal cost baselines,
- connectors to internal systems,
- pilot-result tracking,
- forecast-versus-actual comparison,
- team comments and approvals,
- historical audit versions,
- API-first deployment,
- and reusable skill packages for internal assistants.

---

## 21. Research Sources

The following sources informed the product requirements:

- Microsoft Learn — *Intake and prioritize agent ideas*
- Microsoft Learn — *Manage the agent lifecycle*
- OpenAI Academy — *Skills vs. Agents*
- OpenAI Academy — *Workspace agents*
- OpenAI Academy — *AI workflow design coach*
- OpenAI — *A practical guide to building agents*
- OpenAI — *Inside our in-house data agent*
- NIST — *AI Risk Management Framework*
- NIST — *TEVV-Athlon Framework for Evaluating AI Systems*
