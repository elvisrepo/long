workspace "Longevity" "Architecture workspace for the Longevity project." {
    !identifiers hierarchical

    model {
        user = person "Longevity User" "Uses the platform to view metrics, manage account data, and review synced health information."

        samsung = softwareSystem "Samsung Health / Health Connect" "On-device health data source used by the Android companion app."

        longevity = softwareSystem "Longevity Platform" "Tracks user auth, metrics, analytics, and wearable ingestion." {
            webapp = container "React Web App" "Browser-based client for auth, dashboard, and settings." "React"
              android = container "Android Companion App" "Mobile client for Samsung sync and future mobile workflows." "Kotlin Android"
              api = container "Django API" "Main HTTP API for auth, metrics, analytics, and wearable uploads." "Django + Django REST Framework"
              worker = container "Celery Worker" "Executes asynchronous jobs." "Celery"
              beat = container "Celery Beat" "Schedules recurring jobs." "Celery Beat"
            db = container "PostgreSQL / TimescaleDB" "System of record for users, metrics, and analytics data." "PostgreSQL + TimescaleDB"
            redis = container "Redis" "Broker and cache-style infrastructure for Celery and future coordination." "Redis"
        }

        user -> longevity "Views metrics, manages account, and reviews health data"
        samsung -> longevity "Supplies health data indirectly via the Android companion app"

        user -> longevity.webapp "Uses"
        user -> longevity.android "Uses for Samsung sync"
        samsung -> longevity.android "Provides health data"

          longevity.webapp -> longevity.api "Calls JSON API over HTTPS"
          longevity.android -> longevity.api "Calls JSON API over HTTPS"

          longevity.api -> longevity.db "Reads and writes data"
          longevity.api -> longevity.redis "Uses"
          longevity.api -> longevity.worker "Enqueues asynchronous jobs"
          longevity.worker -> longevity.db "Reads and writes data"
          longevity.worker -> longevity.redis "Uses as broker"
          longevity.beat -> longevity.redis "Publishes scheduled work"

            mvpCloud = deploymentEnvironment "MVP Cloud" {
                userDevices = deploymentNode "User Devices" "Where end users run the browser and Android clients." {
                    tags "ClientZone"

                    browserNode = deploymentNode "Browser" "Web browser runtime" {
                        tags "ClientZone"
                        browserClient = infrastructureNode "Web Browser" "Loads and runs the React web application." {
                            tags "ClientRuntime"
                        }
                    }

                    androidNode = deploymentNode "Android Phone" "Android runtime for the companion app" {
                        tags "ClientZone"
                        androidClient = infrastructureNode "Android Companion App" "Installed mobile application for Samsung sync and future mobile workflows." {
                            tags "ClientRuntime"
                        }
                    }
                }

            aws = deploymentNode "AWS" "Primary MVP cloud hosting environment." {
                tags "CloudZone"

                edge = deploymentNode "Edge" {
                    tags "EdgeZone"
                    alb = infrastructureNode "ALB" "Application Load Balancer" {
                        tags "EdgeService"
                    }
                }

                compute = deploymentNode "Compute" {
                    tags "ComputeZone"

                    apiNode = deploymentNode "ECS Fargate Service" {
                        apiInstance = containerInstance longevity.api
                    }

                    workerNode = deploymentNode "ECS Task - Worker" {
                        workerInstance = containerInstance longevity.worker
                    }

                    beatNode = deploymentNode "ECS Task - Beat" {
                        beatInstance = containerInstance longevity.beat
                    }
                }

                appData = deploymentNode "App Data" {
                    tags "DataZone"
                    redisNode = infrastructureNode "ElastiCache Redis" "Redis" {
                        tags "DataService"
                    }
                }

                security = deploymentNode "Security & Config" {
                    tags "SecurityZone"
                    secretsNode = infrastructureNode "AWS Secrets Manager" "Stores application secrets and configuration values." {
                        tags "SecurityService"
                    }
                }

                ops = deploymentNode "Ops" {
                    tags "OpsZone"
                    monitoringNode = infrastructureNode "CloudWatch" "Operational logs and metrics sink for the deployed MVP runtime." {
                        tags "OpsService"
                    }
                }

                storage = deploymentNode "Storage" {
                    tags "StorageZone"
                    backupsNode = infrastructureNode "S3 Bucket" "Stores backups and static assets." {
                        tags "StorageService"
                    }
                }
            }

            managedDatabase = deploymentNode "Managed Database" {
                tags "ManagedZone"
                timescaleNode = infrastructureNode "Timescale Cloud" "Managed PostgreSQL + TimescaleDB" {
                    tags "ManagedDataService"
                }
            }

            mvpCloud.userDevices.browserNode.browserClient -> mvpCloud.aws.edge.alb "Uses HTTPS" {
                tags "ClientTraffic"
            }

            mvpCloud.userDevices.androidNode.androidClient -> mvpCloud.aws.edge.alb "Uses HTTPS" {
                tags "ClientTraffic"
            }

            mvpCloud.aws.edge.alb -> mvpCloud.aws.compute.apiNode.apiInstance "Routes HTTPS requests" {
                tags "EdgeTraffic"
            }

            mvpCloud.aws.compute.apiNode.apiInstance -> mvpCloud.managedDatabase.timescaleNode "Reads and writes data" {
                tags "DataTraffic"
            }

            mvpCloud.aws.compute.apiNode.apiInstance -> mvpCloud.aws.appData.redisNode "Uses" {
                tags "DataTraffic"
            }

            mvpCloud.aws.compute.apiNode.apiInstance -> mvpCloud.aws.security.secretsNode "Reads secrets and config" {
                tags "SecurityTraffic"
            }

            mvpCloud.aws.compute.apiNode.apiInstance -> mvpCloud.aws.ops.monitoringNode "Writes logs and metrics" {
                tags "OpsTraffic"
            }

            mvpCloud.aws.compute.apiNode.apiInstance -> mvpCloud.aws.storage.backupsNode "Uses for static assets and backups" {
                tags "StorageTraffic"
            }

            mvpCloud.aws.compute.workerNode.workerInstance -> mvpCloud.managedDatabase.timescaleNode "Reads and writes data" {
                tags "DataTraffic"
            }

            mvpCloud.aws.compute.workerNode.workerInstance -> mvpCloud.aws.appData.redisNode "Uses as broker" {
                tags "DataTraffic"
            }

            mvpCloud.aws.compute.workerNode.workerInstance -> mvpCloud.aws.ops.monitoringNode "Writes logs and metrics" {
                tags "OpsTraffic"
            }

            mvpCloud.aws.compute.workerNode.workerInstance -> mvpCloud.aws.storage.backupsNode "Writes backups and repair outputs" {
                tags "StorageTraffic"
            }

            mvpCloud.aws.compute.beatNode.beatInstance -> mvpCloud.aws.appData.redisNode "Publishes scheduled work" {
                tags "DataTraffic"
            }

            mvpCloud.aws.compute.beatNode.beatInstance -> mvpCloud.aws.ops.monitoringNode "Writes logs and metrics" {
                tags "OpsTraffic"
            }
        }
    }

    views {
        systemContext longevity "c4-context" "System context view for the Longevity platform." {
            include user
            include samsung
            include longevity
            autolayout lr
        }

        container longevity "c4-container" "Container view of the current runtime building blocks." {
            include *
            autolayout lr
        }

        dynamic longevity "web-auth-login" "Dynamic view of the current web login flow." {
            user -> longevity.webapp "Enters credentials and starts sign in"
            longevity.webapp -> longevity.api "GET /api/auth/csrf/ to bootstrap CSRF cookie"
            longevity.api -> longevity.webapp "Returns CSRF cookie"
            longevity.webapp -> longevity.api "POST /api/auth/web/login/ with email and password"
            longevity.api -> longevity.db "Loads user record and verifies credentials"
            longevity.db -> longevity.api "Returns user data"
            longevity.api -> longevity.webapp "Returns access token in JSON and refresh_token cookie"
            user -> longevity.webapp "Uses authenticated web session"
        }

        dynamic longevity "web-auth-refresh" "Dynamic view of the current web refresh flow." {
            user -> longevity.webapp "Continues an existing authenticated web session"
            longevity.webapp -> longevity.api "POST /api/auth/web/refresh/ with X-CSRFToken: abc123 and browser cookies, e.g. csrftoken=abc123; refresh_token=eyJhbGciOi..."
            longevity.api -> longevity.db "Validates refresh token and loads token-backed user state, e.g. user id 42 -> alice@example.com"
            longevity.db -> longevity.api "Returns current token and user state for alice@example.com"
            longevity.api -> longevity.webapp "Returns 200 JSON, e.g. {\"access\":\"eyJhbGciOi...\"}, and may rotate refresh_token cookie"
            user -> longevity.webapp "Continues authenticated session with refreshed access token"
        }

        dynamic longevity "web-auth-logout" "Dynamic view of the current web logout flow." {
            user -> longevity.webapp "Chooses to sign out from an authenticated web session"
            longevity.webapp -> longevity.api "POST /api/auth/web/logout/ with X-CSRFToken header"
            longevity.api -> longevity.db "Validates refresh token state and revokes refresh capability"
            longevity.db -> longevity.api "Returns token-related user state"
            longevity.api -> longevity.webapp "Returns 204 and clears refresh_token cookie"
            user -> longevity.webapp "Returns to an unauthenticated web state"
        }

        dynamic longevity "web-auth-current-user" "Dynamic view of current-user bootstrap and protected route access on the web app." {
            user -> longevity.webapp "Navigates to a protected route such as / or /settings"
            longevity.webapp -> longevity.api "GET /api/auth/me/ with Authorization: Bearer <access-token>, e.g. Bearer eyJhbGciOi..."
            longevity.api -> longevity.db "Loads authenticated user for the token-backed request, e.g. user id 42 -> email user@example.com"
            longevity.db -> longevity.api "Returns current user data, e.g. email user@example.com"
            longevity.api -> longevity.webapp "Returns 200 JSON, e.g. {\"email\":\"user@example.com\"}"
            user -> longevity.webapp "TanStack Router beforeLoad allows the protected route and the user sees Dashboard or Settings"
        }

        deployment * mvpCloud "mvp-cloud-deployment" "Deployment view for the pragmatic MVP cloud runtime." {
            include *
            autolayout tb
        }

          styles {
              element "Person" {
                  shape Person
                  background #d5f5d1
                  color #111111
                  stroke #2d7d2f
              }

              element "Software System" {
                  background #1168bd
                  color #ffffff
              }

              element "Container" {
                  background #438dd5
                  color #ffffff
              }

              element "Deployment Node" {
                  background #f7f9fc
                  color #243447
                  stroke #8a9bad
              }

              element "Infrastructure Node" {
                  background #fff8e8
                  color #3b2f00
                  stroke #d4a017
              }

              element "Container Instance" {
                  background #2f6fb3
                  color #ffffff
                  stroke #1d4e80
              }

              element "ClientZone" {
                  background #eef8ec
                  color #1f3b22
                  stroke #6ea36a
              }

              element "CloudZone" {
                  background #f4f7fb
                  color #243447
                  stroke #6f8aa6
              }

              element "EdgeZone" {
                  background #eaf3fb
                  color #13324b
                  stroke #5c92c7
              }

              element "ComputeZone" {
                  background #edf2ff
                  color #1b2f55
                  stroke #6980c7
              }

              element "DataZone" {
                  background #eef6fb
                  color #163647
                  stroke #5f95b5
              }

              element "SecurityZone" {
                  background #fff1e6
                  color #4a2a16
                  stroke #d68a45
              }

              element "OpsZone" {
                  background #fbeef2
                  color #4a2030
                  stroke #b86b84
              }

              element "StorageZone" {
                  background #fff7df
                  color #4c3a0b
                  stroke #c9a227
              }

              element "ManagedZone" {
                  background #eef8f7
                  color #163b39
                  stroke #63a39b
              }

              element "ClientRuntime" {
                  background #dff1dc
                  color #15301a
                  stroke #5d9a61
              }

              element "EdgeService" {
                  background #dcecff
                  color #163a63
                  stroke #4f83c2
              }

              element "DataService" {
                  background #dff3f8
                  color #123846
                  stroke #4d91a7
              }

              element "SecurityService" {
                  background #ffe6cc
                  color #4a2b12
                  stroke #d48733
              }

              element "OpsService" {
                  background #f8dfe7
                  color #471d2a
                  stroke #b25d79
              }

              element "StorageService" {
                  background #fff0b8
                  color #49370b
                  stroke #c49b1f
              }

              element "ManagedDataService" {
                  background #d9f3ef
                  color #12423f
                  stroke #4d9f93
              }

              relationship "Relationship" {
                  color #5b6770
                  thickness 2
                  routing Orthogonal
                  fontSize 18
              }

              relationship "ClientTraffic" {
                  color #4f8a4c
                  thickness 3
                  routing Orthogonal
              }

              relationship "EdgeTraffic" {
                  color #3f74b5
                  thickness 3
                  routing Orthogonal
              }

              relationship "DataTraffic" {
                  color #3f8c9d
                  thickness 3
                  routing Orthogonal
              }

              relationship "SecurityTraffic" {
                  color #d07a1f
                  thickness 3
                  routing Orthogonal
              }

              relationship "OpsTraffic" {
                  color #b04f74
                  thickness 3
                  routing Orthogonal
              }

              relationship "StorageTraffic" {
                  color #c19a16
                  thickness 3
                  routing Orthogonal
              }
          }
      }
  }
