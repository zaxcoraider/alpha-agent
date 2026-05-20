import { z } from 'zod';

const envSchema = z.object({
  DGRID_API_KEY: z.string().min(1),
  DGRID_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  TAVILY_API_KEY: z.string().optional(),
  CRYPTOPANIC_TOKEN: z.string().optional(),
  TWITTERAPI_IO_KEY: z.string().optional(),
  ZEP_API_KEY: z.string().optional(),
  MIROFISH_URL: z.string().url().default('http://localhost:5001'),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);
