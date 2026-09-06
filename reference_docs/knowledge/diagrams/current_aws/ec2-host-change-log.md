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
4. Record exact installed versions for targeted package installations. For a
   bulk operating-system upgrade, record the APT transaction timestamps,
   counts, kernel versions, and the on-host APT history location containing
   every before-and-after package version.
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
- APT transaction evidence:
  - started: 2026-09-06 12:52:08;
  - ended: 2026-09-06 12:52:16;
  - no new package was installed;
  - `ca-certificates:arm64`: `20240203` →
    `20260601~24.04.1`;
  - `curl:arm64`: `8.5.0-2ubuntu10.9` →
    `8.5.0-2ubuntu10.13`;
  - `libcurl3t64-gnutls:arm64`: `8.5.0-2ubuntu10.9` →
    `8.5.0-2ubuntu10.13`;
  - `libcurl4t64:arm64`: `8.5.0-2ubuntu10.9` →
    `8.5.0-2ubuntu10.13`.
- Recovery:
  - removing the source and key would remove Docker's repository;
  - that would not automatically downgrade packages changed by APT.
- Status: completed and reconciled against `/var/log/apt/history.log`.

### EC2-003 — Docker installation request interrupted

- Date: 2026-09-06
- Initiated by: assistant
- Intended execution path: AWS CLI to Systems Manager Run Command.
- Intent: install Docker Engine, Docker CLI, containerd, Buildx, and Docker
  Compose.
- Result:
  - the local request was interrupted before a command ID was returned;
  - a subsequent manual `docker --version` check returned
    `Command 'docker' not found`;
  - a subsequent manual `dpkg-query` found none of `docker-ce`,
    `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`, or
    `docker-compose-plugin`.
- Persistent host change: none from the interrupted Docker installation
  request.
- Status: interrupted request reconciled; Docker packages were not installed.

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

### EC2-005 — Docker Engine and Compose packages installed

- Date: 2026-09-06
- Performed by: operator
- Execution path: root shell in browser-based AWS Systems Manager Session
  Manager.
- Intent: install a reproducible Docker runtime from Docker's official ARM64
  Ubuntu repository.
- Pre-change evidence:
  - Docker CLI and all five explicitly requested packages were absent;
  - an APT simulation reported 7 new packages, 0 upgrades, 0 removals, and 132
    unrelated packages left unchanged.
- Exact command:

  ```bash
  apt-get install -y \
    'docker-ce=5:29.8.0-1~ubuntu.24.04~noble' \
    'docker-ce-cli=5:29.8.0-1~ubuntu.24.04~noble' \
    'containerd.io=2.3.4-2~ubuntu.24.04~noble' \
    'docker-buildx-plugin=0.37.0-1~ubuntu.24.04~noble' \
    'docker-compose-plugin=5.5.1-1~ubuntu.24.04~noble'
  ```

- Newly installed packages:
  - `containerd.io:arm64` `2.3.4-2~ubuntu.24.04~noble`;
  - `docker-ce-cli:arm64` `5:29.8.0-1~ubuntu.24.04~noble`;
  - `docker-ce:arm64` `5:29.8.0-1~ubuntu.24.04~noble`;
  - `docker-buildx-plugin:arm64` `0.37.0-1~ubuntu.24.04~noble`;
  - `docker-ce-rootless-extras:arm64`
    `5:29.8.0-1~ubuntu.24.04~noble`;
  - `docker-compose-plugin:arm64` `5.5.1-1~ubuntu.24.04~noble`;
  - `pigz:arm64` `2.8-1`.
- Package transaction:
  - downloaded 86.3 MB;
  - added approximately 359 MB of disk usage;
  - upgraded 0 packages and removed 0 packages;
  - left 132 unrelated available upgrades unapplied.
- Service changes:
  - enabled `containerd.service` for `multi-user.target`;
  - enabled `docker.service` for `multi-user.target`;
  - enabled `docker.socket` for `sockets.target`.
- Post-install report:
  - running kernel was current;
  - no service, container, user-session, or VM-guest restart was required.
- Verification:
  - package configuration completed;
  - `systemctl is-active docker` returned `active`;
  - `systemctl is-enabled docker` returned `enabled`;
  - `docker version` reported client `29.8.0` and server `29.8.0`,
    proving CLI-to-daemon communication;
  - `docker compose version --short` returned `5.5.1`;
  - `docker buildx version` returned `v0.37.0` at commit
    `ac30b249211430b85fb8f37b6e7154b5c47ba0b6`;
  - `docker info --format '{{.Architecture}}'` returned `aarch64`;
  - `docker run --rm hello-world` pulled and successfully ran the
    `arm64v8` image with content digest
    `sha256:5dd0d3e6e255913fc30f90b9f2b1d359cc2cbdb48090cc4b65f1676e203243cc`.
- Smoke-test side effects:
  - the test container was configured for automatic removal with `--rm`;
  - a subsequent `docker ps -a` returned only the headings, confirming zero
    retained containers;
  - `hello-world:latest` remains cached locally and is tied in this record to
    the content digest above because the tag itself is mutable.
- Recovery: remove these packages only after confirming that no required
  containers, images, volumes, or host data depend on the Docker runtime.
- Status: completed; Docker runtime gate passed.

### EC2-006 — APT repository metadata refreshed

- Date: 2026-09-06
- Performed by: operator
- Execution path: root shell in browser-based AWS Systems Manager Session
  Manager.
- Intent: refresh package indexes before reviewing Ubuntu host updates and
  installing additional host software.
- Exact command: `apt-get update`.
- Repositories refreshed successfully:
  - Docker official Ubuntu `noble`;
  - Ubuntu `noble-security`;
  - Ubuntu `noble`;
  - Ubuntu `noble-updates`;
  - Ubuntu `noble-backports`.
- Packages installed, upgraded, or removed: none.
- Status: completed.

### EC2-007 — Ubuntu full-upgrade plan reviewed

- Date: 2026-09-06
- Performed by: operator
- Execution path: root shell in browser-based AWS Systems Manager Session
  Manager.
- Intent: review all pending Ubuntu updates without changing the host.
- Read-only commands:
  - `apt-get upgrade --simulate`;
  - `apt-get full-upgrade --simulate`.
- Ordinary-upgrade result:
  - 129 packages would be upgraded;
  - `linux-aws`, `linux-headers-aws`, and `linux-image-aws` would be kept
    back.
- Full-upgrade result:
  - 132 packages would be upgraded;
  - 9 packages would be newly installed;
  - 0 packages would be removed;
  - 0 packages would remain not upgraded.
- New kernel/support packages in the full plan:
  - `linux-image-7.0.0-1012-aws`;
  - `linux-modules-7.0.0-1012-aws`;
  - `linux-headers-7.0.0-1012-aws`;
  - `linux-aws-7.0-headers-7.0.0-1012`;
  - `linux-aws-7.0-tools-7.0.0-1012`;
  - `linux-tools-7.0.0-1012-aws`;
  - `libdebuginfod-common`;
  - `libdebuginfod1t64`;
  - `libllvm19`.
- Decision: prefer the full upgrade so the AWS kernel metapackages and security
  updates are not left behind. Verify disk capacity before applying it and
  expect a reboot afterward.
- Pre-change disk capacity: root filesystem 15 GiB total, 2.5 GiB used,
  13 GiB available, 17% utilization.
- Pre-change running kernel: `6.17.0-1017-aws`.
- Persistent host change: none; both commands were simulations.
- Status: reviewed; executed in EC2-008.

### EC2-008 — Ubuntu packages and AWS kernel upgraded

- Date: 2026-09-06
- Performed by: operator
- Execution path: root shell in browser-based AWS Systems Manager Session
  Manager.
- Intent: apply all reviewed Ubuntu security/maintenance updates and avoid
  leaving the AWS kernel metapackages behind.
- Exact command:

  ```bash
  DEBIAN_FRONTEND=noninteractive apt-get full-upgrade -y
  ```

- Transaction scope from the reviewed plan:
  - upgraded 132 packages;
  - newly installed 9 packages;
  - removed 0 packages;
  - left 0 packages not upgraded.
- APT history evidence:
  - started: 2026-09-06 14:38:55;
  - ended: 2026-09-06 14:40:45;
  - requested by: `ssm-user` (UID `1001`);
  - canonical per-package before-and-after version record:
    `/var/log/apt/history.log`, in the transaction whose command line is
    `apt-get full-upgrade -y`.
- Newly installed packages:
  - `linux-image-7.0.0-1012-aws:arm64`
    `7.0.0-1012.12~24.04.1`;
  - `linux-modules-7.0.0-1012-aws:arm64`
    `7.0.0-1012.12~24.04.1`;
  - `linux-headers-7.0.0-1012-aws:arm64`
    `7.0.0-1012.12~24.04.1`;
  - `linux-aws-7.0-headers-7.0.0-1012:arm64`
    `7.0.0-1012.12~24.04.1`;
  - `linux-aws-7.0-tools-7.0.0-1012:arm64`
    `7.0.0-1012.12~24.04.1`;
  - `linux-tools-7.0.0-1012-aws:arm64`
    `7.0.0-1012.12~24.04.1`;
  - `libdebuginfod-common:arm64` `0.190-1.1ubuntu0.1`;
  - `libdebuginfod1t64:arm64` `0.190-1.1ubuntu0.1`;
  - `libllvm19:arm64` `1:19.1.1-1ubuntu1~24.04.2`.
- Services restarted by the package-maintenance tooling:
  - `acpid.service`;
  - `chrony.service`;
  - `containerd.service`;
  - `cron.service`;
  - `irqbalance.service`;
  - `polkit.service`;
  - `snap.amazon-ssm-agent.amazon-ssm-agent.service`.
- Service restarts deferred until reboot:
  - `ModemManager.service`;
  - `dbus.service`;
  - `docker.service`;
  - `getty@tty1.service`;
  - `networkd-dispatcher.service`;
  - `serial-getty@ttyS0.service`;
  - `systemd-logind.service`;
  - `unattended-upgrades.service`.
- Post-upgrade state:
  - installed expected kernel: `7.0.0-1012-aws`;
  - still-running kernel: `6.17.0-1017-aws`;
  - no containers required restart;
  - the root user manager was still using outdated binaries;
  - reboot is required and was not performed automatically.
- Exact upgraded package versions were reconciled against the APT history
  transaction identified above.
- Verification:
  - `dpkg --audit` returned no output, confirming no unpacked or partially
    configured packages;
  - the operator ran `systemctl reboot`;
  - a new browser-based Session Manager session connected successfully after
    reboot;
  - `uname -r` returned `7.0.0-1012-aws`, confirming the new AWS kernel is
    active;
  - `systemctl is-active docker` returned `active` after reboot;
  - `docker version` reported client `29.8.0` and server `29.8.0` after
    reboot, proving daemon communication;
  - a final `apt-get full-upgrade --simulate` reported 0 upgrades, 0 new
    packages, 0 removals, and 0 packages not upgraded.
- Status: completed and reconciled; upgrade, kernel activation, Session
  Manager recovery, and Docker recovery verified.

## Current Known Host-Software State

| Component | State | Evidence |
|---|---|---|
| Docker official APT repository | Configured | Manual source-file inspection |
| Docker Engine, CLI, containerd, Buildx, and Compose | Installed and runtime-verified | EC2-005 package transaction, systemd checks, version checks, architecture check, and container smoke test |
| Exact EC2-002 APT transaction | Reconciled | `/var/log/apt/history.log` |
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
