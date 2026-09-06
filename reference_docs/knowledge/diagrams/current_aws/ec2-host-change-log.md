# Presentation Staging EC2 Host Change Log

## Purpose

This is the append-only operational record for changes made inside the
presentation-staging EC2 host. Record every package installation, package
upgrade, repository change, service change, configuration change, and
persistent filesystem change.

Read-only inspections may also be recorded when they establish a gate or prove
that an attempted change did not occur.

## Host Identity

| Field | Value |
|---|---|
| AWS account | `173291122778` |
| Region | `eu-central-1` |
| Availability Zone | `eu-central-1c` |
| Instance ID | `i-08fbc9f0c53265b63` |
| Instance type | `t4g.small` |
| Architecture | ARM64 / `aarch64` |
| Operating system | Ubuntu 24.04 LTS |
| Administrative access | AWS Systems Manager Session Manager |

If the instance is replaced, close this log with the termination date and
create a new host section before recording changes to the replacement.

## Recording Rules

1. Record one numbered entry for every mutation, including failed or partially
   applied attempts.
2. State who typed or initiated the command and how it reached the host.
3. Record exact commands, but redact credentials, tokens, secret values, and
   generated passwords.
4. Record exact installed package versions from APT/DPKG evidence rather than
   relying on the version requested by a command.
5. Include a verification result and a rollback or recovery note.
6. Do not silently rewrite history. Add a correction beneath the affected
   entry if later evidence changes what is known.

## Operating Convention From EC2-004 Forward

The operator types each mutating command manually in the EC2 Session Manager
terminal, one command at a time. The assistant explains the command first,
waits for the operator's output, and updates this log after the result is known.
The assistant must not use Systems Manager Run Command for host mutations
unless the operator explicitly changes this convention.

## Change Entries

### EC2-001 — Host preflight inspection

- Date: 2026-09-06
- Initiated by: assistant
- Execution path: AWS CLI to Systems Manager Run Command
- SSM command ID: `72f70aaf-e194-4cc3-9375-d02ad511f58b`
- Intent: verify that the new host matched the required bootstrap platform.
- Persistent host change: none.
- Verified result:
  - effective user: `root`;
  - operating system: Ubuntu 24.04;
  - architecture: `aarch64`.
- Status: completed, read-only.

### EC2-002 — Official Docker APT repository configured

- Date: 2026-09-06
- Initiated by: assistant
- Execution path: AWS CLI to Systems Manager Run Command
- SSM command ID: `b55e0093-611b-4f90-807e-85d35d822356`
- Intent: prepare the official Docker package source without installing Docker
  Engine.
- Commands/actions performed:
  1. refreshed APT metadata;
  2. requested installation/update of `ca-certificates` and `curl`;
  3. downloaded Docker's Ubuntu signing key from
     `https://download.docker.com/linux/ubuntu/gpg`;
  4. installed the key as `/etc/apt/keyrings/docker.asc` with mode `0644`;
  5. created `/etc/apt/sources.list.d/docker.sources` for the official Docker
     `noble`, `stable`, `arm64` repository;
  6. refreshed APT metadata again.
- Verified result:
  - Docker repository candidate:
    `5:29.8.0-1~ubuntu.24.04~noble`;
  - Docker Engine remained absent immediately after this entry.
- Package-version evidence:
  - the transaction updated `ca-certificates`, `curl`, and libcurl-related
    packages;
  - exact installed versions and the complete dependency list still need to be
    reconciled from `/var/log/apt/history.log` before this record is considered
    package-complete.
- Recovery:
  - removing the source and key would remove Docker's repository;
  - that would not automatically downgrade packages changed by APT.
- Status: completed; package-version reconciliation pending.

### EC2-003 — Docker installation request interrupted

- Date: 2026-09-06
- Initiated by: assistant
- Intended execution path: AWS CLI to Systems Manager Run Command.
- Intent: install Docker Engine, Docker CLI, containerd, Buildx, and Docker
  Compose.
- Result:
  - the local request was interrupted before a command ID was returned;
  - a subsequent manual `docker --version` check returned
    `Command 'docker' not found`.
- Persistent host change: Docker installation was not proven to have occurred.
  The package database must be inspected before treating this as definitively
  change-free.
- Status: interrupted; reconciliation pending.

### EC2-004 — Manual Session Manager access confirmed

- Date: 2026-09-06
- Performed by: operator
- Execution path: browser-based AWS Systems Manager Session Manager terminal.
- Commands:

  ```bash
  sudo -i
  docker --version
  cat /etc/apt/sources.list.d/docker.sources
  ```

- Persistent host change: none.
- Verified result:
  - passwordless elevation reached a root shell;
  - Docker CLI was absent;
  - the official Docker `noble`/`stable`/`arm64` source file from EC2-002
    was present.
- Status: completed, read-only.

## Current Known Host-Software State

| Component | State | Evidence |
|---|---|---|
| Docker official APT repository | Configured | Manual source-file inspection |
| Docker Engine and CLI | CLI absent | Manual `docker --version` result |
| Exact EC2-002 APT transaction | Reconciliation pending | Inspect APT history before continuing |
| Nginx | Not installed at the initial host inspection | Earlier SSM inspection |
| Certbot and Route 53 plugin | Not installed at the initial host inspection | Earlier SSM inspection |
| CloudWatch agent | Not installed at the initial host inspection | Earlier SSM inspection |

## Template For The Next Change

```markdown
### EC2-00N — Short change title

- Date:
- Performed by:
- Execution path:
- Intent:
- Pre-change evidence:
- Exact command:
- Packages/files/services changed:
- Installed versions:
- Verification:
- Recovery or rollback:
- Status:
```
