---
name: learning-opportunities
description: Offer optional short learning exercises after meaningful coding work, architectural decisions, refactors, schema changes, route changes, or when the user asks to understand the code more deeply. Use in this repo when a slice has just been completed, when the user asks "why", or when a design tradeoff is worth turning into deliberate practice.
---

# Learning Opportunities

Offer one optional 10-15 minute learning exercise after meaningful work in this repo.

Keep the skill focused on deliberate learning, not general tutoring. The goal is to help the user build understanding from the code and architecture that already exist here.

## Workflow

1. Identify one concrete topic from the just-completed work.
2. Offer exactly one brief optional exercise.
3. If the user declines, stop.
4. If the user accepts, choose one exercise type from [references/exercise-types.md](references/exercise-types.md).
5. Ask one concrete question or task.
6. End the message immediately after the question.
7. Wait for the user's response before continuing.
8. Compare the user's answer with the actual code, tests, docs, or runtime behavior.
9. Give direct feedback about what is right, what is wrong, and what gap matters.
10. Close with one short synthesis or one optional follow-up question.

## Offer Rules

- Offer this skill after:
  - creating or changing a vertical slice
  - auth, security, or API contract changes
  - meaningful refactors or architecture updates
  - schema or model changes
  - difficult debugging work
  - any point where the user explicitly wants to understand the system better
- Do not interrupt active debugging, urgent fixes, or a flow where the user clearly wants execution speed over learning.
- Do not offer more than once per substantial piece of work unless the user explicitly asks for another exercise.

## Question Rules

- Ask one question at a time.
- Make the question specific to this repo.
- Prefer grounded prompts over abstract theory.
- Prefer file-driven exploration over pasting long code snippets.
- Do not provide hints, suggested answers, or disguised clues after the question.
- Do not ask multiple questions in one message.
- Do not keep teaching after the pause point.

Use this pattern:

> **Your turn:** [specific question]
>
> (Take your best guess. We can correct it from the code.)

After that, stop and wait.

## Grounding Rules For This Repo

- Base exercises on the actual code, tests, docs, and architecture in this repo.
- Use file paths and concrete flows:
  - auth flow
  - request path
  - CI behavior
  - deployment assumptions
  - test design
- When the topic is architectural, ground it in:
  - `reference_docs/knowledge/05-local-development-architecture.md`
  - `reference_docs/knowledge/06-pragmatic-mvp-cloud-architecture.md`
  - `reference_docs/knowledge/14-auth-strategy.md`
  - `reference_docs/knowledge/21-testing.md`
  - `reference_docs/knowledge/diagrams/longevity-architecture.dsl`
- When the topic is code behavior, send the user to the relevant file first and make them explain what they think happens before you explain it.

## Feedback Rules

- Be direct when the user's answer is wrong.
- Do not pretend they understood more than they actually expressed.
- Separate "described what" from "understood why".
- Tie corrections back to the code or docs, not vague theory.
- Prefer one strong correction over five weak observations.

## Scope Limits

- Keep the exercise short.
- Keep the cognitive target narrow.
- Stay inside one concept, one flow, or one decision at a time.
- Do not expand into a full lesson unless the user asks.

## Resource Use

- Use [references/exercise-types.md](references/exercise-types.md) to pick the right exercise pattern.
