# AI Opportunity Lab

AI Opportunity Lab is a lightweight audit tool for evaluating AI product ideas before committing major build effort.

It helps teams answer a practical question:

> Should this idea become an AI feature, a simpler automation, a workflow change, a pilot, or nothing for now?

## What it does

AI Opportunity Lab takes an AI idea and turns it into a structured audit.

The audit covers:

- problem strength
- business value
- readiness
- architecture fit
- risk and governance
- simpler alternatives
- roadmap
- small-scale tester flow
- scale path
- metrics
- unknowns and assumptions

## How it works

The system uses a hybrid approach:

```text
User idea
-> extractor converts prose into structured fields
-> clarification engine asks only decision-relevant questions
-> deterministic rules evaluate the opportunity
-> audit engine generates the final report
```
