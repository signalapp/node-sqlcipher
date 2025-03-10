{
  'includes': ['deps/common.gypi'],
  'targets': [
    {
      'target_name': 'node_sqlcipher',
      'dependencies': [
        'deps/sqlcipher/sqlcipher.gyp:sqlcipher',
        'deps/extension/extension.gyp:extension',
        "<!(node -p \"require('node-addon-api').targets\"):node_addon_api",
      ],
      'sources': ['src/addon.cc'],
      'conditions': [
        ['OS=="linux"', {
          'ldflags': [
            '-Wl,-Bsymbolic',
            '-Wl,--exclude-libs,ALL',
          ],
        }],
      ],
    },
  ],
}
