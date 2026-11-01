import { config } from '../config.js';

export async function transcribeAudio(file: Express.Multer.File): Promise<string> {
  if (!config.ELEVENLABS_API_KEY) {
    throw new Error('Speech provider not configured');
  }
  const form = new FormData();
  form.append('model_id', config.ELEVENLABS_STT_MODEL);
  form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || 'audio/webm' }), file.originalname || 'audio.webm');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': config.ELEVENLABS_API_KEY },
    body: form
  });
  if (!res.ok) throw new Error(`Speech provider error: ${res.status}`);
  const json = (await res.json()) as { text?: string };
  if (!json.text) throw new Error('No transcript received');
  return json.text;
}
