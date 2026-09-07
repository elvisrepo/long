workspace "SyncVitals Current AWS V011" "Verified presentation-staging deployment state after updating the Ubuntu host and installing and validating Docker and Nginx on 2026-09-07." {
    model {
        currentAwsV011 = deploymentEnvironment "[CURRENT AWS V011] Docker + Nginx Host Ready" {
            userDevices = deploymentNode "User Devices" "Presentation clients that resolve the public staging hostname." {
                tags "ClientZone"

                browser = infrastructureNode "Web Browser" "Loads the deployed React application from staging.syncvitals.space." {
                    tags "ClientRuntime"
                }

                android = infrastructureNode "Android Phone" "Can resolve the staging hostname, but the /api origin is not deployed in this snapshot." {
                    tags "ClientRuntime"
                }
            }

            hostinger = deploymentNode "Hostinger" "External registrar for syncvitals.space; it delegates authoritative DNS to Route 53." {
                tags "ExternalZone"

                registrarDelegation = infrastructureNode "Domain Registration + Nameserver Delegation" "Keeps the domain registered and delegates it to the four Route 53 authoritative nameservers." {
                    tags "ExternalService"
                }
            }

            aws = deploymentNode "AWS Account 173291122778" "Manually provisioned presentation-staging account. Frontend delivery and backend prerequisites include one updated EC2 origin host with an encrypted root disk, working Systems Manager access, a verified native ARM64 Docker runtime, and a verified Nginx service. The persistent database volume, stable origin address, origin TLS certificate, Django and PostgreSQL containers, CloudFront API origin, and staging CloudWatch resources do not exist yet." {
                tags "CloudZone"

                iam = deploymentNode "IAM (Global)" "Identity and least-privilege permissions for the future staging host." {
                    tags "IdentityZone"

                    instanceRole = infrastructureNode "syncvitals-staging-ec2-role" "EC2-only trust with a matching instance profile; no human credentials are stored on the future host." {
                        tags "IdentityService"
                    }

                    ssmCore = infrastructureNode "AmazonSSMManagedInstanceCore" "AWS-managed policy enabling Systems Manager registration and Session Manager operations." {
                        tags "PolicyService"
                    }

                    runtimeReadPolicy = infrastructureNode "SyncVitalsStagingRuntimeRead" "Allows ECR authorization, pull-only access to the one backend repository, and GetSecretValue for the one runtime secret." {
                        tags "PolicyService"
                    }

                    dnsPolicy = infrastructureNode "SyncVitalsStagingOriginCertificateDns" "Allows zone discovery and change polling, while DNS mutation is restricted to UPSERT/DELETE of the origin ACME TXT record." {
                        tags "PolicyService"
                    }
                }

                route53 = deploymentNode "Route 53 (Global)" "Authoritative public DNS for syncvitals.space." {
                    tags "EdgeZone"

                    hostedZone = infrastructureNode "Public Hosted Zone: syncvitals.space" "Contains NS, SOA, ACM validation CNAME, and staging A/AAAA aliases to CloudFront." {
                        tags "EdgeService"
                    }

                    acmValidation = infrastructureNode "ACM DNS Validation CNAME" "Proves control of staging.syncvitals.space and remains for managed certificate renewal." {
                        tags "SecurityService"
                    }
                }

                cloudFront = deploymentNode "CloudFront (Global Edge)" "Public HTTPS and private frontend delivery boundary." {
                    tags "EdgeZone"

                    distribution = infrastructureNode "Staging CloudFront Distribution" "E1BWDS134TAX2K serves staging.syncvitals.space and d14agywanftmtp.cloudfront.net. It redirects HTTP to HTTPS, uses index.html as its root, disables shell caching, and applies optimized caching to /assets/*. The /api origin does not exist yet." {
                        tags "DistributionService"
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

                        ec2Host = infrastructureNode "EC2 Origin Host" "Running instance i-08fbc9f0c53265b63 is a healthy t4g.small ARM64 host in eu-central-1c on updated Canonical Ubuntu 24.04 with AWS kernel 7.0.0-1012-aws. The intended role and security group are attached, IMDSv2 is required, termination protection is enabled, and Session Manager access works." {
                            tags "ComputeService"
                        }

                        dockerRuntime = infrastructureNode "Docker Engine + Compose" "Native ARM64 Docker Engine 29.8.0, containerd 2.3.4, Compose 5.5.1, and Buildx 0.37.0 are active and enabled. The arm64v8 hello-world smoke test passed; no application containers are deployed." {
                            tags "RuntimeService"
                        }

                        nginx = infrastructureNode "Nginx 1.24.0" "Ubuntu Nginx 1.24.0 is active, enabled, syntax-validated, and locally returns HTTP 200. It currently has only the packaged port-80 site; the security group blocks port 80, and origin TLS, reverse proxying, and the CloudFront API origin are not configured." {
                            tags "WebServerService"
                        }
                    }

                    rootVolume = infrastructureNode "Encrypted EC2 Root Volume" "Attached 16 GiB gp3 EBS volume vol-0fb2e65033bb83fb5 uses the AWS-managed EBS KMS key and DeleteOnTermination=true. It is the operating-system disk, not the future persistent PostgreSQL volume." {
                        tags "StorageService"
                    }

                    frontendBucket = infrastructureNode "Private Frontend Assets" "Private versioned S3 origin containing the 18-file Vite build. SSE-S3, Block Public Access, CloudFront-scoped reads, and an explicit deny for insecure transport are enabled." {
                        tags "StorageService"
                    }

                    ecr = deploymentNode "Elastic Container Registry" "Private regional OCI image registry for the presentation-staging backend." {
                        tags "RegistryZone"

                        backendRepository = infrastructureNode "syncvitals/staging/backend" "Private repository with immutable tags, AES-256 encryption, basic scan on push, and no lifecycle or repository permission policy." {
                            tags "RegistryService"
                        }

                        acceptedImage = infrastructureNode "Accepted ARM64 Backend Image" "Trixie-based image from commit 912f84c17dd2b8535acec65dd60751d17d245dd5, pinned by index digest sha256:f830d2790257ce835ace60268d1408d71f3b50c4b3eb205c5f8360dd3d9d9122. Scan risk is accepted only for demo-data presentation staging." {
                            tags "AcceptedArtifact"
                        }

                        rejectedImage = infrastructureNode "Rejected Bookworm Image" "Earlier image from commit 6e9b3de325eba377e3b18113a9fb26c1aa99cd82 remains stored for audit but is not approved for deployment." {
                            tags "RejectedArtifact"
                        }

                        scanRule = infrastructureNode "Basic Scan-on-Push Rule" "Scans the repository's operating-system packages whenever an image is pushed." {
                            tags "SecurityService"
                        }
                    }

                    secretsManager = deploymentNode "Secrets Manager" "Regional encrypted configuration store for the staging runtime." {
                        tags "SecurityZone"

                        runtimeSecret = infrastructureNode "longevity/staging/backend-runtime" "One AWSCURRENT version contains the 15 required string values. The JSON and database-password invariant passed in-memory loader validation; values are intentionally omitted. Automatic rotation is not configured." {
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
            ec2Host -> dockerRuntime "Runs the verified native ARM64 container runtime" "Host service" {
                tags "HostTraffic"
            }
            ec2Host -> nginx "Runs the verified web-server process" "Host service" {
                tags "HostTraffic"
            }
            cloudFrontOriginPrefixList -> originSecurityGroup "Is the sole inbound source on TCP 443" "Security-group rule" {
                tags "SecurityTraffic"
            }

            browser -> hostedZone "Resolves staging.syncvitals.space through A or AAAA" "DNS" {
                tags "ClientTraffic"
            }
            android -> hostedZone "Resolves the staging hostname; the future API path has no origin yet" "DNS" {
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
            acmValidation -> viewerCertificate "Proves domain control for issuance and automatic renewal" "DNS validation" {
                tags "SecurityTraffic"
            }
            viewerCertificate -> distribution "Provides viewer TLS for staging.syncvitals.space" "TLS certificate" {
                tags "SecurityTraffic"
            }
            distribution -> spaFunction "Invokes on the default behavior before cache lookup" "Viewer request" {
                tags "EdgeTraffic"
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
            backendRepository -> rejectedImage "Retains the unapproved immutable artifact for audit" "OCI artifact" {
                tags "RegistryTraffic"
            }
            scanRule -> acceptedImage "Completed; residual findings explicitly accepted for demo staging" "Basic OS scan" {
                tags "SecurityTraffic"
            }
            scanRule -> rejectedImage "Completed; artifact rejected" "Basic OS scan" {
                tags "SecurityTraffic"
            }
        }
    }

    views {
        deployment * currentAwsV011 "current-aws-v011" "[CURRENT AWS V011] Actual state: V010 plus the updated Ubuntu host, verified native ARM64 Docker runtime, and verified Nginx service. Origin TLS, reverse proxying, application containers, and persistent PostgreSQL storage remain absent." {
            include *
            autolayout lr 150 70
        }

        styles {
            element "Element" {
                color "#17202a"
                stroke "#94a3b8"
                strokeWidth 2
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
                width 410
                height 250
            }
            element "PolicyService" {
                background "#faf5ff"
                stroke "#d8b4fe"
                width 410
                height 250
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
                width 430
                height 260
            }
            element "EdgeComputeService" {
                background "#f0fdfa"
                stroke "#5eead4"
                width 390
                height 220
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
                width 420
                height 250
            }
            element "RuntimeService" {
                background "#ecfdf5"
                stroke "#34d399"
                width 400
                height 230
            }
            element "WebServerService" {
                background "#fff7ed"
                stroke "#fb923c"
                width 420
                height 250
            }
            element "StorageService" {
                shape Cylinder
                background "#f0f9ff"
                stroke "#7dd3fc"
                width 420
                height 260
            }
            element "RegistryZone" {
                background "#fffdf7"
                stroke "#fde68a"
            }
            element "RegistryService" {
                shape Cylinder
                background "#fffbeb"
                stroke "#fcd34d"
                width 420
                height 250
            }
            element "AcceptedArtifact" {
                background "#ecfdf5"
                stroke "#6ee7b7"
                width 440
                height 280
            }
            element "RejectedArtifact" {
                background "#fff7ed"
                stroke "#fdba74"
                width 420
                height 250
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
            relationship "StorageTraffic" {
                color "#0ea5e9"
                thickness 3
            }
            relationship "HostTraffic" {
                color "#64748b"
                thickness 3
            }
        }
    }
}
