// Czysta funkcja: które sekcje karty klienta zmieniły się po zapisie (bez DOM — testowana w Node).
// Porównanie po treści, nie po id client_module (zapis „zastąp zestaw” nadaje nowe).

const text = (v) => String(v ?? '').trim();

function dbKey(db) {
  return `${text(db.engine)}|${text(db.version)}|${text(db.label)}`;
}

/** Zbiór (posortowana tablica) unikalnych kluczy — do porównania jako zbiór. */
function setOf(keys) {
  return [...new Set(keys)].sort();
}

function sameSet(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function databaseSet(client) {
  return setOf((client.databases ?? []).map(dbKey));
}

// Bazy modułu po id client_database: id baz są stabilne (saveClient aktualizuje istniejące
// bazy w miejscu), więc zmiana wersji bazy nie jest zmianą przypisania modułu.
function moduleSet(client) {
  return setOf((client.modules ?? []).map((cm) => {
    const dbs = setOf((cm.database_ids ?? []).map(String));
    return `${text(cm.module?.code)}@${dbs.join(',')}`;
  }));
}

function featureSet(client) {
  return setOf((client.modules ?? []).flatMap((cm) =>
    (cm.features ?? []).map((f) => `${text(cm.module?.code)}:${f.id ?? text(f.name)}`)));
}

/**
 * @returns {{event: 'created'|'updated', sections: string[]}}
 * sections ⊆ ['details', 'databases', 'modules', 'features'] w tej kolejności.
 */
export function changedSections(before, after) {
  if (before == null) return { event: 'created', sections: [] };
  const sections = [];
  if (text(before.name) !== text(after.name) || text(before.notes) !== text(after.notes)) {
    sections.push('details');
  }
  if (!sameSet(databaseSet(before), databaseSet(after))) sections.push('databases');
  if (!sameSet(moduleSet(before), moduleSet(after))) sections.push('modules');
  if (!sameSet(featureSet(before), featureSet(after))) sections.push('features');
  return { event: 'updated', sections };
}
