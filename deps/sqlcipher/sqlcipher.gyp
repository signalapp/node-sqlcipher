# ===
# This configuration defines options specific to compiling SQLite3 itself.
# Compile-time options are loaded by the auto-generated file "defines.gypi".
# Before SQLite3 is compiled, it gets extracted from "sqlcipher.tar.gz".
# The --sqlite3 option can be provided to use a custom amalgamation instead.
# ===

{
  'targets': [
    {
      'target_name': 'sqlcipher',
      'type': 'static_library',
      'sources': ['sqlite3.c'],
      'include_dirs': ['.'],
      'direct_dependent_settings': {
        'include_dirs': [
          '.',
        ],
      },
      'cflags': ['-std=c99', '-w'],
      'xcode_settings': {
        'OTHER_CFLAGS': ['-std=c99'],
        'WARNING_CFLAGS': ['-w'],
      },
      'defines': [
        'SQLITE_LIKE_DOESNT_MATCH_BLOBS',
        'SQLITE_THREADSAFE=2',
        'SQLITE_USE_URI=0',
        'SQLITE_DEFAULT_MEMSTATUS=0',
        'SQLITE_OMIT_AUTOINIT',
        'SQLITE_OMIT_DEPRECATED',
        'SQLITE_OMIT_DESERIALIZE',
        'SQLITE_OMIT_GET_TABLE',
        'SQLITE_OMIT_TCL_VARIABLE',
        'SQLITE_OMIT_PROGRESS_CALLBACK',
        'SQLITE_OMIT_SHARED_CACHE',
        'SQLITE_OMIT_UTF16',
        'SQLITE_OMIT_COMPLETE',
        'SQLITE_OMIT_GET_TABLE',
        'SQLITE_OMIT_AUTHORIZATION',
        'SQLITE_OMIT_LOAD_EXTENSION',
        'SQLITE_TRACE_SIZE_LIMIT=32',
        'SQLITE_DEFAULT_CACHE_SIZE=-16000',
        'SQLITE_DEFAULT_FOREIGN_KEYS=1',
        'SQLITE_DEFAULT_WAL_SYNCHRONOUS=1',
        'SQLITE_DQS=0',
        'SQLITE_ENABLE_MATH_FUNCTIONS',
        'SQLITE_ENABLE_DESERIALIZE',
        'SQLITE_ENABLE_COLUMN_METADATA',
        'SQLITE_ENABLE_UPDATE_DELETE_LIMIT',
        'SQLITE_ENABLE_STAT4',
        'SQLITE_ENABLE_FTS5',
        'SQLITE_ENABLE_JSON1',
        'SQLITE_INTROSPECTION_PRAGMAS',

        'SQLCIPHER_CRYPTO_CUSTOM=signal_crypto_provider_setup',

        'HAVE_STDINT_H=1',
        'HAVE_INT8_T=1',
        'HAVE_INT16_T=1',
        'HAVE_INT32_T=1',
        'HAVE_UINT8_T=1',
        'HAVE_INT8_T=1',
        'HAVE_STDINT_H=1',
        'HAVE_UINT16_T=1',
        'HAVE_UINT32_T=1',

        # SQLCipher-specific options
        'SQLITE_HAS_CODEC',
        'SQLITE_TEMP_STORE=2',
        'SQLITE_SECURE_DELETE',
        'SQLITE_EXTRA_INIT=sqlcipher_extra_init',
        'SQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown',
      ],
      'conditions': [
        # Link with extension
        ['OS == "win"', {
          'defines': [
            'WIN32'
          ],
          'link_settings': {
            'libraries': [
              '-luserenv.lib',
              '-lntdll.lib',
              '-lbcrypt.lib',
              '-lcrypt32.lib',
              '-lsignal_sqlcipher_extension.lib'
            ],
            'library_dirs': [
              '<(PRODUCT_DIR)',
            ]
          }
        }, {
          'link_settings': {
            'libraries': [
              '<(SHARED_INTERMEDIATE_DIR)/libsignal_sqlcipher_extension.a',
            ]
          },
        }],

        # Profiling
        ["\"<!(node -p \"require('../../package.json').version\")\".endswith(\"-profiling\")", {
          'defines': [
            'SQLITE_ENABLE_STMT_SCANSTATUS'
          ],
          'direct_dependent_settings': {
            'defines': [
              'SQLITE_ENABLE_STMT_SCANSTATUS'
            ],
          },
        }],
      ],
      'configurations': {
        'Debug': {
          'msvs_settings': { 'VCCLCompilerTool': { 'RuntimeLibrary': 1 } }, # static debug
        },
        'Release': {
          'msvs_settings': { 'VCCLCompilerTool': { 'RuntimeLibrary': 0 } }, # static release
        },
      },
    },
  ],
}
