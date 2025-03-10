/* v8 ignore start */
// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

const { spawnSync } = require('node:child_process');
const { basename } = require('node:path');

const target = process.argv[2];
const args = ['build', '--release', '--target', basename(target)];

console.log('Running: cargo with args:', args);
spawnSync('cargo', args, {
  stdio: [null, 'inherit', 'inherit'],
  cwd: __dirname,
  env: {
    ...process.env,
    MACOSX_DEPLOYMENT_TARGET: '11.0',
    CFLAGS: process.platform === 'win32' ? undefined : '-Wa,--noexecstack',
    RUSTFLAGS: target.includes('aarch64') ? '--cfg aes_armv8' : '',
  },
});
