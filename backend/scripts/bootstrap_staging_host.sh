#!/usr/bin/env bash

set -Eeuo pipefail

readonly EXPECTED_OS_ID="ubuntu"
readonly EXPECTED_OS_VERSION="24.04"
readonly EXPECTED_ARCHITECTURE="aarch64"
readonly DOCKER_APT_KEY_URL="https://download.docker.com/linux/ubuntu/gpg"
readonly DOCKER_APT_REPOSITORY_URL="https://download.docker.com/linux/ubuntu"

fail() {
    printf 'preflight_status=failed reason=%s\n' "$1" >&2
    exit 1
}

read_os_release_value() {
    local key="$1"
    local os_release="$2"

    sed -n "s/^${key}=//p" "$os_release" | head -n 1 | tr -d '"'
}

preflight() {
    local effective_uid="${SYNCVITALS_BOOTSTRAP_EFFECTIVE_UID:-$EUID}"
    local architecture="${SYNCVITALS_BOOTSTRAP_ARCHITECTURE:-$(uname -m)}"
    local os_release="${SYNCVITALS_BOOTSTRAP_OS_RELEASE:-/etc/os-release}"
    local os_id
    local os_version

    [[ "$effective_uid" == "0" ]] || fail "root-required"
    [[ -r "$os_release" ]] || fail "os-release-unreadable"

    os_id="$(read_os_release_value ID "$os_release")"
    os_version="$(read_os_release_value VERSION_ID "$os_release")"

    [[ "$os_id" == "$EXPECTED_OS_ID" ]] || fail "unsupported-os"
    [[ "$os_version" == "$EXPECTED_OS_VERSION" ]] || fail "unsupported-os-version"
    [[ "$architecture" == "$EXPECTED_ARCHITECTURE" ]] || fail "unsupported-architecture"

    printf 'preflight_status=ok\n'
    printf 'os=%s-%s\n' "$os_id" "$os_version"
    printf 'architecture=%s\n' "$architecture"
}

ensure_no_conflicting_docker_packages() {
    local package
    local status
    local -a conflicting_packages=(
        containerd
        docker-buildx
        docker-compose
        docker-compose-v2
        docker-doc
        docker.io
        podman-docker
        runc
    )

    for package in "${conflicting_packages[@]}"; do
        status="$(dpkg-query -W -f='${db:Status-Abbrev}' "$package" 2>/dev/null || true)"
        [[ "$status" != ii* ]] || fail "conflicting-package-${package}"
    done
}

configure_docker_repository() (
    local architecture
    local candidate
    local codename
    local os_release="${SYNCVITALS_BOOTSTRAP_OS_RELEASE:-/etc/os-release}"
    local root="${SYNCVITALS_BOOTSTRAP_ROOT:-}"
    local keyring_dir="${root}/etc/apt/keyrings"
    local source_dir="${root}/etc/apt/sources.list.d"
    local key_tmp
    local source_tmp

    preflight
    ensure_no_conflicting_docker_packages

    codename="$(read_os_release_value UBUNTU_CODENAME "$os_release")"
    if [[ -z "$codename" ]]; then
        codename="$(read_os_release_value VERSION_CODENAME "$os_release")"
    fi
    [[ -n "$codename" ]] || fail "ubuntu-codename-missing"

    architecture="$(dpkg --print-architecture)"
    [[ "$architecture" == "arm64" ]] || fail "unsupported-dpkg-architecture"

    key_tmp="$(mktemp)"
    source_tmp="$(mktemp)"
    trap 'rm -f -- "$key_tmp" "$source_tmp"' EXIT

    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl
    install -m 0755 -d "$keyring_dir" "$source_dir"
    curl -fsSL "$DOCKER_APT_KEY_URL" -o "$key_tmp"
    install -m 0644 "$key_tmp" "$keyring_dir/docker.asc"

    printf '%s\n' \
        "Types: deb" \
        "URIs: ${DOCKER_APT_REPOSITORY_URL}" \
        "Suites: ${codename}" \
        "Components: stable" \
        "Architectures: ${architecture}" \
        "Signed-By: /etc/apt/keyrings/docker.asc" \
        > "$source_tmp"
    install -m 0644 "$source_tmp" "$source_dir/docker.sources"
    apt-get update

    candidate="$(apt-cache policy docker-ce | sed -n 's/^[[:space:]]*Candidate:[[:space:]]*//p' | head -n 1)"
    [[ -n "$candidate" && "$candidate" != "(none)" ]] || fail "docker-ce-candidate-missing"

    printf 'docker_repository_status=configured\n'
    printf 'docker_candidate=%s\n' "$candidate"
)

install_docker_engine() {
    local candidate
    local compose_version
    local engine_version
    local root="${SYNCVITALS_BOOTSTRAP_ROOT:-}"

    preflight
    [[ -r "${root}/etc/apt/keyrings/docker.asc" ]] || fail "docker-key-missing"
    [[ -r "${root}/etc/apt/sources.list.d/docker.sources" ]] || fail "docker-source-missing"

    candidate="$(apt-cache policy docker-ce | sed -n 's/^[[:space:]]*Candidate:[[:space:]]*//p' | head -n 1)"
    [[ -n "$candidate" && "$candidate" != "(none)" ]] || fail "docker-ce-candidate-missing"

    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        "docker-ce=${candidate}" \
        "docker-ce-cli=${candidate}" \
        containerd.io \
        docker-buildx-plugin \
        docker-compose-plugin

    systemctl enable --now docker
    systemctl is-active --quiet docker
    systemctl is-enabled --quiet docker

    engine_version="$(docker version --format '{{.Server.Version}}')"
    compose_version="$(docker compose version --short)"
    docker run --rm hello-world >/dev/null

    printf 'docker_engine_status=installed\n'
    printf 'docker_engine_version=%s\n' "$engine_version"
    printf 'docker_compose_version=%s\n' "$compose_version"
}

case "${1:-}" in
    preflight)
        preflight
        ;;
    configure-docker-repository)
        configure_docker_repository
        ;;
    install-docker-engine)
        install_docker_engine
        ;;
    *)
        printf 'usage: %s {preflight|configure-docker-repository|install-docker-engine}\n' "$0" >&2
        exit 2
        ;;
esac
