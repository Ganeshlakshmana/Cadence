// ElevenLabs stock multilingual voices
// Using multilingual v2 model for all languages
export const ELEVENLABS_MODEL = 'eleven_multilingual_v2';

export const VOICE_MAP: Record<string, { voiceId: string; name: string; gender: string }> = {
  de: { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male' },    // German-capable
  en: { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male' },    // English
  fr: { voiceId: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', gender: 'female' }, // French-capable
  es: { voiceId: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female' },   // Spanish-capable
  it: { voiceId: 'LcfcDJNUP1GQjkzn1xUU', name: 'Emily', gender: 'female' },  // Italian-capable
  nl: { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male' },    // Dutch fallback
};

export function getVoiceForLanguage(languageCode: string): { voiceId: string; name: string; gender: string } {
  return VOICE_MAP[languageCode.toLowerCase()] ?? VOICE_MAP['en'];
}
