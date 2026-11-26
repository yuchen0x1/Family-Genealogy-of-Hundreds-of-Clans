export function parseBackupKeep(value) {
  if (value === undefined) return 7;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("BACKUP_KEEP must be a positive safe integer");
  }
  return Number(value);
}

export async function beginRestoreTransaction(client) {
  let replica = false;
  try {
    // Probe privileges before BEGIN: permission failures abort an active transaction.
    await client.query("SET session_replication_role = replica");
    replica = true;
  } catch (error) {
    if (error?.code !== "42501") throw error;
  }
  try {
    await client.query("BEGIN");
  } catch (error) {
    if (replica) await client.query("SET session_replication_role = DEFAULT").catch(() => undefined);
    throw error;
  }
  return replica;
}
