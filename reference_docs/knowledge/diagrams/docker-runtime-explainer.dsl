workspace "SyncVitals Docker Runtime Explainer" "C4 deployment views showing how Dockerfile, images, Docker Compose, Docker Engine, host resources, and running containers relate." {
    model {
        localDocker = deploymentEnvironment "[REFERENCE] Local Docker Runtime" {
            host = deploymentNode "Local Fedora Computer" "The physical host owns the project files, user processes, Docker daemon, ports, and persistent storage." {
                tags "HostBoundary"

                developerTools = deploymentNode "Developer Tools" {
                    tags "HostProcessZone"

                    terminal = infrastructureNode "Developer Terminal" "Runs docker compose build, up, ps, logs, and down." {
                        tags "HostProcess"
                    }

                    compose = infrastructureNode "Docker CLI + Compose Plugin" "Reads Compose YAML, resolves variables, and sends the desired multi-container state to Docker Engine through the Docker API." {
                        tags "ComposeTool"
                    }
                }

                projectFiles = deploymentNode "Backend Working Tree" "Files stored directly on the host." {
                    tags "SourceBoundary"

                    dockerfile = infrastructureNode "backend/Dockerfile" "Build recipe with shared dependency stages plus development and production targets." {
                        tags "SourceArtifact"
                    }

                    composeLocal = infrastructureNode "backend/docker-compose.yml" "Local development service definitions, source bind mount, .env input, published ports, and dependencies." {
                        tags "SourceArtifact"
                    }

                    source = infrastructureNode "Django Source + uv.lock" "Application code and locked Python dependency graph supplied as Docker build context." {
                        tags "SourceArtifact"
                    }
                }

                browser = infrastructureNode "Browser Process" "Runs on the host and calls localhost:8000, which Docker publishes to the web container." {
                    tags "HostProcess"
                }

                hostStorage = deploymentNode "Host Storage" "Data whose lifecycle is outside an individual container." {
                    tags "StorageBoundary"

                    sourceDirectory = infrastructureNode "Backend Source Directory" "Bind-mounted as /app in the local web container; it overlays the image's copied /app files while that container runs." {
                        tags "BindMount"
                    }

                    pgdata = infrastructureNode "Docker Named Volume: pgdata" "Persists PostgreSQL files when the database container is replaced or recreated." {
                        tags "PersistentVolume"
                    }
                }

                dockerRuntime = deploymentNode "Docker Engine-managed Runtime" "The Docker daemon owns local images, networks, writable layers, and container lifecycle." {
                    tags "DockerBoundary"

                    daemon = infrastructureNode "Docker Engine / Daemon" "Builds and pulls images; creates, starts, stops, connects, and removes containers as requested through the Docker API." {
                        tags "DockerEngine"
                    }

                    imageStore = deploymentNode "Local Image Store" "Reusable read-only image layers stored by Docker Engine." {
                        tags "ImageStoreBoundary"

                        backendImage = deploymentNode "Backend Development Image" "Built from backend/Dockerfile target development." {
                            tags "ImageArtifact"

                            imageArtifact = infrastructureNode "Backend Image Artifact" "Reusable read-only image identified by an image ID or immutable registry digest." {
                                tags "ImageArtifact"
                            }

                            baseRuntime = infrastructureNode "Base Runtime Layer" "Linux userspace plus Python." {
                                tags "ImageLayer"
                            }

                            dependencies = infrastructureNode "Dependency Layers" "Packages installed from the committed uv.lock graph." {
                                tags "ImageLayer"
                            }

                            copiedSource = infrastructureNode "Copied Application Layer" "Django source copied to /app when the image is built." {
                                tags "ImageLayer"
                            }
                        }

                        databaseImage = infrastructureNode "Database Image" "The Timescale-flavoured PostgreSQL 16 image used only by local Compose." {
                            tags "ImageArtifact"
                        }

                        redisImage = infrastructureNode "Redis Image" "Official Redis image used by local Compose infrastructure." {
                            tags "ImageArtifact"
                        }
                    }

                    composeProject = deploymentNode "Compose Project" "A group of related containers, network, mounts, port publications, health checks, dependencies, and restart state." {
                        tags "ComposeProjectBoundary"

                        network = infrastructureNode "Default Compose Network" "Private bridge network with service-name DNS such as db and redis." {
                            tags "DockerNetwork"
                        }

                        webContainer = deploymentNode "web Container" "A running instance of the backend image; the container is not another copy of the Dockerfile." {
                            tags "ContainerBoundary"

                            imageFilesystem = infrastructureNode "Read-only Image Filesystem" "Base runtime, locked dependencies, and copied Django code inherited from the backend image." {
                                tags "ContainerContent"
                            }

                            webProcess = infrastructureNode "PID 1: migrate then runserver" "The local Compose command first runs Django migrations and then starts the development server on container port 8000." {
                                tags "RunningProcess"
                            }

                            runtimeConfig = infrastructureNode "Runtime Configuration" "Environment variables, service DNS, port mapping, health/dependency rules, and process command supplied by Compose." {
                                tags "RuntimeConfig"
                            }

                            writableLayer = infrastructureNode "Ephemeral Writable Layer" "Container-specific filesystem changes that disappear when the container is removed unless stored in a mount." {
                                tags "EphemeralStorage"
                            }

                            appMount = infrastructureNode "Bind Mount: /app" "The host working tree overlays /app locally, so source edits are visible without rebuilding the image." {
                                tags "BindMount"
                            }
                        }

                        databaseContainer = deploymentNode "db Container" "A running instance of the local database image." {
                            tags "ContainerBoundary"

                            databaseProcess = infrastructureNode "PostgreSQL Process :5432" "Stores application data in the attached pgdata named volume and accepts private service-network traffic." {
                                tags "DatabaseProcess"
                            }
                        }

                        redisContainer = deploymentNode "redis Container" "A running instance of the Redis image; prepared local infrastructure not required by current product requests." {
                            tags "ContainerBoundary"

                            redisProcess = infrastructureNode "Redis Process :6379" "Accepts private service-network connections." {
                                tags "RunningProcess"
                            }
                        }
                    }
                }
            }

            terminal -> compose "Invokes docker compose commands" "CLI"
            composeLocal -> compose "Defines services, mounts, ports, health checks, dependencies, and commands" "YAML"
            dockerfile -> compose "Identifies the requested image build target" "Build definition"
            source -> compose "Supplies the selected build context" "Files"
            compose -> daemon "Sends desired state and build context" "Docker API"
            daemon -> imageArtifact "Builds and stores immutable filesystem layers" "Image build"
            daemon -> databaseImage "Pulls and stores image layers" "Registry pull"
            daemon -> redisImage "Pulls and stores image layers" "Registry pull"
            imageArtifact -> imageFilesystem "Provides the read-only container filesystem" "Image layers"
            imageArtifact -> webProcess "Provides Python, dependencies, and Django code" "Runtime artifact"
            daemon -> runtimeConfig "Creates and starts the configured container" "Container lifecycle"
            sourceDirectory -> appMount "Mounted from host into the container" "Bind mount"
            appMount -> webProcess "Makes the live host source visible at /app" "Filesystem overlay"
            browser -> webProcess "Calls host port 8000 mapped to container port 8000" "HTTP"
            webProcess -> network "Joins the project network" "Docker bridge"
            network -> databaseProcess "Resolves db and connects on 5432" "PostgreSQL"
            network -> redisProcess "Resolves redis and connects on 6379 when used" "Redis protocol"
            databaseImage -> databaseProcess "Provides the database executable and filesystem" "Image layers"
            redisImage -> redisProcess "Provides the Redis executable and filesystem" "Image layers"
            pgdata -> databaseProcess "Persists database files outside the container lifecycle" "Volume mount"
            imageFilesystem -> writableLayer "Adds a thin per-container writable layer" "Overlay filesystem"
        }
    }

    views {
        deployment * localDocker "docker-image-build-flow" "[REFERENCE / BUILD] Compose reads the local definition and asks Docker Engine to turn the Dockerfile, locked dependencies, and source context into reusable image layers." {
            include terminal
            include compose
            include dockerfile
            include composeLocal
            include source
            include daemon
            include imageArtifact
            include baseRuntime
            include dependencies
            include copiedSource
            autolayout lr 120 80
        }

        deployment * localDocker "docker-compose-runtime-flow" "[REFERENCE / RUN] Docker Engine instantiates the Compose services from images, connects them through a private network, publishes the web port, and attaches host-backed storage." {
            include browser
            include compose
            include daemon
            include imageArtifact
            include databaseImage
            include redisImage
            include sourceDirectory
            include pgdata
            include webProcess
            include network
            include databaseProcess
            include redisProcess
            autolayout lr 120 80
        }

        deployment * localDocker "docker-local-runtime-overview" "[REFERENCE / OVERVIEW] Host files and processes use Docker Compose and Docker Engine to build images, instantiate connected containers, publish localhost ports, and attach persistent storage." {
            include terminal
            include compose
            include dockerfile
            include composeLocal
            include source
            include browser
            include sourceDirectory
            include pgdata
            include daemon
            include imageArtifact
            include databaseImage
            include redisImage
            include network
            include webProcess
            include databaseProcess
            include redisProcess
            autolayout tb 110 70
        }

        deployment * localDocker "docker-web-container-contents" "[REFERENCE / DETAIL] A container combines image layers with one configured process, environment/network configuration, an ephemeral writable layer, and explicitly attached mounts." {
            include daemon
            include imageArtifact
            include baseRuntime
            include dependencies
            include copiedSource
            include sourceDirectory
            include imageFilesystem
            include webProcess
            include runtimeConfig
            include writableLayer
            include appMount
            autolayout tb 120 90
        }

        styles {
            element "Element" {
                color "#17202a"
                stroke "#94a3b8"
                strokeWidth 2
            }
            element "HostBoundary" {
                background "#fbfdff"
                stroke "#cbd5e1"
            }
            element "HostProcessZone" {
                background "#f8fafc"
                stroke "#cbd5e1"
            }
            element "HostProcess" {
                background "#eff6ff"
                stroke "#93c5fd"
            }
            element "ComposeTool" {
                background "#e0f2fe"
                stroke "#38bdf8"
            }
            element "SourceBoundary" {
                background "#fffdf7"
                stroke "#fde68a"
            }
            element "SourceArtifact" {
                shape Folder
                background "#fffbeb"
                stroke "#fbbf24"
            }
            element "StorageBoundary" {
                background "#f8fafc"
                stroke "#cbd5e1"
            }
            element "BindMount" {
                background "#fff7ed"
                stroke "#fb923c"
            }
            element "PersistentVolume" {
                shape Cylinder
                background "#f0fdf4"
                stroke "#4ade80"
            }
            element "DockerBoundary" {
                background "#f7fcff"
                stroke "#7dd3fc"
            }
            element "DockerEngine" {
                background "#dbeafe"
                stroke "#60a5fa"
            }
            element "ImageStoreBoundary" {
                background "#f5f3ff"
                stroke "#c4b5fd"
            }
            element "ImageArtifact" {
                shape Hexagon
                background "#ede9fe"
                stroke "#a78bfa"
            }
            element "ImageLayer" {
                background "#f5f3ff"
                stroke "#c4b5fd"
            }
            element "ComposeProjectBoundary" {
                background "#f0fdfa"
                stroke "#5eead4"
            }
            element "DockerNetwork" {
                background "#ecfeff"
                stroke "#22d3ee"
            }
            element "ContainerBoundary" {
                background "#f8fafc"
                stroke "#94a3b8"
            }
            element "ContainerContent" {
                background "#f5f3ff"
                stroke "#a78bfa"
            }
            element "RunningProcess" {
                background "#eff6ff"
                stroke "#60a5fa"
            }
            element "DatabaseProcess" {
                shape Cylinder
                background "#f0fdf4"
                stroke "#4ade80"
            }
            element "RuntimeConfig" {
                background "#f0fdfa"
                stroke "#2dd4bf"
            }
            element "EphemeralStorage" {
                background "#fff7ed"
                stroke "#fdba74"
            }
        }
    }
}
