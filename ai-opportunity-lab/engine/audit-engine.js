'use strict';

const { extract } = require('./extractor');
const { evaluate } = require('./evaluate');
const { nextQuestions, shouldStop } = require('./clarify');
const { FIELDS, get, isKnown } = require('./contract');
const { roadmapForDecision, testerFlowForDecision, scalePath } = require('./roadmap');

/**
 * ORCHESTRATOR
 *
 * Three calls, in this order, and the order is the architecture:
 *
 *   extract(idea)        LLM prose -> fields          (variance lives here)
 *   nextQuestions(rec)   fields -> targeted MCQs      (deterministic)
 *   audit(rec)           fields -> verdict            (deterministic)
 *
 * Everything after extraction is reproducible. Run the same record through
 * twice, on any model, and you get the same audit, which is what PRD 18 asks
 * for and what neither previous version could deliver.
 */

const ev = (value, status, note = '') => ({ value: value == null ? null : String(value), evidence_status: status, note });

function evidenceRegister(record) {
  const buckets = { confirmed_facts: [], supported_facts: [], estimates: [], assumptions: [], unknowns: [] };
  const target = { CONFIRMED: 'confirmed_facts', SUPPORTED: 'supported_facts', ESTIMATED: 'estimates', ASSUMED: 'assumptions', UNKNOWN: 'unknowns' };
  for (const [id, c] of Object.entries(record.fields)) {
    const item = {
      claim: `${id}: ${c.value === null ? 'not known' : JSON.stringify(c.value)}`,
      // Mapped onto the schema's declared enum rather than inventing labels.
      // The finer-grained provenance lives in source_reference, so nothing is
      // lost and the output still validates.
      source_kind: c.source === 'user_answer' ? 'USER_INPUT'
        : c.source === 'llm' ? 'MODEL_INFERENCE'
          : c.source === 'heuristic' ? 'MODEL_INFERENCE'
            : c.source === 'oracle' || c.source === 'test' ? 'USER_INPUT' : 'UNKNOWN',
      source_reference: c.note || c.source,
      why_it_matters: FIELDS[id] ? FIELDS[id].prompt : '',
    };
    buckets[target[c.evidence_status] || 'unknowns'].push(item);
  }
  return buckets;
}

function economics(value, architecture) {
  const simpler = architecture.simpler_alternative;
  return {
    economic_attractiveness: value.value_potential === 'HIGH' ? 'PROMISING' : value.value_potential === 'LOW' ? 'WEAK' : 'UNCLEAR',
    confidence: value.confidence,
    current_process_baseline: ev(
      value.effort.annualMinutes != null ? `about ${Math.round(value.effort.annualMinutes / 60)} hours a year` : null,
      value.baseline_status === 'AVAILABLE' ? 'ESTIMATED' : 'UNKNOWN',
      value.effort.basis,
    ),
    options: [
      { name: 'Do nothing', approach: 'Keep the current process.', expected_benefit: 'No spend, no change.', one_time_cost_drivers: [], ongoing_cost_drivers: ['Continuing cost of the current workflow'], human_involvement: 'Unchanged', maintainability: 'LOW_BURDEN', reversibility: 'HIGH', time_to_learn: 'None', confidence: 'HIGH' },
      simpler ? { name: `Simpler: ${simpler}`, approach: 'Lower-complexity path over the core of the workflow.', expected_benefit: 'Part of the value at materially lower operating burden.', one_time_cost_drivers: ['Build or configuration'], ongoing_cost_drivers: ['Rule or prompt maintenance'], human_involvement: 'Reduced but present', maintainability: 'LOW_BURDEN', reversibility: 'HIGH', time_to_learn: 'Days', confidence: value.confidence } : null,
      architecture.best_current_fit ? { name: `Proposed: ${architecture.best_current_fit}`, approach: 'Preferred current path from the architecture comparison.', expected_benefit: 'Addresses the described workflow.', one_time_cost_drivers: ['Build', 'Integration', 'Eval set'], ongoing_cost_drivers: ['Model or tool cost', 'Human review', 'Monitoring', 'Regression evals'], human_involvement: 'Review of important outcomes', maintainability: 'MEDIUM_BURDEN', reversibility: 'MEDIUM', time_to_learn: 'Weeks', confidence: value.confidence } : null,
    ].filter(Boolean),
    dominant_alternative: value.value_potential === 'LOW' && simpler ? simpler : null,
    major_cost_drivers: ['Human review time', 'Integration effort', 'Ongoing evaluation'],
    major_value_drivers: [value.primary_value_mechanism].filter((x) => x && x !== 'UNKNOWN'),
    missing_numbers: value.missing_variables,
  };
}

const METRIC = {
  TIME_SAVED: 'Time per completed case versus baseline',
  LABOR_COST_AVOIDED: 'Fully loaded cost per completed case',
  ERROR_REDUCTION: 'Error or rework rate per 100 cases',
  REVENUE: 'Converted value per period',
  RETENTION: 'Retained accounts or renewal rate',
  RISK_REDUCTION: 'Incidents or exceptions per period',
  CAPACITY_CREATED: 'Cases handled per person per period',
  CUSTOMER_EXPERIENCE: 'Self-service resolution rate',
  TURNAROUND_TIME: 'End-to-end turnaround time',
  DECISION_QUALITY: 'Agreement with expert judgement on a sampled set',
};

function improvements(record, r) {
  const out = [];
  if (r.value.baseline_status !== 'AVAILABLE') {
    out.push({ change: 'Measure the current workflow before building.', why: 'Every value figure here is unanchored without it.', expected_effect: 'Moves value confidence from LOW or MEDIUM to HIGH.' });
  }
  if (r.architecture.simpler_alternative) {
    out.push({ change: `Test ${r.architecture.simpler_alternative} alongside the preferred path.`, why: 'Framework 14: the simpler option must be beaten, not assumed away.', expected_effect: 'Either removes the need for the complex build or justifies it with evidence.' });
  }
  for (const g of r.risk.hard_gates) {
    out.push({ change: `Close ${g}.`, why: r.risk.gate_rationale[g], expected_effect: `Answering ${(r.risk.gate_closing_fields[g] || []).join(', ')} unblocks a controlled pilot.` });
  }
  return out.length ? out : [{ change: 'No structural change needed at this stage.', why: 'The record is internally consistent with the evidence supplied.', expected_effect: 'Proceed with the roadmap.' }];
}

function buildAudit(record, opts = {}) {
  const r = evaluate(record, { allowClarify: false, ...opts });
  const remaining = nextQuestions(record, { max: 3 });

  return {
    run_metadata: {
      framework_version: '1.2', schema_version: '0.3',
      prompt_version: 'extractor-v0.3',
      model_provider: record.extraction_trace ? record.extraction_trace.mode : 'none',
      model_id: 'deterministic-rules-v0.3',
      search_provider: null, generated_at: new Date().toISOString(),
    },
    decision: {
      state: r.decision.state, confidence: r.decision.confidence,
      preferred_current_path: r.architecture.best_current_fit || 'UNDETERMINED',
      executive_summary: r.decision.primary_reason, primary_reason: r.decision.primary_reason,
      largest_uncertainty: r.decision.largest_uncertainty,
    },
    opportunity: {
      original_idea: record.original_idea,
      affected_user: ev(r.problem.affected_user, get(record, 'affected_user').evidence_status),
      problem: ev(r.problem.evidence_level, get(record, 'pain_evidence_level').evidence_status),
      current_workflow: ev(null, 'UNKNOWN'),
      desired_outcome: ev(r.value.primary_value_mechanism, get(record, 'value_mechanism').evidence_status),
      current_baseline: ev(r.value.effort.annualMinutes != null ? `${Math.round(r.value.effort.annualMinutes / 60)} hours a year` : null, r.value.baseline_status === 'AVAILABLE' ? 'ESTIMATED' : 'UNKNOWN', r.value.effort.basis),
      existing_alternatives: [ev(get(record, 'existing_alternative').value, get(record, 'existing_alternative').evidence_status)],
      required_data: [...new Set((r.architecture.candidates || []).flatMap((c) => c.data_needs || []))].map((d) => ev(d, 'ASSUMED', 'Implied by the selected architecture.')),
      required_systems: [...new Set((r.architecture.candidates || []).flatMap((c) => c.tool_needs || []))].map((d) => ev(d, 'ASSUMED', 'Implied by the selected architecture.')),
      expected_actions: [ev(get(record, 'action_target').value, get(record, 'action_target').evidence_status)],
      constraints: [],
      business_owner: ev(get(record, 'accountable_owner').value, get(record, 'accountable_owner').evidence_status),
    },
    evidence_register: evidenceRegister(record),
    problem_strength: {
      rating: r.problem.rating, confidence: r.problem.confidence,
      problem_evidence: ev(r.problem.evidence_level, get(record, 'pain_evidence_level').evidence_status),
      frequency_or_volume: ev(get(record, 'frequency_per_year').value, get(record, 'frequency_per_year').evidence_status),
      severity: r.problem.severity,
      reach: ev(get(record, 'people_affected').value, get(record, 'people_affected').evidence_status),
      workaround_quality: ev(null, 'UNKNOWN'),
      outcome_measurability: r.problem.outcome_measurability,
      strongest_evidence: r.problem.rating === 'WEAK' ? [] : [`Problem evidence level: ${r.problem.evidence_level}`],
      missing_evidence: r.problem.missing_evidence,
      baseline_metrics_needed: r.value.missing_variables,
    },
    business_value: {
      value_potential: r.value.value_potential, confidence: r.value.confidence,
      primary_value_mechanism: r.value.primary_value_mechanism,
      secondary_value_mechanisms: [], baseline_status: r.value.baseline_status,
      value_hypothesis: r.value.value_hypothesis,
      adoption_assumptions: ['Users adopt the new path for most cases', 'Review burden stays below the time saved'],
      owner: get(record, 'accountable_owner').value,
      calculation_inputs: ['frequency_per_year', 'minutes_per_occurrence', 'people_affected']
        .filter((f) => isKnown(get(record, f)))
        .map((f) => ({ name: f, value: String(get(record, f).value), unit: f.includes('minutes') ? 'minutes' : 'count', evidence_status: get(record, f).evidence_status })),
      missing_variables: r.value.missing_variables,
    },
    economics_and_alternatives: economics(r.value, r.architecture),
    readiness: {
      overall: r.readiness.overall, confidence: r.readiness.confidence,
      data: { rating: r.readiness.data.rating, evidence_status: get(record, 'data_available').evidence_status, summary: '', gaps: [] },
      integration: { rating: r.readiness.integration.rating, evidence_status: get(record, 'integration_access_confirmed').evidence_status, summary: '', gaps: [] },
      process: { rating: 'UNKNOWN', evidence_status: 'UNKNOWN', summary: '', gaps: [] },
      evaluation: { rating: r.readiness.evaluation.rating, evidence_status: 'UNKNOWN', summary: 'No eval set described.', gaps: ['No representative case set yet'] },
      observability: { rating: 'UNKNOWN', evidence_status: 'UNKNOWN', summary: '', gaps: [] },
      recovery: { rating: get(record, 'recovery_path_exists').value === true ? 'MEDIUM' : 'UNKNOWN', evidence_status: get(record, 'recovery_path_exists').evidence_status, summary: '', gaps: [] },
      ownership: { rating: r.readiness.ownership.rating, evidence_status: get(record, 'accountable_owner').evidence_status, summary: '', gaps: [] },
      blocking_dependencies: r.readiness.blocking_dependencies,
      preparation_tasks: r.readiness.preparation_tasks,
    },
    /**
     * The schema pins the architecture block to four properties. The engine
     * carries more (per-pattern scores, the reason for an undetermined result,
     * the supporting-role flag) because a recommendation you cannot interrogate
     * is not much of a recommendation. Those go in _trace rather than being
     * dropped, so the contract holds and the explainability survives.
     */
    architecture: {
      best_current_fit: r.architecture.best_current_fit,
      simpler_alternative: r.architecture.simpler_alternative,
      future_option: r.architecture.future_option,
      candidates: (r.architecture.candidates || []).map((c) => ({
        pattern: c.pattern, role: c.role, expected_value: c.expected_value,
        implementation_burden: c.implementation_burden, ongoing_burden: c.ongoing_burden,
        data_needs: c.data_needs, tool_needs: c.tool_needs, human_role: c.human_role,
        key_risks: c.key_risks, fit_summary: c.fit_summary, current_fit: c.current_fit,
      })),
    },
    risk_and_governance: {
      risk_tier: r.risk.risk_tier, confidence: r.risk.confidence,
      stakes: ev(r.risk.dimensions.stakes, get(record, 'stakes').evidence_status),
      error_detectability: ev(r.risk.dimensions.error_detectability, r.risk.dimensions.detectability_inferred_from_review_point ? 'ASSUMED' : get(record, 'error_detectability').evidence_status),
      reversibility: ev(r.risk.dimensions.reversibility, get(record, 'reversibility').evidence_status),
      blast_radius: ev(r.risk.dimensions.blast_radius, 'ASSUMED'),
      sensitive_data: ev(r.risk.dimensions.sensitive_data, get(record, 'sensitive_data').evidence_status),
      rights_impact: ev(r.risk.dimensions.rights_impact, get(record, 'rights_impact').evidence_status),
      adversarial_exposure: ev(r.risk.dimensions.adversarial_exposure, get(record, 'untrusted_input').evidence_status),
      accountable_owner: ev(r.risk.dimensions.accountable_owner, get(record, 'accountable_owner').evidence_status),
      hard_gates: r.risk.hard_gates,
      // gate_rationale and gate_closing_fields are engine extras the schema
      // does not declare, so they live in _trace. Losing the "why" would make
      // a gate unarguable, which defeats the point of having one.
      required_controls: r.risk.required_controls,
      autonomy_limit: r.risk.autonomy_limit,
      human_review_required: r.risk.human_review_required,
      specialist_review_required: r.risk.specialist_review_required,
    },
    market_context: { research_used: false, supports: [], neutral: [], challenges: [], research_summary: 'No search provider configured for this run. Market context is NOT_APPLICABLE rather than absent.' },
    opportunity_cost: {
      build_proposed_solution: r.architecture.best_current_fit ? `Commits build and operating capacity to ${r.architecture.best_current_fit}.` : 'Cannot be estimated until the task shape is known.',
      choose_simpler_option: r.architecture.simpler_alternative ? `Frees most of that capacity and tests ${r.architecture.simpler_alternative} first.` : 'No simpler alternative identified.',
      delay: 'Preserves capacity for higher-confidence work at the cost of any compounding benefit.',
      do_nothing: 'Keeps the current cost of the workflow.',
    },
    improvement_recommendations: improvements(record, r),
    roadmap: roadmapForDecision(r.decision.state),
    tester_flow: testerFlowForDecision(r.decision.state, r.architecture.best_current_fit || 'the undetermined approach'),
    scale_path: scalePath(),
    metrics: {
      primary_outcome_metric: METRIC[r.value.primary_value_mechanism] || 'To be defined once the baseline is measured',
      supporting_metrics: ['Volume processed', 'Cycle time', 'Adoption rate'],
      ai_quality_metrics: ['Accepted-output rate', 'Failure rate by category', 'Groundedness where applicable'],
      human_control_metrics: ['Human correction rate', 'Escalation rate', 'Override rate'],
      economic_metrics: ['Cost per accepted outcome', 'Review minutes per accepted outcome'],
    },
    open_questions: remaining.map((q) => ({
      question: q.question,
      why_it_matters: q.why_asked,
      blocking: r.risk.hard_gates.some((g) => (r.risk.gate_closing_fields[g] || []).includes(q.field)),
    })),
    _trace: {
      architecture_scores: r.architecture.scores,
      architecture_evidence: (r.architecture.candidates || []).map((c) => ({ pattern: c.pattern, score: c.score, evidence: c.evidence })),
      architecture_undetermined_reason: r.architecture.reason || null,
      constrained_to_supporting_role: !!r.architecture.constrained_to_supporting_role,
      known_fields: Object.entries(record.fields).filter(([, c]) => isKnown(c)).length,
      total_fields: Object.keys(record.fields).length,
      extraction: record.extraction_trace,
      unresolved_risk_fields: r.risk.unknown_risk_fields,
      gate_rationale: r.risk.gate_rationale,
      gate_closing_fields: r.risk.gate_closing_fields,
      risk_dimensions: r.risk.dimensions,
    },
  };
}

/** One-shot convenience: prose in, audit and questions out. */
async function auditIdea(idea, opts = {}) {
  const record = await extract(idea, opts);
  return { record, audit: buildAudit(record, opts), questions: nextQuestions(record, { max: 3 }), stop: shouldStop(record) };
}

module.exports = { buildAudit, auditIdea, evaluate };
