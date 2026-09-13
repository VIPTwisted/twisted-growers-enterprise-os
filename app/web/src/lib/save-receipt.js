function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

// A successful HTTP response is not evidence that a row was written.
export function requireSavedRow({ data, error }, expected, label = 'Change') {
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label} was not confirmed by the server. No saved row was returned; reload before retrying.`);
  }
  for (const [key, value] of Object.entries(expected)) {
    if (!sameValue(data[key], value)) {
      throw new Error(`${label} was not confirmed by the server. The returned ${key} differs; reload before retrying.`);
    }
  }
  return data;
}

export async function upsertConfirmed(client, table, payload, options) {
  // updated_at may be replaced by a database trigger; user-controlled values must match.
  const expected = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'updated_at'));
  try {
    const result = await client.from(table).upsert(payload, options)
      .select(Object.keys(expected).join(',')).single();
    return { data: requireSavedRow(result, expected, 'Save'), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

// Serializes only this client's writes. Database authorization remains authoritative.
export function createSaveQueue() {
  let tail = Promise.resolve();
  return (operation) => {
    const pending = tail.then(operation, operation);
    tail = pending.catch(() => undefined);
    return pending;
  };
}
