const CLIENT_SELECT = `
  id, name, notes,
  client_databases ( id, engine, version, label ),
  client_modules (
    id,
    modules ( id, code, name ),
    client_module_databases ( client_database_id ),
    client_module_features ( paid_features ( id, name ) )
  )
`;

// Czysta funkcja: wiersz z zagnieżdżonego selecta -> wspólny kształt Client.
export function mapClientRow(row) {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes ?? '',
    databases: (row.client_databases ?? []).map((d) => ({
      id: d.id, engine: d.engine, version: d.version, label: d.label ?? '',
    })),
    modules: (row.client_modules ?? []).map((cm) => ({
      id: cm.id,
      module: { id: cm.modules.id, code: cm.modules.code, name: cm.modules.name },
      database_ids: (cm.client_module_databases ?? []).map((x) => x.client_database_id),
      features: (cm.client_module_features ?? [])
        .filter((f) => f.paid_features)
        .map((f) => ({ id: f.paid_features.id, name: f.paid_features.name })),
    })),
  };
}

export async function fetchClient(sb, id) {
  const { data, error } = await sb.from('clients').select(CLIENT_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapClientRow(data) : null;
}

export async function fetchAllClients(sb) {
  const { data, error } = await sb.from('clients').select(CLIENT_SELECT).order('name');
  if (error) throw error;
  return (data ?? []).map(mapClientRow);
}

export async function fetchRecipients(sb) {
  const { data, error } = await sb
    .from('user_prefs').select('email').eq('notify_changes', true).not('email', 'is', null);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.email).filter(Boolean))];
}
