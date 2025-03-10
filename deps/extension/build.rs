extern crate cbindgen;

use cbindgen::{Config, EnumConfig, ExportConfig, ItemType, Language, Style};
use std::env;

fn main() {
    let crate_dir = env::var("CARGO_MANIFEST_DIR").unwrap();

    let mut config = Config {
        language: Language::C,
        header: Some(
            "/*\nCopyright (C) 2024 Signal Messenger, LLC.\nSPDX-License-Identifier: AGPL-3.0-only\n*/"
                .into(),
        ),
        style: Style::Type,
        cpp_compat: true,
        enumeration: EnumConfig {
            prefix_with_name: true,
            ..Default::default()
        },
        include_guard: Some("SIGNAL_FTS5_TOKENIZER_H_".into()),
        export: ExportConfig {
            item_types: vec![
                ItemType::Functions,
                ItemType::OpaqueItems,
                ItemType::Structs,
                ItemType::Typedefs,
            ],
            ..Default::default()
        },
        ..Default::default()
    };

    config
        .export
        .rename
        .insert("Sqlite3".into(), "sqlite3".into());
    config
        .export
        .rename
        .insert("SqliteAPIRoutines3".into(), "sqlite3_api_routines".into());
    config
        .export
        .rename
        .insert("TokenFunction".into(), "sqlite3__fts5_token_fn".into());
    config.defines.insert(
        "feature = extension".into(),
        "SIGNAL_FTS5_TOKENIZER_EXTENSION_H_".into(),
    );

    cbindgen::Builder::new()
        .with_crate_and_name(crate_dir, "signal-tokenizer")
        .with_config(config)
        .generate()
        .expect("Unable to generate bindings")
        .write_to_file("target/signal-tokenizer.h");
}
