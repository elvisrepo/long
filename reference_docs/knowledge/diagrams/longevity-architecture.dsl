workspace "Longevity" "Architecture workspace for the Longevity project." {
    !identifiers hierarchical

    model {
        user = person "User" "Uses the Longevity web experience and the Android companion app."

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

        user -> longevity "Uses to view data, manage account, and track metrics"
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

          styles {
              element "Person" {
                  color #ffffff
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
