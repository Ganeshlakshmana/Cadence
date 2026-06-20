// Diagnostic: reveal what's intercepting fetch
import * as https from 'node:https';

async function main() {
  console.log('=== FETCH DIAGNOSTICS ===');
  console.log('Node version:', process.version);
  console.log('fetch source (first 150):', fetch.toString().slice(0, 150));

  // Test 1: native https module
  console.log('\n--- Test 1: node:https direct ---');
  await new Promise<void>((resolve) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/models',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
    }, (res) => {
      console.log('Status:', res.statusCode);
      console.log('x-openai-proxy-wasm:', res.headers['x-openai-proxy-wasm'] ?? 'NOT PRESENT');
      res.resume();
      res.on('end', resolve);
    });
    req.end();
  });

  // Test 2: globalThis.fetch
  console.log('\n--- Test 2: globalThis.fetch ---');
  try {
    const r = await globalThis.fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
    });
    console.log('Status:', r.status);
    console.log('x-openai-proxy-wasm:', r.headers.get('x-openai-proxy-wasm') ?? 'NOT PRESENT');
  } catch (e: any) {
    console.log('Error:', e.message);
  }

  // Test 3: fetch descriptor
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  console.log('\n--- Test 3: fetch descriptor ---');
  console.log('configurable:', desc?.configurable);
  console.log('writable:', desc?.writable);
}

main().catch(console.error);
