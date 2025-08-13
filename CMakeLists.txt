cmake_minimum_required(VERSION 3.25)

find_package(cmake-bare REQUIRED PATHS node_modules/cmake-bare)

project(sqlcipher C CXX)

# Find OpenSSL (required for SQLCipher)
find_package(OpenSSL REQUIRED)

add_bare_module(sqlcipher)

# Try to find and include node-addon-api
execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)

# Remove quotes if present
string(REGEX REPLACE "^['\"]|['\"]$" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")

# Add node-addon-api include directory with higher priority
target_include_directories(
  ${sqlcipher}
  BEFORE PRIVATE
    ${NODE_ADDON_API_DIR}
)

# Add node-addon-api specific definitions
target_compile_definitions(
  ${sqlcipher}
  PRIVATE
    NAPI_VERSION=3
    NAPI_DISABLE_CPP_EXCEPTIONS
)


# SQLCipher source files
target_sources(
  ${sqlcipher}
  PRIVATE
    src/addon.cc
    deps/sqlcipher/sqlite3.c
)

# Include directories
target_include_directories(
  ${sqlcipher}
  PRIVATE
    src
    deps/sqlcipher
)

# Link OpenSSL
target_link_libraries(
  ${sqlcipher}
  PRIVATE
    OpenSSL::SSL
    OpenSSL::Crypto
)

# Compiler definitions
target_compile_definitions(
  ${sqlcipher}
  PRIVATE
    SQLITE_LIKE_DOESNT_MATCH_BLOBS
    SQLITE_THREADSAFE=2
    SQLITE_USE_URI=0
    SQLITE_DEFAULT_MEMSTATUS=0
    SQLITE_OMIT_AUTOINIT
    SQLITE_OMIT_DEPRECATED
    SQLITE_OMIT_DESERIALIZE
    SQLITE_OMIT_GET_TABLE
    SQLITE_OMIT_TCL_VARIABLE
    SQLITE_OMIT_PROGRESS_CALLBACK
    SQLITE_OMIT_SHARED_CACHE
    SQLITE_OMIT_UTF16
    SQLITE_OMIT_COMPLETE
    SQLITE_OMIT_AUTHORIZATION
    SQLITE_OMIT_LOAD_EXTENSION
    SQLITE_TRACE_SIZE_LIMIT=32
    SQLITE_DEFAULT_CACHE_SIZE=-16000
    SQLITE_DEFAULT_FOREIGN_KEYS=1
    SQLITE_DEFAULT_WAL_SYNCHRONOUS=1
    SQLITE_DQS=0
    SQLITE_ENABLE_MATH_FUNCTIONS
    SQLITE_ENABLE_DESERIALIZE
    SQLITE_ENABLE_COLUMN_METADATA
    SQLITE_ENABLE_UPDATE_DELETE_LIMIT
    SQLITE_ENABLE_STAT4
    SQLITE_ENABLE_FTS5
    SQLITE_ENABLE_JSON1
    SQLITE_INTROSPECTION_PRAGMAS
    HAVE_STDINT_H=1
    HAVE_INT8_T=1
    HAVE_INT16_T=1
    HAVE_INT32_T=1
    HAVE_UINT8_T=1
    HAVE_UINT16_T=1
    HAVE_UINT32_T=1
    SQLITE_HAS_CODEC
    SQLITE_TEMP_STORE=2
    SQLITE_SECURE_DELETE
    SQLITE_EXTRA_INIT=sqlcipher_extra_init
    SQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown
)

# Compiler flags
target_compile_options(
  ${sqlcipher}
  PRIVATE
    $<$<COMPILE_LANGUAGE:C>:-std=c99>
    $<$<COMPILE_LANGUAGE:C>:-w>
)

# Platform-specific configurations
if(WIN32)
  target_compile_definitions(
    ${sqlcipher}
    PRIVATE
      WIN32
  )
endif()

# Profiling support for development builds
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
  target_compile_definitions(
    ${sqlcipher}
    PRIVATE
      SQLITE_ENABLE_STMT_SCANSTATUS
  )
endif()