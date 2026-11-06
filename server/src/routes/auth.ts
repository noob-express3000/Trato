import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { nanoid } from 'nanoid';
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { config } from '../config.js';
import { clearSessionCookie, requireAuth, setSessionCookie, signSession } from '../auth.js';

export const authRouter = Router();

authRouter.use(
  rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false })
);

const oauthCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.NODE_ENV === 'production',
  maxAge: 10 * 60 * 1000
};

function oauthConfigured() {
  return Boolean(
    config.GOOGLE_OAUTH_CLIENT_ID &&
    config.GOOGLE_OAUTH_CLIENT_SECRET &&
    config.GOOGLE_OAUTH_CALLBACK_URL
  );
}

function oauthErrorRedirect(message: string) {
  const url = new URL('/', config.GOOGLE_OAUTH_ALLOWED_ORIGIN);
  url.searchParams.set('auth_error', message);
  return url.toString();
}

authRouter.get('/google', (req, res) => {
  if (!oauthConfigured()) return res.status(503).json({ error: 'Google OAuth is not configured' });

  const state = randomBytes(24).toString('hex');
  const nonce = randomBytes(24).toString('hex');
  res.cookie('oauth_state', state, oauthCookieOptions);
  res.cookie('oauth_nonce', nonce, oauthCookieOptions);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', config.GOOGLE_OAUTH_CLIENT_ID!);
  authUrl.searchParams.set('redirect_uri', config.GOOGLE_OAUTH_CALLBACK_URL!);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('nonce', nonce);
  authUrl.searchParams.set('prompt', 'select_account');
  return res.redirect(authUrl.toString());
});

authRouter.get('/google/callback', async (req, res) => {
  if (!oauthConfigured()) return res.redirect(oauthErrorRedirect('Google OAuth is not configured'));
  const state = String(req.query.state || '');
  const code = String(req.query.code || '');
  const error = String(req.query.error || '');
  const cookieState = String(req.cookies.oauth_state || '');
  const cookieNonce = String(req.cookies.oauth_nonce || '');
  res.clearCookie('oauth_state');
  res.clearCookie('oauth_nonce');

  if (error) return res.redirect(oauthErrorRedirect('Google sign-in was cancelled'));
  if (!state || !code || !cookieState || state !== cookieState) {
    return res.redirect(oauthErrorRedirect('Invalid OAuth state'));
  }
  if (!cookieNonce) return res.redirect(oauthErrorRedirect('Missing OAuth nonce'));

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: config.GOOGLE_OAUTH_CLIENT_SECRET!,
        redirect_uri: config.GOOGLE_OAUTH_CALLBACK_URL!,
        grant_type: 'authorization_code'
      })
    });
    if (!tokenResponse.ok) return res.redirect(oauthErrorRedirect('Failed to exchange OAuth code'));
    const tokens = await tokenResponse.json() as { id_token?: string };
    if (!tokens.id_token) return res.redirect(oauthErrorRedirect('Missing identity token from Google'));

    const tokenInfoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`);
    if (!tokenInfoResponse.ok) return res.redirect(oauthErrorRedirect('Invalid Google identity token'));
    const tokenInfo = await tokenInfoResponse.json() as {
      aud?: string; iss?: string; sub?: string; email?: string; email_verified?: string; nonce?: string; exp?: string;
    };

    const validIssuer = tokenInfo.iss === 'accounts.google.com' || tokenInfo.iss === 'https://accounts.google.com';
    const isVerifiedEmail = tokenInfo.email_verified === 'true';
    const notExpired = Number(tokenInfo.exp || 0) * 1000 > Date.now();
    if (!validIssuer || tokenInfo.aud !== config.GOOGLE_OAUTH_CLIENT_ID || !isVerifiedEmail || tokenInfo.nonce !== cookieNonce || !notExpired || !tokenInfo.sub || !tokenInfo.email) {
      return res.redirect(oauthErrorRedirect('Google identity validation failed'));
    }

    const email = tokenInfo.email.toLowerCase();
    const providerUserId = tokenInfo.sub;
    const now = new Date().toISOString();
    const existingByProvider = await db.execute({
      sql: 'SELECT id, email, provider, provider_user_id, business_name, local_currency FROM users WHERE provider = ? AND provider_user_id = ?',
      args: ['google', providerUserId]
    });
    let user = existingByProvider.rows[0] as any;

    if (!user) {
      const existingByEmail = await db.execute({
        sql: 'SELECT id, email, provider, provider_user_id, business_name, local_currency FROM users WHERE email = ?',
        args: [email]
      });
      user = existingByEmail.rows[0] as any;
      if (user) {
        const provider = String(user.provider || 'local');
        const currentProviderUserId = user.provider_user_id ? String(user.provider_user_id) : null;
        if (provider !== 'google' && currentProviderUserId) {
          return res.redirect(oauthErrorRedirect('Account already linked to a different provider'));
        }
        if (provider === 'google' && currentProviderUserId && currentProviderUserId !== providerUserId) {
          return res.redirect(oauthErrorRedirect('Google account mismatch for this email'));
        }
        await db.execute({
          sql: 'UPDATE users SET provider = ?, provider_user_id = ? WHERE id = ?',
          args: ['google', providerUserId, user.id]
        });
      } else {
        const userId = nanoid();
        const businessName = email.split('@')[0] || 'My business';
        await db.execute({
          sql: 'INSERT INTO users (id, email, password_hash, provider, provider_user_id, business_name, local_currency, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)',
          args: [userId, email, 'google', providerUserId, businessName, 'USD', now]
        });
        user = { id: userId, email, business_name: businessName, local_currency: 'USD' };
      }
    }

    const token = signSession({ id: String(user.id), email });
    setSessionCookie(res, token);
    const successRedirect = new URL('/jobs', config.GOOGLE_OAUTH_ALLOWED_ORIGIN);
    return res.redirect(successRedirect.toString());
  } catch {
    return res.redirect(oauthErrorRedirect('Google sign-in failed'));
  }
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const row = await db.execute({ sql: 'SELECT id, email, business_name, local_currency FROM users WHERE id = ?', args: [req.user!.id] });
  const user = row.rows[0] as any;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  return res.json(user);
});
