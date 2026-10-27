import { dbLabel, moduleDbLabels } from './format.js';

const SECTION_LABELS = {
  databases: 'Bazy danych',
  modules: 'Moduły',
  features: 'Funkcje płatne',
  details: 'Dane podstawowe',
};

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stateLines(client) {
  const dbs = client.databases.map(dbLabel);
  const mods = client.modules.map((cm) => {
    const dbPart = moduleDbLabels(client, cm);
    let line = `${cm.module.code} – ${cm.module.name}`;
    if (dbPart.length) line += ` [${dbPart.join(', ')}]`;
    if (cm.features.length) line += `: funkcje: ${cm.features.map((f) => f.name).join(', ')}`;
    return line;
  });
  return { dbs, mods };
}

export function buildChangeEmail({ event, sections, client }) {
  const subject = (event === 'created' ? 'Nowy klient: ' : 'Zmiana u klienta: ') + client.name;
  const changed = (sections ?? []).map((s) => SECTION_LABELS[s]).filter(Boolean);
  const { dbs, mods } = stateLines(client);

  const textParts = [subject, ''];
  if (changed.length) textParts.push(`Zmienione sekcje: ${changed.join(', ')}`, '');
  textParts.push('Aktualny stan:', '', 'Bazy danych:');
  textParts.push(...(dbs.length ? dbs.map((d) => `- ${d}`) : ['- brak']));
  textParts.push('', 'Moduły:');
  textParts.push(...(mods.length ? mods.map((m) => `- ${m}`) : ['- brak']));
  const text = textParts.join('\n');

  const li = (arr) => (arr.length ? arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('') : '<li>brak</li>');
  const html = [
    `<h2>${escapeHtml(subject)}</h2>`,
    changed.length ? `<p>Zmienione sekcje: <b>${escapeHtml(changed.join(', '))}</b></p>` : '',
    '<h3>Aktualny stan</h3>',
    `<p><b>Bazy danych</b></p><ul>${li(dbs)}</ul>`,
    `<p><b>Moduły</b></p><ul>${li(mods)}</ul>`,
  ].join('');

  return { subject, text, html };
}

export function buildWaitlistEmail({ email }) {
  return {
    subject: `Nowa prośba o konto: ${email}`,
    text: `Użytkownik ${email} poprosił o dostęp do aplikacji Mapa Klientów.\n\nAby przyznać dostęp, zaakceptuj prośbę w panelu Clerk → Waitlist.`,
  };
}
