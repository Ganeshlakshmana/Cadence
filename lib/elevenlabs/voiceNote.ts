import { nanoid } from 'nanoid';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

/**
 * Generate a voice note MP3 via ElevenLabs TTS and save it to /public/audio/.
 * Returns the public URL path (e.g. "/audio/abc123.mp3").
 *
 * voiceId defaults to ELEVENLABS_VOICE_ID env var.
 * Use getVoiceForLanguage() from voiceMap.ts if you need language-matched voices.
 */
export async function generateVoiceNote(text: string, voiceId?: string): Promise<string> {
  const vid = voiceId ?? process.env.ELEVENLABS_VOICE_ID;
  if (!vid) throw new Error('No voiceId provided and ELEVENLABS_VOICE_ID is not set');

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
    method: 'POST',
    headers: {
      'xi-api-key':    apiKey,
      'Content-Type':  'application/json',
      'Accept':        'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id:      'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`ElevenLabs TTS ${res.status}: ${detail}`);
  }

  const buffer  = Buffer.from(await res.arrayBuffer());
  const audioDir = path.join(process.cwd(), 'public', 'audio');

  await mkdir(audioDir, { recursive: true });

  const filename = `${nanoid()}.mp3`;
  await writeFile(path.join(audioDir, filename), buffer);

  return `/audio/${filename}`;
}
