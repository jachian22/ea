# Long Horizon Agent — System Plan

This document describes the architecture, workflows, and safety model for the **Long Horizon Agent**: a long-running, sandboxed coding agent designed to research, build, validate, and operate recurring data extraction pipelines over time.

The primary initial use case is **financial transaction extraction**, but the system is designed to generalize to other long-horizon automation tasks.

---

## 1. Objectives

The system must be able to:

1. Convert vague natural-language intents into explicit, reviewable specifications.
2. Perform deep research to determine the safest and most reliable extraction approach.
3. Generate production-grade extraction code with tests, validators, and runbooks.
4. Execute all generated code in isolated sandboxes.
5. Require explicit human approval before any recurring automation is enabled.
6. Operate reliably over long periods, detecting and recovering from drift.

---

## 2. Non-Goals

The system is explicitly **not** intended to:

- Autonomously deploy new production jobs without review.
- Act as a general-purpose assistant or chatbot.
- Handle multi-tenant or third-party user access (single-user by design).
- Bypass authentication, terms of service, or access controls.

---

## 3. Two-Step Execution Model

### Step 1 — Spec & Research Phase (No Code Promotion)

**Purpose:**  
Transform a natural-language request into a fully specified, approved JobSpec.

**Inputs:**
- Natural-language intent (e.g. “Extract my bank and credit card transactions weekly”)

**Core activities:**
- Deep research (hybrid: external research tools + internal web search)
- Source discovery and classification
- Authentication tier assessment
- Risk and brittleness analysis
- Decision checklist completion

**Outputs:**
- Decision Brief
- Source Plan
- Risk Assessment
- Draft JobSpec JSON

**Exit condition:**  
Explicit human approval of the JobSpec.

---

### Step 2 — Build, Verify, and Operate Phase

**Purpose:**  
Implement the approved JobSpec safely and durably.

**Core activities:**
- Run OpenCode inside a Modal sandbox
- Generate extractors, tests, validators, and runbooks
- Execute validation and smoke tests
- Package artifacts for review
- Promote approved artifacts to production
- Schedule recurring execution

**Outputs (per source):**
- Extraction code
- Test suite and validation reports
- Runbook and failure-mode documentation
- Sample normalized transaction output
- Production schedule configuration

---

## 4. JobSpec Envelope

Every operation in the system is driven by a **JobSpec**, a single JSON document that fully defines:

- Objective and scope
- Sources and accounts
- Authentication expectations
- Cadence and windowing
- Output schema and destinations
- Safety constraints
- Review and promotion requirements

JobSpecs are immutable once approved and versioned for auditability.

---

## 5. JobSpec Decision Checklist

All JobSpecs must resolve the mandatory decisions defined in:

docs/checklists/jobspec_decisions_v1.md

No code generation or scheduling is permitted unless all checklist items are resolved or explicitly deferred.

The checklist is the primary guardrail against ambiguity and unsafe automation.

---

## 6. Tiered Access Model

Each source is classified into one of four tiers:

- **Tier 0 — API / OAuth**
  - Fully headless, stable automation
- **Tier 1 — Portal with Stable Session**
  - Cookies or storage artifacts usable for some period
- **Tier 2 — Step-Up Authentication Required**
  - Regular human re-authentication (OTP / push)
- **Tier 3 — Hostile Automation**
  - Frequent CAPTCHA or blocking; fallback required

Tier classification determines:
- Whether headless cron execution is allowed
- Whether re-auth workflows must exist
- Failure and alerting behavior

---

## 7. Execution Substrate

### Modal
Used for:
- Isolated sandbox execution
- Image-based dependency control
- Scheduling (cron)
- Secrets management
- Durable storage (volumes and dicts)

All production execution occurs on Modal.

### OpenCode
Used as:
- The coding agent harness
- Responsible for iterative code generation, editing, and testing
- Executed headlessly inside sandboxes
- Configured with strict tool and permission policies

---

## 8. Artifact Lifecycle

Artifacts move through explicit states:

1. **Draft**
   - Produced during Step 1 (spec artifacts only)
2. **Pending**
   - Generated code and validation outputs awaiting review
3. **Approved**
   - Promoted artifacts eligible for production execution
4. **Executed**
   - Runtime outputs from scheduled jobs

Artifacts are immutable once approved; updates require a new run and review.

---

## 9. Safety Model

The system enforces safety through:

- Sandboxed execution (no shared state)
- Least-privilege secrets injection
- Restricted network egress in production
- Tool permission gating (dev vs prod)
- Explicit review and promotion gates
- Deterministic validation of outputs

No component is trusted by default, including the coding agent.

---

## 10. Failure Handling

The system must detect and respond to:

- Authentication expiry
- Schema violations
- Zero-transaction or anomalous outputs
- Network or site changes
- Runtime or dependency failures

Default behavior on failure:
- Pause recurring execution
- Emit a `needs_reauth` or `run_failed` signal
- Require explicit repair or re-auth workflow

---

## 11. Integration with Assistant Environment

This repository is designed to be **embedded but isolated**:

- No imports from the assistant codebase
- Communication via explicit interfaces (CLI or HTTP)
- Data exported via files or defined ingestion endpoints
- Assistant handles UI, approvals, and notifications

The assistant acts as a control plane; this repo acts as an execution engine.

---

## 12. Long-Term Operability

Every extractor must ship with:
- Tests
- Validation logic
- Runbook
- Documented failure modes

The goal is not one-time success, but **months-to-years of reliable operation**.

---

## 13. Milestones

1. End-to-end flow with one Tier 0 source
2. Portal extraction template with validation
3. Tier 2 re-auth workflow support
4. Hardened production policies and observability

---

## 14. Guiding Constraint

> The system should be boring to operate, auditable to review, and safe to leave running.

If a choice trades reliability or safety for speed, choose safety.
