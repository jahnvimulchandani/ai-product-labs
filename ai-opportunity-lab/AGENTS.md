# AI Opportunity Lab Agent Instructions

## Project

AI Opportunity Lab is a portable AI opportunity-audit framework that evaluates AI ideas before major resource commitment.

## Core Product Flow

1. A user describes an AI idea.
2. The extractor converts the idea into structured fields.
3. The clarification engine asks only decision-changing multiple-choice questions.
4. Deterministic rules evaluate risk, value, readiness, architecture, and decision state.
5. The product returns an audit report, architecture comparison, roadmap, tester flow, scale path, metrics, assumptions, and unknowns.
6. The final skill package lets this framework run as a reusable AI workflow.

## Architecture Rule

The LLM may extract, clarify, summarize, and draft. The deterministic engine owns decisions, hard gates, risk restrictions, state selection, and output schema validation. Rules must consume structured fields, not raw prose.

## Source Layout

- Product docs live in `docs/`.
- Audit schemas live in `framework/` and are copied into `evals/` only when the eval harness expects them there.
- Deterministic engine code lives in `engine/`.
- Rule modules live in `engine/rules/`.
- Evaluation fixtures and harnesses live in `evals/`.

## Design System

Follow `docs/design-system.md`.

- Light mode first.
- Reading-heavy report screens must be light.
- Use neutral-heavy composition.
- Butter Yellow is the signature cue.
- Turquoise is only for rare live/system moments.
- Spring Green signals verified/trust.
- Pastel Sky signals data/structure.
- Avoid gradients, fake AI visuals, glassmorphism, heavy shadows, and clutter.

## Coding Standards

- Keep the implementation small and readable.
- Prefer plain JavaScript or TypeScript with minimal dependencies.
- Do not weaken evals to make tests pass.
- Do not hardcode answers from test cases.
- Do not expose API keys.
- Do not place secrets in frontend code.
- Do not commit `.env`, `.env.local`, `node_modules`, build artifacts, or API keys.
- Add comments only where they explain decision logic.

## Testing

Before claiming done, run:

```bash
npm install
npm run eval
npm run demo
npm run build
```

If `npm run demo` is interactive, verify that it starts and reaches the first clarification question without crashing.

## Success Criteria

- Evals run without import errors.
- Schema validation passes.
- Hard risk gates pass.
- Clarification questions include three suggested choices plus Custom answer.
- Unknowns remain Unknown unless the user answers.
- Audit output includes decision, architecture, risk, roadmap, tester flow, scale path, metrics, assumptions, and unknowns.
- UI renders the full flow without crashing once a frontend exists.

