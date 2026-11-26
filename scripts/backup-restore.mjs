import { beginRestoreTransaction } from "./backup-safety.mjs";

const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const tableName = (name) => `"public".${quote(name)}`;

function deserialize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.__bytea === "string") return Buffer.from(value.__bytea, "base64");
    if (typeof value.__json === "string") return value.__json;
  }
  return value;
}

export function planSnapshotRestore(tables, foreignKeys, primaryKeys) {
  const populated = tables.filter((table) => table.rows.length > 0);
  const names = new Set(populated.map((table) => table.name));
  const dependencies = new Map([...names].map((name) => [name, new Set()]));
  const deferred = new Map();
  for (const foreignKey of foreignKeys) {
    if (!names.has(foreignKey.child)) continue;
    if (foreignKey.nullable) {
      if (!deferred.has(foreignKey.child)) deferred.set(foreignKey.child, new Set());
      for (const column of foreignKey.columns) deferred.get(foreignKey.child).add(column);
    } else if (names.has(foreignKey.parent)) {
      dependencies.get(foreignKey.child).add(foreignKey.parent);
    }
  }
  for (const table of populated) {
    const columns = deferred.get(table.name);
    if (!columns?.size) continue;
    const keys = primaryKeys.get(table.name);
    if (!keys?.length || keys.some((key) => !table.columns.includes(key)) ||
        [...columns].some((column) => !table.columns.includes(column))) {
      throw new Error(`Cannot restore nullable foreign keys without complete columns and primary key: ${table.name}`);
    }
  }
  const remaining = new Set(names);
  const order = [];
  while (remaining.size) {
    const ready = [...remaining].filter((name) => [...dependencies.get(name)].every((parent) => !remaining.has(parent)));
    if (!ready.length) throw new Error(`Non-nullable foreign-key cycle prevents restore: ${[...remaining].join(", ")}`);
    for (const name of ready.sort()) {
      order.push(name);
      remaining.delete(name);
    }
  }
  return { order, deferred, primaryKeys };
}

async function readRestorePlan(client, tables) {
  const foreignKeys = await client.query(`
    SELECT child.relname AS child, parent.relname AS parent,
      array_agg(attribute.attname::text ORDER BY key.ordinality) AS columns,
      bool_and(NOT attribute.attnotnull) AS nullable
    FROM pg_constraint constraint_info
    JOIN pg_class child ON child.oid = constraint_info.conrelid
    JOIN pg_namespace namespace ON namespace.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = constraint_info.confrelid
    JOIN LATERAL unnest(constraint_info.conkey) WITH ORDINALITY AS key(attnum, ordinality) ON true
    JOIN pg_attribute attribute ON attribute.attrelid = child.oid AND attribute.attnum = key.attnum
    WHERE constraint_info.contype = 'f' AND namespace.nspname = 'public'
    GROUP BY constraint_info.oid, child.relname, parent.relname`);
  const primaryKeys = await client.query(`
    SELECT table_info.relname AS name, array_agg(attribute.attname::text ORDER BY key.ordinality) AS columns
    FROM pg_constraint constraint_info
    JOIN pg_class table_info ON table_info.oid = constraint_info.conrelid
    JOIN pg_namespace namespace ON namespace.oid = table_info.relnamespace
    JOIN LATERAL unnest(constraint_info.conkey) WITH ORDINALITY AS key(attnum, ordinality) ON true
    JOIN pg_attribute attribute ON attribute.attrelid = table_info.oid AND attribute.attnum = key.attnum
    WHERE constraint_info.contype = 'p' AND namespace.nspname = 'public'
    GROUP BY constraint_info.oid, table_info.relname`);
  return planSnapshotRestore(tables, foreignKeys.rows, new Map(primaryKeys.rows.map((key) => [key.name, key.columns])));
}

export async function restoreSnapshot(client, snapshot) {
  const replica = await beginRestoreTransaction(client);
  try {
    const tables = snapshot.tables;
    if (tables.length) {
      await client.query(`LOCK TABLE ${tables.map((table) => tableName(table.name)).sort().join(", ")} IN SHARE ROW EXCLUSIVE MODE`);
    }
    for (const table of tables) {
      const result = await client.query(`SELECT count(*)::int AS n FROM ${tableName(table.name)}`);
      if (result.rows[0].n > 0) throw new Error(`Target table is not empty; refusing to overwrite: ${table.name}`);
    }
    const plan = replica
      ? { order: tables.map((table) => table.name), deferred: new Map(), primaryKeys: new Map() }
      : await readRestorePlan(client, tables);
    const byName = new Map(tables.map((table) => [table.name, table]));
    let inserted = 0;
    for (const name of plan.order) {
      const table = byName.get(name);
      const deferred = plan.deferred.get(name);
      const columns = table.columns.map(quote).join(", ");
      const placeholders = table.columns.map((_, index) => `$${index + 1}`).join(", ");
      for (const row of table.rows) {
        const values = table.columns.map((column) => deferred?.has(column) ? null : deserialize(row[column]));
        await client.query(`INSERT INTO ${tableName(name)} (${columns}) VALUES (${placeholders})`, values);
        inserted++;
      }
    }
    // Nullable foreign keys are restored after every referenced row exists, including self references.
    for (const [name, deferred] of plan.deferred) {
      const table = byName.get(name);
      const columns = [...deferred];
      const keys = plan.primaryKeys.get(name);
      const assignments = columns.map((column, index) => `${quote(column)} = $${index + 1}`).join(", ");
      const where = keys.map((key, index) => `${quote(key)} = $${columns.length + index + 1}`).join(" AND ");
      for (const row of table.rows) {
        if (columns.every((column) => row[column] === null || row[column] === undefined)) continue;
        const values = [...columns, ...keys].map((column) => deserialize(row[column]));
        const result = await client.query(`UPDATE ${tableName(name)} SET ${assignments} WHERE ${where}`, values);
        if (result.rowCount !== 1) throw new Error(`Cannot identify a restored row in ${name}`);
      }
    }
    await client.query("COMMIT");
    return inserted;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    if (replica) await client.query("SET session_replication_role = DEFAULT").catch(() => undefined);
  }
}
