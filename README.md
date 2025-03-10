## Updating sqlcipher

On macOS:

```sh
cd deps/sqlcipher
export OPENSSL_PREFIX=`brew --prefix openssl`
export CFLAGS="-I $OPENSSL_PREFIX/include"
export LIBRARY_PATH="$LIBRARY_PATH:$OPENSSL_PREFIX/lib"
./update.sh v4.6.1
cd -
```

## License

Copyright 2025 Signal Messenger, LLC.

Licensed under the AGPLv3: http://www.gnu.org/licenses/agpl-3.0.html
