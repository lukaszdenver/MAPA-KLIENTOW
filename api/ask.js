import Anthropic from '@anthropic-ai/sdk';
import { HttpError, sendError } from '../lib/http.js';
import { verifyRequest } from '../lib/auth.js';
import { validateQuestion } from '../lib/validate.js';
import { getAdminClient } from '../lib/supabaseAdmin.js';
import { fetchAllClients } from '../lib/data.js';
import { buildSnapshot } from '../lib/snapshot.js';

const SYSTEM_PROMPT =
  'Jesteś asystentem aplikacji Mapa Klientów. Odpowiadasz po polsku, zwięźle, wyłącznie na podstawie danych poniżej. ' +
  'Jeśli danych brak — powiedz to. Nie wymyślaj klientów.';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Metoda niedozwolona');
    await verifyRequest(req);
    const question = validateQuestion(req.body?.question);

    const clients = await fetchAllClients(getAdminClient());
    const system = `${SYSTEM_PROMPT}\n\n${buildSnapshot(clients)}`;

    let answer;
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-5-5',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: question }],
      });
      answer = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    } catch (e) {
      console.error(e);
      throw new HttpError(502, 'Asystent AI jest chwilowo niedostępny');
    }
    res.status(200).json({ answer });
  } catch (err) {
    sendError(res, err);
  }
}
