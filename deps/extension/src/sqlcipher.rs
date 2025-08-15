//
// Copyright 2024 Signal Messenger, LLC.
// SPDX-License-Identifier: AGPL-3.0-only
//

use core::ffi::{c_char, c_int, c_uchar, c_void};

// From: sqlcipher.h

pub const SQLCIPHER_HMAC_SHA512: c_int = 2;
pub const SQLCIPHER_PBKDF2_HMAC_SHA512: c_int = 2;

// Legacy encryption primitives
pub const SQLCIPHER_HMAC_SHA1: c_int = 0;
pub const SQLCIPHER_PBKDF2_HMAC_SHA1: c_int = 0;

pub const CIPHER_ENCRYPT: c_int = 1;

#[repr(C)]
pub struct SqlCipherProvider {
    pub activate: extern "C" fn(ctx: *mut c_void) -> c_int,
    pub deactivate: extern "C" fn(ctx: *mut c_void) -> c_int,
    pub get_provider_name: extern "C" fn(ctx: *mut c_void) -> *const c_char,
    pub add_random: extern "C" fn(ctx: *mut c_void, buf: *mut c_void, length: c_int) -> c_int,
    pub random: extern "C" fn(ctx: *mut c_void, buf: *mut c_void, length: c_int) -> c_int,
    pub hmac: extern "C" fn(
        ctx: *mut c_void,
        algorithm: c_int,
        hmac_key: *const c_uchar,
        key_sz: c_int,
        in1: *const c_uchar,
        in1_sz: c_int,
        in2: *const c_uchar,
        in2_sz: c_int,
        out: *mut c_uchar,
    ) -> c_int,
    pub pbkdf: extern "C" fn(
        ctx: *mut c_void,
        algorithm: c_int,
        pass: *const c_uchar,
        pass_sz: c_int,
        salt: *const c_uchar,
        salt_sz: c_int,
        workfactor: c_int,
        key_sz: c_int,
        key: *mut c_uchar,
    ) -> c_int,
    pub cipher: extern "C" fn(
        ctx: *mut c_void,
        mode: c_int,
        key: *const c_uchar,
        key_sz: c_int,
        iv: *const c_uchar,
        in1: *const c_uchar,
        in1_sz: c_int,
        out: *mut c_uchar,
    ) -> c_int,
    pub get_cipher: extern "C" fn(ctx: *mut c_void) -> *const c_char,
    pub get_key_sz: extern "C" fn(ctx: *mut c_void) -> c_int,
    pub get_iv_sz: extern "C" fn(ctx: *mut c_void) -> c_int,
    pub get_block_sz: extern "C" fn(ctx: *mut c_void) -> c_int,
    pub get_hmac_sz: extern "C" fn(ctx: *mut c_void, algorithm: c_int) -> c_int,
    pub ctx_init: extern "C" fn(ctx: *mut *mut c_void) -> c_int,
    pub ctx_free: extern "C" fn(ctx: *mut *mut c_void) -> c_int,
    pub fips_status: extern "C" fn(ctx: *mut c_void) -> c_int,
    pub get_provider_version: extern "C" fn(ctx: *mut c_void) -> *const c_char,
}
