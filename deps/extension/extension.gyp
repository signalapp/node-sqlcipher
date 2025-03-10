{
  'variables': {
    'conditions': [
      ['OS == "mac" and target_arch == "x64"', {
        'rust_arch': 'x86_64-apple-darwin',
        'rust_prefix': 'lib',
        'rust_ext': 'a',
      }],
      ['OS == "mac" and target_arch == "arm64"', {
        'rust_arch': 'aarch64-apple-darwin',
        'rust_prefix': 'lib',
        'rust_ext': 'a',
      }],
      ['OS == "linux" and target_arch == "x64"', {
        'rust_arch': 'x86_64-unknown-linux-gnu',
        'rust_prefix': 'lib',
        'rust_ext': 'a',
      }],
      ['OS == "linux" and target_arch == "arm64"', {
        'rust_arch': 'aarch64-unknown-linux-gnu',
        'rust_prefix': 'lib',
        'rust_ext': 'a',
      }],
      ['OS == "win" and target_arch == "x64"', {
        'rust_arch': 'x86_64-pc-windows-msvc',
        'rust_prefix': '',
        'rust_ext': 'lib',
      }],
      ['OS == "win" and target_arch == "arm64"', {
        'rust_arch': 'aarch64-pc-windows-msvc',
        'rust_prefix': '',
        'rust_ext': 'lib',
      }],
    ],
  },
  'targets': [{
    'target_name': 'extension',
    'type': 'none',
    'direct_dependent_settings': {
      'include_dirs': [
        'target',
      ],
      'conditions': [
        ['OS == "win"', {
          'link_settings': {
            'libraries': [
              '-l<(rust_prefix)signal_sqlcipher_extension.<(rust_ext)',
            ],
            'library_dirs': [
              '<(SHARED_INTERMEDIATE_DIR)',
            ]
          }
        }, {
          'link_settings': {
            'libraries': [
              '<(SHARED_INTERMEDIATE_DIR)/<(rust_prefix)signal_sqlcipher_extension.<(rust_ext)',
            ]
          },
        }],
      ],
    },
    'hard_dependency': 1,
    'actions': [{
      'action_name': 'build',
      'process_outputs_as_sources': 1,
      'inputs': [],
      'outputs': [
        'target/signal-tokenizer.h',
        'target/<(rust_arch)/release/<(rust_prefix)signal_sqlcipher_extension.<(rust_ext)',
      ],
      'action': [
        'node',
        'cargo-wrap.js',
        'target/<(rust_arch)',
      ],
    }],
    'copies': [{
      'files': [
        'target/<(rust_arch)/release/<(rust_prefix)signal_sqlcipher_extension.<(rust_ext)',
      ],
      'destination': '<(SHARED_INTERMEDIATE_DIR)',
    }],
  }],
}
