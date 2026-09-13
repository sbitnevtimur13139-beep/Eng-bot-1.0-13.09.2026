import OpenAI, { toFile } from "openai";

const STT_MODEL = "whisper-1";

let client: OpenAI | null = null;

function getClient() {
  if (!client) client = new OpenAI();
  return client;
}

export async function transcribe(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await toFile(buffer, "audio.webm");

  const result = await getClient().audio.transcriptions.create({
    model: STT_MODEL,
    file: upload,
    language: "en",
  });

  return result.text.trim();
}
