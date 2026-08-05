workspace "Longevity" "Architecture workspace for the Longevity project." {
    !identifiers hierarchical

    model {
        user = person "Longevity User" "Uses the platform to view metrics, manage account data, and review synced health information."

        samsungHealth = softwareSystem "Samsung Health" "On-device source application that writes Samsung-originated health records into Health Connect."
        healthConnect = softwareSystem "Health Connect" "Android on-device health data platform that exposes user-permitted records to the companion app."
        stripe = softwareSystem "Stripe" "External billing provider for hosted Checkout and Customer Portal sessions, subscription payment collection, and billing webhooks."

        longevity = softwareSystem "Longevity Platform" "Tracks user auth, subscriptions, metrics, analytics entitlements, and wearable ingestion." {
            webapp = container "React Web App" "Implemented browser client for registration, hardened web sessions, dashboard/manual metrics, metric catalog/detail management, and Stripe-backed settings." "React + TypeScript" {
                webRoutes = component "Routes and Screens" "TanStack Router pages for registration, login, protected Dashboard, Metrics, Metric Detail, and Settings flows." "React + TanStack Router"
                webAuth = component "Web Auth Session" "Bootstraps CSRF, keeps the access token in memory, relies on an HttpOnly refresh cookie, shares in-flight refreshes, and uses the browser Lock Manager for cross-tab rotation when available." "TypeScript"
                webServerState = component "Server State Layer" "Fetches, caches, mutates, and invalidates current-user, metric, and subscription server state." "TanStack Query"
            }

            android = container "Android Companion App" "Implemented mobile authentication, encrypted JWT storage, on-demand refresh/retry, Health Connect permission and paginated WeightRecord adapter, initial Samsung weight sync coordination, backend connection registration, and authenticated upload transport; the UI sync action is next." "Kotlin + Jetpack Compose" {
                androidPresentation = component "Compose UI and ViewModels" "Renders login/session and Health Connect connection state, handles user actions, and coordinates the official permission Activity Result." "Jetpack Compose + AndroidX Lifecycle"
                androidAuth = component "Mobile Auth Repository" "Implements mobile login, local startup restoration, on-demand refresh rotation, logout revocation, and safe error translation." "Kotlin + OkHttp"
                androidTokenStore = component "Keystore Token Store" "Encrypts access and refresh JWTs with an Android-Keystore key and durably stores only ciphertext in private SharedPreferences." "Android Keystore + AES-GCM"
                androidApiClient = component "Authenticated API Client" "Attaches stored bearer access tokens, coordinates one refresh after a 401, and retries the original product request once." "Kotlin + OkHttp + Coroutines"
                androidWearables = component "Wearable Connection Repository" "Lists and registers caller-owned Health Connect connections through the authenticated API client." "Kotlin + kotlinx.serialization"
                androidUploads = component "Wearable Upload Repository" "Posts normalized, retry-stable weight batches and maps Django SyncRun receipts and conflict/rejection outcomes without exposing transport DTOs." "Kotlin + OkHttp + kotlinx.serialization"
                androidHealthAccess = component "Health Connect Access" "Checks SDK availability and WeightRecord permission, then maps paginated SDK reads into SDK-independent weight samples." "AndroidX Health Connect"
                androidWeightSyncPlanner = component "Initial Weight Sync Planner" "Requests a clock-bounded 30-day window, keeps exact Samsung Health provenance, and splits ordered samples into backend-safe batches." "Kotlin + Coroutines"
                androidWeightSyncCoordinator = component "Initial Weight Sync Coordinator" "Coordinates ordered planned batches and authenticated uploads with one UUID per batch, preserving completed receipts when later work stops; no UI action invokes it yet." "Kotlin + Coroutines"
            }

            api = container "Django API" "Synchronous HTTP API for auth, subscriptions/Stripe, metrics, and wearable connection/upload workflows." "Django + Django REST Framework" {
                authApi = component "Authentication" "Registration, web/mobile login, CSRF, current-user, logout, and concurrency-safe SimpleJWT refresh rotation." "Django REST Framework + SimpleJWT"
                subscriptionsApi = component "Subscriptions and Billing" "Plan/price reads, entitlement state, Checkout/Portal session creation, and idempotent signed Stripe webhook reconciliation." "Django REST Framework + Stripe SDK"
                metricsApi = component "Metrics" "Metric definitions, entitlement-limited custom metrics, manual entries, history reads, and entry maintenance." "Django REST Framework"
                wearablesApi = component "Wearables" "Plan-limited Health Connect connection lifecycle and synchronous idempotent normalized upload ingestion." "Django REST Framework"
            }

            worker = container "Celery Worker" "Prepared local/future runtime for asynchronous wearable processing, exports, deletion, and other background jobs; no current product flow depends on it." "Celery" {
                tags "PreparedInfrastructure"
            }

            beat = container "Celery Beat" "Prepared local/future scheduler; no current product flow depends on scheduled Celery work." "Celery Beat" {
                tags "PreparedInfrastructure"
            }

            db = container "PostgreSQL / TimescaleDB" "System of record for encrypted user identity, JWT revocation state, subscriptions, Stripe receipts, metric data, wearable connections, and sync receipts. Timescale-specific features are not enabled yet." "PostgreSQL + TimescaleDB"

            redis = container "Redis" "Running-capable Celery broker infrastructure reserved for future asynchronous work; current product requests do not depend on it." "Redis" {
                tags "PreparedInfrastructure"
            }
        }

        user -> longevity "Views metrics, manages account, and reviews health data"
        healthConnect -> longevity "Supplies permitted on-device health records indirectly through the Android companion app"
        stripe -> longevity "Sends verified billing webhooks after checkout and subscription events"

        user -> longevity.webapp "Uses"
        user -> longevity.android "Uses to connect and sync on-device health data"
        samsungHealth -> healthConnect "Writes Samsung-originated health records on device"
          longevity.android -> healthConnect "Checks SDK availability and permission and exposes paginated WeightRecord reads to the initial sync coordinator; the UI sync action is next"
        user -> stripe "Completes hosted Checkout and manages billing/cancellation in the Customer Portal"

          longevity.webapp -> longevity.api "Calls JSON API over HTTPS"
          longevity.webapp -> stripe "Redirects user to hosted Stripe Checkout and Customer Portal URLs"
          stripe -> longevity.webapp "Redirects the browser to server-configured Settings return URLs"
          longevity.android -> longevity.api "Calls JSON API over HTTPS"

          longevity.api -> longevity.db "Reads and writes data"
          longevity.api -> stripe "Creates Checkout Sessions with server-owned Stripe Price IDs and on-demand Customer Portal Sessions; verifies signed webhook events"
          stripe -> longevity.api "POSTs signed billing webhook events"
          user -> longevity.webapp.webRoutes "Uses browser screens"
          longevity.webapp.webRoutes -> longevity.webapp.webAuth "Requires session state and protected-route checks"
          longevity.webapp.webRoutes -> longevity.webapp.webServerState "Reads and mutates product data"
          longevity.webapp.webAuth -> longevity.api "Calls web auth endpoints with CSRF, bearer access tokens, and browser cookies"
          longevity.webapp.webServerState -> longevity.api "Calls authenticated metric and subscription endpoints"
          longevity.webapp.webRoutes -> stripe "Navigates to hosted Checkout and Customer Portal pages"
          user -> longevity.android.androidPresentation "Uses mobile screens"
          longevity.android.androidPresentation -> longevity.android.androidAuth "Restores, creates, and revokes the mobile session"
          longevity.android.androidPresentation -> longevity.android.androidWearables "Starts Health Connect connection registration"
          longevity.android.androidPresentation -> longevity.android.androidHealthAccess "Checks Health Connect availability and existing permission"
          longevity.android.androidWeightSyncPlanner -> longevity.android.androidHealthAccess "Reads normalized weight samples for the initial sync window"
          longevity.android.androidWeightSyncCoordinator -> longevity.android.androidWeightSyncPlanner "Requests ordered Samsung-originated weight batches"
          longevity.android.androidWeightSyncCoordinator -> longevity.android.androidUploads "Uploads each planned batch with one generated UUID"
          longevity.android.androidPresentation -> healthConnect "Launches the official permission Activity Result contract"
          longevity.android.androidAuth -> longevity.android.androidTokenStore "Reads, encrypts, commits, and clears JWT pairs"
          longevity.android.androidAuth -> longevity.api "Calls mobile authentication endpoints"
          longevity.android.androidAuth -> longevity.api.authApi "Calls mobile login, refresh, and logout endpoints"
          longevity.android.androidApiClient -> longevity.android.androidTokenStore "Reads bearer credentials and rereads after refresh coordination"
          longevity.android.androidApiClient -> longevity.android.androidAuth "Requests one refresh after a rejected access token"
          longevity.android.androidApiClient -> longevity.api "Calls authenticated product endpoints"
          longevity.android.androidApiClient -> longevity.api.wearablesApi "Calls authenticated wearable connection and upload endpoints"
          longevity.android.androidWearables -> longevity.android.androidApiClient "Executes authenticated connection requests"
          longevity.android.androidUploads -> longevity.android.androidApiClient "Executes authenticated normalized upload requests"
          longevity.android.androidHealthAccess -> healthConnect "Checks SDK availability and WeightRecord read grant"

          longevity.webapp -> longevity.api.authApi "Uses web auth and current-user endpoints"
          longevity.webapp -> longevity.api.metricsApi "Uses metric definition and entry endpoints"
          longevity.webapp -> longevity.api.subscriptionsApi "Uses subscription, Checkout, and Portal endpoints"
          longevity.android -> longevity.api.authApi "Uses mobile auth endpoints"
          longevity.android -> longevity.api.wearablesApi "Uses implemented connection and normalized upload endpoints; the UI sync action is next"

          longevity.api.authApi -> longevity.db "Reads users and writes SimpleJWT outstanding/blacklisted token state"
          longevity.api.authApi -> longevity.api.subscriptionsApi "Creates the default Free subscription during registration"
          longevity.api.metricsApi -> longevity.db "Reads and writes metric definitions and entries"
          longevity.api.metricsApi -> longevity.api.subscriptionsApi "Checks current plan entitlements"
          longevity.api.subscriptionsApi -> longevity.db "Reads and writes plans, subscriptions, billing mappings, attempts, and webhook receipts"
          longevity.api.subscriptionsApi -> stripe "Creates hosted sessions and verifies signed events"
          stripe -> longevity.api.subscriptionsApi "POSTs signed subscription events"
          longevity.api.wearablesApi -> longevity.db "Reads and writes connections, SyncRuns, and normalized MetricEntries"
          longevity.api.wearablesApi -> longevity.api.subscriptionsApi "Checks wearable connection entitlements"

          longevity.api -> longevity.redis "Planned: publishes asynchronous work through the broker" {
              tags "PreparedTraffic"
          }
          longevity.worker -> longevity.db "Planned: reads and writes durable job state" {
              tags "PreparedTraffic"
          }
          longevity.worker -> longevity.redis "Prepared broker connection" {
              tags "PreparedTraffic"
          }
          longevity.beat -> longevity.redis "Prepared scheduled-work publisher" {
              tags "PreparedTraffic"
          }

            localDev = deploymentEnvironment "Local Development" {
                developerMachine = deploymentNode "Developer Machine" "Local host machine used for browser testing, Vite, Android Studio/Gradle/adb, and Stripe webhook forwarding." {
                    tags "ClientZone"

                    localBrowserNode = deploymentNode "Browser" "Local browser runtime that executes the React application." {
                        tags "ClientZone"
                        localBrowser = infrastructureNode "Local Web Browser" "Loads the Vite-served React application and follows Stripe hosted redirects." {
                            tags "ClientRuntime"
                        }
                        localWebapp = containerInstance longevity.webapp
                    }

                    viteNode = deploymentNode "Vite Dev Server" "Serves React assets on :5173 and proxies relative /api requests to Django on :8000." {
                        tags "ClientZone"
                        viteServer = infrastructureNode "Vite Runtime and /api Proxy" "Provides frontend development assets and the same-origin API proxy." {
                            tags "ClientRuntime"
                        }
                    }

                    stripeCli = infrastructureNode "Stripe CLI Listener" "Forwards selected Stripe sandbox webhook events to the local Django webhook endpoint." {
                        tags "EdgeService"
                    }

                    androidTooling = infrastructureNode "Android Studio + Gradle + adb" "Builds the Kotlin/Compose app and installs/runs debug and test APKs on the authorized physical phone." {
                        tags "ClientRuntime"
                    }

                    adbReverse = infrastructureNode "adb reverse Tunnel" "Forwards the phone's localhost:8000 traffic to the host Django development port for physical-device API testing." {
                        tags "EdgeService"
                    }
                }

                physicalAndroidPhone = deploymentNode "Physical Android Phone" "Current USB-connected test device. Mobile authentication, backend connection registration, WeightRecord permission, and the reader adapter are implemented; a real product-flow read/upload is next." {
                    tags "ClientZone"

                    localAndroidClient = containerInstance longevity.android

                    localHealthConnect = infrastructureNode "Health Connect" "On-device platform with implemented availability, WeightRecord permission, and paginated reader integration; the product flow does not invoke reads yet." {
                        tags "ClientRuntime"
                    }

                    localSamsungHealth = infrastructureNode "Samsung Health" "On-device source application expected to write Samsung-originated records into Health Connect." {
                        tags "ClientRuntime"
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

                localDev.developerMachine.localBrowserNode.localBrowser -> localDev.developerMachine.viteNode.viteServer "Loads React application assets from :5173" {
                    tags "ClientTraffic"
                }

                localDev.developerMachine.viteNode.viteServer -> localDev.developerMachine.localBrowserNode.localWebapp "Serves the application executed by the browser" {
                    tags "ClientTraffic"
                }

                localDev.developerMachine.androidTooling -> localDev.physicalAndroidPhone.localAndroidClient "Builds, installs, and runs debug/test APKs over USB using adb" {
                    tags "ClientTraffic"
                }

                localDev.physicalAndroidPhone.localSamsungHealth -> localDev.physicalAndroidPhone.localHealthConnect "Writes Samsung-originated records on device" {
                    tags "ClientTraffic"
                }

                localDev.physicalAndroidPhone.localAndroidClient -> localDev.physicalAndroidPhone.localHealthConnect "Checks availability/permission and can issue paginated WeightRecord reads; product orchestration is next" {
                    tags "ClientTraffic"
                }

                localDev.physicalAndroidPhone.localAndroidClient -> localDev.developerMachine.adbReverse "Calls Django mobile auth and wearable connection APIs through the debug localhost tunnel" {
                    tags "ClientTraffic"
                }

                localDev.developerMachine.adbReverse -> localDev.dockerCompose.localApiNode.localApi "Forwards TCP port 8000 to Django" {
                    tags "EdgeTraffic"
                }

                localDev.developerMachine.localBrowserNode.localWebapp -> localDev.developerMachine.viteNode.viteServer "Calls relative /api URLs through the Vite proxy" {
                    tags "ClientTraffic"
                }

                localDev.developerMachine.viteNode.viteServer -> localDev.dockerCompose.localApiNode.localApi "Proxies /api requests to host port 8000" {
                    tags "EdgeTraffic"
                }

                localDev.developerMachine.localBrowserNode.localWebapp -> stripe "Redirects to hosted Checkout and Customer Portal" {
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

                    browserNode = deploymentNode "Browser" "Web browser runtime that executes the deployed React client." {
                        tags "ClientZone"
                        browserRuntime = infrastructureNode "Web Browser" "Loads and runs the React web application." {
                            tags "ClientRuntime"
                        }
                        browserClient = containerInstance longevity.webapp
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

            mvpCloud.userDevices.browserNode.browserRuntime -> mvpCloud.userDevices.browserNode.browserClient "Runs the React application" {
                tags "ClientTraffic"
            }

            mvpCloud.userDevices.browserNode.browserClient -> mvpCloud.aws.edge.alb "Calls the API over HTTPS" {
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

        component longevity.webapp "c4-web-components" "Implemented React web-client responsibilities and their external dependencies." {
            include user
            include longevity.webapp.webRoutes
            include longevity.webapp.webAuth
            include longevity.webapp.webServerState
            include longevity.api
            include stripe
            autolayout lr
        }

        component longevity.android "c4-android-components" "Implemented Android authentication, secure storage, authenticated API, wearable connection, and Health Connect permission responsibilities." {
            include user
            include longevity.android.androidPresentation
            include longevity.android.androidAuth
            include longevity.android.androidTokenStore
            include longevity.android.androidApiClient
            include longevity.android.androidWearables
            include longevity.android.androidUploads
            include longevity.android.androidHealthAccess
            include longevity.android.androidWeightSyncPlanner
            include longevity.android.androidWeightSyncCoordinator
            include longevity.api
            include healthConnect
            autolayout lr
        }

        component longevity.api "c4-api-components" "Implemented Django domain boundaries and their principal dependencies." {
            include longevity.webapp
            include longevity.android
            include stripe
            include longevity.api.authApi
            include longevity.api.subscriptionsApi
            include longevity.api.metricsApi
            include longevity.api.wearablesApi
            include longevity.db
            autolayout lr
        }

        dynamic longevity "web-auth-register" "Dynamic view of the current web registration flow." {
            user -> longevity.webapp "Visits /register, enters email user@example.com and password Secret123!, then submits the form"
            longevity.webapp -> longevity.api "POST /api/auth/register/ with JSON, e.g. {\"email\":\"user@example.com\",\"password\":\"Secret123!\"}; RegisterSerializer validates email format, checks email_lookup_hash uniqueness, and runs Django password validation"
            longevity.api -> longevity.db "Inside one transaction, creates the user with encrypted normalized email, keyed email_lookup_hash, and hashed password, then creates the user's active default Free Subscription"
            longevity.db -> longevity.api "Commits both records or rolls both back; returns created user, e.g. user id 42 -> user@example.com"
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
            longevity.api -> longevity.db "Registers the issued refresh JWT in SimpleJWT's OutstandingToken table"
            longevity.api -> longevity.webapp "Returns only {\"access\":\"...\"} in JSON and sets refresh_token as an HttpOnly, Secure, SameSite=Lax cookie"
            user -> longevity.webapp "Uses authenticated web session"
        }

        dynamic longevity "web-auth-refresh" "Dynamic view of concurrency-safe web refresh rotation and cookie-only refresh transport." {
            user -> longevity.webapp "Continues an existing authenticated web session"
            longevity.webapp -> longevity.api "After same-tab in-flight sharing and, when available, the cross-tab browser lock, POST /api/auth/web/refresh/ with X-CSRFToken and the browser-managed refresh_token cookie"
            longevity.api -> longevity.db "Validates the signed refresh token type/JTI, starts a transaction, and SELECT FOR UPDATE locks its token_blacklist_outstandingtoken row"
            longevity.db -> longevity.api "Returns the one outstanding-token row while holding its PostgreSQL row lock"
            longevity.api -> longevity.db "TokenRefreshSerializer checks blacklist state, inserts BlacklistedToken for the old JTI, registers the rotated OutstandingToken, and commits"
            longevity.api -> longevity.webapp "Returns 200 JSON containing only {\"access\":\"...\"}; transports the rotated refresh token exclusively in a new HttpOnly cookie"
            user -> longevity.webapp "Continues authenticated session with refreshed access token"
        }

        dynamic longevity "web-auth-logout" "Dynamic view of the current web logout flow." {
            user -> longevity.webapp "Chooses to sign out from an authenticated web session"
            longevity.webapp -> longevity.api "POST /api/auth/web/logout/ with X-CSRFToken and the browser-managed refresh_token cookie"
            longevity.api -> longevity.db "Validates the cookie refresh JWT and inserts a BlacklistedToken row for its OutstandingToken"
            longevity.db -> longevity.api "Confirms the presented refresh token is revoked"
            longevity.api -> longevity.webapp "Returns 204, expires the refresh_token cookie, and exposes no refresh token to JavaScript"
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
            user -> longevity.webapp "AuthBootstrapGate blocks route rendering while one shared restore operation runs"
            longevity.webapp -> longevity.api "GET /api/auth/csrf/ to establish the CSRF cookie"
            longevity.api -> longevity.webapp "Returns the CSRF cookie"
            longevity.webapp -> longevity.api "After same-tab sharing and the browser lock when available, POST /api/auth/web/refresh/ with browser cookies and X-CSRFToken"
            longevity.api -> longevity.db "Locks the OutstandingToken row and atomically validates, blacklists, and rotates the refresh token"
            longevity.db -> longevity.api "Commits the blacklist row plus the new outstanding refresh-token row"
            longevity.api -> longevity.webapp "Returns only the renewed access token in JSON and rotates the HttpOnly refresh_token cookie"
            longevity.webapp -> longevity.api "GET /api/auth/me/ with Authorization: Bearer <renewed-access-token>"
            longevity.api -> longevity.db "Loads the authenticated user"
            longevity.db -> longevity.api "Returns current user data"
            longevity.api -> longevity.webapp "Returns 200 current-user JSON"
            user -> longevity.webapp "TanStack Router allows the protected route after session restoration succeeds"
        }

        dynamic longevity.android "mobile-auth-login" "Dynamic view of Android login and durable encrypted token storage." {
            user -> longevity.android.androidPresentation "Enters email and password and chooses Sign in"
            longevity.android.androidPresentation -> longevity.android.androidAuth "Calls login with the submitted credentials; JWTs never enter Compose or ViewModel state"
            longevity.android.androidAuth -> longevity.api "POST /api/auth/mobile/login/ with JSON email and password"
            longevity.api -> longevity.db "Loads the encrypted user identity through email_lookup_hash, verifies the Django password hash, and registers the issued refresh JWT in SimpleJWT's OutstandingToken table"
            longevity.db -> longevity.api "Returns the authenticated user and committed outstanding-token state"
            longevity.api -> longevity.android.androidAuth "Returns 200 JSON containing access and refresh JWTs"
            longevity.android.androidAuth -> longevity.android.androidTokenStore "Encrypts each token with AES-GCM and synchronously commits both ciphertext values before reporting success"
            longevity.android.androidAuth -> longevity.android.androidPresentation "Returns success without exposing token values"
            user -> longevity.android.androidPresentation "Sees the authenticated mobile screen"
        }

        dynamic longevity.android "mobile-session-restore" "Dynamic view of Android cold-start session restoration without unnecessary refresh rotation." {
            user -> longevity.android.androidPresentation "Cold-starts or reopens the Android app"
            longevity.android.androidPresentation -> longevity.android.androidAuth "LoginViewModel asks whether a local session can be restored"
            longevity.android.androidAuth -> longevity.android.androidTokenStore "Reads and decrypts the stored access/refresh pair"
            longevity.android.androidTokenStore -> longevity.android.androidAuth "Returns a readable pair or no session"
            longevity.android.androidAuth -> longevity.android.androidPresentation "Returns only a Boolean restoration result; no API request or token rotation occurs"
            user -> longevity.android.androidPresentation "Sees the authenticated screen when the encrypted pair is readable"
        }

        dynamic longevity.android "mobile-auth-refresh-retry" "Dynamic view of Android on-demand refresh rotation after a protected product request receives 401." {
            user -> longevity.android.androidPresentation "Starts an authenticated product action such as Health Connect registration"
            longevity.android.androidPresentation -> longevity.android.androidWearables "Requests the wearable connection operation"
            longevity.android.androidWearables -> longevity.android.androidApiClient "Builds the product request without handling JWT values"
            longevity.android.androidApiClient -> longevity.android.androidTokenStore "Reads the stored access token"
            longevity.android.androidApiClient -> longevity.api "Sends the protected wearable request with Authorization: Bearer <stored-access-token>"
            longevity.api -> longevity.android.androidApiClient "Returns 401 because the access token is expired or otherwise rejected"
            longevity.android.androidApiClient -> longevity.android.androidTokenStore "Inside a coroutine mutex, rereads storage and reuses a token already refreshed by another request when available"
            longevity.android.androidApiClient -> longevity.android.androidAuth "Requests one refresh when the rejected access token is still current"
            longevity.android.androidAuth -> longevity.android.androidTokenStore "Reads the stored refresh token"
            longevity.android.androidAuth -> longevity.api "POST /api/auth/mobile/refresh/ with the refresh token in JSON"
            longevity.api -> longevity.db "Validates type/JTI, SELECT FOR UPDATE locks the matching OutstandingToken row, blacklists the submitted token, registers the rotated token, and commits atomically"
            longevity.db -> longevity.api "Returns committed refresh-rotation state"
            longevity.api -> longevity.android.androidAuth "Returns replacement access and rotated refresh JWTs"
            longevity.android.androidAuth -> longevity.android.androidTokenStore "Encrypts and synchronously commits the replacement pair"
            longevity.android.androidAuth -> longevity.android.androidApiClient "Reports successful refresh without exposing token values"
            longevity.android.androidApiClient -> longevity.api "Retries the original wearable request once with the replacement access token"
            longevity.api -> longevity.android.androidApiClient "Returns the final product response"
            longevity.android.androidApiClient -> longevity.android.androidWearables "Returns the buffered, closed response without logging health data"
            longevity.android.androidWearables -> longevity.android.androidPresentation "Returns the connection result for UI state"
        }

        dynamic longevity.android "mobile-auth-logout" "Dynamic view of Android server-side refresh revocation followed by local credential deletion." {
            user -> longevity.android.androidPresentation "Chooses Logout"
            longevity.android.androidPresentation -> longevity.android.androidAuth "Requests logout without receiving JWT values"
            longevity.android.androidAuth -> longevity.android.androidTokenStore "Reads the stored refresh token"
            longevity.android.androidAuth -> longevity.api "POST /api/auth/mobile/logout/ with the refresh token in JSON"
            longevity.api -> longevity.db "Validates the refresh JWT and inserts a BlacklistedToken row for its OutstandingToken"
            longevity.db -> longevity.api "Confirms server-side revocation"
            longevity.api -> longevity.android.androidAuth "Returns 204; unexpected server/network failure leaves local credentials available for an honest retry"
            longevity.android.androidAuth -> longevity.android.androidTokenStore "Synchronously clears the encrypted local pair after accepted revocation"
            longevity.android.androidAuth -> longevity.android.androidPresentation "Reports logout success"
            user -> longevity.android.androidPresentation "Returns to the mobile login form"
        }

        dynamic longevity "web-dashboard" "Dynamic view of the implemented protected Dashboard read and manual-entry flow." {
            user -> longevity.webapp "Opens / after the protected-route current-user check succeeds"
            longevity.webapp -> longevity.api "TanStack Query requests GET /api/v1/metrics/definitions/, GET /api/v1/metrics/entries/?limit=50, and GET /api/v1/subscriptions/current/ with the in-memory bearer access token"
            longevity.api -> longevity.db "Loads visible metric definitions, the authenticated user's newest entries, and current plan entitlements"
            longevity.db -> longevity.api "Returns metric catalog/history plus Free or Pro subscription state"
            longevity.api -> longevity.webapp "Returns JSON used for latest-value cards, recent-entry filtering, and client-computed locked/unlocked Pro Insights"
            user -> longevity.webapp "Submits a manual value from a metric card"
            longevity.webapp -> longevity.api "POST /api/v1/metrics/entries/ with metric_definition, value, recorded_at, and optional context"
            longevity.api -> longevity.db "Validates ownership/visibility and metric range, assigns source=manual server-side, then creates MetricEntry"
            longevity.db -> longevity.api "Returns the saved entry"
            longevity.api -> longevity.webapp "Returns 201; TanStack Query invalidates entry caches and the Dashboard renders the updated value/history"
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

        dynamic longevity.android "wearable-connection-register" "Dynamic view of the implemented Android Health Connect permission and backend connection-registration flow." {
            user -> longevity.android.androidPresentation "Chooses Connect Health Connect"
            longevity.android.androidPresentation -> longevity.android.androidHealthAccess "Checks SDK availability and the existing WeightRecord read grant"
            longevity.android.androidHealthAccess -> healthConnect "Queries Health Connect SDK status and granted permissions"
            healthConnect -> longevity.android.androidHealthAccess "Returns available with permission granted, permission required, provider update required, or unavailable"
            longevity.android.androidHealthAccess -> longevity.android.androidPresentation "Returns the typed access state"
            longevity.android.androidPresentation -> healthConnect "When required, launches the official READ_WEIGHT permission Activity Result contract"
            healthConnect -> longevity.android.androidPresentation "Returns the user's grant or denial; denial stops without consuming a backend plan slot"
            longevity.android.androidPresentation -> longevity.android.androidWearables "After an existing or new grant, resolves the backend Health Connect connection"
            longevity.android.androidWearables -> longevity.android.androidApiClient "Builds GET /api/v1/wearables/connections/"
            longevity.android.androidApiClient -> longevity.api "Sends owner-scoped GET /api/v1/wearables/connections/ with Authorization: Bearer <access-token>"
            longevity.api -> longevity.db "Loads the authenticated user's connections"
            longevity.db -> longevity.api "Returns current connection rows"
            longevity.api -> longevity.android.androidApiClient "Returns 200 with the caller-owned connection list"
            longevity.android.androidApiClient -> longevity.android.androidWearables "Returns the buffered response"
            longevity.android.androidWearables -> longevity.android.androidApiClient "Only when health_connect is absent, builds POST with {\"provider\":\"health_connect\"}"
            longevity.android.androidApiClient -> longevity.api "Sends POST /api/v1/wearables/connections/ with Authorization: Bearer <access-token>"
            longevity.api -> longevity.db "Atomically locks the user, loads current plan entitlement, counts active connections, and creates or reactivates WearableConnection(status=pending) when a slot is available"
            longevity.db -> longevity.api "Returns the stored caller-owned connection"
            longevity.api -> longevity.android.androidApiClient "Returns 201, or 400 when the wearable_connection_limit is exhausted"
            longevity.android.androidApiClient -> longevity.android.androidWearables "Returns the final connection response"
            longevity.android.androidWearables -> longevity.android.androidPresentation "Publishes Ready, Rejected, NoSession, or Unavailable UI state"
        }

        dynamic longevity.android "mobile-initial-weight-sync-coordinator" "Dynamic view of the implemented initial weight coordinator through Django ingestion; no Compose or ViewModel action invokes this boundary yet." {
            longevity.android.androidWeightSyncCoordinator -> longevity.android.androidWeightSyncPlanner "Requests the initial weight batches for one caller-owned connection"
            longevity.android.androidWeightSyncPlanner -> longevity.android.androidHealthAccess "Requests the previous 30 days of WeightRecord data"
            longevity.android.androidHealthAccess -> healthConnect "Reads every page in ascending order"
            healthConnect -> longevity.android.androidHealthAccess "Returns permitted records with stable IDs, timestamps, mass, and data-origin package"
            longevity.android.androidHealthAccess -> longevity.android.androidWeightSyncPlanner "Returns SDK-independent normalized weight samples"
            longevity.android.androidWeightSyncPlanner -> longevity.android.androidWeightSyncCoordinator "Returns only Samsung-originated samples in ordered batches of at most 100"
            longevity.android.androidWeightSyncCoordinator -> longevity.android.androidUploads "Generates one upload UUID and submits each batch sequentially"
            longevity.android.androidUploads -> longevity.android.androidApiClient "Serializes the normalized batch without handling JWT values"
            longevity.android.androidApiClient -> longevity.api "POST /api/v1/wearables/uploads/ with the stored bearer access token"
            longevity.api -> longevity.db "Validates caller ownership, locks the connection, enforces upload/payload idempotency, inserts new MetricEntry rows, and completes SyncRun"
            longevity.db -> longevity.api "Commits metric records, connection sync state, and the terminal receipt"
            longevity.api -> longevity.android.androidApiClient "Returns 201 for new work, 200 for an exact retry, or a safe rejection/conflict"
            longevity.android.androidApiClient -> longevity.android.androidUploads "Returns the buffered response without logging health data"
            longevity.android.androidUploads -> longevity.android.androidWeightSyncCoordinator "Returns a typed receipt or explicit conflict/rejection/session/unavailable outcome"
        }

        dynamic longevity "wearable-connection-disconnect" "Dynamic view of the implemented backend disconnect boundary; the Android client action is planned." {
            user -> longevity.android "Planned client action: chooses to disconnect Health Connect"
            longevity.android -> longevity.api "Planned client call to implemented DELETE /api/v1/wearables/connections/{id}/ with Authorization: Bearer <access-token>"
            longevity.api -> longevity.db "Looks up the connection UUID only inside the authenticated user's connections"
            longevity.api -> longevity.db "Marks the caller-owned connection inactive, preserving its identity/history while releasing its wearable_connection_limit slot"
            longevity.api -> longevity.android "Returns 204 when disconnected, or 404 for an unknown, unowned, or already-inactive UUID"
        }

        dynamic longevity "wearable-connection-status-read" "Dynamic view of the implemented backend status-read boundary; the Android client call is planned." {
            user -> longevity.android "Planned client action: views detailed Health Connect sync state"
            longevity.android -> longevity.api "Planned client call to implemented GET /api/v1/wearables/connections/{id}/status/ with Authorization: Bearer <access-token>"
            longevity.api -> longevity.db "Looks up the connection UUID only inside the authenticated user's connections"
            longevity.db -> longevity.api "Returns provider, status, last_synced_at, and last_error when owned"
            longevity.api -> longevity.android "Returns 200 with connection state, or 404 for an unknown or unowned UUID"
        }

        dynamic longevity "free-to-pro-health-connect" "End-to-end dynamic view of account registration, Stripe-backed Free-to-Pro transition, and pending Health Connect registration." {
            user -> longevity.webapp "Registers an account"
            longevity.webapp -> longevity.api "POST /api/auth/register/"
            longevity.api -> longevity.db "Atomically creates the User and active Free Subscription"
            longevity.api -> longevity.webapp "Returns 201 with the registered email"
            user -> longevity.webapp "Signs in"
            longevity.webapp -> longevity.api "POST /api/auth/web/login/"
            longevity.api -> longevity.db "Authenticates the user"
            longevity.api -> longevity.webapp "Returns an access token and sets the refresh token in an HttpOnly cookie"
            user -> longevity.webapp "Selects the Pro monthly price in Settings"
            longevity.webapp -> longevity.api "POST /api/v1/subscriptions/checkout/ with the internal Pro monthly SubscriptionPrice UUID"
            longevity.api -> longevity.db "Creates CheckoutAttempt(pending, expected_subscription=current Free subscription)"
            longevity.api -> stripe "Creates a hosted Checkout Session with server-owned Stripe price and attempt idempotency key"
            stripe -> longevity.api "Returns cs_test session ID and hosted Checkout URL"
            longevity.api -> longevity.db "Marks CheckoutAttempt completed and stores the Stripe session ID; Free remains current"
            longevity.api -> longevity.webapp "Returns 201 with the hosted Checkout URL"
            longevity.webapp -> stripe "Redirects the browser to hosted Checkout"
            user -> stripe "Completes the Pro monthly payment"
            stripe -> longevity.api "POSTs a signed checkout.session.completed webhook"
            longevity.api -> longevity.db "Records the unique Stripe event, cancels the Free subscription into history, creates the active Pro subscription and BillingCustomer, and confirms the attempt"
            stripe -> longevity.api "POSTs a signed customer.subscription.updated webhook"
            longevity.api -> longevity.db "Records the unique Stripe event and refreshes the Pro price, billing-period dates, and cancellation state"
            user -> longevity.android "Opens the Android app and completes mobile login or local session restoration"
            user -> longevity.android "Chooses Connect Health Connect"
            longevity.android -> healthConnect "Checks availability and existing READ_WEIGHT permission, launching the official permission UI when required"
            healthConnect -> longevity.android "Returns the grant; denial stops before backend registration"
            longevity.android -> longevity.api "GET /api/v1/wearables/connections/ with the stored bearer access token"
            longevity.api -> longevity.db "Loads existing caller-owned wearable connections"
            longevity.db -> longevity.api "Returns no Health Connect connection for this first registration"
            longevity.api -> longevity.android "Returns 200 with the current connection list"
            longevity.android -> longevity.api "POST /api/v1/wearables/connections/ with provider=health_connect and the stored bearer access token"
            longevity.api -> longevity.db "Locks the user, loads active Pro entitlement, counts active connections, and creates WearableConnection(status=pending, is_active=true)"
            longevity.api -> longevity.android "Returns 201 with the pending connection; no MetricEntry exists until ingestion succeeds"
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
            stripe -> longevity.webapp "Redirects to server-configured /settings?checkout=success or /settings?checkout=cancelled"
            user -> longevity.webapp "Sees an informational result message; entitlement still changes only after the verified webhook is reconciled"
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
            stripe -> longevity.webapp "Returns the browser to the server-controlled /settings URL"
            user -> longevity.webapp "Settings refetches current local subscription state; webhook reconciliation remains authoritative"
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

        deployment * localDev "local-development-deployment" "Current local runtime: browser-executed React app with Vite /api proxy, synchronous Django/PostgreSQL product flows, Stripe CLI forwarding, and an adb-installed Android client with mobile auth, Health Connect permission/reader adapter, and wearable registration. A physical record-to-upload flow is next; Redis/Celery/Beat remain unused by product flows." {
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

              element "PreparedInfrastructure" {
                  background #eceff3
                  color #52606d
                  stroke #9aa5b1
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

              relationship "PreparedTraffic" {
                  color #9aa5b1
                  thickness 2
                  dashed true
                  routing Orthogonal
              }
          }
      }
  }
