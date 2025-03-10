{
  'target_defaults': {
    'default_configuration': 'Release',
    'msvs_settings': {
      'VCCLCompilerTool': {
        'ExceptionHandling': 1,
      },
    },
    'conditions': [
      ['OS == "win"', {
        'defines': ['WIN32'],
      }],
    ],
    'configurations': {
      'Debug': {
        'defines!': [
          'NDEBUG',
        ],
        'defines': [
          'DEBUG',
          '_DEBUG',
          'SQLITE_DEBUG',
          'SQLITE_MEMDEBUG',
          'SQLITE_ENABLE_API_ARMOR',
          'SQLITE_WIN32_MALLOC_VALIDATE',
        ],
        'cflags': [
          '-O0',
        ],
        'xcode_settings': {
          'MACOSX_DEPLOYMENT_TARGET': '11',
          'GCC_OPTIMIZATION_LEVEL': '0',
          'GCC_GENERATE_DEBUGGING_SYMBOLS': 'YES',
          'GCC_ENABLE_CPP_EXCEPTIONS': 'NO',
        },
        'msvs_settings': {
          'VCLinkerTool': {
            'GenerateDebugInformation': 'true',
          },
        },
      },
      'Release': {
        'defines!': [
          'DEBUG',
          '_DEBUG',
        ],
        'defines': [
          'NDEBUG',
        ],
        'cflags': [
          '-O3',
        ],
        'conditions': [
          ['OS == "linux"', {
            # GCC only for now
            'cflags': ['-flto=4', '-fuse-linker-plugin', '-ffat-lto-objects'],
            'ldflags': ['-flto=4', '-fuse-linker-plugin', '-ffat-lto-objects'],
          }],
        ],
        'xcode_settings': {
          'MACOSX_DEPLOYMENT_TARGET': '11',
          'GCC_OPTIMIZATION_LEVEL': '3',
          'GCC_GENERATE_DEBUGGING_SYMBOLS': 'NO',
          'DEAD_CODE_STRIPPING': 'YES',
          'GCC_INLINES_ARE_PRIVATE_EXTERN': 'YES',
          'GCC_ENABLE_CPP_EXCEPTIONS': 'NO',
          'GCC_SYMBOLS_PRIVATE_EXTERN': 'YES', # -fvisibility=hidden
          'LLVM_LTO': 'YES',
        },
      },
    },
  },
}
