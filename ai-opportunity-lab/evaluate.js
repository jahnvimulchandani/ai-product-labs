'use strict';

const { evaluateRisk } = require('./rules/risk');
const { evaluateProblem, evaluateValue, evaluateReadiness } = require('./rules/value');
const { selectArchitecture } = require('./rules/architecture');
const { decideState } = require('./rules/decision');

/**
 * THE PURE CORE
 *
 * record in, blocks and decision out. No I/O, no clock, no model, no mutation
 * of the record. Split out from the orchestrator for one specific reason: the
 * clarification engine needs to run it hundreds of times on hypothetical
 * records to work out which question is worth asking. That only works if
 * evaluation is cheap and side-effect free.
 *
 * It is also what makes the whole system testable without an API key.
 */
function evaluate(record, opts = {}) {
  // Risk first: it constrains architecture, and framework 14 says risk
  // outranks value, so nothing downstream should be computed before it.
  const risk = evaluateRisk(record);
  const problem = evaluateProblem(record);
  const value = evaluateValue(record, problem);
  const readiness = evaluateReadiness(record, risk);
  const architecture = selectArchitecture(record, risk, readiness);
  const blocks = { risk, problem, value, readiness, architecture };
  const decision = decideState(record, blocks, opts);
  return { ...blocks, decision };
}

module.exports = { evaluate };
