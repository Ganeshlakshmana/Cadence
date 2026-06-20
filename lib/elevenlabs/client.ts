import { ElevenLabsClient } from 'elevenlabs';
import { createHash } from 'crypto';
import { writeFile, access } from 'fs/promises';
import path from 'path';
import { getVoiceForLanguage, ELEVENLABS_MODEL } from './voiceMap';

let _client: ElevenLabsClient | null = null;

function getClient(): ElevenLabsClient {
  if (!_client) {
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not set. Add it to .env.local before running voice generation.');
    }
    _client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  }
  return _client;
}

function scriptHash(script: string, voiceId: string): string {
  return createHash('sha256').update(`${voiceId}:${script}`).digest('hex').slice(0, 16);
}

export async function generateVoiceNote(params: {
  script: string;
  languageCode: string;
  installerName: string;
  customerFirstName: string;
}): Promise<string> {
  const voice = getVoiceForLanguage(params.languageCode);
  const hash = scriptHash(params.script, voice.voiceId);
  const filename = `${hash}.mp3`;
  const audioPath = path.join(process.cwd(), 'public', 'audio', filename);
  const publicUrl = `/audio/${filename}`;

  // Return cached file if it exists
  try {
    await access(audioPath);
    return publicUrl;
  } catch {
    // File doesn't exist — generate it
  }

  const audioStream = await getClient().textToSpeech.convert(voice.voiceId, {
    text: params.script,
    model_id: ELEVENLABS_MODEL,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
    },
  });

  // Collect stream into buffer
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  await writeFile(audioPath, buffer);
  return publicUrl;
}

export function buildVoiceScript(params: {
  installerName: string;
  companyName: string;
  customerFirstName: string;
  languageCode: string;
  mainMessage: string;
}): string {
  const { installerName, companyName, customerFirstName, languageCode, mainMessage } = params;

  // AI Act Article 50 disclosure opening — required for synthetic audio
  const disclosures: Record<string, string> = {
    de: `Hallo ${customerFirstName}, das ist eine KI-assistierte Nachricht von ${installerName} bei ${companyName}.`,
    en: `Hello ${customerFirstName}, this is an AI-assisted message from ${installerName} at ${companyName}.`,
    fr: `Bonjour ${customerFirstName}, c'est un message assisté par IA de ${installerName} chez ${companyName}.`,
    es: `Hola ${customerFirstName}, este es un mensaje asistido por IA de ${installerName} en ${companyName}.`,
  };

  const disclosure = disclosures[languageCode] ?? disclosures['en'];
  return `${disclosure} ${mainMessage}`;
}
