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

### EC2-009 — Nginx installed

- Date: 2026-09-07
- Performed by: operator
- Execution path: root shell in browser-based AWS Systems Manager Session
  Manager.
- Intent: install the host reverse proxy from Ubuntu's signed Noble update
  repository.
- Pre-change evidence:
  - an APT simulation reported 2 new packages, 0 upgrades, 0 removals, and 0
    packages left not upgraded.
- Exact command:

  ```bash
  apt-get install -y \
    'nginx=1.24.0-2ubuntu7.17' \
    'nginx-common=1.24.0-2ubuntu7.17'
  ```

- Newly installed packages:
  - `nginx-common` `1.24.0-2ubuntu7.17`;
  - `nginx:arm64` `1.24.0-2ubuntu7.17`.
- Package transaction:
  - downloaded 565 kB;
  - added approximately 1,626 kB of disk usage;
  - upgraded 0 packages and removed 0 packages.
- Service changes:
  - enabled `nginx.service` for `multi-user.target`;
  - the Ubuntu package performed its standard Nginx binary start/upgrade
    action successfully.
- Post-install report:
  - the running kernel was current;
  - no service, container, user-session, or VM-guest restart was required.
- Security boundary:
  - the package initially provides Ubuntu's default HTTP configuration;
  - EC2 security-group ingress still blocks port 80 and permits only
    CloudFront-origin traffic on port 443.
- Verification:
  - `nginx -t` reported valid syntax and a successful configuration test;
  - `systemctl is-active nginx` returned `active`;
  - `systemctl is-enabled nginx` returned `enabled`;
  - `ss -ltnp` showed Nginx listening on `0.0.0.0:80` and `[::]:80`;
  - a local HTTP HEAD request to `http://127.0.0.1` returned
    `HTTP/1.1 200 OK` from `nginx/1.24.0 (Ubuntu)`.
- Status: installed and verified with syntax, service, listener, and local HTTP
  response checks.

### EC2-010 — Certbot and Route 53 DNS plugin installed

- Date: 2026-09-07
- Performed by: operator
- Execution path: root shell in browser-based AWS Systems Manager Session
  Manager.
- Intent: install ACME certificate tooling and the Route 53 DNS-01
  authenticator without requesting a certificate or changing DNS.
- Pre-change evidence:
  - an APT simulation reported 9 new packages, 0 upgrades, 0 removals, and 0
    packages left not upgraded.
- Exact command:

  ```bash
  apt-get install -y \
    'certbot=2.9.0-1' \
    'python3-certbot-dns-route53=2.9.0-1'
  ```

- Newly installed packages:
  - `certbot` `2.9.0-1`;
  - `python3-certbot` `2.9.0-1`;
  - `python3-certbot-dns-route53` `2.9.0-1`;
  - `python3-acme` `2.9.0-1`;
  - `python3-configargparse` `1.7-1`;
  - `python3-icu:arm64` `2.12-1build2`;
  - `python3-josepy` `1.14.0-1`;
  - `python3-parsedatetime` `2.6-3`;
  - `python3-rfc3339` `1.1-4`.
- Package transaction:
  - downloaded 989 kB;
  - added approximately 5,402 kB of disk usage;
  - upgraded 0 packages and removed 0 packages.
- Service changes:
  - enabled `certbot.timer` for `timers.target`.
- Post-install report:
  - the running kernel was current;
  - no service, container, user-session, or VM-guest restart was required.
- External changes: no certificate was requested and no Route 53 record was
  changed.
- Verification:
  - `certbot --version` returned `certbot 2.9.0`;
  - `certbot plugins` discovered the `dns-route53` authenticator plus the
    packaged `standalone` and `webroot` authenticators;
  - `dns-route53` advertises the expected Authenticator and Plugin
    interfaces;
  - `systemctl is-enabled certbot.timer` returned `enabled`;
  - `systemctl is-active certbot.timer` returned `active`;
  - `systemctl list-timers certbot.timer --no-pager` reported the timer's next
    activation at `2026-09-07 18:01:38 UTC`.
- Verification-command side effect:
  - Certbot created or appended its debug log at
    `/var/log/letsencrypt/letsencrypt.log`.
- Status: installed and verified, including plugin discovery and the automatic
  renewal timer's enabled, active, and scheduled states.

### EC2-011 — CloudWatch Agent package downloaded but not installed

- Date: 2026-09-07
- Performed by: automation at the operator's explicit request.
- Execution path: AWS Systems Manager Run Command
  `17bd3573-af1a-46e6-b67a-2fe398580b38` using `AWS-RunShellScript`.
- Intent: download the current AWS-published Ubuntu ARM64 CloudWatch Agent
  package for inspection without installing, configuring, or starting it.
- Exact command:

  ```bash
  curl --proto '=https' --tlsv1.2 -fSL \
    -o /tmp/amazon-cloudwatch-agent.deb \
    https://amazoncloudwatch-agent-eu-central-1.s3.eu-central-1.amazonaws.com/ubuntu/arm64/latest/amazon-cloudwatch-agent.deb
  ```

- Filesystem change:
  - created or replaced the temporary file
    `/tmp/amazon-cloudwatch-agent.deb`;
  - curl reported approximately 60.6 MiB transferred.
- Command result: Systems Manager reported `Success` with response code `0`.
- Important compatibility boundary:
  - the downloaded package is AWS-published for Ubuntu ARM64, but AWS's current
    supported-operating-systems matrix does not list Ubuntu 24.04 under ARM64;
  - local inspection of the same published artifact found package version
    `1.300072.0b1766-1`, architecture `arm64`, dependency `libc6`, the expected
    AWS signing-key fingerprint, and a good package signature;
  - compatibility with this Ubuntu 24.04 ARM64 host is therefore not yet
    treated as vendor-supported or runtime-verified.
- Status: downloaded only; on-host checksum/signature verification and
  installation remain pending.

### EC2-012 — CloudWatch Agent installed and metrics verified through the console

- Date: 2026-09-08
- Performed by: operator through the CloudWatch and IAM consoles.
- Execution path: CloudWatch Getting Started agent workflow, manually targeting
  only `i-08fbc9f0c53265b63` in `eu-central-1`; workload detection remained disabled.
- Host changes: console-managed agent installation and configuration deployment.
  The console reported both `Installed` and `Configured`. Exact installed
  package version, installation command ID, generated file paths, and boot
  enablement have not yet been independently inspected; the earlier downloaded
  package's version must not be assumed to be the installed version.
- Related IAM change: operator created inline policy
  `SyncVitalsStagingMetricsWrite` on `syncvitals-staging-ec2-role`:

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Sid": "PublishStagingHostMetrics",
      "Effect": "Allow",
      "Action": "cloudwatch:PutMetricData",
      "Resource": "*",
      "Condition": {"StringEquals": {
        "cloudwatch:namespace": "CWAgent",
        "aws:RequestedRegion": "eu-central-1"
      }}
    }]
  }
  ```

- Exact configuration reviewed and deployed:

  ```json
  {
    "agent": {
      "metrics_collection_interval": 60,
      "run_as_user": "cwagent",
      "region": "eu-central-1"
    },
    "metrics": {
      "namespace": "CWAgent",
      "append_dimensions": {"InstanceId": "${aws:InstanceId}"},
      "metrics_collected": {
        "mem": {"measurement": ["mem_used_percent"]},
        "disk": {
          "measurement": ["disk_used_percent"],
          "resources": ["/"],
          "drop_device": true
        }
      }
    }
  }
  ```

- Verification: operator screenshots show two metric series in `CWAgent` in
  Frankfurt. Memory datapoints are approximately 16%; disk datapoints are
  approximately 26% for this instance's `ext4` filesystem mounted at `/`.
  Successful datapoint delivery verifies the configured collection and
  publishing path on this host, but does not establish vendor OS support.
- Scope: no logs, traces, or aggregation rollups are configured. Alarm setup
  remains pending; the disk metric's console row shows `No alarms`.
- Status: installed, configured, and metric delivery verified. The temporary
  download from EC2-011 has not been explicitly removed.

### EC2-013 — Database EBS volume mounted and PostgreSQL directory prepared

- Date: 2026-09-08
- Performed by: operator in the EC2 console and root Session Manager shell.
- Volume: `vol-0f23b93a2f1cd46b4`, Name `syncvitals-staging-postgresql`,
  10 GiB gp3, 3000 IOPS, 125 MiB/s, encrypted with `aws/ebs`, created without
  a source snapshot in `eu-central-1c`. Attached to `i-08fbc9f0c53265b63`
  as `/dev/sdf`; Ubuntu identified it as `/dev/nvme1n1` with matching serial.
- Pre-format checks: `lsblk` showed the new 10 GiB disk without a filesystem
  or mount, separate from the 16 GiB root disk; `wipefs --no-act` found no
  signatures.
- Commands completed:

  ```bash
  mkfs.ext4 -L staging-postgres /dev/nvme1n1
  mkdir -p /srv/syncvitals
  mount UUID=f4a12602-0ab0-45ae-a73d-dc6fc8fb00e2 /srv/syncvitals
  cp -a --no-clobber /etc/fstab /etc/fstab.before-postgresql-volume
  ```

- `findmnt` confirmed the ext4 UUID and mount. The fstab backup matched the
  original using `cmp`; the copy command emitted a portability warning only.
- Added this entry to `/etc/fstab`:

  ```fstab
  UUID=f4a12602-0ab0-45ae-a73d-dc6fc8fb00e2 /srv/syncvitals ext4 defaults,nofail 0 2
  ```

- The first paste split the entry into two lines. Verification detected the
  parse error; the operator joined lines 4 and 5 with
  `sed -i '4{N;s/\n */ /;}' /etc/fstab`. After `systemctl daemon-reload`,
  `findmnt --verify --verbose` reported no errors or warnings.
- Created `/srv/syncvitals/postgresql`. Downloaded the pinned PostgreSQL image
  and ran only its `id` command using a temporary `--rm` container, without
  mounting the database directory or starting PostgreSQL:

  ```bash
  pg_digest=f1c3376c26f2609ab9f29f71f824103f
  pg_digest=${pg_digest}e2fcd8ee0346485cb6122a4f93df6f94
  docker run --rm --entrypoint id postgres:16@sha256:$pg_digest postgres
  chown 999:999 /srv/syncvitals/postgresql
  chmod 700 /srv/syncvitals/postgresql
  ```

- The image reported PostgreSQL UID/GID `999:999`; final directory `stat`
  confirmed `999:999 700 /srv/syncvitals/postgresql`. The image remains cached.
  An earlier multiline paste failed before Docker started a container.
- Status: mounted and directory prepared; no database initialized. Reboot
  remount verification and confirmation of `DeleteOnTermination=false` remain
  pending. Because the fstab entry uses `nofail`, deployment must prevent
  PostgreSQL from starting when the database volume is not mounted.

### EC2-014 — Database volume retention and reboot persistence verified

- Date: 2026-09-09
- Performed by: operator through the EC2 console and Session Manager.
- EC2 Storage tab confirmed `DeleteOnTermination=false` for database volume
  `vol-0f23b93a2f1cd46b4` on `/dev/sdf`; root volume
  `vol-0fb2e65033bb83fb5` retains `DeleteOnTermination=true`.
- Operator rebooted the instance and reconnected through Session Manager.
- Post-reboot `findmnt -o SOURCE,TARGET,FSTYPE,UUID /srv/syncvitals` returned
  `/dev/nvme1n1 /srv/syncvitals ext4 f4a12602-0ab0-45ae-a73d-dc6fc8fb00e2`.
- Post-reboot `stat -c '%u:%g %a %n' /srv/syncvitals/postgresql` returned
  `999:999 700 /srv/syncvitals/postgresql`.
- Status: EC2-013's retention and reboot verification checks are complete.
  PostgreSQL is not initialized or running. The deployment mount guard remains
  required before starting it; CloudWatch currently monitors only the root disk.

### EC2-015 — Stable origin address and certificate issuance verified

- Date: 2026-09-09
- Performed by: operator using the EC2/Route 53 consoles and root Session Manager shell.
- Related AWS changes: Elastic IP `3.73.229.16`, allocation
  `eipalloc-093b36cd5cd7ac947`, association `eipassoc-0c713bbbe834242eb`,
  attached to `i-08fbc9f0c53265b63`, ENI `eni-0f5c7007ed1557258`, private
  IP `172.31.14.35`. Route 53 A record `origin-staging.syncvitals.space`
  created for this IP (operator instructed: simple routing, non-alias, TTL 300).
  `dig +short origin-staging.syncvitals.space A` returned `3.73.229.16`.
- Certificate command:

  ```bash
  certbot certonly --dns-route53 \
    -d origin-staging.syncvitals.space \
    --email elvisrepo23@gmail.com \
    --agree-tos --non-interactive
  ```

- Certbot registered an account and successfully issued the certificate,
  reporting expiry `2026-12-08`. Certificate and private key paths:
  `/etc/letsencrypt/live/origin-staging.syncvitals.space/fullchain.pem` and
  `/etc/letsencrypt/live/origin-staging.syncvitals.space/privkey.pem`.
  Renewal configuration: `/etc/letsencrypt/renewal/origin-staging.syncvitals.space.conf`.
  Certbot also maintains account/archive state and `/var/log/letsencrypt/letsencrypt.log`.
- `certbot renew --dry-run --cert-name origin-staging.syncvitals.space`
  registered a staging account and reported all simulated renewals succeeded.
- Status: issuance and DNS-01 renewal verified. Existing Certbot timer was
  previously verified enabled/active. Nginx TLS configuration, post-renewal
  reload hook, and renewal/expiry alerting remain pending. Private key contents
  are intentionally not recorded.

### EC2-016 — Certbot deploy hook and renewal dry-run verified

- Date: 2026-09-09
- Performed by: operator in the root Session Manager shell.
- Created `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx` with mode `750`.
  The hook validates Nginx and reloads it after a successful certificate
  renewal:

  ```sh
  #!/bin/sh
  set -eu
  /usr/sbin/nginx -t >/dev/null 2>&1
  /usr/bin/systemctl reload nginx
  ```

- A first edit accidentally expanded the shell replacement character and
  produced `/usr/sbin/nginx -t 2>nginx -t1`; the error was diagnosed with
  `sh -x` and corrected. Direct reload returned exit code `0`.
- `certbot renew --dry-run --run-deploy-hooks` then reported all simulated
  renewals succeeded without hook errors for
  `origin-staging.syncvitals.space`.
- Status: certificate issuance, DNS-01 renewal simulation, Nginx deploy hook,
  and clean hook execution are verified. Nginx is still serving only its
  default site; TLS listener and reverse proxy configuration remain pending.

### EC2-017 — Nginx origin TLS listener configured

- Date: 2026-09-09
- Performed by: operator in the root Session Manager shell.
- Configured `/etc/nginx/sites-available/origin-staging` and enabled it with a
  symlink under `/etc/nginx/sites-enabled/`; the packaged `default` site was
  disabled.
- HTTP on port 80 for `origin-staging.syncvitals.space` returns a 301 redirect
  to the equivalent HTTPS URL.
- HTTPS on port 443 uses the Certbot-managed certificate and key for
  `origin-staging.syncvitals.space`, with TLS 1.2 and 1.3 enabled. The current
  `/` location intentionally returns 404 until the API container is deployed.
- `nginx -t` passed and Nginx was reloaded successfully.
- Local checks passed with `curl --resolve`: HTTPS returned `404 Not Found`
  and HTTP returned `301 Moved Permanently` with the expected `Location`.
- Status: TLS termination and HTTP redirect verified. CloudFront-only origin
  header enforcement, API reverse proxying, and renewal/expiry alerting remain
  pending. No private key contents are recorded.

### EC2-018 — Deployment bundle and Docker storage guard installed

- Date: 2026-09-12
- Performed by: operator through AWS CLI and Systems Manager Run Command.
- Installed the seven-file deployment bundle at the root-owned
  `/opt/syncvitals/deployment`; its transferred archive SHA-256 was
  `0b68bc239eabb8be3b079782752d7fb72ba5dc655cabbc7f2cfca4618297fd7f`.
- Installed `/etc/systemd/system/docker.service.d/10-staging-storage.conf`.
  Docker now requires and binds to `srv-syncvitals.mount`, and runs the bundle's
  EBS UUID/writeability guard before daemon startup. Live restore is disabled.
- A standalone `systemd-analyze verify docker.service` initially failed because
  the generated mount unit was not in that verifier invocation. Verification
  passed when `/run/systemd/generator/srv-syncvitals.mount` was supplied with
  `docker.service`; the loaded mount unit itself was already healthy.
- Docker restart passed. A later EC2 reboot changed the boot ID, remounted UUID
  `f4a12602-0ab0-45ae-a73d-dc6fc8fb00e2`, and reran `ExecStartPre` successfully
  before Docker became active.
- Status: bundle, boot guard, Docker restart, and reboot persistence verified.

### EC2-019 — AWS CLI v2 host prerequisite installed

- Date: 2026-09-12
- Performed by: operator through AWS CLI and Systems Manager Run Command.
- Runtime preflight initially stopped with `aws: not found`. Ubuntu Noble had no
  `awscli` APT candidate. AWS's official install script then stopped safely
  because `unzip` was missing.
- Installed pinned Ubuntu package `unzip=6.0-28ubuntu4.1`.
- Installed AWS CLI `2.36.44` from AWS's version-pinned Linux ARM64 bundle under
  `/usr/local/aws-cli`; the installer's SHA-256 was checked before execution and
  the downloaded bundle's AWS PGP signature verified.
- `/usr/local/bin/aws --version` reported native `aarch64` on Ubuntu 24 with
  kernel `7.0.0-1012-aws`.
- The no-container runtime preflight then passed: image identity, EBS storage,
  instance-role secret retrieval, and runtime contract were all accepted.
- A later read-only APT simulation reported eight pending upgrades:
  `base-files`, `containerd.io`, `docker-buildx-plugin`, `motd-news-config`,
  `python-apt-common`, `python3-apt`, `python3-distupgrade`, and
  `ubuntu-release-upgrader-core`. They were not applied during the live
  deployment; container runtime updates require a maintenance window.

### EC2-020 — PostgreSQL and Django containers deployed

- Date: 2026-09-12
- Performed by: operator through AWS CLI and Systems Manager Run Command.
- Pulled the accepted ECR index digest
  `sha256:24edf7e3d5911c72a2565ff5b30b05d4eaeaf0b0eee7c0dac212731179deeb83`;
  Docker verified it as `linux/arm64`. The temporary ECR login was removed after
  deployment.
- `scripts.staging_runtime` retrieved and validated one `AWSCURRENT` secret
  snapshot, then `scripts.production_deployment` started PostgreSQL, applied all
  Django migrations, and started Gunicorn/Django.
- `syncvitals-staging-database-1` and `syncvitals-staging-api-1` are healthy.
  PostgreSQL has no host port and bind-mounts `/srv/syncvitals/postgresql` to
  `/var/lib/postgresql/data`; the API is bound only to `127.0.0.1:18000`.
- Local database-backed readiness passed. Django reported the existing
  `auth.W004` warning because `User.email` is the `USERNAME_FIELD` but is not
  database-unique; this did not block deployment and remains application debt.

### EC2-021 — Nginx API proxy and CloudFront origin guard enabled

- Date: 2026-09-12
- Performed by: operator through AWS CLI and Systems Manager Run Command.
- Replaced the HTTPS 404 placeholder in
  `/etc/nginx/sites-available/origin-staging` with a reverse proxy to
  `http://127.0.0.1:18000`. Nginx forwards host, client IP, forwarding chain,
  and trusted HTTPS scheme metadata. HTTP redirects to the fixed origin HTTPS
  hostname.
- Added root-owned mode-`600`
  `/etc/nginx/snippets/origin-staging-auth.conf`. Its value comes from the
  `CLOUDFRONT_ORIGIN_HEADER` field added to the existing staging runtime secret;
  the value is intentionally not recorded here. Do not run `nginx -T` into logs
  because it expands included files and would expose this value.
- `nginx -t` passed. Settled probes returned `403` without the custom header and
  `200` with it. An immediate first probe after reload briefly reached a retiring
  worker and returned the old `404`; subsequent probes verified the new workers.
- Related AWS change: CloudFront distribution `E1BWDS134TAX2K` now has the
  HTTPS custom origin `origin-staging.syncvitals.space` and an uncached
  `/api/*` behavior with all required HTTP methods and viewer data forwarded.
  Public readiness returned `200`, unknown API routes remained API `404`s, SPA
  deep links remained `200`, and repeated identical API requests were cache
  misses. A missing private-S3 asset returned `403`, not the previously expected
  `404`, and did not fall back to the SPA.
- Status: EC2 origin, application proxy, origin-header enforcement, and public
  CloudFront API routing verified. Renewal/expiry alerting remains pending.

## Current Known Host-Software State

| Component | State | Evidence |
|---|---|---|
| Docker official APT repository | Configured | Manual source-file inspection |
| Docker Engine, CLI, containerd, Buildx, and Compose | Installed and runtime-verified | EC2-005 package transaction, systemd checks, version checks, architecture check, and container smoke test |
| Nginx | Installed and verified | EC2-009 syntax, service, listener, and local HTTP checks |
| Certbot and Route 53 DNS plugin | Origin certificate issued; renewal dry-run and Nginx deploy hook passed | EC2-010, EC2-015, and EC2-016 |
| CloudWatch Agent | Installed and configured through console; memory and root-disk metric delivery verified | EC2-012 console status and graphs; installed version and boot enablement not yet inspected |
| AWS CLI | Version-pinned native ARM64 v2 installed and signature-verified | EC2-019 |
| PostgreSQL and Django | Healthy containers; EBS persistence and loopback-only API verified | EC2-020 |
| Nginx origin proxy | TLS, root-only CloudFront header guard, and loopback proxy verified | EC2-021 |
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
