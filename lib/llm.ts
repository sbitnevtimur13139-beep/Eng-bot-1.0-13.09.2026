import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { SYSTEM_PROMPT } from "./prompt";
import type { Message, RespondResult } from "./types";

const CHAT_MODEL = "gpt-4o-mini";
const MAX_ATTEMPTS = 2;

let client: OpenAI | null = null;

function getClient() {
  if (!client) client = new OpenAI();
  return client;
}

function parseResult(raw: string): RespondResult {
  const data = JSON.parse(raw) as Partial<RespondResult>;
  const { corrected, explanation, reply } = data;

  if (
    typeof corrected !== "string" ||
    typeof explanation !== "string" ||
    typeof reply !== "string"
  ) {
    throw new Error("respond: в ответе модели нет одного из трёх полей");
  }

  return { corrected, explanation, reply };
}

export async function respond(
  history: Message[],
  userText: string,
): Promise<RespondResult> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.text })),
    { role: "user", content: userText },
  ];

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const completion = await getClient().chat.completions.create({
      model: CHAT_MODEL,
      response_format: { type: "json_object" },
      messages,
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    try {
      return parseResult(raw);
    } catch (error) {
      lastError = error;
      console.error(`respond: попытка ${attempt} не разобрана`, error, raw);
    }
  }

  throw lastError;
}
