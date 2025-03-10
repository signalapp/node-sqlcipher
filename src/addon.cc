// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

#include <assert.h>
#include <list>

#include "addon.h"

#include "napi.h"
#include "signal-tokenizer.h"
#include "sqlite3.h"

// Signal Tokenizer

class SignalTokenizerModule {
 public:
  static void Destroy(void* p_ctx) {}

  inline fts5_tokenizer* GetAPIObject() { return &api_object; }

 private:
  static int Create(void* p_ctx, char const**, int, Fts5Tokenizer** pp_out) {
    SignalTokenizerModule* m = static_cast<SignalTokenizerModule*>(p_ctx);
    *pp_out = reinterpret_cast<Fts5Tokenizer*>(m);
    return SQLITE_OK;
  }

  static void Delete(Fts5Tokenizer* tokenizer) {}
  static fts5_tokenizer api_object;
};

fts5_tokenizer SignalTokenizerModule::api_object = {
    &Create,
    &Delete,
    signal_fts5_tokenize,
};

static int SignalTokenizeCallback(void* tokens_ptr,
                                  int _flags,
                                  char const* token,
                                  int len,
                                  int _start,
                                  int _end) {
  std::vector<std::string>* tokens =
      reinterpret_cast<std::vector<std::string>*>(tokens_ptr);
  tokens->push_back(std::string(token, len));
  return SQLITE_OK;
}

static Napi::Value SignalTokenize(const Napi::CallbackInfo& info) {
  auto env = info.Env();

  auto value = info[0].As<Napi::String>();
  assert(value.IsString());

  auto utf8 = value.Utf8Value();

  std::vector<std::string> tokens;
  int status =
      signal_fts5_tokenize(nullptr, reinterpret_cast<void*>(&tokens), 0,
                           utf8.c_str(), utf8.length(), SignalTokenizeCallback);
  if (status != SQLITE_OK) {
    NAPI_THROW(Napi::Error::New(env, "Failed to tokenize"), Napi::Value());
  }

  auto result = Napi::Array::New(env, tokens.size());
  int i = 0;
  for (auto& str : tokens) {
    result[i++] = str.c_str();
  }

  return result;
}

// Database

Napi::Object Database::Init(Napi::Env env, Napi::Object exports) {
  exports["databaseOpen"] = Napi::Function::New(env, &Database::Open);
  exports["databaseClose"] = Napi::Function::New(env, &Database::Close);
  exports["databaseExec"] = Napi::Function::New(env, &Database::Exec);
  return exports;
}

Database::Database(Napi::Env env, sqlite3* handle) : handle_(handle) {
  auto external = Napi::External<Database>::New(
      env, this, [](Napi::Env env, Database* db) { delete db; });
  self_ref_ = Napi::Persistent(external);
}

Database::~Database() {
  // Manually closed
  if (handle_ == nullptr) {
    return;
  }

  int r = sqlite3_close(handle_);
  if (r != SQLITE_OK) {
    fprintf(stderr, "Cleanup: sqlite3_close failure\n");
    abort();
  }
  handle_ = nullptr;
}

Database* Database::FromExternal(const Napi::Value value) {
  auto external = value.As<Napi::External<Database>>();

  auto db = external.Data();

  if (db->handle_ == nullptr) {
    NAPI_THROW(Napi::Error::New(value.Env(), "Database closed"), nullptr);
  }

  return db;
}

Napi::Value Database::Open(const Napi::CallbackInfo& info) {
  auto env = info.Env();

  auto path = info[0].As<Napi::String>();
  assert(path.IsString());

  auto path_utf8 = path.Utf8Value();

  int flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE;

  sqlite3* handle = nullptr;
  int r = sqlite3_open_v2(path_utf8.c_str(), &handle, flags, nullptr);
  if (r != SQLITE_OK) {
    char buf[1024];

    snprintf(buf, sizeof(buf), "sqlite open error: %s", sqlite3_errstr(r));
    NAPI_THROW(Napi::Error::New(env, buf), Napi::Value());
  }

  auto db = new Database(env, handle);

  r = sqlite3_extended_result_codes(handle, 1);
  if (r != SQLITE_OK) {
    return db->ThrowSqliteError(env, r);
  }

  fts5_api* fts5 = db->GetFTS5API(env);

  if (fts5 == nullptr) {
    return Napi::Value();
  }
  SignalTokenizerModule* icu = new SignalTokenizerModule();
  fts5->xCreateTokenizer(fts5, "signal_tokenizer", icu, icu->GetAPIObject(),
                         &SignalTokenizerModule::Destroy);

  return db->self_ref_.Value();
}

Napi::Value Database::Close(const Napi::CallbackInfo& info) {
  auto env = info.Env();

  auto db = FromExternal(info[0]);
  if (db == nullptr) {
    return Napi::Value();
  }

  for (const auto& stmt : db->statements_) {
    int r = sqlite3_finalize(stmt->handle_);
    if (r != SQLITE_OK) {
      return db->ThrowSqliteError(env, r);
    }
    stmt->handle_ = nullptr;
    stmt->db_ = nullptr;
  }
  db->statements_.clear();

  int r = sqlite3_close(db->handle_);
  if (r != SQLITE_OK) {
    return db->ThrowSqliteError(env, r);
  }
  db->handle_ = nullptr;
  return Napi::Value();
}

Napi::Value Database::Exec(const Napi::CallbackInfo& info) {
  auto env = info.Env();

  auto db = FromExternal(info[0]);
  auto query = info[1].As<Napi::String>();
  assert(query.IsString());

  if (db == nullptr) {
    return Napi::Value();
  }

  auto query_utf8 = query.Utf8Value();

  if (db->handle_ == nullptr) {
    NAPI_THROW(Napi::Error::New(env, "Database closed"), Napi::Value());
  }

  int r =
      sqlite3_exec(db->handle_, query_utf8.c_str(), nullptr, nullptr, nullptr);
  if (r != SQLITE_OK) {
    return db->ThrowSqliteError(env, r);
  }
  return Napi::Value();
}

Napi::Value Database::ThrowSqliteError(Napi::Env env, int error) {
  char buf[1024];

  assert(handle_ != nullptr);
  const char* msg = sqlite3_errmsg(handle_);
  int offset = sqlite3_error_offset(handle_);
  int extended = sqlite3_extended_errcode(handle_);
  if (offset == -1) {
    snprintf(buf, sizeof(buf), "sqlite error(%d): %s", extended, msg);
  } else {
    snprintf(buf, sizeof(buf), "sqlite error(%d): %s, offset: %d", extended,
             msg, offset);
  }

  NAPI_THROW(Napi::Error::New(env, buf), Napi::Value());
}

fts5_api* Database::GetFTS5API(Napi::Env env) {
  sqlite3_stmt* stmt_ = nullptr;

  int r = sqlite3_prepare(handle_, "SELECT fts5(?1)", -1, &stmt_, 0);
  if (r != SQLITE_OK) {
    ThrowSqliteError(env, r);
    return nullptr;
  }

  fts5_api* fts5 = nullptr;
  sqlite3_bind_pointer(stmt_, 1, reinterpret_cast<void*>(&fts5), "fts5_api_ptr",
                       nullptr);
  sqlite3_step(stmt_);
  r = sqlite3_finalize(stmt_);
  if (r != SQLITE_OK) {
    ThrowSqliteError(env, r);
    return nullptr;
  }

  assert(fts5 != nullptr);
  return fts5;
}

std::list<Statement*>::const_iterator Database::TrackStatement(
    Statement* stmt) {
  // Keep database instance alive while any statement is
  self_ref_.Ref();

  statements_.emplace_back(stmt);
  return --statements_.end();
}

void Database::UntrackStatement(std::list<Statement*>::const_iterator iter) {
  self_ref_.Unref();
  statements_.erase(iter);
}

// Statement

Napi::Object Statement::Init(Napi::Env env, Napi::Object exports) {
  exports["statementNew"] = Napi::Function::New(env, &Statement::New);
  exports["statementClose"] = Napi::Function::New(env, &Statement::Close);
  exports["statementRun"] = Napi::Function::New(env, &Statement::Run);
  exports["statementStep"] = Napi::Function::New(env, &Statement::Step);
  return exports;
}

Statement::Statement(Database* db,
                     Napi::Value db_obj,
                     sqlite3_stmt* handle,
                     bool is_persistent,
                     bool is_pluck,
                     bool is_bigint)
    : db_(db),
      handle_(handle),
      is_persistent_(is_persistent),
      is_pluck_(is_pluck),
      is_bigint_(is_bigint) {
  db_iter_ = db_->TrackStatement(this);
}

Statement::~Statement() {
  // Manually closed
  if (handle_ == nullptr) {
    return;
  }

  int r = sqlite3_finalize(handle_);
  if (r != SQLITE_OK) {
    fprintf(stderr, "Cleanup: sqlite3_finalize failure\n");
    abort();
  }
  db_->UntrackStatement(db_iter_);
  db_ = nullptr;
  handle_ = nullptr;
}

Napi::Value Statement::New(const Napi::CallbackInfo& info) {
  auto env = info.Env();

  auto db_external = info[0].As<Napi::External<Database>>();
  auto query = info[1].As<Napi::String>();
  auto is_persistent = info[2].As<Napi::Boolean>();
  auto is_pluck = info[3].As<Napi::Boolean>();
  auto is_bigint = info[4].As<Napi::Boolean>();

  assert(db_external.IsExternal());
  assert(query.IsString());
  assert(is_persistent.IsBoolean());
  assert(is_pluck.IsBoolean());
  assert(is_bigint.IsBoolean());

  auto db = db_external.Data();

  auto utf8 = query.Utf8Value();
  sqlite3_stmt* handle = nullptr;

  const char* tail;
  int r = sqlite3_prepare_v3(db->handle(), utf8.c_str(), utf8.length(),
                             is_persistent ? SQLITE_PREPARE_PERSISTENT : 0,
                             &handle, &tail);
  if (r != SQLITE_OK) {
    return db->ThrowSqliteError(env, r);
  }

  // Verify no further statements
  if (HasTail(tail)) {
    r = sqlite3_finalize(handle);
    if (r == SQLITE_OK) {
      NAPI_THROW(Napi::Error::New(env, "Can't prepare more than one statement"),
                 Napi::Value());
    } else {
      return db->ThrowSqliteError(env, r);
    }
  }

  auto stmt = new Statement(db, db_external, handle, is_persistent, is_pluck,
                            is_bigint);

  return Napi::External<Statement>::New(
      env, stmt, [](Napi::Env env, Statement* stmt) { delete stmt; });
}

Statement* Statement::FromExternal(const Napi::Value& value) {
  auto external = value.As<Napi::External<Statement>>();
  assert(external.IsExternal());

  auto stmt = external.Data();

  if (stmt->handle_ == nullptr) {
    NAPI_THROW(Napi::Error::New(external.Env(), "Statement closed"), nullptr);
  }

  return stmt;
}

Napi::Value Statement::Close(const Napi::CallbackInfo& info) {
  auto env = info.Env();

  auto stmt = FromExternal(info[0]);

  int r = sqlite3_finalize(stmt->handle_);
  if (r != SQLITE_OK) {
    return stmt->db_->ThrowSqliteError(env, r);
  }
  stmt->handle_ = nullptr;
  stmt->db_->UntrackStatement(stmt->db_iter_);
  stmt->db_ = nullptr;
  return Napi::Value();
}

Napi::Value Statement::Run(const Napi::CallbackInfo& info) {
  auto env = info.Env();

  auto stmt = FromExternal(info[0]);
  auto params = info[1];
  auto result = info[2].As<Napi::Array>();

  assert(params.IsObject() || params.IsUndefined());
  assert(result.IsArray());

  if (stmt->handle_ == nullptr) {
    NAPI_THROW(Napi::Error::New(env, "Statement closed"), Napi::Value());
  }

  if (!stmt->BindParams(env, params)) {
    // BindParams threw an exception
    return Napi::Value();
  }

  int total_changes_before = sqlite3_total_changes(stmt->db_->handle());

  int r = sqlite3_step(stmt->handle_);
  stmt->Reset();
  if (r != SQLITE_DONE && r != SQLITE_ROW) {
    return stmt->db_->ThrowSqliteError(env, r);
  }

  int total_changes_after = sqlite3_total_changes(stmt->db_->handle());
  int64_t last_rowid = sqlite3_last_insert_rowid(stmt->db_->handle());

  result[static_cast<uint32_t>(0)] = total_changes_after == total_changes_before
                                         ? 0
                                         : sqlite3_changes(stmt->db_->handle());
  result[static_cast<uint32_t>(1)] = last_rowid;

  return Napi::Value();
}

Napi::Value Statement::Step(const Napi::CallbackInfo& info) {
  auto env = info.Env();

  auto stmt = FromExternal(info[0]);
  auto params = info[1];
  auto cache = info[2];
  auto is_get = info[3].As<Napi::Boolean>();

  // Note: `null` is only allowed in `run` to keep the bound parameters
  assert(params.IsObject() || params.IsUndefined() || params.IsNull());
  assert(cache.IsArray() || cache.IsUndefined());
  assert(is_get.IsBoolean());

  if (stmt->handle_ == nullptr) {
    NAPI_THROW(Napi::Error::New(env, "Statement closed"), Napi::Value());
  }

  if (!stmt->BindParams(env, params)) {
    // BindParams threw an exception
    return Napi::Value();
  }

  int r = sqlite3_step(stmt->handle_);

  if (r == SQLITE_DONE) {
    stmt->Reset();
    return Napi::Value();
  }

  AutoResetStatement _(stmt, is_get.Value());
  if (r != SQLITE_ROW) {
    return stmt->db_->ThrowSqliteError(env, r);
  }

  int column_count = sqlite3_column_count(stmt->handle_);

  if (stmt->is_pluck_) {
    if (column_count != 1) {
      NAPI_THROW(Napi::Error::New(env, "Invalid column count for pluck"),
                 Napi::Value());
    }

    auto result = stmt->GetColumnValue(env, 0);
    return result;
  }

  if (!stmt->is_persistent_) {
    auto result = Napi::Object::New(env);
    for (int i = 0; i < column_count; i++) {
      result[sqlite3_column_name(stmt->handle_, i)] =
          stmt->GetColumnValue(env, i);
    }
    return result;
  }

  // Track when the statement gets recompiled due to a schema change. When it
  // happens - we need to invalidate the cached JS wrapper function that
  // translates an array of column names and values into a JS object.
  auto recompiled =
      sqlite3_stmt_status(stmt->handle_, SQLITE_STMTSTATUS_REPREPARE, 1);

  Napi::Array result;
  if (recompiled || cache.IsUndefined()) {
    result = Napi::Array::New(env, 2 * column_count);
    for (int i = 0; i < column_count; i++) {
      result[i] = sqlite3_column_name(stmt->handle_, i);
    }
  } else {
    result = cache.As<Napi::Array>();
  }

  for (int i = 0; i < column_count; i++) {
    result[column_count + i] = stmt->GetColumnValue(env, i);
  }

  return result;
}

bool Statement::BindParams(Napi::Env env, Napi::Value params) {
  char buf[1024];

  int key_count = sqlite3_bind_parameter_count(handle_);

  if (params.IsNull()) {
    // .all() only binds the first params
  } else if (params.IsUndefined()) {
    if (key_count == 0) {
      return true;
    }

    snprintf(buf, sizeof(buf), "Expected %d parameters, got 0", key_count);
    NAPI_THROW(Napi::Error::New(env, buf), false);
  } else if (params.IsArray()) {
    auto list = params.As<Napi::Array>();
    auto list_len = static_cast<int>(list.Length());
    if (list_len != key_count) {
      snprintf(buf, sizeof(buf), "Expected %d parameters, got %d", key_count,
               list_len);
      NAPI_THROW(Napi::Error::New(env, buf), false);
    }

    for (int i = 1; i <= list_len; i++) {
      auto name = sqlite3_bind_parameter_name(handle_, i);
      if (name != nullptr) {
        snprintf(buf, sizeof(buf), "Unexpected named param %s at %d", name, i);
        NAPI_THROW(Napi::Error::New(env, buf), false);
      }

      auto error = BindParam(env, i, list[i - 1]);
      if (error != nullptr) {
        snprintf(buf, sizeof(buf), "Failed to bind param %d, error %s", i,
                 error);
        NAPI_THROW(Napi::Error::New(env, buf), false);
      }
    }
  } else {
    auto obj = params.As<Napi::Object>();

    for (int i = 1; i <= key_count; i++) {
      auto name = sqlite3_bind_parameter_name(handle_, i);
      if (name == nullptr) {
        snprintf(buf, sizeof(buf), "Unexpected anonymous param at %d", i);
        NAPI_THROW(Napi::Error::New(env, buf), false);
      }

      // Skip "$"
      name = name + 1;
      auto value = obj[name];
      auto error = BindParam(env, i, value);
      if (error != nullptr) {
        snprintf(buf, sizeof(buf), "Failed to bind param %s, error %s", name,
                 error);
        NAPI_THROW(Napi::Error::New(env, buf), false);
      }
    }
  }
  return true;
}

const char* Statement::BindParam(Napi::Env env, int column, Napi::Value param) {
  int r;
  switch (param.Type()) {
    case napi_null:
      r = sqlite3_bind_null(handle_, column);
      break;
    case napi_number:
      r = sqlite3_bind_double(handle_, column,
                              param.As<Napi::Number>().DoubleValue());
      break;
    case napi_string: {
      auto val = napi_value(param.As<Napi::String>());

      size_t length;
      napi_status status =
          napi_get_value_string_utf8(env, val, nullptr, 0, &length);
      if (status != napi_ok) {
        return "failed to get string length";
      }

      char* data = new char[length + 1];
      status = napi_get_value_string_utf8(env, val, data, length + 1, nullptr);
      if (status != napi_ok) {
        delete[] data;
        return "failed to copy string data";
      }

      r = sqlite3_bind_text(handle_, column, data, length, DestroyString);
      break;
    }
    case napi_bigint: {
      bool lossless;
      auto value = param.As<Napi::BigInt>().Int64Value(&lossless);
      if (!lossless) {
        return "failed to convert bigint to int64";
      }
      r = sqlite3_bind_int64(handle_, column, value);
      break;
    }
    case napi_object:
      if (param.IsTypedArray()) {
        auto val = param.As<Napi::TypedArray>();

        auto data = val.ArrayBuffer();
        const uint8_t* view = reinterpret_cast<const uint8_t*>(data.Data());

        r = sqlite3_bind_blob(handle_, column, view + val.ByteOffset(),
                              val.ByteLength(), SQLITE_TRANSIENT);
        break;
      } else {
        return "unexpected type `object`";
      }
    case napi_boolean:
      return "unexpected type `boolean`";
    case napi_external:
      return "unexpected type `external`";
    case napi_function:
      return "unexpected type `function`";
    case napi_undefined:
      return "unexpected type `undefined`";
    case napi_symbol:
      return "unexpected type `symbol`";
    default:
      return "unknown parameter type";
  }
  if (r != SQLITE_OK) {
    return sqlite3_errmsg(db_->handle());
  }
  return nullptr;
}

void Statement::DestroyString(void* param) {
  delete[] reinterpret_cast<char*>(param);
}

Napi::Value Statement::GetColumnValue(Napi::Env env, int column) {
  int type = sqlite3_column_type(handle_, column);
  switch (type) {
    case SQLITE_INTEGER: {
      auto val = sqlite3_column_int64(handle_, column);
      if (is_bigint_) {
        return Napi::BigInt::New(env, static_cast<int64_t>(val));
      }
      if (static_cast<int64_t>(INT32_MIN) <= val &&
          val <= static_cast<int64_t>(INT32_MAX)) {
        napi_value n_value;
        NAPI_THROW_IF_FAILED(
            env, napi_create_int32(env, static_cast<int32_t>(val), &n_value),
            Napi::Value());
        return Napi::Value(env, n_value);
      } else {
        return Napi::Number::New(env, val);
      }
    }
    case SQLITE_TEXT:
      return Napi::String::New(
          env,
          reinterpret_cast<const char*>(sqlite3_column_text(handle_, column)),
          sqlite3_column_bytes(handle_, column));
    case SQLITE_FLOAT:
      return Napi::Number::New(env, sqlite3_column_double(handle_, column));
    case SQLITE_BLOB:
      return Napi::Buffer<uint8_t>::Copy(
          env,
          reinterpret_cast<const uint8_t*>(
              sqlite3_column_blob(handle_, column)),
          sqlite3_column_bytes(handle_, column));
    case SQLITE_NULL:
      return env.Null();
  }
  return Napi::Value();
}

AutoResetStatement::~AutoResetStatement() {
  if (enabled_) {
    stmt_->Reset();
  }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  sqlite3_initialize();

  Database::Init(env, exports);
  Statement::Init(env, exports);
  exports["signalTokenize"] = Napi::Function::New(env, &SignalTokenize);
  return exports;
}

NODE_API_MODULE(node_sqlcipher, Init)
