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

  static inline bool HasTail(const char* tail) {
    for (; *tail != 0; tail++) {
      switch (*tail) {
        // Various whitespace
        case '\t':  // 0x09
        case '\r':  // 0x0a
        case '\v':  // 0x0b
        case '\f':  // 0x0c
        case '\n':  // 0x0d
        case ' ':

        // Statement separator
        case ';':
          break;

        // Line comment
        case '-':
          tail++;
          if (*tail != '-') {
            return true;
          }

          tail = strchr(tail, '\n');
          if (tail == nullptr) {
            return false;
          }

          break;

        // Block comment
        case '/':
          tail++;
          if (*tail != '*') {
            return true;
          }

          // Look for closing '*/'
          while (true) {
            tail = strchr(tail, '*');
            if (tail == nullptr) {
              return false;
            }

            tail++;
            const char next = *tail;
            if (next == 0) {
              return false;
            }
            if (next == '/') {
              tail++;
              break;
            }
          }
        default:
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

  bool BindParams(Napi::Env env, Napi::Value params);

  const char* BindParam(Napi::Env env, int column, Napi::Value param);

  static void DestroyString(void* param);

  Napi::Value GetColumnValue(Napi::Env env, int column);

  Database* db_;
  sqlite3_stmt* handle_;
  bool is_persistent_;
  bool is_pluck_;
  bool is_bigint_;
  std::list<Statement*>::const_iterator db_iter_;

  friend class Database;
};

#endif  // SRC_ADDON_H_
