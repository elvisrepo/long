workspace "Longevity" "Architecture workspace for the Longevity project." {
    !identifiers hierarchical

    model {
        user = person "Longevity User" "Uses the platform to view metrics, manage account data, and review synced health information."

        samsungHealth = softwareSystem "Samsung Health" "On-device source application that writes Samsung-originated health records into Health Connect."
        healthConnect = softwareSystem "Health Connect" "Android on-device health data platform that exposes user-permitted records to the companion app."
        stripe = softwareSystem "Stripe" "External billing provider for hosted Checkout and Customer Portal sessions, subscription payment collection, and billing webhooks."

        longevity = softwareSystem "Longevity Platform" "Tracks user auth, metrics, analytics, and wearable ingestion." {
            webapp = container "React Web App" "Browser-based client for auth, dashboard, metric catalog/detail management, and settings." "React"
              android = container "Android Companion App" "Reads user-permitted Health Connect records on device and uploads normalized samples to the Django API." "Kotlin Android"
              api = container "Django API" "Main HTTP API for auth, metrics, analytics, and wearable uploads." "Django + Django REST Framework"
              worker = container "Celery Worker" "Executes asynchronous jobs." "Celery"
              beat = container "Celery Beat" "Schedules recurring jobs." "Celery Beat"
            db = container "PostgreSQL / TimescaleDB" "System of record for users, metrics, and analytics data." "PostgreSQL + TimescaleDB"
            redis = container "Redis" "Broker and cache-style infrastructure for Celery and future coordination." "Redis"
        }

        user -> longevity "Views metrics, manages account, and reviews health data"
        healthConnect -> longevity "Supplies permitted on-device health records indirectly through the Android companion app"
        stripe -> longevity "Sends verified billing webhooks after checkout and subscription events"

        user -> longevity.webapp "Uses"
        user -> longevity.android "Uses to connect and sync on-device health data"
        samsungHealth -> healthConnect "Writes Samsung-originated health records on device"
        longevity.android -> healthConnect "Reads user-permitted health records on device"
        user -> stripe "Completes hosted Checkout and manages billing/cancellation in the Customer Portal"

          longevity.webapp -> longevity.api "Calls JSON API over HTTPS"
          longevity.webapp -> stripe "Redirects user to hosted Stripe Checkout and Customer Portal URLs"
          longevity.android -> longevity.api "Calls JSON API over HTTPS"

          longevity.api -> longevity.db "Reads and writes data"
          longevity.api -> stripe "Creates Checkout Sessions with server-owned Stripe Price IDs and on-demand Customer Portal Sessions; verifies signed webhook events"
          stripe -> longevity.api "POSTs signed billing webhook events"
          longevity.api -> longevity.redis "Uses"
          longevity.api -> longevity.worker "Enqueues asynchronous jobs"
          longevity.worker -> longevity.db "Reads and writes data"
          longevity.worker -> longevity.redis "Uses as broker"
          longevity.beat -> longevity.redis "Publishes scheduled work"

            localDev = deploymentEnvironment "Local Development" {
                developerMachine = deploymentNode "Developer Machine" "Local host machine used for browser testing, the Vite dev server, and Stripe webhook forwarding." {
                    tags "ClientZone"

                    localBrowserNode = deploymentNode "Browser" "Local browser runtime" {
                        tags "ClientZone"
                        localBrowser = infrastructureNode "Local Web Browser" "Loads the Vite-served React application and follows Stripe hosted redirects." {
                            tags "ClientRuntime"
                        }
                    }

                    viteNode = deploymentNode "Vite Dev Server" "Local frontend development server" {
                        tags "ClientZone"
                        localWebapp = containerInstance longevity.webapp
                    }

                    stripeCli = infrastructureNode "Stripe CLI Listener" "Forwards selected Stripe sandbox webhook events to the local Django webhook endpoint." {
                        tags "EdgeService"
                    }
                }

                dockerCompose = deploymentNode "Docker Compose" "Local backend runtime." {
                    tags "CloudZone"

                    localApiNode = deploymentNode "Django API Container" {
                        tags "ComputeZone"
                        localApi = containerInstance longevity.api
                    }

                    localWorkerNode = deploymentNode "Celery Worker Container" {
                        tags "ComputeZone"
                        localWorker = containerInstance longevity.worker
                    }

                    localBeatNode = deploymentNode "Celery Beat Container" {
                        tags "ComputeZone"
                        localBeat = containerInstance longevity.beat
                    }

                    localDbNode = deploymentNode "PostgreSQL / TimescaleDB Container" {
                        tags "DataZone"
                        localDb = containerInstance longevity.db
                    }

                    localRedisNode = deploymentNode "Redis Container" {
                        tags "DataZone"
                        localRedis = containerInstance longevity.redis
                    }
                }

                localDev.developerMachine.localBrowserNode.localBrowser -> localDev.developerMachine.viteNode.localWebapp "Loads React app from Vite" {
                    tags "ClientTraffic"
                }

                localDev.developerMachine.viteNode.localWebapp -> stripe "Redirects to hosted Checkout and Customer Portal" {
                    tags "ClientTraffic"
                }

                localDev.dockerCompose.localApiNode.localApi -> stripe "Creates Checkout and Portal Sessions in Stripe sandbox" {
                    tags "EdgeTraffic"
                }

                stripe -> localDev.developerMachine.stripeCli "Sends sandbox billing events to the Stripe CLI listener" {
                    tags "EdgeTraffic"
                }

                localDev.developerMachine.stripeCli -> localDev.dockerCompose.localApiNode.localApi "Forwards signed events to /api/v1/subscriptions/stripe/webhook/" {
                    tags "EdgeTraffic"
                }

            }

            mvpCloud = deploymentEnvironment "MVP Cloud" {
                userDevices = deploymentNode "User Devices" "Where end users run the browser and Android clients." {
                    tags "ClientZone"

                    browserNode = deploymentNode "Browser" "Web browser runtime" {
                        tags "ClientZone"
                        browserClient = infrastructureNode "Web Browser" "Loads and runs the React web application." {
                            tags "ClientRuntime"
                        }
                    }

                    androidNode = deploymentNode "Android Phone" "Android runtime for the companion app, Health Connect, and Samsung Health." {
                        tags "ClientZone"

                        androidClient = containerInstance longevity.android

                        healthConnectRuntime = infrastructureNode "Health Connect" "On-device Android health data platform used by the companion app." {
                            tags "ClientRuntime"
                        }

                        samsungHealthRuntime = infrastructureNode "Samsung Health" "On-device source application that writes health records into Health Connect." {
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

            mvpCloud.userDevices.androidNode.samsungHealthRuntime -> mvpCloud.userDevices.androidNode.healthConnectRuntime "Writes Samsung-originated health records" {
                tags "ClientTraffic"
            }

            mvpCloud.userDevices.androidNode.androidClient -> mvpCloud.userDevices.androidNode.healthConnectRuntime "Reads user-permitted health records" {
                tags "ClientTraffic"
            }

            mvpCloud.aws.edge.alb -> mvpCloud.aws.compute.apiNode.apiInstance "Routes HTTPS requests" {
                tags "EdgeTraffic"
            }

            mvpCloud.userDevices.browserNode.browserClient -> stripe "Redirects to hosted Checkout and Customer Portal" {
                tags "ClientTraffic"
            }

            mvpCloud.aws.compute.apiNode.apiInstance -> stripe "Creates Checkout and Customer Portal Sessions" {
                tags "EdgeTraffic"
            }

            stripe -> mvpCloud.aws.edge.alb "POSTs signed billing webhooks over HTTPS" {
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
            include samsungHealth
            include healthConnect
            include stripe
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

        dynamic longevity "wearable-connection-register" "Dynamic view of the implemented backend connection-registration boundary with the planned Android companion app as caller." {
            user -> longevity.android "Chooses to connect on-device health data through Health Connect"
            longevity.android -> longevity.api "POST /api/v1/wearables/connections/ with Authorization: Bearer <access-token> and {\"provider\":\"health_connect\"}"
            longevity.api -> longevity.db "Starts an atomic transaction, locks the authenticated user row, loads the current subscription plan, and counts registered connections"
            longevity.db -> longevity.api "Returns the caller's current plan entitlement and connection usage"
            longevity.api -> longevity.db "Creates one WearableConnection owned by the authenticated user with provider health_connect and initial status disconnected when a slot is available"
            longevity.db -> longevity.api "Returns the stored connection state"
            longevity.api -> longevity.android "Returns 201 with the caller-owned connection, or 400 when server-managed state is supplied, the provider is already registered, or wearable_connection_limit is exhausted"
        }

        dynamic longevity "subscription-checkout-create" "Dynamic view of the implemented Stripe Checkout creation flow from Settings." {
            user -> longevity.webapp "Opens /settings and reviews Current Plan plus Available Plans"
            longevity.webapp -> longevity.api "GET /api/v1/subscriptions/current/ with Authorization: Bearer <access-token>"
            longevity.api -> longevity.db "Loads the authenticated user's current Subscription, related SubscriptionPlan, optional SubscriptionPrice, cancellation state, and BillingCustomer availability"
            longevity.db -> longevity.api "Returns current subscription, e.g. Free plan with 3 custom metrics"
            longevity.api -> longevity.webapp "Returns 200 JSON with id, status, billing_portal_available, period dates, cancel_at, cancel_at_period_end, price, and plan entitlement data"
            longevity.webapp -> longevity.api "GET /api/v1/subscriptions/plans/"
            longevity.api -> longevity.db "Loads active plans and prefetches active prices; Stripe provider_price_id values stay server-side"
            longevity.db -> longevity.api "Returns catalog with internal SubscriptionPrice.id values, e.g. monthly-price-uuid"
            longevity.api -> longevity.webapp "Returns 200 JSON catalog; the React app renders Upgrade buttons for paid prices"
            user -> longevity.webapp "Clicks Upgrade to Pro monthly"
            longevity.webapp -> longevity.api "POST /api/v1/subscriptions/checkout/ with {\"price_id\":\"monthly-price-uuid\"}"
            longevity.api -> longevity.db "SubscriptionCheckoutSerializer validates the internal active price, current subscription, and non-default target plan"
            longevity.api -> longevity.db "Creates CheckoutAttempt(status=pending, expected_subscription=current free subscription)"
            longevity.api -> longevity.db "Loads the user's Stripe BillingCustomer when one exists"
            longevity.api -> stripe "Creates Checkout Session with server-owned price, metadata, and idempotency key; sends stored customer ID or customer_email for first Checkout"
            stripe -> longevity.api "Returns Checkout Session id cs_test_... and hosted url https://checkout.stripe.com/c/..."
            longevity.api -> longevity.db "Marks CheckoutAttempt completed and stores provider_checkout_session_id; no entitlement change yet"
            longevity.api -> longevity.webapp "Returns 201 JSON {\"url\":\"https://checkout.stripe.com/c/...\"}"
            longevity.webapp -> stripe "Redirects browser with window.location.assign(checkout.url)"
            user -> stripe "Sees hosted Stripe Checkout page and enters test payment details"
        }

        dynamic longevity "subscription-checkout-webhook" "Dynamic view of verified Stripe Checkout completion and local entitlement reconciliation." {
            stripe -> longevity.api "POST /api/v1/subscriptions/stripe/webhook/ with signed checkout.session.completed event"
            longevity.api -> longevity.db "Inserts unique StripeWebhookEvent provider_event_id; duplicate delivery stops here"
            longevity.api -> longevity.db "Loads CheckoutAttempt, selected plan and price, expected subscription, and existing BillingCustomer"
            longevity.db -> longevity.api "Returns correlated local state and provider ownership mapping"
            longevity.api -> longevity.db "Rejects mismatched session, metadata, stale subscription, or conflicting Stripe customer without changing entitlements"
            longevity.api -> longevity.db "For a valid event, atomically replaces the current subscription, creates BillingCustomer when first seen, and confirms CheckoutAttempt"
            longevity.api -> stripe "Returns 200 acknowledgment; frontend redirect remains informational"
        }

        dynamic longevity "subscription-portal-create" "Dynamic view of the implemented Stripe Customer Portal creation flow from Settings." {
            user -> longevity.webapp "Opens /settings as a Stripe-managed paid user and clicks Manage subscription"
            longevity.webapp -> longevity.api "POST /api/v1/subscriptions/portal/ with Authorization: Bearer <access-token>; no client-supplied Stripe customer ID"
            longevity.api -> longevity.db "Loads the authenticated user's BillingCustomer and current subscription state"
            longevity.db -> longevity.api "Returns local Stripe customer mapping, e.g. cus_test_..."
            longevity.api -> stripe "Creates a Customer Portal Session with the stored Stripe customer ID and server-controlled return URL"
            stripe -> longevity.api "Returns short-lived billing.stripe.com portal URL"
            longevity.api -> longevity.webapp "Returns 201 JSON {\"url\":\"https://billing.stripe.com/p/session/...\"}; provider details stay server-side on errors"
            longevity.webapp -> stripe "Redirects browser to the hosted Customer Portal"
            user -> stripe "Manages payment method, scheduled cancellation, or cancellation reversal in Stripe-hosted UI"
        }

        dynamic longevity "subscription-portal-scheduled-cancellation" "Dynamic view of Customer Portal scheduled cancellation and local subscription preservation." {
            user -> stripe "Clicks Cancel subscription in the hosted Customer Portal; Stripe schedules the subscription to end in the future by setting cancel_at and/or cancel_at_period_end"
            stripe -> longevity.api "POST /api/v1/subscriptions/stripe/webhook/ with signed customer.subscription.updated event containing the scheduled cancellation state"
            longevity.api -> longevity.db "Inserts unique StripeWebhookEvent provider_event_id; duplicate delivery stops here"
            longevity.api -> longevity.db "Verifies the Stripe subscription ID and customer ID match the current local subscription and BillingCustomer"
            longevity.api -> longevity.db "Stores Stripe cancel_at, normalizes local cancel_at_period_end when cancel_at_period_end=true or cancel_at equals current_period_end, refreshes period dates, and reconciles recognized Stripe price changes"
            longevity.api -> stripe "Returns 200 acknowledgment"
            longevity.webapp -> longevity.api "Later GET /api/v1/subscriptions/current/"
            longevity.api -> longevity.webapp "Returns active Pro subscription with cancel_at and cancel_at_period_end=true"
            user -> longevity.webapp "Sees Pro still active with a Cancels date because the paid period has not ended"
        }

        dynamic longevity "subscription-portal-cancellation-reversal" "Dynamic view of Customer Portal cancellation reversal before the paid period ends." {
            user -> stripe "Clicks Don't cancel subscription in the hosted Customer Portal; Stripe removes the scheduled cancellation from the active subscription"
            stripe -> longevity.api "POST /api/v1/subscriptions/stripe/webhook/ with signed customer.subscription.updated event showing no scheduled cancellation"
            longevity.api -> longevity.db "Records the Stripe event idempotently and verifies subscription/customer ownership"
            longevity.api -> longevity.db "Clears local cancel_at, stores cancel_at_period_end=false, refreshes current period dates, and keeps the paid subscription active"
            longevity.api -> stripe "Returns 200 acknowledgment"
            longevity.webapp -> longevity.api "Later GET /api/v1/subscriptions/current/"
            longevity.api -> longevity.webapp "Returns active Pro subscription with no scheduled cancellation"
            user -> longevity.webapp "Sees the plan as renewing again"
        }

        dynamic longevity "subscription-terminal-cancellation-downgrade" "Dynamic view of terminal Stripe cancellation and local downgrade to Free." {
            stripe -> longevity.api "After the scheduled cancellation timestamp or another terminal cancellation, POST /api/v1/subscriptions/stripe/webhook/ with signed customer.subscription.deleted event"
            longevity.api -> longevity.db "Inserts unique StripeWebhookEvent provider_event_id; duplicate delivery stops here"
            longevity.api -> longevity.db "Verifies the Stripe subscription ID and customer ID match the user's current paid subscription and BillingCustomer"
            longevity.api -> longevity.db "Marks the paid subscription row cancelled/history, clears current paid entitlement, and creates an active Free subscription"
            longevity.api -> stripe "Returns 200 acknowledgment"
            longevity.webapp -> longevity.api "Later GET /api/v1/subscriptions/current/"
            longevity.api -> longevity.webapp "Returns the active Free subscription and Free entitlement limits"
            user -> longevity.webapp "Sees Free plan state after the paid subscription has actually ended"
        }

        deployment * localDev "local-development-deployment" "Deployment view for the current browser/backend local runtime, including Docker Compose and Stripe CLI webhook forwarding; the Android test-device runtime will be added when the companion app exists." {
            include *
            autolayout lr
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
