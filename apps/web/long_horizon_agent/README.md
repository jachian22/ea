# Long Horizon Agent

A secure, sandboxed, long-running code agent designed to **research, build, validate, and operate data extraction pipelines over time** — with an emphasis on high-risk, high-value domains like financial transaction data.

This repository is intentionally **isolated** and **capability-scoped**. It is designed to be embedded into a larger assistant system, while remaining deployable and auditable on its own.

---

## What This Is

**Long Horizon Agent** is a system for:

- Turning vague natural-language intents (e.g. *“extract my bank transactions weekly”*)  
  into **explicit, reviewed JobSpecs**
- Performing **deep research** to determine the safest and most reliable extraction method
- Using an autonomous coding agent (OpenCode) to:
  - generate extractors
  - write tests and validators
  - verify behavior in a sandbox
- Running approved extractors on a recurring cadence
- Detecting breakage, auth expiry, and drift over time

The system is optimized for **long-running reliability**, not one-off scripts.

---

## What This Is NOT

- ❌ A general-purpose assistant
- ❌ A UI-first product
- ❌ A fully autonomous system that deploys itself without review
- ❌ A multi-tenant SaaS (by design, currently single-user)

Every promotion to production requires **explicit human approval**.

---

## Core Design Principles

1. **Transactions First**  
   Structured transaction rows are the primary output. PDFs are secondary.

2. **Two-Step Execution Model**  
   - Step 1: Research + decisions → approved JobSpec  
   - Step 2: Codegen + sandbox verification → review → promotion

3. **Sandboxed Execution**  
   All generated code runs in isolated environments with strict limits.

4. **Least Privilege Everywhere**  
   Secrets, network egress, tools, and runtime permissions are minimized.

5. **Tiered Access Model**  
   Sources are classified by automation feasibility (API → portal → reauth → manual).

6. **Long-Term Operability**  
   Every extractor must ship with:
   - tests
   - runbook
   - failure modes
   - validation logic

---

## High-Level Architecture

- **Modal**
  - Execution substrate
  - Sandboxed environments
  - Scheduling (cron)
  - Secrets and durable storage

- **OpenCode**
  - Agentic coding harness
  - Iterative code generation and testing
  - Tool-aware reasoning loop

- **Human-in-the-loop**
  - JobSpec approval
  - Promotion gating
  - Re-auth flows (when required)

---

## Repository Boundaries

This repository is intentionally isolated:

- No imports from the parent assistant project
- Owns its own Modal apps, secrets, volumes, and schedules
- Communicates via explicit interfaces (CLI or HTTP)
- Interactive authentication workflows are **local-only**
- No public-facing agent endpoints

See `BOUNDARIES.md` for details.

---

## Execution Modes

The system operates in three modes:

1. **Spec Mode**
   - Intake + deep research
   - Produces Decision Briefs and JobSpecs
   - No code promotion

2. **Dev Mode**
   - Code generation with OpenCode
   - Sandbox verification
   - Artifact generation for review

3. **Prod Mode**
   - Approved extractors only
   - Scheduled execution
   - Strict permissions and observability

---

## Typical Workflow

1. Submit a natural-language request
2. Review research findings and decisions
3. Approve a JobSpec
4. Review generated extractor artifacts
5. Promote to production
6. Monitor recurring runs and alerts
7. Re-auth or repair as needed

---

## Key Documents

- `PLAN.md` — Full system plan and architecture
- `SECURITY.md` — Threat model and safety constraints
- `docs/checklists/jobspec_decisions_v1.md` — Mandatory decision checklist
- `docs/contracts/jobspec.schema.json` — JobSpec schema
- `docs/contracts/tx_v1.schema.json` — Transaction schema
- `docs/prompts/` — Agent prompt templates
- `docs/runbooks/` — Operational procedures

---

## Status

This project is under active development and intentionally conservative in scope.  
Safety, auditability, and long-term reliability are prioritized over speed.

---

## License

TBD (intentionally unspecified during early development).
