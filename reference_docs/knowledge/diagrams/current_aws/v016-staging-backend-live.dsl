workspace "SyncVitals Current AWS V016" "Verified presentation-staging state after deploying PostgreSQL and Django, protecting the origin, and routing CloudFront API traffic on 2026-09-12." {
    model {
            currentAwsV016 = deploymentEnvironment "[CURRENT AWS V016] Staging Backend Live" {
            userDevices = deploymentNode "User Devices" "Presentation clients that resolve the public staging hostname." {
                tags "ClientZone"

                browser = infrastructureNode "Web Browser" "Loads the deployed React application from staging.syncvitals.space." {
                    tags "ClientRuntime"
                }

                android = infrastructureNode "Android Phone" "Can reach the public staging frontend and Django API through CloudFront; authenticated device flows remain unverified." {
                    tags "ClientRuntime"
                }
            }

            hostinger = deploymentNode "Hostinger" "External registrar for syncvitals.space; it delegates authoritative DNS to Route 53." {
                tags "ExternalZone"

                registrarDelegation = infrastructureNode "Domain Registration + Nameserver Delegation" "Keeps the domain registered and delegates it to the four Route 53 authoritative nameservers." {
                    tags "ExternalService"
                }
            }

            aws = deploymentNode "AWS Account 173291122778" "Manually provisioned presentation staging. CloudFront serves the private S3 frontend and routes /api/* to a guarded Nginx origin. One ARM64 EC2 host runs healthy Django and PostgreSQL containers; PostgreSQL persists on a retained encrypted EBS volume. CloudWatch host metrics are live; logs, traces, alarms, and backups remain pending." {
                tags "CloudZone"

                iam = deploymentNode "IAM (Global)" "Identity and least-privilege permissions for the staging host." {
                    tags "IdentityZone"

                    instanceRole = infrastructureNode "syncvitals-staging-ec2-role" "EC2-only trust with a matching instance profile; no human credentials are stored on the host." {
                        tags "IdentityService"
                    }

                    ssmCore = infrastructureNode "AmazonSSMManagedInstanceCore" "AWS-managed policy enabling Systems Manager registration and Session Manager operations." {
                        tags "PolicyService"
                    }

                    runtimeReadPolicy = infrastructureNode "SyncVitalsStagingRuntimeRead" "Allows ECR authorization, pull-only access to the one backend repository, and GetSecretValue for the one runtime secret." {
                        tags "PolicyService"
                    }

                    metricsWritePolicy = infrastructureNode "SyncVitalsStagingMetricsWrite" "Inline policy permits cloudwatch:PutMetricData only in namespace CWAgent and region eu-central-1. No log or trace publishing permissions are added by this policy." {
                        tags "PolicyService"
                    }

                    dnsPolicy = infrastructureNode "SyncVitalsStagingOriginCertificateDns" "Allows zone discovery and change polling, while DNS mutation is restricted to UPSERT/DELETE of the origin ACME TXT record." {
                        tags "PolicyService"
                    }
                }

                route53 = deploymentNode "Route 53 (Global)" "Authoritative public DNS for syncvitals.space." {
                    tags "EdgeZone"

                    hostedZone = infrastructureNode "Public Hosted Zone: syncvitals.space" "Contains NS, SOA, ACM validation CNAME, staging A/AAAA aliases to CloudFront, and the origin A record." {
                        tags "EdgeService"
                    }

                    originRecord = infrastructureNode "origin-staging.syncvitals.space" "A record resolves the private-purpose origin hostname to Elastic IP 3.73.229.16. Public clients normally use staging.syncvitals.space through CloudFront." {
                        tags "EdgeService"
                    }

                    acmValidation = infrastructureNode "ACM DNS Validation CNAME" "Proves control of staging.syncvitals.space and remains for managed certificate renewal." {
                        tags "SecurityService"
                    }
                }

                cloudFront = deploymentNode "CloudFront (Global Edge)" "Public HTTPS and private frontend delivery boundary." {
                    tags "EdgeZone"

                    distribution = infrastructureNode "Staging CloudFront Distribution" "E1BWDS134TAX2K serves staging.syncvitals.space. The default behavior privately serves the SPA from S3; /assets/* is optimized, while the shell and /api/* are uncached." {
                        tags "DistributionService"
                    }

                    apiBehavior = infrastructureNode "/api/* Behavior" "Accepts all seven HTTP methods and bypasses the SPA rewrite. Uses managed CachingDisabled (4135ea2d...) and AllViewer (216adef6...) policies; repeated requests are verified cache misses." {
                        tags "EdgeComputeService"
                    }

                    apiOrigin = infrastructureNode "Django Custom Origin" "HTTPS-only custom origin at origin-staging.syncvitals.space using TLS 1.2. Sends a secret X-SyncVitals-Origin header whose value is intentionally omitted." {
                        tags "EdgeService"
                    }

                    spaFunction = infrastructureNode "SPA Rewrite Function" "LIVE CloudFront Function rewrites extensionless GET/HEAD frontend routes to /index.html while preserving /api, /assets, files, and other methods." {
                        tags "EdgeComputeService"
                    }

                    oac = infrastructureNode "S3 Origin Access Control" "OAC E3COXMPWT0QATK signs every S3 origin request with SigV4." {
                        tags "SecurityService"
                    }
                }

                usEast1 = deploymentNode "us-east-1 (N. Virginia)" "CloudFront viewer-certificate region." {
                    tags "CloudZone"

                    viewerCertificate = infrastructureNode "ACM Viewer Certificate" "Issued certificate for staging.syncvitals.space, attached through SNI with TLSv1.2_2021." {
                        tags "SecurityService"
                    }
                }

                euCentral1 = deploymentNode "eu-central-1 (Frankfurt)" "Chosen region for the application host, frontend object storage, and backend container registry." {
                    tags "CloudZone"

                    cloudFrontOriginPrefixList = infrastructureNode "CloudFront Origin-Facing Prefix List" "AWS-managed regional prefix list pl-a3a144ca represents CloudFront origin-facing servers." {
                        tags "EdgeService"
                    }

                    defaultVpc = deploymentNode "Default VPC" "Existing VPC vpc-08d84eb2a3aa76777 with CIDR 172.31.0.0/16; it now contains the one SyncVitals presentation-staging host." {
                        tags "NetworkZone"

                        originSecurityGroup = infrastructureNode "syncvitals-staging-origin" "Attached security group sg-0bb8f60ee0b21cb06 allows inbound TCP 443 only from pl-a3a144ca. It has no inbound SSH, HTTP, Gunicorn, PostgreSQL, IPv4 CIDR, or IPv6 CIDR rule; default all-IPv4 outbound remains enabled for host dependencies." {
                            tags "SecurityService"
                        }

                        ec2Host = infrastructureNode "EC2 Origin Host" "i-08fbc9f0c53265b63: healthy t4g.small ARM64 in eu-central-1c. Ubuntu 24.04, kernel 7.0.0-1012-aws; IMDSv2 and termination protection enabled. Session Manager verified; eight host upgrades await a maintenance window." {
                            tags "ComputeService"
                        }

                        awsCli = infrastructureNode "AWS CLI 2.36.44" "Native aarch64 AWS CLI v2 installed from a version-pinned, checksum-checked, AWS-signature-verified bundle. Used with the EC2 instance role; no human credentials are stored." {
                            tags "HostAutomationService"
                        }

                        deploymentBundle = infrastructureNode "Deployment Bundle" "Seven root-owned files installed at /opt/syncvitals/deployment. Transferred archive SHA-256: 0b68bc239eabb8be3b079782752d7fb72ba5dc655cabbc7f2cfca4618297fd7f." {
                            tags "AcceptedArtifact"
                        }

                        dockerStorageGuard = infrastructureNode "Docker Storage Guard" "systemd drop-in requires and binds Docker to srv-syncvitals.mount, then verifies the expected EBS UUID and writeability before Docker starts. Reboot behavior passed." {
                            tags "HostAutomationService"
                        }

                        dockerRuntime = infrastructureNode "Docker Engine + Compose" "ARM64 Docker 29.8.0 with containerd 2.3.4, Compose 5.5.1, and Buildx 0.37.0. Active and boot-enabled; application containers are managed from the installed deployment bundle." {
                            tags "RuntimeService"
                        }

                        postgresImage = infrastructureNode "Pinned PostgreSQL 16 Image" "postgres:16 pinned by digest sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94. Its postgres process uses UID/GID 999:999." {
                            tags "AcceptedArtifact"
                        }

                        databaseMount = infrastructureNode "Database Filesystem" "/srv/syncvitals: ext4, label staging-postgres, UUID f4a12602-0ab0-45ae-a73d-dc6fc8fb00e2. Mounted from /dev/nvme1n1 through fstab; remount and pre-Docker guard passed after reboot." {
                            tags "StorageService"
                        }

                        postgresDirectory = infrastructureNode "PostgreSQL Data Directory" "/srv/syncvitals/postgresql on the retained EBS filesystem. Owner 999:999 and mode 700 allow only PostgreSQL (and root) to access the database files." {
                            tags "StorageService"
                        }

                        databaseContainer = infrastructureNode "PostgreSQL 16 Container" "syncvitals-staging-database-1 is healthy and exposes no host or public port. Its schema and system seed rows exist; user, metric-entry, wearable, subscription, and Stripe records are empty." {
                            tags "ContainerService"
                        }

                        apiContainer = infrastructureNode "Django + Gunicorn Container" "syncvitals-staging-api-1 is healthy, all migrations are applied, and Gunicorn is published only at host loopback 127.0.0.1:18000. Django auth.W004 remains known debt." {
                            tags "ContainerService"
                        }

                        nginx = infrastructureNode "Nginx 1.24.0" "Terminates origin TLS on 443, rejects requests missing the root-only CloudFront header, and proxies accepted traffic to 127.0.0.1:18000. Port 80 redirects to the fixed HTTPS origin hostname but is blocked by the security group." {
                            tags "WebServerService"
                        }

                        cloudWatchAgent = infrastructureNode "CloudWatch Agent" "Console-installed; runs as cwagent. Collects memory and root-disk usage every 60s; delivery verified. Exact version and boot enablement unchecked. Workload detection off." {
                            tags "MonitoringService"
                        }

                        certbot = infrastructureNode "Certbot 2.9.0 + dns-route53" "Certbot 2.9.0 and Route 53 DNS-01 plugin issued the origin certificate. The renewal dry-run passed; private key contents are not recorded." {
                            tags "SecurityService"
                        }

                        certbotTimer = infrastructureNode "Certbot Renewal Timer" "systemd timer is active and boot-enabled. Renewal dry-run and the Nginx deploy hook both passed." {
                            tags "HostAutomationService"
                        }
                    }

                    cloudWatch = deploymentNode "Amazon CloudWatch" "Regional host monitoring in Frankfurt. Memory and root-disk metric datapoints are verified; logs, traces, and alarms are not configured." {
                        tags "CloudZone"

                        hostMetrics = infrastructureNode "CWAgent Host Metrics" "CWAgent, instance i-08fbc9f0c53265b63: mem_used_percent by InstanceId; disk_used_percent by InstanceId, fstype=ext4, path=/. No rollups or device dimension. On 2026-09-08: memory ~16%, root disk ~26%." {
                            tags "MonitoringService"
                        }
                    }

                    elasticIp = infrastructureNode "Elastic IP 3.73.229.16" "Stable public IPv4 address eipalloc-093b36cd5cd7ac947 associated with the host's primary private address 172.31.14.35." {
                        tags "EdgeService"
                    }

                    rootVolume = infrastructureNode "Encrypted EC2 Root Volume" "vol-0fb2e65033bb83fb5: 16 GiB gp3, encrypted with aws/ebs. DeleteOnTermination=true. Stores Ubuntu, host software, deployment files, and cached images; PostgreSQL data uses the separate disk." {
                        tags "StorageService"
                    }

                    databaseVolume = infrastructureNode "Encrypted PostgreSQL EBS Volume" "vol-0f23b93a2f1cd46b4 (syncvitals-staging-postgresql): 10 GiB gp3, 3000 IOPS, 125 MiB/s, eu-central-1c. aws/ebs encryption; created blank. Attached as /dev/sdf, seen as /dev/nvme1n1. DeleteOnTermination=false verified." {
                        tags "StorageService"
                    }

                    frontendBucket = infrastructureNode "Private Frontend Assets" "Private versioned S3 origin containing the 18-file Vite build. SSE-S3, Block Public Access, CloudFront-scoped reads, and an explicit deny for insecure transport are enabled." {
                        tags "StorageService"
                    }

                    ecr = deploymentNode "Elastic Container Registry" "Private regional OCI image registry for the presentation-staging backend." {
                        tags "RegistryZone"

                        backendRepository = infrastructureNode "syncvitals/staging/backend" "Private repository with immutable tags, AES-256 encryption, and basic scan on push. It currently retains only the deployed image; temporary host login credentials were removed." {
                            tags "RegistryService"
                        }

                        acceptedImage = infrastructureNode "Deployed ARM64 Backend Image" "Image from Git commit cf1397bd91a169c0ac20e1c3e6acd73cdb60f996, pinned by index digest sha256:24edf7e3d5911c72a2565ff5b30b05d4eaeaf0b0eee7c0dac212731179deeb83. Docker resolved linux/arm64." {
                            tags "AcceptedArtifact"
                        }

                        scanRule = infrastructureNode "Accepted Basic Scan" "0 critical, 1 high, 0 medium, and 0 low findings. CVE-2026-85091 in zlib is accepted only for demo-data staging; no previous image remains for rollback." {
                            tags "SecurityService"
                        }
                    }

                    secretsManager = deploymentNode "Secrets Manager" "Regional encrypted configuration store for the staging runtime." {
                        tags "SecurityZone"

                        runtimeSecret = infrastructureNode "longevity/staging/backend-runtime" "One AWSCURRENT version contains the validated application runtime fields plus CLOUDFRONT_ORIGIN_HEADER. Values are omitted; automatic rotation is not configured." {
                            tags "SecurityService"
                        }
                    }
                }
            }

            instanceRole -> ssmCore "Has managed Systems Manager core permissions" "IAM attachment" {
                tags "IdentityTraffic"
            }
            instanceRole -> runtimeReadPolicy "Has the verified runtime-read policy" "Inline IAM policy" {
                tags "IdentityTraffic"
            }
            instanceRole -> metricsWritePolicy "Has namespace- and region-scoped metric publishing permission" "Inline IAM policy" {
                tags "IdentityTraffic"
            }
            metricsWritePolicy -> hostMetrics "Allows publishing only to CWAgent in Frankfurt" "IAM authorization" {
                tags "IdentityTraffic"
            }
            ec2Host -> cloudWatchAgent "Runs the configured host metrics collector" "Host service" {
                tags "HostTraffic"
            }
            cloudWatchAgent -> hostMetrics "Publishes memory and root-disk usage every 60 seconds" "HTTPS / PutMetricData" {
                tags "MonitoringTraffic"
            }
            instanceRole -> dnsPolicy "Has the verified DNS-01 policy" "Inline IAM policy" {
                tags "IdentityTraffic"
            }
            instanceRole -> acceptedImage "May pull the accepted image from the one repository" "ECR read"
            instanceRole -> runtimeSecret "May retrieve AWSCURRENT at deployment time" "Secrets Manager read"
            instanceRole -> hostedZone "May change only the origin ACME TXT record" "Route 53 API"
            instanceRole -> ec2Host "Attached through the matching instance profile" "IAM instance profile" {
                tags "IdentityTraffic"
            }
            originSecurityGroup -> ec2Host "Is attached as the host's only security group" "EC2 network interface" {
                tags "SecurityTraffic"
            }
            rootVolume -> ec2Host "Provides the encrypted operating-system disk" "EBS attachment" {
                tags "StorageTraffic"
            }
            databaseVolume -> ec2Host "Provides the retained 10 GiB database disk" "EBS attachment /dev/sdf" {
                tags "StorageTraffic"
            }
            databaseVolume -> databaseMount "Hosts the ext4 filesystem; remount verified after reboot" "UUID-based mount" {
                tags "StorageTraffic"
            }
            databaseMount -> postgresDirectory "Contains data directory" "Filesystem directory" {
                tags "StorageTraffic"
            }
            dockerStorageGuard -> databaseMount "Verifies the required UUID and writeability before Docker starts" "systemd ExecStartPre" {
                tags "AutomationTraffic"
            }
            deploymentBundle -> dockerStorageGuard "Installs the Docker service drop-in and storage check" "Host configuration" {
                tags "AutomationTraffic"
            }
            dockerRuntime -> postgresImage "Uses the digest-pinned database image" "Local OCI image" {
                tags "HostTraffic"
            }
            postgresImage -> databaseContainer "Supplies the PostgreSQL runtime" "Container image" {
                tags "HostTraffic"
            }
            acceptedImage -> apiContainer "Supplies the deployed Django runtime" "Digest-pinned container image" {
                tags "RegistryTraffic"
            }
            dockerRuntime -> databaseContainer "Runs the healthy database container" "Docker Compose" {
                tags "HostTraffic"
            }
            dockerRuntime -> apiContainer "Runs the healthy API container" "Docker Compose" {
                tags "HostTraffic"
            }
            databaseContainer -> postgresDirectory "Persists PostgreSQL data through a bind mount" "/var/lib/postgresql/data" {
                tags "StorageTraffic"
            }
            apiContainer -> databaseContainer "Reads and writes application data on the private Compose network" "PostgreSQL protocol" {
                tags "ApplicationTraffic"
            }
            ec2Host -> dockerRuntime "Runs ARM64 Docker" "Host service" {
                tags "HostTraffic"
            }
            ec2Host -> awsCli "Uses instance-role AWS access during deployment" "Host tool" {
                tags "HostTraffic"
            }
            deploymentBundle -> dockerRuntime "Defines and validates the staging Compose deployment" "Root-owned configuration" {
                tags "AutomationTraffic"
            }
            ec2Host -> nginx "Runs web server" "Host service" {
                tags "HostTraffic"
            }
            nginx -> apiContainer "Proxies accepted origin requests over host loopback" "HTTP 127.0.0.1:18000" {
                tags "ApplicationTraffic"
            }
            runtimeSecret -> apiContainer "Supplies validated runtime configuration in memory at deployment" "Secret retrieval" {
                tags "SecurityTraffic"
            }
            runtimeSecret -> nginx "Supplies the omitted origin-header value to a root-only snippet" "Mode 600 host configuration" {
                tags "SecurityTraffic"
            }
            nginx -> certbot "Reads the managed origin certificate and key" "TLS files" {
                tags "SecurityTraffic"
            }
            ec2Host -> certbot "Provides DNS-01 tooling" "Host package" {
                tags "HostTraffic"
            }
            certbotTimer -> certbot "Invokes periodic renewal checks" "systemd timer" {
                tags "AutomationTraffic"
            }
            certbot -> nginx "Validates and reloads Nginx after renewal" "Deploy hook" {
                tags "AutomationTraffic"
            }
            cloudFrontOriginPrefixList -> originSecurityGroup "Is the sole inbound source on TCP 443" "Security-group rule" {
                tags "SecurityTraffic"
            }

            browser -> hostedZone "Resolves staging.syncvitals.space through A or AAAA" "DNS" {
                tags "ClientTraffic"
            }
            android -> hostedZone "Resolves staging.syncvitals.space through A or AAAA" "DNS" {
                tags "ClientTraffic"
            }
            registrarDelegation -> hostedZone "Delegates syncvitals.space through the Route 53 nameservers" "DNS delegation" {
                tags "EdgeTraffic"
            }
            hostedZone -> distribution "Aliases staging.syncvitals.space to the distribution" "A + AAAA alias" {
                tags "EdgeTraffic"
            }
            browser -> distribution "Requests the public frontend" "HTTPS" {
                tags "ClientTraffic"
            }
            android -> distribution "Calls the public /api/* endpoint; authenticated flows remain unverified" "HTTPS" {
                tags "ClientTraffic"
            }
            acmValidation -> viewerCertificate "Proves domain control for issuance and automatic renewal" "DNS validation" {
                tags "SecurityTraffic"
            }
            viewerCertificate -> distribution "Provides viewer TLS for staging.syncvitals.space" "TLS certificate" {
                tags "SecurityTraffic"
            }
            distribution -> spaFunction "Invokes on the default behavior before cache lookup" "Viewer request" {
                tags "EdgeTraffic"
            }
            distribution -> apiBehavior "Selects uncached API routing for /api/*" "Ordered cache behavior" {
                tags "EdgeTraffic"
            }
            apiBehavior -> apiOrigin "Forwards all required viewer request data" "HTTPS-only origin request" {
                tags "OriginTraffic"
            }
            apiOrigin -> originRecord "Resolves the origin hostname" "DNS A lookup" {
                tags "EdgeTraffic"
            }
            originRecord -> elasticIp "Maps the origin name to its stable IPv4 address" "Route 53 A record" {
                tags "EdgeTraffic"
            }
            elasticIp -> ec2Host "Associates with primary private address 172.31.14.35" "EC2 network interface" {
                tags "EdgeTraffic"
            }
            apiOrigin -> nginx "Sends TLS requests with the secret origin header" "HTTPS 443" {
                tags "OriginTraffic"
            }
            distribution -> oac "Uses for the private S3 origin" "OAC" {
                tags "SecurityTraffic"
            }
            oac -> frontendBucket "Signs distribution-scoped reads for index.html and static assets" "HTTPS + SigV4" {
                tags "OriginTraffic"
            }
            backendRepository -> acceptedImage "Stores the approved immutable tag and digest" "OCI artifact" {
                tags "RegistryTraffic"
            }
            scanRule -> acceptedImage "Completed; residual findings explicitly accepted for demo staging" "Basic OS scan" {
                tags "SecurityTraffic"
            }
        }
    }

    views {
        deployment * currentAwsV016 "current-aws-v016" "[CURRENT AWS V016] Actual state: V015 plus the accepted ARM64 backend image, installed deployment bundle and boot guard, healthy PostgreSQL and Django containers, EBS persistence, guarded Nginx proxy, and uncached CloudFront /api/* routing. Public liveness/readiness are verified; logs, alarms, backups, and authenticated end-to-end flows remain pending." {
            include *
            autolayout lr 180 110
        }

        styles {
            element "Element" {
                color "#17202a"
                stroke "#94a3b8"
                strokeWidth 2
                fontSize 20
                width 520
                height 360
            }
            element "ClientZone" {
                background "#fbfdff"
                stroke "#cbd5e1"
            }
            element "ClientRuntime" {
                background "#eff6ff"
                stroke "#93c5fd"
            }
            element "ExternalZone" {
                background "#fdfbff"
                stroke "#ddd6fe"
            }
            element "ExternalService" {
                background "#f5f3ff"
                stroke "#c4b5fd"
            }
            element "CloudZone" {
                background "#fbfdff"
                stroke "#cbd5e1"
            }
            element "IdentityZone" {
                background "#fafaff"
                stroke "#c4b5fd"
            }
            element "IdentityService" {
                background "#f5f3ff"
                stroke "#a78bfa"
                width 520
                height 360
            }
            element "PolicyService" {
                background "#faf5ff"
                stroke "#d8b4fe"
                width 520
                height 360
            }
            element "EdgeZone" {
                background "#f7fcff"
                stroke "#bae6fd"
            }
            element "EdgeService" {
                background "#e0f2fe"
                stroke "#7dd3fc"
            }
            element "DistributionService" {
                background "#eff6ff"
                stroke "#60a5fa"
                width 520
                height 360
            }
            element "EdgeComputeService" {
                background "#f0fdfa"
                stroke "#5eead4"
                width 520
                height 360
            }
            element "SecurityService" {
                background "#f0fdf4"
                stroke "#86efac"
            }
            element "SecurityZone" {
                background "#f7fff9"
                stroke "#bbf7d0"
            }
            element "NetworkZone" {
                background "#f8fafc"
                stroke "#cbd5e1"
            }
            element "ComputeService" {
                background "#eef2ff"
                stroke "#818cf8"
                width 520
                height 360
            }
            element "RuntimeService" {
                background "#ecfdf5"
                stroke "#34d399"
                width 520
                height 360
            }
            element "ContainerService" {
                shape RoundedBox
                background "#ecfdf5"
                stroke "#10b981"
                width 520
                height 360
            }
            element "WebServerService" {
                background "#fff7ed"
                stroke "#fb923c"
                width 520
                height 360
            }
            element "MonitoringService" {
                background "#fdf2f8"
                stroke "#ec4899"
                width 520
                height 360
            }
            element "HostAutomationService" {
                background "#f0fdfa"
                stroke "#2dd4bf"
                width 520
                height 360
            }
            element "StorageService" {
                shape Cylinder
                background "#f0f9ff"
                stroke "#7dd3fc"
                width 520
                height 360
            }
            element "RegistryZone" {
                background "#fffdf7"
                stroke "#fde68a"
            }
            element "RegistryService" {
                shape Cylinder
                background "#fffbeb"
                stroke "#fcd34d"
                width 520
                height 360
            }
            element "AcceptedArtifact" {
                background "#ecfdf5"
                stroke "#6ee7b7"
                width 520
                height 360
            }
            element "RejectedArtifact" {
                background "#fff7ed"
                stroke "#fdba74"
                width 520
                height 360
            }
            relationship "IdentityTraffic" {
                color "#8b5cf6"
                thickness 3
            }
            relationship "ClientTraffic" {
                color "#60a5fa"
                thickness 3
            }
            relationship "EdgeTraffic" {
                color "#a78bfa"
                thickness 3
            }
            relationship "SecurityTraffic" {
                color "#4ade80"
                thickness 3
            }
            relationship "OriginTraffic" {
                color "#38bdf8"
                thickness 3
            }
            relationship "RegistryTraffic" {
                color "#f59e0b"
                thickness 3
            }
            relationship "MonitoringTraffic" {
                color "#db2777"
                thickness 3
            }
            relationship "AutomationTraffic" {
                color "#14b8a6"
                thickness 3
            }
            relationship "StorageTraffic" {
                color "#0ea5e9"
                thickness 3
            }
            relationship "HostTraffic" {
                color "#64748b"
                thickness 3
            }
            relationship "ApplicationTraffic" {
                color "#059669"
                thickness 3
            }
        }
    }
}
