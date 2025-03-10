# Overview

Signal-Sqlcipher-Extension bundles:

- [Signal-FTS5-Extension](https://github.com/signalapp/Signal-FTS5-Extension)
- Rust-based cryptography provider

into a single .a (.lib on Windows) file that could be linked into relevant
sqlcipher builds.

# Build Instructions

For x86_64:

```sh
cargo build --release
```

For arm64

```sh
RUSTFLAGS="--cfg aes_armv8" cargo build --release
```

# Usage

The resulting `.a`/`.lib` file needs to be linked with sqlcipher, and built with
`-DSQLCIPHER_CRYPTO_CUSTOM=signal_crypto_provider_setup`.

# Legal things

## License

Copyright 2024 Signal Messenger, LLC.

Licensed under the AGPLv3: http://www.gnu.org/licenses/agpl-3.0.html
