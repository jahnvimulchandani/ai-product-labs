'use strict';

/**
 * CONVERGENCE CASES
 *
 * Each case carries the prose AND the field values a perfect extractor would
 * produce from it. That pairing is what lets the suite answer the question
 * that matters in a hybrid system: when the audit is wrong, is the rule wrong
 * or did the extraction miss?
 *
 * The oracle fields are hand-written from the prose. They are the answer key
 * for extraction and the input fixture for the rules, and they were written
 * before the rules were tuned against them.
 *
 * Cases are drawn from the golden set, the v0.2 hold-out set, and the blind
 * set that exposed v0.2's real generalisation of 1/8. The safety-critical ones
 * are flagged: those are the cases both earlier engines cleared at LOW risk.
 */

const cases = [
  {
    id: 'C-01', title: 'Overdue invoice reminder',
    idea: 'If an invoice is still unpaid 7 days after its due date, send the customer a reminder email automatically. It happens about 40 times a week and takes a clerk five minutes each.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'QUANTIFIED', demand_evidence: 'REQUESTED',
      frequency_per_year: 2080, minutes_per_occurrence: 5, people_affected: 1, value_mechanism: 'TIME_SAVED', baseline_measured: true,
      organisational_failure: false, interpretation_complexity: 'NONE', prediction_need: 'NONE',
      knowledge_grounding: 'NONE', path_variability: 'FIXED', stage_count: 2, tool_use: 'WRITE',
      action_target: 'EXTERNAL_COMMUNICATION', stakes: 'LOW', error_detectability: 'MEDIUM',
      reversibility: 'RECOVERABLE', recovery_path_exists: true, sensitive_data: 'INTERNAL',
      rights_impact: false, untrusted_input: false, human_review_point: 'SAMPLE',
      autonomy_requested: 'APPROVE_EXCEPTIONS', accountable_owner: 'finance lead',
      data_available: true, integration_access_confirmed: true, data_fragmented: false,
    },
    expect_decision: ['USE_SIMPLER_APPROACH'], expect_gates: [],
  },
  {
    id: 'C-02', title: 'Internal SOP question answering',
    idea: 'Employees keep asking the operations team about our internal SOPs. The SOP library changes every few weeks. I want an assistant that answers using the latest approved SOP and shows the source section. Ops fields about 30 of these a week, five minutes each.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'QUANTIFIED', demand_evidence: 'REQUESTED',
      frequency_per_year: 1560, minutes_per_occurrence: 5, people_affected: 2, value_mechanism: 'TIME_SAVED', baseline_measured: true,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'NONE',
      knowledge_grounding: 'PROPRIETARY_CHANGING', source_traceability_required: true,
      path_variability: 'FIXED', stage_count: 2, tool_use: 'READ', action_target: 'NONE',
      stakes: 'LOW', error_detectability: 'MEDIUM', reversibility: 'REVERSIBLE',
      sensitive_data: 'INTERNAL', rights_impact: false, untrusted_input: false,
      human_review_point: 'SAMPLE', autonomy_requested: 'SUGGEST_ONLY', accountable_owner: 'ops lead',
      data_available: true, integration_access_confirmed: true, data_fragmented: false,
    },
    expect_decision: ['PROCEED_TO_PILOT'], expect_gates: [],
  },
  {
    id: 'C-03', title: 'Autonomous contract termination', safety_critical: true,
    idea: 'We want AI to review enterprise contract usage and payment history, decide when a customer has materially breached terms, terminate the contract, and send the termination notice automatically.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'ANECDOTAL', demand_evidence: 'REQUESTED',
      value_mechanism: 'RISK_REDUCTION', baseline_measured: false,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'NONE',
      knowledge_grounding: 'PROPRIETARY_STATIC', path_variability: 'BRANCHING', stage_count: 4,
      tool_use: 'WRITE', action_target: 'EXTERNAL_COMMUNICATION',
      stakes: 'HIGH', error_detectability: 'LOW', reversibility: 'IRREVERSIBLE',
      recovery_path_exists: false, sensitive_data: 'INTERNAL', rights_impact: true,
      untrusted_input: false, human_review_point: 'NONE', autonomy_requested: 'FULL_AUTONOMY',
    },
    expect_decision: ['HUMAN_LED_DO_NOT_AUTOMATE'],
    expect_gates: ['HIGH_STAKES_LOW_DETECTABILITY', 'IRREVERSIBLE_ACTION_WEAK_RECOVERY'],
  },
  {
    id: 'C-04', title: 'Autonomous claim adjudication', safety_critical: true,
    idea: 'The system should approve or deny insurance claims end to end with no adjuster involved, and send the decision letter to the policyholder straight away.',
    oracle_fields: {
      affected_user: 'customer', pain_evidence_level: 'ANECDOTAL', demand_evidence: 'REQUESTED',
      value_mechanism: 'TURNAROUND_TIME', baseline_measured: false,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'CLASSIFY',
      knowledge_grounding: 'PROPRIETARY_STATIC', path_variability: 'BRANCHING', stage_count: 3,
      tool_use: 'WRITE', action_target: 'EXTERNAL_COMMUNICATION',
      stakes: 'HIGH', error_detectability: 'LOW', reversibility: 'IRREVERSIBLE',
      recovery_path_exists: false, sensitive_data: 'REGULATED', data_controls_confirmed: false,
      rights_impact: true, untrusted_input: false, human_review_point: 'NONE',
      autonomy_requested: 'FULL_AUTONOMY',
    },
    expect_decision: ['HUMAN_LED_DO_NOT_AUTOMATE'],
    expect_gates: ['HIGH_STAKES_LOW_DETECTABILITY', 'IRREVERSIBLE_ACTION_WEAK_RECOVERY', 'SENSITIVE_DATA_CONTROLS_UNKNOWN'],
  },
  {
    id: 'C-05', title: 'External email writes to pricing', safety_critical: true,
    idea: 'Build an agent that reads incoming vendor emails from outside the company and updates our live pricing table directly when it spots a price change.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'REPEATED_PATTERN', demand_evidence: 'REQUESTED',
      frequency_per_year: 250, minutes_per_occurrence: 10, people_affected: 1,
      value_mechanism: 'TIME_SAVED', baseline_measured: false,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'NONE',
      knowledge_grounding: 'NONE', path_variability: 'BRANCHING', stage_count: 3,
      tool_use: 'WRITE', action_target: 'INTERNAL_RECORD',
      stakes: 'MEDIUM', error_detectability: 'LOW', reversibility: 'RECOVERABLE',
      recovery_path_exists: false, sensitive_data: 'INTERNAL', rights_impact: false,
      untrusted_input: true, human_review_point: 'NONE', autonomy_requested: 'FULL_AUTONOMY',
      data_available: true, integration_access_confirmed: false,
    },
    expect_decision: ['PREPARE_DEPENDENCIES', 'HUMAN_LED_DO_NOT_AUTOMATE'],
    expect_gates: ['UNTRUSTED_CONTENT_WITH_TOOL_ACTIONS'],
  },
  {
    id: 'C-06', title: 'Grant eligibility letters', safety_critical: true,
    idea: 'The system should read each grant application, decide eligibility against the funding rules, and post the outcome letter to the applicant with nobody checking it first.',
    oracle_fields: {
      affected_user: 'customer', pain_evidence_level: 'REPEATED_PATTERN', demand_evidence: 'REQUESTED',
      frequency_per_year: 500, minutes_per_occurrence: 30, people_affected: 2,
      value_mechanism: 'TURNAROUND_TIME', baseline_measured: false,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'CLASSIFY',
      knowledge_grounding: 'PROPRIETARY_STATIC', source_traceability_required: false,
      path_variability: 'BRANCHING', stage_count: 3, tool_use: 'WRITE',
      action_target: 'EXTERNAL_COMMUNICATION', stakes: 'HIGH', error_detectability: 'LOW',
      reversibility: 'IRREVERSIBLE', recovery_path_exists: false, sensitive_data: 'PERSONAL',
      data_controls_confirmed: false, rights_impact: true, untrusted_input: false,
      human_review_point: 'NONE', autonomy_requested: 'FULL_AUTONOMY',
    },
    expect_decision: ['HUMAN_LED_DO_NOT_AUTOMATE'],
    expect_gates: ['HIGH_STAKES_LOW_DETECTABILITY', 'IRREVERSIBLE_ACTION_WEAK_RECOVERY', 'SENSITIVE_DATA_CONTROLS_UNKNOWN'],
  },
  {
    id: 'C-07', title: 'Scraped reviews to roadmap tool', safety_critical: true,
    idea: 'Build an agent that crawls third-party review sites for mentions of our product, works out which complaints are real, and creates tickets in our roadmap tool by itself.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'REPEATED_PATTERN', demand_evidence: 'REQUESTED',
      frequency_per_year: 250, minutes_per_occurrence: 20, people_affected: 1,
      value_mechanism: 'TIME_SAVED', baseline_measured: false,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'CLASSIFY',
      knowledge_grounding: 'NONE', path_variability: 'VARIABLE', dynamic_planning_required: true,
      stage_count: 3, tool_use: 'WRITE', action_target: 'INTERNAL_RECORD',
      stakes: 'MEDIUM', error_detectability: 'LOW', reversibility: 'REVERSIBLE',
      recovery_path_exists: false, sensitive_data: 'INTERNAL', rights_impact: false,
      untrusted_input: true, human_review_point: 'NONE', autonomy_requested: 'FULL_AUTONOMY',
      data_available: true, integration_access_confirmed: false,
    },
    expect_decision: ['PREPARE_DEPENDENCIES'],
    expect_gates: ['UNTRUSTED_CONTENT_WITH_TOOL_ACTIONS'],
  },
  {
    id: 'C-08', title: 'Nurse handover notes', safety_critical: true,
    idea: 'Nurses hand over at shift change and things get missed. We think an AI could summarise the notes. We have not measured how often anything is actually missed and we do not know if we are allowed to process the notes at all.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'ANECDOTAL', demand_evidence: 'REQUESTED',
      value_mechanism: 'ERROR_REDUCTION', baseline_measured: false,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'NONE',
      knowledge_grounding: 'NONE', path_variability: 'FIXED', stage_count: 2,
      tool_use: 'READ', action_target: 'NONE', stakes: 'HIGH', error_detectability: 'MEDIUM',
      reversibility: 'REVERSIBLE', sensitive_data: 'REGULATED', data_controls_confirmed: false,
      rights_impact: false, untrusted_input: false, human_review_point: 'EVERY_CASE',
      autonomy_requested: 'SUGGEST_ONLY', data_available: true, integration_access_confirmed: false,
    },
    expect_decision: ['VALIDATE_VALUE', 'PREPARE_DEPENDENCIES'],
    expect_gates: ['SENSITIVE_DATA_CONTROLS_UNKNOWN'],
  },
  {
    id: 'C-09', title: 'Loan default scoring',
    idea: 'We have five years of loan applications with repayment outcomes. I want to score new applicants on how likely they are to default so the credit team can prioritise reviews. About 400 applications a month, twenty minutes of review each.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'QUANTIFIED', demand_evidence: 'REQUESTED',
      frequency_per_year: 4800, minutes_per_occurrence: 20, people_affected: 4,
      value_mechanism: 'CAPACITY_CREATED', baseline_measured: true,
      organisational_failure: false, interpretation_complexity: 'LOW', prediction_need: 'RANK',
      labelled_history_available: true, knowledge_grounding: 'NONE',
      path_variability: 'FIXED', stage_count: 2, tool_use: 'READ', action_target: 'NONE',
      stakes: 'HIGH', error_detectability: 'HIGH', reversibility: 'REVERSIBLE',
      sensitive_data: 'REGULATED', data_controls_confirmed: false, rights_impact: false,
      untrusted_input: false, human_review_point: 'EVERY_CASE', autonomy_requested: 'SUGGEST_ONLY',
      data_available: true, integration_access_confirmed: true, data_fragmented: false,
    },
    expect_decision: ['PREPARE_DEPENDENCIES'],
    expect_gates: ['SENSITIVE_DATA_CONTROLS_UNKNOWN'],
  },
  {
    id: 'C-10', title: 'Field manual question answering',
    idea: 'Our field engineers need answers from a 900-page equipment manual that is revised quarterly, and they must see the page reference for every answer. They call the depot several times a day, ten minutes a call.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'QUANTIFIED', demand_evidence: 'REQUESTED',
      frequency_per_year: 750, minutes_per_occurrence: 10, people_affected: 3,
      value_mechanism: 'TIME_SAVED', baseline_measured: true,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'NONE',
      knowledge_grounding: 'PROPRIETARY_CHANGING', source_traceability_required: true,
      path_variability: 'FIXED', stage_count: 2, tool_use: 'READ', action_target: 'NONE',
      stakes: 'MEDIUM', error_detectability: 'MEDIUM', reversibility: 'REVERSIBLE',
      sensitive_data: 'INTERNAL', rights_impact: false, untrusted_input: false,
      human_review_point: 'SAMPLE', autonomy_requested: 'SUGGEST_ONLY',
      data_available: true, integration_access_confirmed: true, data_fragmented: false,
    },
    expect_decision: ['PROCEED_TO_PILOT'], expect_gates: [],
  },
  {
    id: 'C-11', title: 'Stalled marketing approvals',
    idea: 'Marketing spend approvals stall for weeks because nobody knows who owns the final sign-off. I want to automate the approval chain. It affects maybe two requests a week.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'REPEATED_PATTERN', demand_evidence: 'REQUESTED',
      frequency_per_year: 104, minutes_per_occurrence: 30, people_affected: 3,
      value_mechanism: 'TURNAROUND_TIME', baseline_measured: false,
      organisational_failure: true, interpretation_complexity: 'NONE', prediction_need: 'NONE',
      knowledge_grounding: 'NONE', path_variability: 'FIXED', stage_count: 2,
      tool_use: 'READ', action_target: 'INTERNAL_RECORD', stakes: 'LOW',
      error_detectability: 'HIGH', reversibility: 'REVERSIBLE', sensitive_data: 'INTERNAL',
      rights_impact: false, untrusted_input: false, human_review_point: 'EVERY_CASE',
      autonomy_requested: 'APPROVE_EACH', data_available: true, integration_access_confirmed: true,
    },
    expect_decision: ['USE_SIMPLER_APPROACH', 'PARK'], expect_gates: [],
  },
  {
    id: 'C-12', title: 'Quarterly board narrative',
    idea: 'Once a quarter I spend about twenty minutes writing the narrative paragraph on top of the board pack. I want AI to draft it for me.',
    oracle_fields: {
      affected_user: 'single role', pain_evidence_level: 'QUANTIFIED', demand_evidence: 'NONE',
      frequency_per_year: 4, minutes_per_occurrence: 20, people_affected: 1,
      value_mechanism: 'TIME_SAVED', baseline_measured: true,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'NONE',
      knowledge_grounding: 'NONE', path_variability: 'FIXED', stage_count: 1,
      tool_use: 'READ', action_target: 'NONE', stakes: 'LOW', error_detectability: 'HIGH',
      reversibility: 'REVERSIBLE', sensitive_data: 'INTERNAL', rights_impact: false,
      untrusted_input: false, human_review_point: 'EVERY_CASE', autonomy_requested: 'SUGGEST_ONLY',
      data_available: true, integration_access_confirmed: true,
    },
    expect_decision: ['PARK', 'USE_SIMPLER_APPROACH'], expect_gates: [],
  },
  {
    id: 'C-13', title: 'Competitor chatbot pressure',
    idea: 'Three competitors launched AI chatbots, so our CEO wants one in our SaaS product too. We do not currently have strong customer requests for chat, but it would help us look modern.',
    oracle_fields: {
      affected_user: 'customer', pain_evidence_level: 'HYPOTHESIS', demand_evidence: 'COMPETITOR_DRIVEN',
      value_mechanism: 'STRATEGIC_CAPABILITY', baseline_measured: false,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'NONE',
      knowledge_grounding: 'NONE', path_variability: 'FIXED', stage_count: 1,
      tool_use: 'NONE', action_target: 'NONE', stakes: 'LOW', error_detectability: 'MEDIUM',
      reversibility: 'REVERSIBLE', sensitive_data: 'INTERNAL', rights_impact: false,
      untrusted_input: false, human_review_point: 'NONE', autonomy_requested: 'SUGGEST_ONLY',
    },
    expect_decision: ['VALIDATE_VALUE', 'PARK'], expect_gates: [],
  },
  {
    id: 'C-14', title: 'Agent requested for survey synthesis',
    idea: 'I definitely want an autonomous AI agent that takes 100 survey responses, summarizes the themes, and gives me the top 5 pain points. No tools or external actions are needed; I just want the agent because agents are the future.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'REPEATED_PATTERN', demand_evidence: 'REQUESTED',
      frequency_per_year: 12, minutes_per_occurrence: 180, people_affected: 1,
      value_mechanism: 'TIME_SAVED', baseline_measured: false,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'NONE',
      knowledge_grounding: 'NONE', path_variability: 'FIXED', stage_count: 2,
      tool_use: 'NONE', action_target: 'NONE', dynamic_planning_required: false,
      stakes: 'LOW', error_detectability: 'HIGH', reversibility: 'REVERSIBLE',
      sensitive_data: 'INTERNAL', rights_impact: false, untrusted_input: false,
      human_review_point: 'EVERY_CASE', autonomy_requested: 'SUGGEST_ONLY',
      data_available: true, integration_access_confirmed: true,
    },
    expect_decision: ['PROCEED_TO_PILOT', 'USE_SIMPLER_APPROACH'], expect_gates: [],
  },
  {
    id: 'C-15', title: 'Warehouse pick anomaly detection',
    idea: 'We log every pick in the warehouse, roughly 40000 events a month across three years. I want to flag anomalous picking patterns so supervisors can investigate them.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'QUANTIFIED', demand_evidence: 'REQUESTED',
      frequency_per_year: 480000, minutes_per_occurrence: 1, people_affected: 1,
      value_mechanism: 'ERROR_REDUCTION', baseline_measured: true,
      organisational_failure: false, interpretation_complexity: 'NONE', prediction_need: 'ANOMALY',
      labelled_history_available: true, knowledge_grounding: 'NONE',
      path_variability: 'FIXED', stage_count: 2, tool_use: 'READ', action_target: 'NONE',
      stakes: 'LOW', error_detectability: 'HIGH', reversibility: 'REVERSIBLE',
      sensitive_data: 'INTERNAL', rights_impact: false, untrusted_input: false,
      human_review_point: 'EVERY_CASE', autonomy_requested: 'SUGGEST_ONLY',
      data_available: true, integration_access_confirmed: true, data_fragmented: false,
    },
    expect_decision: ['PROCEED_TO_PILOT'], expect_gates: [],
  },
  {
    id: 'C-16', title: 'Churn investigation across systems',
    idea: 'We lose meaningful revenue when enterprise customers churn. We want to combine CRM notes, support history, usage events and billing data to spot at-risk accounts. The data lives in four systems and we have not checked whether APIs or permissions exist.',
    oracle_fields: {
      affected_user: 'internal team', pain_evidence_level: 'REPEATED_PATTERN', demand_evidence: 'REQUESTED',
      frequency_per_year: 52, minutes_per_occurrence: 120, people_affected: 2,
      value_mechanism: 'RETENTION', baseline_measured: false,
      organisational_failure: false, interpretation_complexity: 'HIGH', prediction_need: 'RANK',
      labelled_history_available: true, knowledge_grounding: 'NONE',
      path_variability: 'BRANCHING', stage_count: 3, tool_use: 'READ', action_target: 'NONE',
      stakes: 'MEDIUM', error_detectability: 'HIGH', reversibility: 'REVERSIBLE',
      sensitive_data: 'INTERNAL', rights_impact: false, untrusted_input: false,
      human_review_point: 'EVERY_CASE', autonomy_requested: 'SUGGEST_ONLY',
      data_available: true, data_fragmented: true, integration_access_confirmed: false,
    },
    expect_decision: ['PREPARE_DEPENDENCIES'], expect_gates: [],
  },
];

/**
 * Paraphrase pairs. Same facts, different wording. Both engines before this
 * one lost the gates on P-01 when the wording changed.
 */
const paraphrases = [
  {
    id: 'P-01',
    a: 'An AI reviews vendor performance and automatically sends the termination notice when the vendor misses targets, with no manager approval.',
    b: 'Build a system that reads vendor agreements and, with no person in the loop, issues the cancellation letter when it decides the vendor has breached terms.',
    must_match: ['gates', 'tier'],
  },
  {
    id: 'P-02',
    a: 'Employees keep asking about our internal SOPs. The library changes every few weeks. I want an assistant that answers using the latest approved SOP and shows the source section.',
    b: 'Staff constantly ping the ops team about our written procedures. Those documents get revised often. I want a bot that replies using the newest signed-off version and points to the exact clause.',
    must_match: ['gates', 'tier'],
  },
  {
    id: 'P-03',
    a: 'Summarise our monthly survey responses into themes for the product team.',
    b: 'I want an autonomous agent that summarises our monthly survey responses into themes for the product team.',
    /**
     * Only architecture must match here. Variant b genuinely states something
     * variant a does not (full autonomy), so the risk read SHOULD differ: that
     * is correct extraction, not drift. What must not change is the
     * architecture, because framework 10.4 says asking for an agent does not
     * make the task shape agentic. Checking gates on this pair as well would
     * have been the eval being wrong, not the engine.
     */
    must_match: ['architecture'],
  },
];

module.exports = { cases, paraphrases };
