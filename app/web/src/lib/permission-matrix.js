import { requireSavedRow } from './save-receipt.js';

function validateSnapshot(data, role) {
  if (!data || data.role !== role || !/^[a-f0-9]{32}$/.test(data.revision || '') ||
      !['permissions', 'visibility', 'nav', 'roles'].every(key => Array.isArray(data[key]))) {
    throw new Error('The permission snapshot is incomplete. Reload before editing.');
  }
  return data;
}

export async function readPermissionMatrix(client, role) {
  const { data, error } = await client.rpc('f_permission_matrix', { p_role: role });
  if (error) throw error;
  return validateSnapshot(data, role);
}

export async function savePermissionMatrix(client, role, revision, pages) {
  if (!revision || !pages.length) throw new Error('Load permissions and make a change before saving.');
  const { data, error } = await client.rpc('f_save_permission_matrix', { p_role: role, p_revision: revision, p_pages: pages });
  if (error) throw error;
  const snapshot = validateSnapshot(data, role);
  if (snapshot.saved_count !== pages.length) throw new Error('The server did not confirm every permission change. Reload before retrying.');
  for (const { menu, ...page } of pages) {
    requireSavedRow({ data: snapshot.permissions.find(row => row.view_key === page.view_key) }, { role, ...page }, 'Page permissions');
    requireSavedRow({ data: snapshot.visibility.find(row => row.view_key === page.view_key) }, { role, view_key: page.view_key, visible: menu }, 'Menu visibility');
  }
  return snapshot;
}
