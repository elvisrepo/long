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
                    browserNode = deploymentNode "Browser" "Web browser runtime" {
                        browserClient = infrastructureNode "Web Browser" "Loads and runs the React web application."
                    }

                    androidNode = deploymentNode "Android Phone" "Android runtime for the companion app" {
                        androidClient = infrastructureNode "Android Companion App" "Installed mobile application for Samsung sync and future mobile workflows."
                    }
                }

            aws = deploymentNode "AWS" "Primary MVP cloud hosting environment." {
                edge = deploymentNode "Edge" {
                    alb = infrastructureNode "ALB" "Application Load Balancer"
                }

                compute = deploymentNode "Compute" {
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
                    redisNode = infrastructureNode "ElastiCache Redis" "Redis"
                }

                security = deploymentNode "Security & Config" {
                    secretsNode = infrastructureNode "AWS Secrets Manager" "Stores application secrets and configuration values."
                }

                ops = deploymentNode "Ops" {
                    monitoringNode = infrastructureNode "CloudWatch" "Operational logs and metrics sink for the deployed MVP runtime."
                }

                storage = deploymentNode "Storage" {
                    backupsNode = infrastructureNode "S3 Bucket" "Stores backups and static assets."
                }
            }

            managedDatabase = deploymentNode "Managed Database" {
                timescaleNode = infrastructureNode "Timescale Cloud" "Managed PostgreSQL + TimescaleDB"
            }

            mvpCloud.userDevices.browserNode.browserClient -> mvpCloud.aws.edge.alb "Uses HTTPS"
            mvpCloud.userDevices.androidNode.androidClient -> mvpCloud.aws.edge.alb "Uses HTTPS"
            mvpCloud.aws.edge.alb -> mvpCloud.aws.compute.apiNode.apiInstance "Routes HTTPS requests"

            mvpCloud.aws.compute.apiNode.apiInstance -> mvpCloud.managedDatabase.timescaleNode "Reads and writes data"
            mvpCloud.aws.compute.apiNode.apiInstance -> mvpCloud.aws.appData.redisNode "Uses"
            mvpCloud.aws.compute.apiNode.apiInstance -> mvpCloud.aws.security.secretsNode "Reads secrets and config"
            mvpCloud.aws.compute.apiNode.apiInstance -> mvpCloud.aws.ops.monitoringNode "Writes logs and metrics"
            mvpCloud.aws.compute.apiNode.apiInstance -> mvpCloud.aws.storage.backupsNode "Uses for static assets and backups"

            mvpCloud.aws.compute.workerNode.workerInstance -> mvpCloud.managedDatabase.timescaleNode "Reads and writes data"
            mvpCloud.aws.compute.workerNode.workerInstance -> mvpCloud.aws.appData.redisNode "Uses as broker"
            mvpCloud.aws.compute.workerNode.workerInstance -> mvpCloud.aws.ops.monitoringNode "Writes logs and metrics"
            mvpCloud.aws.compute.workerNode.workerInstance -> mvpCloud.aws.storage.backupsNode "Writes backups and repair outputs"

            mvpCloud.aws.compute.beatNode.beatInstance -> mvpCloud.aws.appData.redisNode "Publishes scheduled work"
            mvpCloud.aws.compute.beatNode.beatInstance -> mvpCloud.aws.ops.monitoringNode "Writes logs and metrics"
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
            longevity.webapp -> longevity.api "POST /api/auth/web/refresh/ with X-CSRFToken header"
            longevity.api -> longevity.db "Validates refresh token and loads token-related user state"
            longevity.db -> longevity.api "Returns user and token state"
            longevity.api -> longevity.webapp "Returns new access token in JSON and rotated refresh_token cookie"
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
          }
      }
  }
