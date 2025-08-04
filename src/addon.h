// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

#ifndef SRC_ADDON_H_

#include <list>

#include "napi.h"
#include "sqlite3.h"

class Statement;

class Database {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  Napi::Value ThrowSqliteError(Napi::Env env, int error);

  std::list<Statement*>::const_iterator TrackStatement(Statement* stmt);
  void UntrackStatement(std::list<Statement*>::const_iterator);

  inline sqlite3* handle() { return handle_; }

 protected:
  Database(Napi::Env env, sqlite3* handle);
  ~Database();

  static Database* FromExternal(const Napi::Value value);
  static Napi::Value Open(const Napi::CallbackInfo& info);
  static Napi::Value InitTokenizer(const Napi::CallbackInfo& info);
  static Napi::Value Close(const Napi::CallbackInfo& info);
  static Napi::Value Exec(const Napi::CallbackInfo& info);

  fts5_api* GetFTS5API(Napi::Env env);

  sqlite3* handle_;

  // A reference to the `external` object. Initially only a weak reference, it
  // gets it's ref count incremented on every `TrackStatement` call (new
  // statement creation) and decremented on every `UntrackStatement` (statement
  // close or GC/destructor).
  Napi::Reference<Napi::External<Database>> self_ref_;

  // All currently open statements for this database. Used to close all open
  // statements when closing the database.
  std::list<Statement*> statements_;
};

class AutoResetStatement {
 public:
  AutoResetStatement(Statement* stmt, bool enabled)
      : stmt_(stmt), enabled_(enabled) {}

  ~AutoResetStatement();

  // Force reset statement now and clear `enabled_`
  void Reset();

 private:
  Statement* stmt_;
  bool enabled_;
};

class Statement {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);

  Statement(Database* db,
            Napi::Value db_obj,
            sqlite3_stmt* handle,
            bool is_persistent,
            bool is_pluck,
            bool is_bigint);

  ~Statement();

  inline void Reset() {
    sqlite3_reset(handle_);
    sqlite3_clear_bindings(handle_);
  }

  // Check if the remainder of the SQL query string has any additional
  // statements.
  //
  // If return value `false` - only whitespace and comments remain.
  //
  // Note: we use `rfind(..., 0)` for effectively a prefix check.
  static inline bool HasTail(std::string const& tail) {
    std::string p(tail);
    while (!p.empty()) {
      auto ch = p.front();
      // Various whitespace or statement separator
      if (std::isspace(ch) || ch == ';') {
        p = p.substr(1);

      } else if (p.rfind("--", 0) == 0) {
        // Line comment: "--"
        p = p.substr(2);

        // Skip until the end of the line
        auto end = p.find("\n");
        if (end == p.npos) {
          return false;
        }

        p = p.substr(end + 1);

      } else if (p.rfind("/*", 0) == 0) {
        // Block comment
        p = p.substr(2);

        auto end = p.find("*/");
        if (end == p.npos) {
          return false;
        }

        p = p.substr(end + 2);
      } else {
        // Not whitespace or comments
        return true;
      }
    }
    return false;
  }

  Napi::Value Finalize(Napi::Env env);

 protected:
  static Napi::Value New(const Napi::CallbackInfo& info);
  static Statement* FromExternal(const Napi::Value& value);
  static Napi::Value Close(const Napi::CallbackInfo& info);
  static Napi::Value Run(const Napi::CallbackInfo& info);
  static Napi::Value Step(const Napi::CallbackInfo& info);
  static Napi::Value ScanStats(const Napi::CallbackInfo& info);

  bool BindParams(Napi::Env env, Napi::Value params);

  const char* BindParam(Napi::Env env, int column, Napi::Value param);

  static void DestroyString(void* param);

  Napi::Value GetColumnValue(Napi::Env env, int column);

  Database* db_;
  sqlite3_stmt* handle_;

  // If `true` - `Step()` uses provided cache array and returns raw column names
  // and values instead of constructing JS objects in C++.
  bool is_persistent_;

  // If `true` - `Step()` returns the first column value instead of full row.
  bool is_pluck_;

  // If `true` - `Step()` returns BigInt instance for all INTEGER column values
  bool is_bigint_;

  // Iterator into the Database's `statements_` `std::list`. Used for untracking
  // the statement.
  std::list<Statement*>::const_iterator db_iter_;

  friend class Database;
};

#endif  // SRC_ADDON_H_
