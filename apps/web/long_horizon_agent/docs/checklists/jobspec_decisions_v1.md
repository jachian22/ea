# JobSpec Decision Checklist (v1)

This checklist defines the **mandatory decisions** that must be resolved before a JobSpec can be approved.

No code generation, sandbox execution, or scheduling is permitted until all required items are explicitly resolved or intentionally deferred with justification.

This document is the source of truth for Step 1 (Spec & Research).

---

## How to Use This Checklist

- Each item must be answered explicitly.
- Defaults may be applied, but must be stated.
- Any unresolved item must include a reason and a follow-up plan.
- All decisions must be reflected in the final JobSpec JSON.

---

## A. Scope & Intent

### A1. Data Scope
- ☐ Transactions only  
- ☐ Transactions + statements (PDF/CSV)

**Decision:**  
**Notes:**  

---

### A2. Transaction Types
- ☐ Posted only  
- ☐ Pending + posted  

**Decision:**  
**Notes:**  

---

### A3. Accounts in Scope
- ☐ All accounts at source  
- ☐ Specific accounts only  

**Decision:**  
**Accounts:**  
**Notes:**  

---

## B. Cadence & Windowing

### B1. Execution Cadence
- ☐ Hourly  
- ☐ Daily  
- ☐ Weekly  
- ☐ Custom cron  

**Decision:**  
**Cron expression:**  
**Timezone:**  

---

### B2. Initial Lookback Window
- ☐ 30 days  
- ☐ 90 days  
- ☐ 180 days  
- ☐ 365 days  
- ☐ Custom  

**Decision:**  
**Notes:**  

---

### B3. Incremental Strategy
- ☐ Since last successful run  
- ☐ Sliding window  
- ☐ Source-provided cursor  

**Decision:**  
**Notes:**  

---

### B4. Rebuild / Backfill Policy
- ☐ Never rebuild automatically  
- ☐ Manual backfill only  
- ☐ Periodic rebuild  

**Decision:**  
**Notes:**  

---

## C. Output & Storage

### C1. Canonical Schema Version
- ☐ tx_v1  
- ☐ Other (must specify)

**Decision:**  

---

### C2. Output Formats
- ☐ JSONL  
- ☐ Parquet  
- ☐ DuckDB  
- ☐ Multiple  

**Decision:**  

---

### C3. Destination
- ☐ Finance agent volume  
- ☐ Export to assistant ingestion path  
- ☐ Local filesystem (dev only)

**Decision:**  
**Paths:**  

---

### C4. Deduplication Strategy
- ☐ Source transaction ID  
- ☐ Deterministic hash  
- ☐ Hybrid  

**Decision:**  
**Notes:**  

---

## D. Access & Authentication (Per Source)

### D1. Tier Classification
- ☐ Tier 0 — API / OAuth  
- ☐ Tier 1 — Stable portal session  
- ☐ Tier 2 — Step-up auth required  
- ☐ Tier 3 — Hostile automation  

**Decision:**  
**Rationale:**  

---

### D2. Preferred Access Methods (Ordered)
- ☐ Official API  
- ☐ OAuth refresh token  
- ☐ CSV export  
- ☐ Portal scraping (Playwright)

**Order:**  

---

### D3. Browser Automation Allowed?
- ☐ Yes (dev only)  
- ☐ Yes (prod allowed)  
- ☐ No  

**Decision:**  

---

### D4. Step-Up Authentication Handling
- ☐ Not expected  
- ☐ Local-only re-auth workflow  
- ☐ Pause + notify on failure  

**Decision:**  

---

### D5. Session Artifacts
- ☐ Cookies  
- ☐ Local storage  
- ☐ None  

**Decision:**  
**TTL / rotation plan:**  

---

## E. Safety & Compliance

### E1. Secret Scope
- ☐ API keys only  
- ☐ OAuth tokens  
- ☐ Session artifacts  

**Decision:**  

---

### E2. Network Egress
- ☐ Allowlist in prod  
- ☐ Broad egress in dev only  

**Decision:**  
**Allowlist (if applicable):**  

---

### E3. Tool Permissions
- ☐ Default dev permissions  
- ☐ Restricted prod permissions  

**Decision:**  

---

### E4. Data Retention
- ☐ Raw downloads retained  
- ☐ Raw downloads ephemeral  
- ☐ Normalized outputs retained long-term  

**Decision:**  
**Retention period:**  

---

## F. Failure Handling & Observability

### F1. Failure Policy
- ☐ Pause + notify  
- ☐ Retry (bounded)  
- ☐ Manual intervention required  

**Decision:**  

---

### F2. Alert Destinations
- ☐ Assistant notification  
- ☐ Email  
- ☐ Log only  

**Decision:**  

---

### F3. Validation Requirements
- ☐ Schema validation  
- ☐ Invariant checks  
- ☐ Minimum transaction count  

**Decision:**  

---

## G. Review & Promotion

### G1. Promotion Required?
- ☐ Yes (mandatory)  
- ☐ No (not permitted for this system)

**Decision:**  

---

### G2. Review Artifacts Required
- ☐ RUNBOOK.md  
- ☐ RISKS.md  
- ☐ TEST_REPORT.md  
- ☐ sample_output.jsonl  

**Decision:**  

---

## H. Final Approval

### H1. Outstanding Questions
List any unresolved items:

---

### H2. Approval
- ☐ JobSpec approved as written  
- ☐ Revisions required  

**Approved by:**  
**Date:**  

---

## Guiding Rule

> If a decision is not explicitly recorded here, it is considered **undecided**.

Undecided specifications must not advance to code generation.
