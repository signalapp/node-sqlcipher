# Copyright 2022 Signal Messenger, LLC.
# SPDX-License-Identifier: AGPL-3.0-only
#

FROM ubuntu:focal-20240530@sha256:fa17826afb526a9fc7250e0fbcbfd18d03fe7a54849472f86879d8bf562c629e

# Avoid getting prompted to configure things during installation.
ENV DEBIAN_FRONTEND=noninteractive

# APT source files
COPY docker/ docker/
COPY docker/apt.conf docker/sources.list /etc/apt/

# Ubuntu needs the ca-certificates package before it'll trust our mirror.
# But we can't install it because it doesn't trust our mirror!
# Temporarily disables APT's certificate signature checking
# to download the certificates.
RUN    apt-get update -oAcquire::https::Verify-Peer=false \
    && apt-get install -oAcquire::https::Verify-Peer=false -y ca-certificates
# Back to normal, verification back on

# Install only what's needed to set up Rust and Node.
# We'll install additional tools at the end to take advantage of Docker's caching of earlier steps.
RUN apt-get update && apt-get install -y apt-transport-https xz-utils unzip

# User-specific setup!

ARG UID
ARG GID

# Create a user to map the host user to.
RUN groupadd -o -g "${GID}" sqlcipher \
    && useradd -m -o -u "${UID}" -g "${GID}" -s /bin/bash sqlcipher

USER sqlcipher
ENV HOME=/home/sqlcipher
ENV USER=sqlcipher
ENV SHELL=/bin/bash
ENV CI=on

WORKDIR /home/sqlcipher

# Rust setup
COPY rust-toolchain rust-toolchain
ENV PATH="/home/sqlcipher/.cargo/bin:${PATH}"
ARG RUSTUP_SHA=ad1f8b5199b3b9e231472ed7aa08d2e5d1d539198a15c5b1e53c746aad81d27b

ADD --chown=sqlcipher --chmod=755 --checksum=sha256:${RUSTUP_SHA} \
    https://static.rust-lang.org/rustup/archive/1.21.1/x86_64-unknown-linux-gnu/rustup-init /tmp/rustup-init

RUN /tmp/rustup-init -y --profile minimal --default-toolchain "$(cat rust-toolchain)" \
    && rm -rf /tmp/rustup-init

RUN rustup target add aarch64-unknown-linux-gnu

# Node setup

ARG NODE_VERSION

ADD --chown=sqlcipher https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz node.tar.xz

RUN tar -xf node.tar.xz \
    && mv node-v* node \
    && rm -f node.tar.xz

ENV PATH="/home/sqlcipher/node/bin:${PATH}"

# And finally any bonus packages we're going to need
# Note that we jump back to root for this.
USER root
RUN apt-get install -y g++ gcc crossbuild-essential-arm64 git python3 binutils
USER sqlcipher

RUN cargo install dump_syms --no-default-features --features cli

CMD [ "/bin/bash" ]
