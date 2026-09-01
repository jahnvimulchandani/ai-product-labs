'use strict';

const COMMON_EVIDENCE = ['Current baseline', 'Representative sample', 'Failure categories'];

const ROADMAPS = {
  PROCEED_TO_PILOT: [
    ['Confirm baseline', 'Measure the current workflow before claiming lift.', 'Baseline time, cost, quality, and volume are documented.'],
    ['Freeze pilot scope', 'A constrained pilot keeps the test reversible and interpretable.', 'One segment, workflow, data source set, and outcome are selected.'],
    ['Build eval set', 'Representative and edge cases make quality visible before launch.', 'The eval set covers common cases, failure-prone cases, and risky cases.'],
    ['Build smallest viable architecture', 'Optional integrations and autonomy would blur what is being tested.', 'The smallest useful version is ready for sandbox testing.'],
    ['Run sandbox test', 'The team needs quality and failure data without live consequences.', 'Sandbox results meet the pilot threshold or reveal fixable gaps.'],
    ['Run controlled pilot', 'Limited live use shows workflow fit under human control.', 'Pilot outcomes beat baseline and the simpler comparator.'],
    ['Make scale decision', 'Scale should follow evidence, not initial enthusiasm.', 'Failures, cost, latency, and human interventions have been reviewed.'],
  ],
  VALIDATE_VALUE: [
    ['Identify weakest value assumption', 'The idea should not advance until the value claim is anchored.', 'The highest-impact unknown is named.'],
    ['Gather workflow evidence', 'User or workflow evidence should replace requester framing.', 'Observed pain, demand, or repeated pattern evidence is collected.'],
    ['Measure baseline', 'A baseline is required before saved effort or improved quality can be claimed.', 'Current handling time, cost, errors, or throughput are measured.'],
    ['Test desirability manually', 'A manual test can prove demand before software is built.', 'Users choose or reject the proposed workflow in a low-cost test.'],
    ['Rerun the audit', 'The decision should update only after the missing evidence changes.', 'The audit is rerun with confirmed value evidence.'],
  ],
  PREPARE_DEPENDENCIES: [
    ['List blocking dependencies', 'Readiness gaps must be explicit before build work starts.', 'Data, integration, ownership, evaluation, and control gaps are listed.'],
    ['Sequence by decision impact', 'The first dependency should be the one most likely to change the verdict.', 'Dependencies are ordered by decision impact and risk impact.'],
    ['Assign ownership', 'Unowned dependencies usually become hidden launch risk.', 'Each blocker has an accountable owner and due date.'],
    ['Resolve smallest blocker first', 'The team should learn quickly before committing to a broad build.', 'The smallest high-impact blocker is closed.'],
    ['Create evaluation capability', 'No pilot should begin without a way to judge outputs.', 'Representative cases and pass/fail rules exist.'],
    ['Rerun readiness', 'A pilot should start only after blocking conditions clear.', 'The audit shows readiness no longer blocks the next stage.'],
  ],
  USE_SIMPLER_APPROACH: [
    ['Define simpler solution', 'The simpler path must be concrete enough to test.', 'The lower-complexity workflow is specified.'],
    ['Map problem coverage', 'The team needs to know what value the simpler path can and cannot cover.', 'Covered and uncovered use cases are documented.'],
    ['Test at low scope', 'A small test can capture value without unnecessary AI complexity.', 'The simpler path runs on a representative slice.'],
    ['Compare with advanced hypothesis', 'Complex AI should earn its place against a cheaper comparator.', 'Measured results show whether more complexity is justified.'],
    ['Revisit only if needed', 'Advanced automation should wait until unmet value remains material.', 'A clear trigger exists for reconsidering the AI-heavy path.'],
  ],
  HUMAN_LED_DO_NOT_AUTOMATE: [
    ['Identify human-owned decision', 'High-stakes or rights-impacting decisions must keep accountable human judgement.', 'The decision that stays human is explicitly named.'],
    ['Find safe assistive subtasks', 'The opportunity may still have safe value around preparation or summarization.', 'Assistive tasks are listed without autonomous action.'],
    ['Test assistance only', 'The system should improve human work without making the consequential decision.', 'A suggest-only or draft-only test is scoped.'],
    ['Measure quality and control', 'Assistance must improve speed or consistency without eroding oversight.', 'Human correction, escalation, and override rates are tracked.'],
    ['Review any future automation', 'Further automation requires separate evidence and controls.', 'A future review trigger is defined.'],
  ],
  PARK: [
    ['Record parking reason', 'The team should preserve the decision logic without continuing spend.', 'The reason for parking is captured.'],
    ['Record missing evidence', 'The idea can be reopened only when the missing facts change.', 'Missing evidence is listed.'],
    ['Define reopening trigger', 'A trigger prevents passive drift back into build mode.', 'A measurable reopening condition is set.'],
    ['Stop active spend', 'Low-confidence ideas should not consume build capacity.', 'No implementation work remains active.'],
  ],
  INSUFFICIENT_INPUT: [
    ['Clarify the opportunity', 'There is not enough information to evaluate user, workflow, or outcome.', 'A concrete user, workflow, and intended outcome are written down.'],
    ['Separate facts from guesses', 'Unknowns should stay unknown until the user provides evidence.', 'Confirmed facts, assumptions, and unknowns are separated.'],
    ['Rerun extraction', 'The audit can only begin after the description contains decision-shaped inputs.', 'The extractor produces enough known fields to continue.'],
  ],
  NEEDS_CLARIFICATION: [
    ['Answer blocking questions', 'The current record contains unknowns that can change the decision.', 'Decision-changing questions have confirmed answers or remain explicitly unknown.'],
    ['Update the record', 'Rules should consume structured fields, not revised prose.', 'Confirmed answers are written into the opportunity record.'],
    ['Rerun audit', 'The verdict should follow the updated record.', 'The audit is regenerated after clarification.'],
  ],
};

function roadmapForDecision(decision) {
  const items = ROADMAPS[decision] || ROADMAPS.NEEDS_CLARIFICATION;
  return items.map(([title, why, exit], index) => ({
    step: index + 1,
    title,
    action: title,
    why,
    owner_type: index === 0 ? 'Product owner' : 'Product and engineering',
    required_inputs: index === 0 ? ['Opportunity record', ...COMMON_EVIDENCE] : ['Prior step output'],
    expected_output: exit,
    evidence_to_collect: COMMON_EVIDENCE,
    exit_condition: exit,
  }));
}

function testerFlowForDecision(decision, architecture = 'the proposed approach') {
  const humanControl = decision === 'HUMAN_LED_DO_NOT_AUTOMATE'
    ? 'Human owns the decision; the system may only draft, summarize, or suggest.'
    : 'Human approval remains in place until quality, failure handling, and rollback are proven.';

  return {
    objective: `Test whether ${architecture} improves the workflow without creating unacceptable risk.`,
    representative_sample: 'Use a small set of recent, representative cases plus edge cases that are likely to fail.',
    baseline: 'Measure the current manual or simpler workflow before comparing AI-assisted results.',
    simplest_comparator: 'Compare against the simplest non-agentic workflow that could solve the same user problem.',
    proposed_test: decision === 'HUMAN_LED_DO_NOT_AUTOMATE'
      ? 'Run the system in assistive mode only; it must not execute the consequential action.'
      : 'Run the smallest viable version in sandbox or controlled pilot mode.',
    human_control: humanControl,
    success_criteria: [
      'Output quality beats the baseline or simpler comparator on the primary metric.',
      'Human correction and escalation rates are acceptable for the workflow.',
      'No hard risk gate remains open for the tested scope.',
    ],
    stop_criteria: [
      'The system makes an unsafe or unrecoverable recommendation.',
      'Failure modes cannot be detected before user or business harm.',
      'The measured value does not justify build or operating cost.',
    ],
    measurements: [
      'Cycle time per case',
      'Accepted-output rate',
      'Human correction rate',
      'Escalation rate',
      'Cost per accepted outcome',
    ],
    failure_analysis: ['DATA', 'REASONING', 'WORKFLOW', 'RISK_CONTROL'],
    go_no_go_rule: 'Proceed only if the test beats baseline, keeps human control intact, and closes every blocking gate for the pilot scope.',
    steps: [
      {
        step: 1,
        action: 'Select representative cases and edge cases.',
        expected_output: 'A test set with normal, ambiguous, and risky examples.',
        measurement: 'Coverage of common and high-risk case types.',
        pass_condition: 'The sample reflects the workflow the pilot will actually face.',
        stop_condition: 'The team cannot produce representative cases.',
      },
      {
        step: 2,
        action: 'Run the current workflow and simplest comparator.',
        expected_output: 'Baseline and comparator results.',
        measurement: 'Time, quality, cost, and control metrics.',
        pass_condition: 'The baseline is measurable enough for comparison.',
        stop_condition: 'No reliable baseline can be established.',
      },
      {
        step: 3,
        action: 'Run the proposed AI workflow under human review.',
        expected_output: 'AI-assisted outputs with reviewer notes.',
        measurement: 'Accepted-output rate, corrections, escalations, and failure modes.',
        pass_condition: 'Results beat the comparator without opening risk gates.',
        stop_condition: 'Unsafe, undetectable, or repeated failures appear.',
      },
      {
        step: 4,
        action: 'Review go/no-go evidence.',
        expected_output: 'Pilot, dependency, simplify, or park decision.',
        measurement: 'Decision confidence and unresolved unknowns.',
        pass_condition: 'The next decision is supported by measured evidence.',
        stop_condition: 'The evidence remains too weak to justify the next stage.',
      },
    ],
  };
}

function scalePath() {
  return [
    {
      stage: 'REPRESENTATIVE_TEST',
      objective: 'Prove the workflow on representative cases before live exposure.',
      scope: 'Offline or sandbox test set.',
      entry_conditions: ['Opportunity record is structured', 'Baseline is defined'],
      controls: ['No live action', 'Human review of every output'],
      metrics: ['Accepted-output rate', 'Failure categories', 'Cycle time'],
      exit_conditions: ['Quality threshold met', 'Failure modes are understood'],
    },
    {
      stage: 'CONTROLLED_PILOT',
      objective: 'Test the workflow with limited live use and clear oversight.',
      scope: 'One user group, one workflow, limited volume.',
      entry_conditions: ['Representative test passed', 'Blocking gates closed for pilot scope'],
      controls: ['Human approval', 'Rollback path', 'Escalation route'],
      metrics: ['Human correction rate', 'Escalation rate', 'Cost per accepted outcome'],
      exit_conditions: ['Pilot beats baseline', 'Control burden is acceptable'],
    },
    {
      stage: 'LIMITED_LIVE_USE',
      objective: 'Expand volume without expanding autonomy beyond proven controls.',
      scope: 'More cases within the same workflow boundary.',
      entry_conditions: ['Controlled pilot passed', 'Monitoring is in place'],
      controls: ['Sampling review', 'Exception handling', 'Regression evals'],
      metrics: ['Drift rate', 'Override rate', 'Latency', 'Adoption rate'],
      exit_conditions: ['Metrics remain stable', 'No new hard gates appear'],
    },
    {
      stage: 'BROADER_ROLLOUT',
      objective: 'Scale only after value, quality, and governance are repeatable.',
      scope: 'Additional teams or adjacent workflows.',
      entry_conditions: ['Limited live use is stable', 'Owners accept operating burden'],
      controls: ['Change management', 'Periodic audits', 'Incident review'],
      metrics: ['Business outcome metric', 'Risk incidents', 'Operating cost'],
      exit_conditions: ['The workflow is production-ready with named owners and ongoing evals'],
    },
  ];
}

module.exports = { roadmapForDecision, testerFlowForDecision, scalePath };

