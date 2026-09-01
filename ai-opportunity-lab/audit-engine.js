'use strict';

const { normalizeInput } = require('./input-model');
const { selectArchitecture } = require('./architecture-rules');
const { evaluateRisk } = require('./risk-rules');
const { evaluateScores } = require('./scoring-rules');
const { decideState, DECISION } = require('./decision-rules');
const { roadmapForDecision, testerFlowForDecision, scalePath } = require('./roadmap-rules');

/**
 * AUDIT ASSEMBLY
 *
 * WHY THE OUTPUT SHAPE CHANGED
 *
 * v0.1 emitted 11 of the 18 blocks audit-schema.json marks as required.
 * Validating its output produced 41 violations, including 7 entire blocks
 * missing (opportunity, evidence_register, economics_and_alternatives,
 * market_context, opportunity_cost, improvement_recommendations, metrics)
 * and 4 missing required properties inside business_value alone. Nothing in
 * the harness reported this, so the contract was drifting silently.
 *
 * v0.2 emits every required block. Where the deterministic engine genuinely
 * cannot produce content (market research needs a search provider), it emits
 * the block with an explicit UNKNOWN / research_used:false rather than
 * omitting it. That is the difference between "not implemented" and
 * "implemented as not-applicable", and only the second one is honest.
 */

const ev = (value, status, note) => ({ value: value == null ? null : String(value), evidence_status: status, note: note || '' });

function evidenceRegister(input, scores) {
  const confirmed = [];
  if (input.hasFacts) {
    confirmed.push({
      claim: 'Facts supplied by the user during clarification.',
      source_kind: 'USER',
      source_reference: 'confirmed_facts',
      why_it_matters: 'These are treated as CONFIRMED and may drive the recommendation.',
    });
  }
  const q = scores.quantities;
  const estimates = [];
  if (q.occurrencesPerYear != null) {
    estimates.push({
      claim: `Approximately ${q.occurrencesPerYear} occurrences per year, derived from stated cadence.`,
      source_kind: 'DERIVED', source_reference: 'quantity parser',
      why_it_matters: 'Used only for a coarse value band, not for a currency figure.',
    });
  }
  return {
    confirmed_facts: confirmed,
    supported_facts: [],
    estimates,
    assumptions: [{
      claim: 'The described workflow is representative of normal operation.',
      source_kind: 'ASSUMPTION', source_reference: 'engine default',
      why_it_matters: 'If edge cases dominate, value and risk both change.',
    }],
    unknowns: (input.unknownLabels || []).map((u) => ({
      claim: String(u), source_kind: 'USER', source_reference: 'intentionally_unknown',
      why_it_matters: 'Lowers confidence and may block a pilot. Never used as positive evidence.',
    })),
  };
}

function economics(scores, architecture) {
  const attractive = scores.value === 'HIGH' ? 'PROMISING'
    : scores.value === 'LOW' ? 'WEAK' : 'UNCLEAR';
  const simpler = architecture.simpler_alternative;
  return {
    economic_attractiveness: attractive,
    confidence: scores.valueConfidence,
    current_process_baseline: ev(
      scores.effort.annualMinutes != null ? `~${Math.round(scores.effort.annualMinutes / 60)} hours per year of current effort` : null,
      scores.baselineStatus === 'AVAILABLE' ? 'ESTIMATED' : 'UNKNOWN',
      'Derived from stated frequency and duration. Confirm before using in any ROI figure.',
    ),
    options: [
      {
        name: 'Do nothing', approach: 'Keep the current process unchanged.',
        expected_benefit: 'No spend, no change.',
        one_time_cost_drivers: [], ongoing_cost_drivers: ['Continuing cost of the current workflow'],
        human_involvement: 'Unchanged', maintainability: 'HIGH', reversibility: 'HIGH',
        time_to_learn: 'None', confidence: 'HIGH',
      },
      simpler ? {
        name: `Simpler option: ${simpler}`, approach: 'Lower-complexity path covering the core of the workflow.',
        expected_benefit: 'Captures part of the value with materially lower operating burden.',
        one_time_cost_drivers: ['Build or configuration'], ongoing_cost_drivers: ['Maintenance of rules or prompts'],
        human_involvement: 'Reduced but present', maintainability: 'HIGH', reversibility: 'HIGH',
        time_to_learn: 'Days', confidence: scores.valueConfidence,
      } : null,
      architecture.best_current_fit ? {
        name: `Proposed: ${architecture.best_current_fit}`, approach: 'The preferred current path from the architecture comparison.',
        expected_benefit: 'Addresses the full described workflow.',
        one_time_cost_drivers: ['Build', 'Integration', 'Eval set creation'],
        ongoing_cost_drivers: ['Model or tool cost', 'Human review', 'Monitoring', 'Regression evals'],
        human_involvement: 'Review of important outcomes', maintainability: 'MEDIUM', reversibility: 'MEDIUM',
        time_to_learn: 'Weeks', confidence: scores.valueConfidence,
      } : null,
    ].filter(Boolean),
    dominant_alternative: scores.value === 'LOW' && simpler ? simpler : null,
    major_cost_drivers: ['Human review time', 'Integration effort', 'Ongoing evaluation and monitoring'],
    major_value_drivers: [scores.mechanism].filter((m) => m && m !== 'UNKNOWN'),
    missing_numbers: scores.missingVariables,
  };
}

function metricsFor(scores) {
  const primary = {
    TIME_SAVED: 'Time per completed case versus baseline',
    LABOR_COST_AVOIDED: 'Fully loaded cost per completed case',
    ERROR_REDUCTION: 'Error or rework rate per 100 cases',
    REVENUE: 'Converted value per period',
    RETENTION: 'Retained accounts or renewal rate',
    RISK_REDUCTION: 'Incidents or exceptions per period',
    CAPACITY_CREATED: 'Cases handled per person per period',
    CUSTOMER_EXPERIENCE: 'Self-service resolution rate',
    CONVERSION: 'Conversion rate',
    TURNAROUND_TIME: 'End-to-end turnaround time',
    DECISION_QUALITY: 'Agreement with expert judgement on a sampled set',
    STRATEGIC_CAPABILITY: 'Capability milestone reached',
    UNKNOWN: 'To be defined once the baseline is measured',
  }[scores.mechanism] || 'To be defined once the baseline is measured';
  return {
    primary_outcome_metric: primary,
    supporting_metrics: ['Volume processed', 'Cycle time', 'Adoption rate'],
    ai_quality_metrics: ['Accepted-output rate', 'Failure rate by category', 'Groundedness or citation support where applicable'],
    human_control_metrics: ['Human correction rate', 'Escalation rate', 'Override rate'],
    economic_metrics: ['Cost per accepted outcome', 'Review minutes per accepted outcome'],
  };
}

function improvements(scores, architecture, risk, decision) {
  const out = [];
  if (scores.baselineMissing) {
    out.push({
      change: 'Measure the current workflow before any build.',
      why: 'Every value claim in this audit is unanchored without it.',
      expected_effect: 'Converts value confidence from LOW to MEDIUM or HIGH.',
    });
  }
  if (architecture.simpler_alternative) {
    out.push({
      change: `Scope a test of ${architecture.simpler_alternative} alongside the preferred path.`,
      why: 'The framework requires the simpler option to be beaten, not assumed away.',
      expected_effect: 'Either removes the need for the complex build or justifies it with evidence.',
    });
  }
  for (const g of risk.hard_gates) {
    out.push({
      change: `Close hard gate ${g}.`,
      why: risk.gate_rationale[g] || 'Framework hard gate.',
      expected_effect: 'Unblocks a controlled pilot.',
    });
  }
  if (decision.state === DECISION.INSUFFICIENT) {
    out.push({
      change: 'Describe the current workflow, its frequency, and the outcome you want to change.',
      why: 'The engine will not produce a recommendation from an unauditable description.',
      expected_effect: 'Makes the idea auditable.',
    });
  }
  return out.length ? out : [{
    change: 'No structural change required at this stage.',
    why: 'The described opportunity is internally consistent with the evidence supplied.',
    expected_effect: 'Proceed with the roadmap as written.',
  }];
}

function buildAudit(inputLike) {
  const input = normalizeInput(inputLike || {});
  const risk = evaluateRisk(input);
  const scores = evaluateScores(input, risk);
  const architecture = selectArchitecture(input, scores, risk);
  const decision = decideState(input, scores, architecture, risk);

  const insufficient = decision.state === DECISION.INSUFFICIENT;

  /**
   * When the engine refuses to audit, it must refuse completely. Emitting a
   * risk tier and an architecture next to INSUFFICIENT_INPUT is worse than
   * saying nothing: it looks like a finding. This is what let hold-out case
   * H-11 ("I love reading about how companies terminate contracts") come back
   * with two hard gates attached to a non-proposal.
   */
  if (insufficient) {
    architecture.best_current_fit = null;
    architecture.candidates = [];
    architecture.scores = {};
    architecture.undetermined = true;
    risk.hard_gates = [];
    risk.gate_rationale = {};
    risk.risk_tier = 'LOW';
    risk.confidence = 'LOW';
    risk.required_controls = [];
    risk.human_review_required = false;
    risk.specialist_review_required = false;
    risk.dimensions.stakes = { rating: 'LOW', families: [] };
  }

  return {
    run_metadata: {
      framework_version: '1.2',
      schema_version: '0.2',
      prompt_version: 'not-used-v0.2',
      model_provider: 'none',
      model_id: 'deterministic-rule-engine-v0.2',
      search_provider: null,
      generated_at: new Date().toISOString(),
    },

    decision: {
      state: decision.state,
      confidence: decision.confidence,
      preferred_current_path: architecture.best_current_fit || 'UNDETERMINED',
      executive_summary: decision.primary_reason,
      primary_reason: decision.primary_reason,
      largest_uncertainty: decision.largest_uncertainty,
    },

    opportunity: {
      original_idea: input.original_idea,
      affected_user: ev(null, 'UNKNOWN', 'Not extracted by the deterministic engine.'),
      problem: ev(null, input.wordCount >= 6 ? 'ASSUMED' : 'UNKNOWN', 'Stated in the user description.'),
      current_workflow: ev(null, 'UNKNOWN', ''),
      desired_outcome: ev(null, 'UNKNOWN', ''),
      current_baseline: ev(
        scores.effort.annualMinutes != null ? `~${Math.round(scores.effort.annualMinutes / 60)} hours per year` : null,
        scores.baselineStatus === 'AVAILABLE' ? 'ESTIMATED' : 'UNKNOWN',
        'Coarse band only.',
      ),
      existing_alternatives: [],
      required_data: architecture.candidates.flatMap((c) => c.data_needs || []),
      required_systems: architecture.candidates.flatMap((c) => c.tool_needs || []),
      expected_actions: [],
      constraints: [],
      business_owner: ev(null, input.unknownTopics.has('owner') ? 'UNKNOWN' : 'UNKNOWN', ''),
    },

    evidence_register: evidenceRegister(input, scores),

    problem_strength: {
      rating: scores.problem,
      confidence: scores.problemConfidence,
      problem_evidence: ev(`${scores.painSignalCount} distinct pain indicators detected`, scores.painSignalCount ? 'SUPPORTED' : 'UNKNOWN', ''),
      frequency_or_volume: ev(
        scores.quantities.occurrencesPerYear != null ? `~${scores.quantities.occurrencesPerYear} per year` : null,
        scores.quantities.occurrencesPerYear != null ? 'ESTIMATED' : 'UNKNOWN', '',
      ),
      severity: scores.problem === 'STRONG' ? 'HIGH' : scores.problem === 'WEAK' ? 'LOW' : 'MEDIUM',
      reach: ev(scores.quantities.peopleAffected, scores.quantities.peopleAffected ? 'ESTIMATED' : 'UNKNOWN', ''),
      workaround_quality: ev(null, 'UNKNOWN', ''),
      outcome_measurability: scores.baselineStatus === 'AVAILABLE' ? 'HIGH' : scores.baselineStatus === 'PARTIAL' ? 'MEDIUM' : 'LOW',
      strongest_evidence: scores.techFirst ? [] : ['Stated recurring pain in the description'],
      missing_evidence: scores.missingVariables,
      baseline_metrics_needed: scores.missingVariables,
    },

    business_value: {
      value_potential: scores.value === 'UNKNOWN' ? 'LOW' : scores.value,
      confidence: scores.valueConfidence,
      primary_value_mechanism: scores.mechanism,
      secondary_value_mechanisms: scores.secondaryMechanisms,
      baseline_status: scores.baselineStatus,
      value_hypothesis: scores.effort.annualMinutes != null
        ? `Roughly ${Math.round(scores.effort.annualMinutes / 60)} hours per year of current effort are in scope, before adoption losses.`
        : 'Value cannot be quantified until frequency and per-case effort are measured.',
      adoption_assumptions: ['Users adopt the new path for the majority of cases', 'Review burden stays below the time saved'],
      owner: null,
      calculation_inputs: [
        scores.quantities.occurrencesPerYear != null
          ? { name: 'occurrences_per_year', value: String(scores.quantities.occurrencesPerYear), unit: 'count', evidence_status: 'ESTIMATED' } : null,
        scores.quantities.minutesPerOccurrence != null
          ? { name: 'minutes_per_occurrence', value: String(scores.quantities.minutesPerOccurrence), unit: 'minutes', evidence_status: 'ESTIMATED' } : null,
      ].filter(Boolean),
      missing_variables: scores.missingVariables,
    },

    economics_and_alternatives: economics(scores, architecture),

    readiness: {
      overall: scores.readiness,
      confidence: scores.readinessConfidence,
      data: { rating: scores.fragmented ? 'LOW' : scores.readiness, evidence_status: input.unknownTopics.has('data') ? 'UNKNOWN' : 'ASSUMED', summary: 'Derived from stated access and fragmentation signals.', gaps: input.unknownTopics.has('data') ? ['Data quality and coverage unconfirmed'] : [] },
      integration: { rating: input.unknownTopics.has('access') ? 'UNKNOWN' : scores.readiness, evidence_status: input.unknownTopics.has('access') ? 'UNKNOWN' : 'ASSUMED', summary: '', gaps: input.unknownTopics.has('access') ? ['API or permission availability unconfirmed'] : [] },
      process: { rating: 'UNKNOWN', evidence_status: 'UNKNOWN', summary: '', gaps: [] },
      evaluation: { rating: 'UNKNOWN', evidence_status: 'UNKNOWN', summary: 'No eval set described.', gaps: ['No representative case set exists yet'] },
      observability: { rating: 'UNKNOWN', evidence_status: 'UNKNOWN', summary: '', gaps: [] },
      recovery: { rating: input.unknownTopics.has('recovery') ? 'UNKNOWN' : 'MEDIUM', evidence_status: 'UNKNOWN', summary: '', gaps: [] },
      ownership: { rating: input.unknownTopics.has('owner') ? 'UNKNOWN' : 'MEDIUM', evidence_status: input.unknownTopics.has('owner') ? 'UNKNOWN' : 'ASSUMED', summary: '', gaps: input.unknownTopics.has('owner') ? ['No accountable owner named'] : [] },
      blocking_dependencies: scores.readiness === 'LOW' || scores.readiness === 'UNKNOWN'
        ? ['Confirm data, integration, permission, control, and ownership readiness.'] : [],
      preparation_tasks: risk.required_controls,
    },

    architecture,

    risk_and_governance: {
      risk_tier: risk.risk_tier,
      confidence: risk.confidence,
      stakes: ev(risk.dimensions.stakes.families.join(', ') || 'none detected', risk.dimensions.stakes.families.length ? 'SUPPORTED' : 'UNKNOWN', ''),
      error_detectability: ev(risk.dimensions.error_detectability, 'ASSUMED', ''),
      reversibility: ev(risk.dimensions.reversibility, 'ASSUMED', ''),
      blast_radius: ev(risk.dimensions.blast_radius, 'ASSUMED', ''),
      sensitive_data: ev(risk.dimensions.sensitive_data, risk.dimensions.sensitive_data === 'NOT_INDICATED' ? 'UNKNOWN' : 'SUPPORTED', ''),
      rights_impact: ev(risk.dimensions.rights_impact, 'ASSUMED', ''),
      adversarial_exposure: ev(risk.dimensions.adversarial_exposure, 'ASSUMED', ''),
      accountable_owner: ev(risk.dimensions.accountable_owner, 'UNKNOWN', ''),
      hard_gates: risk.hard_gates,
      gate_rationale: risk.gate_rationale,
      required_controls: risk.required_controls,
      autonomy_limit: risk.autonomy_limit,
      human_review_required: risk.human_review_required,
      specialist_review_required: risk.specialist_review_required,
    },

    market_context: {
      research_used: false,
      supports: [], neutral: [], challenges: [],
      research_summary: 'The deterministic engine has no search provider. Market context is NOT_APPLICABLE for this run rather than absent.',
    },

    opportunity_cost: {
      build_proposed_solution: architecture.best_current_fit
        ? `Commits build and ongoing operating capacity to ${architecture.best_current_fit}.`
        : 'Cannot be estimated until a task shape is identified.',
      choose_simpler_option: architecture.simpler_alternative
        ? `Frees most of that capacity and tests ${architecture.simpler_alternative} first.`
        : 'No simpler alternative was identified from the description.',
      delay: 'Preserves capacity for higher-confidence work at the cost of any compounding benefit.',
      do_nothing: 'Keeps the current cost of the workflow, which is unmeasured in this run.',
    },

    improvement_recommendations: improvements(scores, architecture, risk, decision),

    roadmap: roadmapForDecision(decision.state),
    tester_flow: testerFlowForDecision(decision.state, { best_current_fit: architecture.best_current_fit || 'undetermined approach' }),
    scale_path: scalePath(),
    metrics: metricsFor(scores),

    open_questions: [
      ...(input.unknownLabels || []).map((q) => ({
        question: String(q),
        why_it_matters: 'Affects readiness, risk, or the design of a pilot.',
        blocking: risk.prepareRequired || scores.readiness === 'UNKNOWN' || scores.readiness === 'LOW',
      })),
      ...(insufficient ? [{
        question: 'Who does this task today, how often, and what do they produce?',
        why_it_matters: 'Without this the idea cannot be audited at all.',
        blocking: true,
      }] : []),
      ...scores.missingVariables.map((v) => ({
        question: `What is the current value of: ${v}?`,
        why_it_matters: 'Required before any value claim can be anchored to a baseline.',
        blocking: false,
      })),
    ],

    // Not part of the schema. Emitted for eval and human review so a
    // recommendation can be challenged rather than merely trusted.
    _trace: {
      architecture_scores: architecture.scores,
      quantities: scores.quantities,
      effort_band: scores.effort.band,
      unknown_topics: [...input.unknownTopics],
      build_intent: input.buildIntent,
      tech_first: scores.techFirst,
      pain_signals: scores.painSignalCount,
    },
  };
}

module.exports = { buildAudit, normalizeInput, evaluateScores, evaluateRisk, selectArchitecture, DECISION };
