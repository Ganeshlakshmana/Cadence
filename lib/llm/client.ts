import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import * as https from 'node:https';
import * as http from 'node:http';

// ── Claude models ───────────────────────────────────────────────────────────
export const SONNET = 'claude-sonnet-4-6' as const;
export const HAIKU = 'claude-haiku-4-5-20251001' as const;

// ── OpenAI model for profiling calls (persona inference + voice-of-customer)
// Swap this one constant to change the profiling model.
export const OPENAI_PROFILING_MODEL = 'gpt-4o-mini' as const;

// ── Anthropic singleton ─────────────────────────────────────────────────────
function createAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local before running.');
  }
  return new Anthropic({ apiKey });
}

let _anthropicClient: Anthropic | null = null;
export function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) _anthropicClient = createAnthropicClient();
  return _anthropicClient;
}

export const anthropic: Anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    return (getAnthropicClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ── OpenAI singleton ────────────────────────────────────────────────────────
// globalThis.fetch is intercepted at the Cloudflare edge level (x-openai-proxy-wasm)
// when the OpenAI SDK sends certain headers (x-stainless-env=browser or similar).
// We use a native https-backed fetch that sends only exactly the headers we set,
// which bypasses the key-replacement behaviour.
function nativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const url =
      typeof input === 'string' ? new URL(input)
      : input instanceof URL ? input
      : new URL((input as Request).url);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const reqInit = init ?? {};
    const method = (reqInit.method ?? 'GET').toUpperCase();

    // Handle both Headers instances and plain objects
    const headers: Record<string, string> = {};
    if (reqInit.headers) {
      if (typeof (reqInit.headers as any).entries === 'function') {
        for (const [k, v] of (reqInit.headers as any).entries()) headers[k] = v;
      } else {
        for (const [k, v] of Object.entries(reqInit.headers as Record<string, string>)) {
          headers[k] = v;
        }
      }
    }

    // DEBUG — remove once confirmed working
    const auth = headers['authorization'] || headers['Authorization'] || '(none)';
    process.stderr.write(`[nativeFetch] ${method} ${url.pathname} | auth: ${auth.slice(0, 30)}...\n`);

    // Handle body — OpenAI SDK sends JSON strings or ReadableStream
    let bodyData: Buffer | undefined;
    if (reqInit.body) {
      if (typeof reqInit.body === 'string') {
        bodyData = Buffer.from(reqInit.body);
      } else if (reqInit.body instanceof Uint8Array) {
        bodyData = Buffer.from(reqInit.body);
      } else {
        // Fallback: stringify if object
        bodyData = Buffer.from(JSON.stringify(reqInit.body));
      }
      headers['content-length'] = String(bodyData.length);
    }

    const options = {
      hostname: url.hostname,
      port: url.port ? Number(url.port) : (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers,
    };

    const req = transport.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        const responseHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (v) responseHeaders.set(k, Array.isArray(v) ? v.join(', ') : String(v));
        }
        resolve(new Response(body, { status: res.statusCode ?? 200, headers: responseHeaders }));
      });
    });

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

function createOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env.local before running.');
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.openai.com/v1',
    fetch: nativeFetch as unknown as typeof globalThis.fetch,
  });
}

let _openaiClient: OpenAI | null = null;
export function getOpenAIClient(): OpenAI {
  if (!_openaiClient) _openaiClient = createOpenAIClient();
  return _openaiClient;
}

export const openai: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop) {
    return (getOpenAIClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
