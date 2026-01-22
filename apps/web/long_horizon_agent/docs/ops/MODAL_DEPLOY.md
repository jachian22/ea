# Modal Deployment & Operations Guide

This document describes how to deploy, operate, and manage the **Long Horizon Agent** using Modal.

The deployment model is intentionally simple, explicit, and conservative.

---

## Environments

The system supports two primary environments:

### 1. Development
- Used for:
  - Step 1 (spec + research)
  - Step 2 (codegen + sandbox verification)
- Broader network egress
- More permissive tool access
- No recurring schedules enabled by default

### 2. Production
- Used only for:
  - Approved extractors
  - Scheduled execution
- Strict network egress
- Restricted tool permissions
- No interactive behavior

Dev and prod MUST use separate Modal apps and secrets.

---

## Modal App Structure

The Modal app is defined in `modal_app/app.py` and typically exposes:

- `intake_research()` — Step 1
- `generate_and_test()` — Step 2
- `promote()` — manual promotion action
- `run_<source>()` — approved scheduled extractors

Each function runs in its own sandbox.

---

## Images & Dependencies

### Image Build
- Images are defined in `modal_app/images.py`
- Images must include:
  - OpenCode
  - Language runtimes (Python / Node)
  - Playwright (if browser automation is allowed)
  - Parsing and validation libraries

### Rules
- All dependencies must be pinned
- No dynamic installs in production paths
- Image rebuilds are explicit and versioned

---

## Secrets Management

### Naming Convention
All secrets must be prefixed:

LONG_HORIZON_AGENT_<SOURCE>_<TYPE>

Examples:
- `LONG_HORIZON_AGENT_CHASE_OAUTH`
- `LONG_HORIZON_AGENT_AMEX_SESSION`

### Rules
- Secrets are injected at runtime only
- No secrets are logged or written to disk
- Dev and prod secrets are distinct

---

## Storage (Volumes & State)

Recommended volumes:

- `pending_specs/` — Step 1 outputs
- `pending/` — reviewable artifacts
- `approved/` — production-ready artifacts
- `exports/` — normalized outputs
- `runs/` — run summaries and logs

Volumes are mounted explicitly per function.

---

## Scheduling

### Schedule Creation
- Schedules are defined only from `approved/` artifacts
- Schedules must match `SCHEDULE.json` exactly
- No schedule may be created automatically by the agent

### Disabling Schedules
At any time you may:
- Disable a single schedule
- Disable all schedules
- Remove the Modal app entirely

Disabling schedules is always safe and reversible.

---

## Execution Flow (Production)

1. Modal cron triggers extractor
2. Approved extractor code is loaded
3. Secrets are injected
4. Extractor runs in sandbox
5. Output is written to `exports/`
6. Run summary is recorded
7. Alerts are emitted on failure

---

## Observability

Each run must emit:

- `run_id`
- `source_id`
- start/end timestamps
- transaction count
- status (success / failed / needs_reauth)
- failure reason (if applicable)

Logs must never include secrets or raw credentials.

---

## Failure Handling

### Authentication Failure
- Mark source as `needs_reauth`
- Disable schedule
- Emit alert
- Require local re-auth workflow

### Validation Failure
- Disable schedule
- Archive outputs
- Require repair run

### Runtime Failure
- Retry only if explicitly configured
- Otherwise pause and alert

---

## Re-authentication Workflow (Tier 2)

- Re-auth workflows are **local-only**
- Typically involve:
  - Manual login
  - Session artifact refresh
  - Secure upload of new artifact to Modal secret
- Production schedules remain disabled until re-auth completes

---

## Rollback Strategy

Rollback is achieved by:

- Disabling schedules
- Reverting to a previous approved artifact
- Redeploying Modal app if needed

No irreversible state changes should occur.

---

## Emergency Procedures

If unsafe behavior is detected:

1. Disable all schedules immediately
2. Revoke all secrets
3. Archive current artifacts
4. Investigate before re-enabling

---

## Deployment Checklist

Before enabling production schedules:

- [ ] JobSpec approved
- [ ] Artifacts reviewed and promoted
- [ ] Secrets configured
- [ ] Egress restrictions verified
- [ ] First run manually verified

---

## Guiding Rule

> If you cannot stop it instantly, it is not safe to run.

Every deployment decision should preserve the ability to halt execution immediately.
