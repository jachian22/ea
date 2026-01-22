# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Long Horizon Agent** is a sandboxed, long-running code agent system for building and operating recurring data extraction pipelines. The primary use case is financial transaction extraction from bank APIs and portals.

This is an **execution engine** designed to be embedded into a larger assistant system. It is intentionally isolated with explicit boundaries - no imports from parent projects, own Modal apps/secrets/volumes, and communication via CLI or HTTP only.

## Architecture

### Two-Step Execution Model

**Step 1 - Spec & Research (No Code Promotion)**
- Transform natural-language requests into approved JobSpecs
- Deep research on sources, APIs, authentication tiers
- Outputs: DecisionBrief.md, SourcePlan.md, RiskAssessment.md, job_spec.json
- Agent: Spec Builder (`docs/prompts/spec_builder.md`)

**Step 2 - Build, Verify, Operate**
- Implement approved JobSpecs in sandboxed Modal environments
- Generate extractors, tests, validators, runbooks
- Outputs per source: extractor code, tests, TEST_REPORT.md, RUNBOOK.md, RISKS.md, sample_output.jsonl, SCHEDULE.json
- Agent: Extractor Builder (`docs/prompts/extractor_builder.md`)

### Execution Substrate

- **Modal**: Sandboxed execution, scheduling (cron), secrets management, durable storage
- **OpenCode**: Agentic coding harness for iterative code generation and testing

### Tiered Access Model

Sources are classified by automation feasibility:
- **Tier 0**: API / OAuth (fully headless, stable)
- **Tier 1**: Portal with stable session (cookies/storage usable)
- **Tier 2**: Step-up auth required (regular human re-auth)
- **Tier 3**: Hostile automation (frequent CAPTCHA, fallback required)

### Artifact Lifecycle

`Draft` → `Pending` → `Approved` → `Executed`

Artifacts are immutable once approved. Updates require a new run and review.

## Key Contracts

- **JobSpec**: `docs/contracts/jobspec.schema.json` - Defines scope, sources, auth expectations, cadence, output schema, safety constraints
- **Transaction Schema**: `docs/contracts/tx_v1.schema.json` - Canonical output format (source_id, account_id, transaction_id, posted_at, amount, currency, description, raw)
- **Decision Checklist**: `docs/checklists/jobspec_decisions_v1.md` - Mandatory decisions before JobSpec approval

## Safety Model

- All generated code runs in isolated Modal sandboxes
- Least-privilege secrets injection (per-extractor only)
- Restricted network egress in production (allowlists preferred)
- Explicit review and promotion gates - no autonomous deployment
- Tool permission gating between dev and prod modes

### Tool Permissions (Dev vs Prod)

| Tool | Dev | Prod |
|------|-----|------|
| edit/read/grep | allowed | allowed |
| bash | allowed | restricted |
| install deps | allowed | forbidden |
| web fetch | allowed | restricted |

## Directory Structure (Modal Volumes)

```
pending_specs/    # Step 1 outputs
pending/          # Reviewable artifacts awaiting promotion
approved/         # Production-ready artifacts
exports/          # Normalized transaction outputs
runs/             # Run summaries and logs
```

## Key Documents

- `PLAN.md` - Full system architecture and workflows
- `SECURITY.md` - Threat model and safety constraints
- `docs/ops/MODAL_DEPLOY.md` - Deployment and operations guide
- `docs/runbooks/REVIEW_AND_PROMOTE.md` - Artifact promotion process

## Guiding Principles

1. **Transactions First** - Structured transaction rows are the primary output
2. **Explicit Approval Required** - Every promotion to production requires human sign-off
3. **Sandboxed Execution** - Generated code never runs on host machine
4. **Failure Halts Execution** - Failures pause schedules and emit alerts, not infinite retries
5. **Long-Term Operability** - Every extractor ships with tests, runbook, and documented failure modes

> "The system should be boring to operate, auditable to review, and safe to leave running."
