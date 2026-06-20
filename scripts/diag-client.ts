import { config } from 'dotenv';
config({ path: '.env.local' });

import { getOpenAIClient } from '../lib/llm/client';

async function main() {
  const client = getOpenAIClient();
  console.log('client baseURL:', (client as any).baseURL);
  console.log('client.fetch name:', (client as any).fetch?.name ?? 'unknown');
  console.log('client.fetch is nativeFetch?', (client as any).fetch?.toString().includes('nativeFetch') ?? false);
  
  try {
    const models = await client.models.list();
    console.log('models count:', models.data.length);
  } catch (e: any) {
    console.log('models.list() error:', e.message?.slice(0, 100));
    console.log('headers:', JSON.stringify(Object.fromEntries([...(e.headers?.entries?.() ?? [])])));
  }
}

main().catch(console.error);
