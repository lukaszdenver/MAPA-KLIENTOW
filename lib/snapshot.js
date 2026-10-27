import { dbLabel, moduleDbLabels } from './format.js';

export function buildSnapshot(clients) {
  return clients.map((c) => {
    const dbs = c.databases.map(dbLabel).join('; ') || 'brak';
    const mods = c.modules.map((cm) => {
      let s = `${cm.module.code}(${moduleDbLabels(c, cm).join(', ')})`;
      if (cm.features.length) s += `{funkcje: ${cm.features.map((f) => f.name).join(', ')}}`;
      return s;
    }).join('; ') || 'brak';
    return `Klient: ${c.name} | Bazy: ${dbs} | Moduły: ${mods}`;
  }).join('\n');
}
