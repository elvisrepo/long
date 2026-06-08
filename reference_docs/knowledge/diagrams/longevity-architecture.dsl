workspace "Longevity" "Architecture workspace for the Longevity project." {
    !identifiers hierarchical

    model {
        user = person "Longevity User" "Uses the platform to view metrics, manage account data, and review synced health information."

        samsung = softwareSystem "Samsung Health / Health Connect" "On-device health data source used by the Android companion app."

        longevity = softwareSystem "Longevity Platform" "Tracks user auth, metrics, analytics, and wearable ingestion." {
            webapp = container "React Web App" "Browser-based client for auth, dashboard, metric catalog/detail management, and settings." "React"
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

        dynamic longevity "web-auth-register" "Dynamic view of the current web registration flow." {
            user -> longevity.webapp "Visits /register, enters email user@example.com and password Secret123!, then submits the form"
            longevity.webapp -> longevity.api "POST /api/auth/register/ with JSON, e.g. {\"email\":\"user@example.com\",\"password\":\"Secret123!\"}; RegisterSerializer validates email format, checks email_lookup_hash uniqueness, and runs Django password validation"
            longevity.api -> longevity.db "Creates user record after validation, normalizes/stores email according to the custom user model, stores a hashed password, and persists lookup data"
            longevity.db -> longevity.api "Returns created user, e.g. user id 42 -> user@example.com"
            longevity.api -> longevity.webapp "Returns 201 JSON, e.g. {\"email\":\"user@example.com\"}"
            user -> longevity.webapp "Is redirected to /login and can sign in with the newly created account"
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

        dynamic longevity "web-session-bootstrap" "Dynamic view of browser session restoration before protected route access." {
            user -> longevity.webapp "Opens or reloads the web application"
            longevity.webapp -> longevity.api "GET /api/auth/csrf/ to establish the CSRF cookie"
            longevity.api -> longevity.webapp "Returns the CSRF cookie"
            longevity.webapp -> longevity.api "POST /api/auth/web/refresh/ with browser cookies and X-CSRFToken"
            longevity.api -> longevity.db "Validates refresh-token state and loads the token-backed user"
            longevity.db -> longevity.api "Returns current refresh-token and user state"
            longevity.api -> longevity.webapp "Returns a renewed access token and may rotate the HttpOnly refresh_token cookie"
            longevity.webapp -> longevity.api "GET /api/auth/me/ with Authorization: Bearer <renewed-access-token>"
            longevity.api -> longevity.db "Loads the authenticated user"
            longevity.db -> longevity.api "Returns current user data"
            longevity.api -> longevity.webapp "Returns 200 current-user JSON"
            user -> longevity.webapp "TanStack Router allows the protected route after session restoration succeeds"
        }

        dynamic longevity "metrics-definition-entry-api" "Dynamic view of the current metric definition and metric entry API slice." {
            user -> longevity.webapp "Opens the authenticated dashboard"
            longevity.webapp -> longevity.api "GET /api/v1/metrics/definitions/ with Authorization: Bearer <access-token>"
            longevity.api -> longevity.db "Loads active default metric definitions plus the authenticated user's active custom definitions"
            longevity.db -> longevity.api "Returns metric definitions, e.g. resting_hr, vo2_max, mood"
            longevity.api -> longevity.webapp "Returns 200 JSON list of metric definitions for dashboard display"
            longevity.webapp -> longevity.api "POST /api/v1/metrics/entries/ with metric_definition slug, value, recorded_at, and optional context"
            longevity.api -> longevity.db "Validates auth, metric-definition scope, active status, min/max range, then writes a MetricEntry for the authenticated user"
            longevity.db -> longevity.api "Returns the created metric entry"
            longevity.api -> longevity.webapp "Returns 201 JSON with id, metric_definition slug, value, source manual, context, and created_at"
            longevity.webapp -> longevity.api "GET /api/v1/metrics/entries/?metric=resting_hr&from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z"
            longevity.api -> longevity.db "Reads only the authenticated user's entries, applies metric/from/to filters, and orders by recorded_at DESC, id DESC"
            longevity.db -> longevity.api "Returns matching metric entries"
            longevity.api -> longevity.webapp "Returns 200 JSON list of entries for display"
        }

        dynamic longevity "metrics-catalog-management" "Dynamic view of active and archived custom metric catalog management." {
            user -> longevity.webapp "Opens /metrics"
            longevity.webapp -> longevity.api "GET /api/v1/metrics/definitions/ and GET /api/v1/metrics/usage/"
            longevity.api -> longevity.db "Loads active system/user definitions and counts the authenticated user's active custom metrics"
            longevity.db -> longevity.api "Returns definitions and current entitlement usage"
            longevity.api -> longevity.webapp "Returns the active catalog plus { used, limit } usage"
            user -> longevity.webapp "Optionally reveals archived custom metrics"
            longevity.webapp -> longevity.api "GET /api/v1/metrics/definitions/?include_inactive=true"
            longevity.api -> longevity.db "Loads active defaults plus the authenticated user's active and inactive custom definitions"
            longevity.db -> longevity.api "Returns visible active and archived definitions"
            longevity.api -> longevity.webapp "Returns 200 JSON for separate active and archived catalog sections"
            user -> longevity.webapp "Creates, edits, deactivates, or reactivates a custom metric"
            longevity.webapp -> longevity.api "POST /api/v1/metrics/definitions/ or PATCH /api/v1/metrics/definitions/{id}/"
            longevity.api -> longevity.db "Validates ownership, fields, active status, and entitlement rules, then persists the change"
            longevity.db -> longevity.api "Returns the created or updated definition"
            longevity.api -> longevity.webapp "Returns success; TanStack Query invalidates definition, entry, and usage caches as applicable"
        }

        dynamic longevity "metric-detail-history" "Dynamic view of metric detail, filtered history, chart rendering, and entry maintenance." {
            user -> longevity.webapp "Opens /metrics/{slug} and selects an optional 7d, 30d, 90d, or all range"
            longevity.webapp -> longevity.api "GET /api/v1/metrics/definitions/ and GET /api/v1/metrics/entries/?metric={slug}&from={timestamp}&limit=50"
            longevity.api -> longevity.db "Loads the visible metric definition and the authenticated user's filtered entry history"
            longevity.db -> longevity.api "Returns the definition and newest-first entries"
            longevity.api -> longevity.webapp "Returns JSON used for the metric summary, entry history, and client-side daily-latest chart"
            user -> longevity.webapp "Edits or deletes one historical metric entry"
            longevity.webapp -> longevity.api "PATCH or DELETE /api/v1/metrics/entries/{id}/"
            longevity.api -> longevity.db "Scopes the entry to the authenticated user, validates updates when applicable, and writes or deletes it"
            longevity.db -> longevity.api "Returns the updated entry or confirms deletion"
            longevity.api -> longevity.webapp "Returns 200 or 204; TanStack Query invalidates metric-entry history"
        }

        dynamic longevity "custom-metric-entitlement-write" "Dynamic view of concurrency-safe custom metric creation and reactivation." {
            user -> longevity.webapp "Creates a custom metric or reactivates an archived custom metric"
            longevity.webapp -> longevity.api "POST /api/v1/metrics/definitions/ or PATCH /api/v1/metrics/definitions/{id}/ with is_active=true"
            longevity.api -> longevity.db "Starts an atomic write and issues SELECT FOR UPDATE for the authenticated user's row"
            longevity.api -> longevity.db "Counts the user's active, non-default custom metric definitions"
            longevity.db -> longevity.api "Returns current active custom metric usage"
            longevity.api -> longevity.db "Creates or reactivates the metric when a slot is available, then commits and releases the user-row lock"
            longevity.api -> longevity.webapp "Returns 201/200 on success, or 400 when the active custom metric limit is reached"
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
