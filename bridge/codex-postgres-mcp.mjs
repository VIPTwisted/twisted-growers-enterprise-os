#!/usr/bin/env node
/* Read-only TG OS MCP for subscription-authenticated Codex.

   The connection remains in the repository's gitignored .mcp.json. Codex's
   global MCP configuration contains only this script path and TG_PROJECT, never
   the URI. Every statement runs inside a READ ONLY transaction as the existing
   tg_desktop_reader role, with an eight-second statement timeout. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { readOnlySql } from "./read-only-sql.mjs";

export { readOnlySql } from "./read-only-sql.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = process.env.TG_PROJECT || path.resolve(HERE, "..");
const CONFIG = path.join(PROJECT, ".mcp.json");
const ROW_LIMIT = 2000;

function connectionString() {
  if (!existsSync(CONFIG)) throw new Error(`The gitignored TG OS MCP configuration is missing at ${CONFIG}.`);
  const raw = JSON.parse(readFileSync(CONFIG, "utf8"));
  const value = raw?.mcpServers?.["twisted-growers"]?.args?.[0];
  if (!value || !/^postgres(?:ql)?:\/\//i.test(value)) {
    throw new Error("The TG OS MCP configuration carries no PostgreSQL connection.");
  }
  if (/sslmode=/.test(value)) {
    return value.replace(/(?:uselibpqcompat=true&)?sslmode=[a-z-]+/, "uselibpqcompat=true&sslmode=require");
  }
  return value + (value.includes("?") ? "&" : "?") + "uselibpqcompat=true&sslmode=require";
}

let pool;
function databasePool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: connectionString(),
      ssl: { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

const server = new McpServer({ name: "twisted-growers-read-only", version: "1.0.0" });

server.registerTool("query", {
  title: "Query TG OS (read only)",
  description: "Run one read-only SELECT, WITH, SHOW, or EXPLAIN against the permitted TG OS Supabase mirror. Writes are refused by both this tool and the database role.",
  inputSchema: {
    sql: z.string().min(1).max(100000).describe("One read-only PostgreSQL statement"),
  },
}, async ({ sql }) => {
  if (!readOnlySql(sql)) {
    return { isError: true, content: [{ type: "text", text: "Refused: one read-only SELECT, WITH, SHOW, or EXPLAIN statement is required." }] };
  }

  const client = await databasePool().connect();
  try {
    await client.query("begin read only");
    await client.query("set local statement_timeout = '8000ms'");
    const result = await client.query(sql);
    await client.query("rollback");
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const body = {
      columns: (result.fields || []).map((f) => f.name),
      row_count: result.rowCount ?? rows.length,
      returned: Math.min(rows.length, ROW_LIMIT),
      truncated: rows.length > ROW_LIMIT,
      rows: rows.slice(0, ROW_LIMIT),
    };
    return { content: [{ type: "text", text: JSON.stringify(body, (_k, v) => typeof v === "bigint" ? v.toString() : v) }] };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return { isError: true, content: [{ type: "text", text: `Read-only query failed: ${String(e?.message || e).slice(0, 1200)}` }] };
  } finally {
    client.release();
  }
});

async function main() {
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`TG OS read-only MCP failed: ${String(e?.message || e).slice(0, 400)}`);
    process.exit(1);
  });
}
