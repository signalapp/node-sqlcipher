#!/bin/bash
# shellcheck disable=SC1004

#
# Copyright 2022 Signal Messenger, LLC.
# SPDX-License-Identifier: AGPL-3.0-only
#

set -euo pipefail

DOCKER_IMAGE=sqlcipher-builder

IS_TTY=""
if [[ -t 0 ]]; then
    IS_TTY="yes"
fi

# Build specifically using linux/amd64 to make it reproducible.
docker build --platform=linux/amd64 --build-arg "UID=${UID:-501}" --build-arg "GID=${GID:-501}" --build-arg "NODE_VERSION=$(cat .nvmrc)" -t ${DOCKER_IMAGE} -f Dockerfile .

# We build both architectures in the same run action to save on intermediates
# (including downloading dependencies)
# We run `npm ci` to make sure the correct prebuildify version is used.
docker run ${IS_TTY:+ -it} --init --rm -v "${PWD}":/home/sqlcipher/src ${DOCKER_IMAGE} sh -c '
    cd src &&
    npm i -g pnpm &&
    pnpm install --frozen-lockfile &&
    env CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
        CC=aarch64-linux-gnu-gcc \
        CXX=aarch64-linux-gnu-g++ \
        CPATH=/usr/aarch64-linux-gnu/include \
        PREBUILD_STRIP_BIN=aarch64-linux-gnu-strip \
        pnpm prebuildify -t $(cat ./.nvmrc) --arch arm64 &&
    pnpm prebuildify -t $(cat ./.nvmrc) --arch x64
'
