export function readOnlySql(sql) {
  const text = String(sql || "").trim();
  if (!text) return false;
  /* Approval is narrower than PostgreSQL's read-only transaction. Strip text
     that cannot carry syntax, then reject write verbs anywhere—not merely as
     the first token—so data-modifying CTEs and EXPLAIN ANALYZE DML are never
     labelled safe. The database reader role and BEGIN READ ONLY remain the
     second and third controls. */
  const syntax = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*(?:\n|$)/g, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""')
    .trim();
  if (/\$[a-z0-9_]*\$/i.test(syntax)) return false;
  const withoutTrailing = syntax.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) return false;
  if (!/^(select|with|show|explain)\b/i.test(withoutTrailing)) return false;
  if (/\b(insert|update|delete|merge|call|copy|do|alter|create|drop|truncate|grant|revoke|refresh|vacuum|analyze|execute|prepare|deallocate|lock|listen|notify|reindex|cluster|security|set|reset)\b/i.test(withoutTrailing)) return false;
  if (/\b(pg_sleep|pg_terminate_backend|pg_cancel_backend|set_config|dblink|lo_import|lo_export|pg_read_file|pg_write_file)\s*\(/i.test(withoutTrailing)) return false;
  return true;
}
