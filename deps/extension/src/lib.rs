//
// Copyright 2024 Signal Messenger, LLC.
// SPDX-License-Identifier: AGPL-3.0-only
//

use crate::sqlcipher::*;
use crate::sqlite::*;
use aes::cipher::{block_padding::NoPadding, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use core::ffi::{c_char, c_int, c_uchar, c_void};
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2_hmac;
use rand_core::{OsRng, RngCore};
use sha2::Sha512;

pub use signal_tokenizer;

mod sqlcipher;
mod sqlite;

type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

extern "C" fn activate(_ctx: *mut c_void) -> c_int {
    // Not called
    SQLITE_OK
}

extern "C" fn deactivate(_ctx: *mut c_void) -> c_int {
    // Not called
    SQLITE_OK
}

extern "C" fn ctx_init(_ctx: *mut *mut c_void) -> c_int {
    // Not called
    SQLITE_OK
}

extern "C" fn ctx_free(_ctx: *mut *mut c_void) -> c_int {
    // Not called
    SQLITE_OK
}

extern "C" fn get_provider_name(_ctx: *mut c_void) -> *const c_char {
    return concat!(env!("CARGO_PKG_NAME"), "\0").as_bytes().as_ptr() as *const c_char;
}

extern "C" fn get_provider_version(_ctx: *mut c_void) -> *const c_char {
    return concat!(env!("CARGO_PKG_VERSION"), "\0").as_bytes().as_ptr() as *const c_char;
}

extern "C" fn fips_status(_ctx: *mut c_void) -> c_int {
    // Off
    0
}

extern "C" fn add_random(_ctx: *mut c_void, _buf: *mut c_void, _length: c_int) -> c_int {
    // Not needed
    SQLITE_OK
}

extern "C" fn random(_ctx: *mut c_void, buf: *mut c_void, length: c_int) -> c_int {
    if buf.is_null() {
        return SQLITE_ERROR;
    }
    let slice = unsafe { core::slice::from_raw_parts_mut(buf as *mut c_uchar, length as usize) };
    OsRng.fill_bytes(slice);
    SQLITE_OK
}

extern "C" fn get_hmac_sz(_ctx: *mut c_void, algorithm: c_int) -> c_int {
    match algorithm {
        SQLCIPHER_HMAC_SHA512 => 64,
        _ => 0,
    }
}

extern "C" fn hmac(
    _ctx: *mut c_void,
    algorithm: c_int,
    hmac_key: *const c_uchar,
    key_sz: c_int,
    in1: *const c_uchar,
    in1_sz: c_int,
    in2: *const c_uchar,
    in2_sz: c_int,
    out: *mut c_uchar,
) -> c_int {
    if algorithm != SQLCIPHER_HMAC_SHA512 {
        return SQLITE_ERROR;
    }
    if hmac_key.is_null() || in1.is_null() || out.is_null() {
        return SQLITE_ERROR;
    }
    let key = unsafe { core::slice::from_raw_parts(hmac_key as *mut c_uchar, key_sz as usize) };
    let in1 = unsafe { core::slice::from_raw_parts(in1 as *const c_uchar, in1_sz as usize) };
    let in2 = if in2.is_null() {
        None
    } else {
        Some(unsafe { core::slice::from_raw_parts(in2 as *mut c_uchar, in2_sz as usize) })
    };

    let Ok(mut mac) = Hmac::<Sha512>::new_from_slice(key) else {
        return SQLITE_ERROR;
    };
    mac.update(in1);
    if let Some(in2) = in2 {
        mac.update(in2);
    }
    let digest = mac.finalize().into_bytes();
    unsafe {
        out.copy_from(digest.as_ptr(), digest.len());
    };
    SQLITE_OK
}

extern "C" fn pbkdf(
    _ctx: *mut c_void,
    algorithm: c_int,
    pass: *const c_uchar,
    pass_sz: c_int,
    salt: *const c_uchar,
    salt_sz: c_int,
    workfactor: c_int,
    key_sz: c_int,
    key: *mut c_uchar,
) -> c_int {
    if algorithm != SQLCIPHER_PBKDF2_HMAC_SHA512 {
        return SQLITE_ERROR;
    }
    if pass.is_null() || salt.is_null() || key.is_null() {
        return SQLITE_ERROR;
    }
    let password = unsafe { core::slice::from_raw_parts(pass as *const c_uchar, pass_sz as usize) };
    let salt = unsafe { core::slice::from_raw_parts(salt as *const c_uchar, salt_sz as usize) };
    let buf = unsafe { core::slice::from_raw_parts_mut(key as *mut c_uchar, key_sz as usize) };
    pbkdf2_hmac::<Sha512>(password, salt, workfactor as u32, buf);
    SQLITE_OK
}

extern "C" fn get_cipher(_ctx: *mut c_void) -> *const c_char {
    return "aes-256-cbc\0".as_bytes().as_ptr() as *const c_char;
}

extern "C" fn get_key_sz(_ctx: *mut c_void) -> c_int {
    // AES-256-CBC
    32
}

extern "C" fn get_iv_sz(ctx: *mut c_void) -> c_int {
    get_block_sz(ctx)
}

extern "C" fn get_block_sz(_ctx: *mut c_void) -> c_int {
    // AES-256-CBC
    16
}

extern "C" fn cipher(
    ctx: *mut c_void,
    mode: c_int,
    key: *const c_uchar,
    key_sz: c_int,
    iv: *const c_uchar,
    in1: *const c_uchar,
    in1_sz: c_int,
    out: *mut c_uchar,
) -> c_int {
    let key = unsafe { core::slice::from_raw_parts(key as *const c_uchar, key_sz as usize) };
    let iv = unsafe { core::slice::from_raw_parts(iv as *const c_uchar, get_iv_sz(ctx) as usize) };
    let in1 = unsafe { core::slice::from_raw_parts(in1 as *const c_uchar, in1_sz as usize) };
    let out = unsafe { core::slice::from_raw_parts_mut(out as *mut c_uchar, in1_sz as usize) };
    let res = if mode == CIPHER_ENCRYPT {
        Aes256CbcEnc::new(key.into(), iv.into())
            .encrypt_padded_b2b_mut::<NoPadding>(in1, out)
            .map_err(|_| ())
    } else {
        Aes256CbcDec::new(key.into(), iv.into())
            .decrypt_padded_b2b_mut::<NoPadding>(in1, out)
            .map_err(|_| ())
    };
    match res {
        Ok(_) => SQLITE_OK,
        Err(_) => SQLITE_ERROR,
    }
}

#[no_mangle]
pub extern "C" fn signal_crypto_provider_setup(provider: *mut SqlCipherProvider) -> c_int {
    if provider.is_null() {
        return SQLITE_ERROR;
    }

    unsafe {
        provider.write(SqlCipherProvider {
            activate,
            deactivate,
            get_provider_name,
            add_random,
            random,
            hmac,
            pbkdf,
            cipher,
            get_cipher,
            get_key_sz,
            get_iv_sz,
            get_block_sz,
            get_hmac_sz,
            ctx_init,
            ctx_free,
            fips_status,
            get_provider_version,
        });
    }
    SQLITE_OK
}
