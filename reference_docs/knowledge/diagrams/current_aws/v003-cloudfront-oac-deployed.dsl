workspace "SyncVitals Current AWS V003" "Verified presentation-staging deployment state after deploying CloudFront and its private S3 origin access control on 2026-09-01." {
    model {
        currentAwsV003 = deploymentEnvironment "[CURRENT AWS V003] CloudFront + Private S3 OAC" {
            userDevices = deploymentNode "User Devices" "Future presentation users; staging DNS does not route to the deployed distribution yet." {
                tags "ClientZone"

                browser = infrastructureNode "Web Browser" "Cannot resolve staging.syncvitals.space until its Route 53 application alias exists." {
                    tags "ClientRuntime"
                }

                android = infrastructureNode "Android Phone" "The staging build has no resolvable public API hostname yet." {
                    tags "ClientRuntime"
                }
            }

            hostinger = deploymentNode "Hostinger" "External registrar for syncvitals.space; it delegates authoritative DNS to Route 53." {
                tags "ExternalZone"

                registrarDelegation = infrastructureNode "Domain Registration + Nameserver Delegation" "Keeps the domain registered and delegates it to the four Route 53 authoritative nameservers." {
                    tags "ExternalService"
                }
            }

            aws = deploymentNode "AWS Account 173291122778" "Manually provisioned presentation-staging account. No ECR, EC2, EBS, Elastic IP, Secrets Manager, or CloudWatch staging resource exists in this snapshot." {
                tags "CloudZone"

                route53 = deploymentNode "Route 53 (Global)" "Authoritative public DNS for syncvitals.space." {
                    tags "EdgeZone"

                    hostedZone = infrastructureNode "Public Hosted Zone: syncvitals.space" "Contains NS, SOA, and ACM validation records. No staging application alias exists yet." {
                        tags "EdgeService"
                    }

                    acmValidation = infrastructureNode "ACM DNS Validation CNAME" "Proves control of staging.syncvitals.space and remains for managed certificate renewal." {
                        tags "SecurityService"
                    }
                }

                cloudFront = deploymentNode "CloudFront (Global Edge)" "Deployed presentation-staging viewer and private frontend delivery boundary." {
                    tags "EdgeZone"

                    distribution = infrastructureNode "Staging CloudFront Distribution" "Deployed at d14agywanftmtp.cloudfront.net with staging.syncvitals.space attached. HTTPS redirect and compression are enabled; DNS routing, a default root object, SPA rewriting, and the API behavior are not configured yet." {
                        tags "DistributionService"
                    }

                    oac = infrastructureNode "S3 Origin Access Control" "OAC E3COXMPWT0QATK signs every S3 origin request with SigV4." {
                        tags "SecurityService"
                    }
                }

                usEast1 = deploymentNode "us-east-1 (N. Virginia)" "CloudFront viewer-certificate region." {
                    tags "CloudZone"

                    viewerCertificate = infrastructureNode "ACM Viewer Certificate" "Issued certificate for staging.syncvitals.space, now attached to the CloudFront distribution through SNI with TLSv1.2_2021." {
                        tags "SecurityService"
                    }
                }

                euCentral1 = deploymentNode "eu-central-1 (Frankfurt)" "Chosen region for the application host and frontend object storage." {
                    tags "CloudZone"

                    defaultVpc = infrastructureNode "Default VPC" "Existing 172.31.0.0/16 network; no Longevity compute yet." {
                        tags "NetworkZone"
                    }

                    frontendBucket = infrastructureNode "Private Frontend Assets" "Private S3 origin; its policy grants only distribution E1BWDS134TAX2K permission to read objects." {
                        tags "StorageService"
                    }
                }
            }

            browser -> hostedZone "Queries staging.syncvitals.space; no application alias exists yet" "DNS" {
                tags "ClientTraffic"
            }

            android -> hostedZone "Would resolve the configured staging hostname; no application alias exists yet" "DNS" {
                tags "ClientTraffic"
            }

            registrarDelegation -> hostedZone "Delegates syncvitals.space through the Route 53 nameservers" "DNS delegation" {
                tags "EdgeTraffic"
            }

            acmValidation -> viewerCertificate "Proves domain control for issuance and automatic renewal" "DNS validation" {
                tags "SecurityTraffic"
            }

            viewerCertificate -> distribution "Provides viewer TLS for staging.syncvitals.space" "TLS certificate" {
                tags "SecurityTraffic"
            }

            distribution -> oac "Uses for the private S3 origin" "OAC" {
                tags "SecurityTraffic"
            }

            oac -> frontendBucket "Signs distribution-scoped read requests" "HTTPS + SigV4" {
                tags "OriginTraffic"
            }
        }
    }

    views {
        deployment * currentAwsV003 "current-aws-v003" "[CURRENT AWS V003] Actual state: deployed CloudFront and private S3 OAC with viewer TLS; Route 53 does not route staging traffic to CloudFront yet." {
            include *
            autolayout lr 220 120
        }

        styles {
            element "Element" {
                color "#17202a"
                stroke "#64748b"
                strokeWidth 2
            }
            element "ClientZone" {
                background "#f8fafc"
                stroke "#94a3b8"
            }
            element "ClientRuntime" {
                background "#dbeafe"
                stroke "#438dd5"
            }
            element "ExternalZone" {
                background "#faf5ff"
                stroke "#c4b5fd"
            }
            element "ExternalService" {
                background "#ede9fe"
                stroke "#8b5cf6"
            }
            element "CloudZone" {
                background "#f8fafc"
                stroke "#94a3b8"
            }
            element "EdgeZone" {
                background "#f0f9ff"
                stroke "#7dd3fc"
            }
            element "EdgeService" {
                background "#bae6fd"
                stroke "#438dd5"
            }
            element "DistributionService" {
                background "#dbeafe"
                stroke "#1168bd"
                width 430
                height 260
            }
            element "SecurityService" {
                background "#dcfce7"
                stroke "#4ade80"
            }
            element "NetworkZone" {
                background "#f1f5f9"
                stroke "#94a3b8"
            }
            element "StorageService" {
                shape Cylinder
                background "#e0f2fe"
                stroke "#1168bd"
                width 420
                height 260
            }
            relationship "ClientTraffic" {
                color "#438dd5"
                thickness 3
            }
            relationship "EdgeTraffic" {
                color "#8b5cf6"
                thickness 3
            }
            relationship "SecurityTraffic" {
                color "#16a34a"
                thickness 3
            }
            relationship "OriginTraffic" {
                color "#0369a1"
                thickness 3
            }
        }
    }
}
