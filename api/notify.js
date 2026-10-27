import { HttpError, sendError } from '../lib/http.js';
import { verifyRequest, assertAdmin } from '../lib/auth.js';
import { validateNotify } from '../lib/validate.js';
import { getAdminClient } from '../lib/supabaseAdmin.js';
import { fetchClient, fetchRecipients } from '../lib/data.js';
import { buildChangeEmail } from '../lib/emails.js';
import { sendMail } from '../lib/mailer.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Metoda niedozwolona');
    const user = await verifyRequest(req);
    assertAdmin(user);
    const { clientId, event, sections } = validateNotify(req.body);

    const sb = getAdminClient();
    const client = await fetchClient(sb, clientId);
    if (!client) throw new HttpError(404, 'Nie znaleziono klienta');

    const to = await fetchRecipients(sb);
    const { subject, text, html } = buildChangeEmail({ event, sections, client });
    const sent = await sendMail({ to, subject, text, html });
    res.status(200).json({ sent });
  } catch (err) {
    sendError(res, err);
  }
}
