workspace "SyncVitals Current AWS V001" "Verified presentation-staging deployment state after DNS delegation and viewer-certificate issuance on 2026-08-31." {
    model {
        currentAwsV001 = deploymentEnvironment "[CURRENT AWS V001] Route 53 + ACM Viewer Certificate" {
            userDevices = deploymentNode "User Devices" "Future presentation users; no deployed application endpoint exists yet." {
                tags "ClientZone"

                browser = infrastructureNode "Web Browser" "A request for staging.syncvitals.space currently has no application alias to resolve." {
                    tags "ClientRuntime"
                }

                android = infrastructureNode "Android Phone" "The isolated staging build is prepared, but no public API endpoint exists yet." {
                    tags "ClientRuntime"
                }
            }

            hostinger = deploymentNode "Hostinger" "External registrar for syncvitals.space; it no longer manages the domain's DNS records." {
                tags "ExternalZone"

                registrarDelegation = infrastructureNode "Domain Registration + Nameserver Delegation" "Keeps the domain registered and delegates it to the four Route 53 authoritative nameservers." {
                    tags "ExternalService"
                }
            }

            aws = deploymentNode "AWS Account 173291122778" "Manually provisioned presentation-staging account. No CloudFront, S3, ECR, EC2, EBS, Elastic IP, Secrets Manager, or CloudWatch staging resource exists in this snapshot." {
                tags "CloudZone"

                route53 = deploymentNode "Route 53 (Global)" "Authoritative public DNS for syncvitals.space." {
                    tags "EdgeZone"

                    hostedZone = infrastructureNode "Public Hosted Zone: syncvitals.space" "Contains the generated NS and SOA records plus ACM's validation CNAME. It has no staging application alias yet." {
                        tags "EdgeService"
                    }

                    acmValidation = infrastructureNode "ACM DNS Validation CNAME" "Proves control of staging.syncvitals.space and remains in place for managed certificate renewal." {
                        tags "SecurityService"
                    }
                }

                usEast1 = deploymentNode "us-east-1 (N. Virginia)" "CloudFront viewer-certificate region." {
                    tags "CloudZone"

                    viewerCertificate = infrastructureNode "Issued ACM Viewer Certificate" "AWS-managed, non-exportable RSA 2048 certificate for staging.syncvitals.space. It is issued but not attached because CloudFront does not exist yet." {
                        tags "SecurityService"
                    }
                }

                euCentral1 = deploymentNode "eu-central-1 (Frankfurt)" "Chosen application region; no Longevity workload has been provisioned here yet." {
                    tags "CloudZone"

                    defaultVpc = infrastructureNode "Existing Default VPC 172.31.0.0/16" "Account-default network discovered during the read-only inventory; it contains no Longevity compute in V001." {
                        tags "NetworkZone"
                    }
                }
            }

            browser -> hostedZone "Queries staging.syncvitals.space; no application record exists yet" "DNS" {
                tags "ClientTraffic"
            }

            android -> hostedZone "Would resolve the configured staging origin; no application record exists yet" "DNS" {
                tags "ClientTraffic"
            }

            registrarDelegation -> hostedZone "Delegates syncvitals.space through the Route 53 nameservers" "DNS delegation" {
                tags "EdgeTraffic"
            }

            acmValidation -> viewerCertificate "Proves domain control for issuance and automatic renewal" "DNS validation" {
                tags "SecurityTraffic"
            }
        }
    }

    views {
        deployment * currentAwsV001 "current-aws-v001" "[CURRENT AWS V001] Actual state: Hostinger delegates syncvitals.space to Route 53; the staging viewer certificate is issued in us-east-1 but no application endpoint exists." {
            include *
            autolayout lr
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
            element "SecurityService" {
                background "#dcfce7"
                stroke "#4ade80"
            }
            element "NetworkZone" {
                background "#f1f5f9"
                stroke "#94a3b8"
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
        }
    }
}
