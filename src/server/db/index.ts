import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";

import { env } from "@/env.mjs";

import * as schema from "./schema";

let _connection: Pool | null = null;
let _db: MySql2Database<typeof schema> | null = null;

function getConnection(): Pool {
  if (!_connection) {
    _connection = mysql.createPool({
      uri: env.DATABASE_URL,
      connectionLimit: 20,
    });
  }
  return _connection;
}

function getDb(): MySql2Database<typeof schema> {
  if (!_db) {
    _db = drizzle(getConnection(), { schema, mode: "default" });
  }
  return _db;
}

export const connection = new Proxy({} as Pool, {
  get(_, prop) {
    const instance = getConnection();
    const value = instance[prop as keyof Pool];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

export const db = new Proxy({} as MySql2Database<typeof schema>, {
  get(_, prop) {
    const instance = getDb();
    const value = instance[prop as keyof MySql2Database<typeof schema>];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});
