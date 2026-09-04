workspace "SyncVitals Current AWS V006" "Verified presentation-staging deployment state after publishing and explicitly accepting the Trixie-based ARM64 backend image on 2026-09-04." {
    model {
        currentAwsV006 = deploymentEnvironment "[CURRENT AWS V006] Backend Image Published" {
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

            aws = deploymentNode "AWS Account 173291122778" "Manually provisioned presentation-staging account. Frontend delivery and the accepted backend image exist; no EC2, EBS, Elastic IP, Secrets Manager, Nginx, Django, PostgreSQL, or staging CloudWatch resource exists yet." {
                tags "CloudZone"

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

                    defaultVpc = infrastructureNode "Default VPC" "Existing 172.31.0.0/16 network; no SyncVitals compute exists yet." {
                        tags "NetworkZone"
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
                }
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
        deployment * currentAwsV006 "current-aws-v006" "[CURRENT AWS V006] Actual state: V005 plus accepted Trixie ARM64 and rejected Bookworm backend artifacts; no API compute exists yet." {
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
            element "NetworkZone" {
                background "#f8fafc"
                stroke "#cbd5e1"
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
        }
    }
}
