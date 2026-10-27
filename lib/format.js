const ENGINE = { oracle: 'Oracle', postgres: 'PostgreSQL' };

export function dbLabel(d) {
  return `${ENGINE[d.engine] ?? d.engine} ${d.version}`.trim();
}

// Etykiety baz, do których przypisany jest moduł (kolejność jak w client.databases).
export function moduleDbLabels(client, cm) {
  return client.databases.filter((d) => cm.database_ids.includes(d.id)).map(dbLabel);
}
