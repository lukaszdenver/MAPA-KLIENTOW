import { Webhook } from 'svix';
import { HttpError, sendError } from '../lib/http.js';
import { buildWaitlistEmail } from '../lib/emails.js';
import { sendMail } from '../lib/mailer.js';

// Svix wymaga surowego body — wyłączamy parser Vercela i czytamy strumień.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return sendError(res, new HttpError(500, 'Brak konfiguracji webhooka'));
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Metoda niedozwolona');
    const raw = await readRawBody(req);

    let event;
    try {
      event = new Webhook(secret).verify(raw, {
        'svix-id': req.headers['svix-id'],
        'svix-timestamp': req.headers['svix-timestamp'],
        'svix-signature': req.headers['svix-signature'],
      });
    } catch {
      throw new HttpError(400, 'Nieprawidłowy podpis');
    }

    if (event.type === 'waitlistEntry.created') {
      if (!process.env.ADMIN_EMAIL) {
        console.warn('clerk-webhook: brak ADMIN_EMAIL — pomijam wysyłkę e-maila.');
        return res.status(200).json({ ok: true });
      }
      const email = event.data?.email_address ?? 'nieznany';
      const { subject, text } = buildWaitlistEmail({ email });
      await sendMail({ to: [process.env.ADMIN_EMAIL], subject, text });
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
}
