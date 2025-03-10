// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

declare module 'node-gyp-build' {
  export default function load<Addon>(dir: string): Addon;
}
