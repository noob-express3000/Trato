import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().optional(),
  TURSO_DATABASE_URL: z.string().default('file:./local.db'),
  TURSO_AUTH_TOKEN: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.1-8b-instant'),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_STT_MODEL: z.string().default('scribe_v1'),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_BASE_URL: z.string().url().default('https://api-m.sandbox.paypal.com'),
  PAYPAL_MOCK: z.enum(['true', 'false']).default('false'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_CALLBACK_URL: z.string().url().optional(),
  GOOGLE_OAUTH_ALLOWED_ORIGIN: z.string().url().optional()
});

const env = envSchema.parse(process.env);

if (env.NODE_ENV === 'production') {
  const required = [
    ['JWT_SECRET', env.JWT_SECRET],
    ['TURSO_DATABASE_URL', env.TURSO_DATABASE_URL],
    ['TURSO_AUTH_TOKEN', env.TURSO_AUTH_TOKEN],
    ['PAYPAL_CLIENT_ID', env.PAYPAL_CLIENT_ID],
    ['PAYPAL_CLIENT_SECRET', env.PAYPAL_CLIENT_SECRET],
    ['PAYPAL_WEBHOOK_ID', env.PAYPAL_WEBHOOK_ID],
    ['GOOGLE_OAUTH_CLIENT_ID', env.GOOGLE_OAUTH_CLIENT_ID],
    ['GOOGLE_OAUTH_CLIENT_SECRET', env.GOOGLE_OAUTH_CLIENT_SECRET],
    ['GOOGLE_OAUTH_CALLBACK_URL', env.GOOGLE_OAUTH_CALLBACK_URL]
  ].filter(([, value]) => !value);
  if (required.length > 0) {
    throw new Error(`Missing required production env vars: ${required.map(([k]) => k).join(', ')}`);
  }
}

if (!env.JWT_SECRET && env.NODE_ENV !== 'production') {
  console.warn('JWT_SECRET is not set; using development fallback secret.');
}

export const config = {
  ...env,
  JWT_SECRET: env.JWT_SECRET || 'dev-only-secret-change-me',
  PAYPAL_MOCK: env.PAYPAL_MOCK === 'true',
  GOOGLE_OAUTH_ALLOWED_ORIGIN: env.GOOGLE_OAUTH_ALLOWED_ORIGIN || new URL(env.PUBLIC_BASE_URL).origin
};
