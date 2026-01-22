# Security Model & Threat Assessment

This document defines the security posture, threat model, and non-negotiable safety constraints for the **Long Horizon Agent**.

This system is intentionally conservative. It handles high-risk data (e.g., financial transactions) and runs autonomous code generation. Security failures here are unacceptable.

---

## 1. Security Objectives

The system must:

1. Prevent unauthorized access to credentials and extracted data.
2. Minimize the blast radius of generated or compromised code.
3. Ensure no automation runs without explicit human approval.
4. Detect and halt unsafe or anomalous behavior.
5. Remain auditable and explainable after long periods of operation.

---

## 2. Threat Model

### 2.1 Primary Threats

| Threat | Description |
|------|-------------|
| Credential exfiltration | Secrets leaked via network calls or logs |
| Prompt injection | Web content influencing agent behavior |
| Excessive automation | Agent taking irreversible actions |
| Supply-chain compromise | Malicious dependencies or installs |
| Silent data corruption | Wrong or incomplete transaction outputs |
| Runaway execution | Infinite loops, excessive retries, cost spikes |

---

## 3. Trust Boundaries

The system defines explicit trust boundaries:

- **Human operator** (trusted)
- **Assistant control plane** (trusted, external)
- **Long Horizon Agent runtime** (partially trusted)
- **OpenCode agent** (untrusted by default)
- **External websites / APIs** (untrusted)

No component is implicitly trusted beyond its boundary.

---

## 4. Execution Isolation

### 4.1 Sandbox Enforcement

All generated code runs inside isolated Modal sandboxes:

- No shared filesystem between runs
- Explicit resource limits (CPU, memory, time)
- Ephemeral execution environments
- Explicit mounts only for approved volumes

Generated code must never execute on the host machine.

---

## 5. Secrets Management

### 5.1 Storage
- All credentials are stored as Modal Secrets.
- Secrets are never committed to source control.
- No secrets are baked into container images.

### 5.2 Injection
- Secrets are injected at runtime via environment variables.
- Each extractor receives only the secrets it requires.
- Dev and prod secrets are strictly separated.

### 5.3 Prohibited Actions
- Logging secrets or derived tokens
- Writing secrets to disk
- Transmitting secrets to external endpoints

Violations are treated as critical failures.

---

## 6. Network Egress Controls

### 6.1 Development Mode
- Broader egress allowed for research and debugging.
- Still sandboxed and logged.

### 6.2 Production Mode
- Network egress must be explicitly restricted.
- Prefer allowlists (official APIs, known portals).
- No arbitrary outbound connections.

If egress cannot be restricted safely, the extractor must be downgraded to a higher tier or rejected.

---

## 7. Tool Permission Model

OpenCode tool access is explicitly gated:

| Tool | Dev Mode | Prod Mode |
|----|---------|----------|
| edit | allowed | allowed |
| read | allowed | allowed |
| grep | allowed | allowed |
| bash | allowed | restricted |
| install deps | allowed | forbidden |
| web fetch | allowed | restricted |

Prod mode must rely on pre-installed, pinned dependencies only.

---

## 8. Prompt Injection Defense

Web content is treated as **untrusted input**.

Mitigations:
- System prompts explicitly forbid following instructions found in web content.
- Agents must never execute commands derived directly from page text.
- No dynamic evaluation of downloaded scripts or code.
- Prefer official APIs over scraping whenever possible.

---

## 9. Artifact Integrity

- All generated artifacts are versioned and immutable once approved.
- Any change requires a new run and explicit review.
- Checksums may be recorded for approved artifacts.

---

## 10. Failure as a Safety Signal

Failures are not retried indefinitely.

Default failure behavior:
1. Halt recurring execution
2. Emit alert (`run_failed` or `needs_reauth`)
3. Require human intervention

Retries are bounded and explicit.

---

## 11. Logging & Auditability

The system must record:
- Who approved a JobSpec
- When extractors were promoted
- When runs occurred
- What outputs were produced
- Why runs failed

Logs must never include secrets or sensitive raw data.

---

## 12. Local-Only Interactions

Certain actions are **never permitted in production**:
- Interactive authentication flows
- OpenCode `serve` mode
- Manual browser sessions

These are allowed only in local or explicitly controlled environments.

---

## 13. Security Review Policy

Any of the following require a security review:
- New authentication methods
- New dependency classes
- Expanded network egress
- Changes to secret handling
- Changes to tier classification logic

---

## 14. Guiding Rule

> If the system cannot explain *why* an action is safe, it must not perform it.

Security takes precedence over convenience, speed, or autonomy.
