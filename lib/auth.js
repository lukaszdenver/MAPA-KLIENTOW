import { verifyToken } from '@clerk/backend';
import { HttpError } from './http.js';

export async function verifyRequest(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new HttpError(401, 'Brak autoryzacji');
  try {
    const payload = await verifyToken(match[1], { secretKey: process.env.CLERK_SECRET_KEY });
    if (!payload?.sub) throw new Error('no sub');
    return {
      userId: payload.sub,
      role: payload.app_role === 'admin' ? 'admin' : 'viewer',
      email: payload.email ?? null,
    };
  } catch (err) {
    console.error('verifyRequest:', err?.reason || err?.message || err);
    throw new HttpError(401, 'Brak autoryzacji');
  }
}

export function assertAdmin(user) {
  if (user?.role !== 'admin') throw new HttpError(403, 'Tylko admin');
}
