import { createOpenAI } from '@ai-sdk/openai';

export const dgrid = createOpenAI({
  apiKey: process.env.DGRID_API_KEY!,
  baseURL: process.env.DGRID_BASE_URL!,
  compatibility: 'compatible',
});
