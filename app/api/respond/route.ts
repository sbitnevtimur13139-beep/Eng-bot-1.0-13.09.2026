import { respond } from "@/lib/llm";
import type { Message } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const { history, userText } = (await req.json()) as {
      history: Message[];
      userText: string;
    };

    const result = await respond(history ?? [], userText);

    return Response.json(result);
  } catch (error) {
    console.error("POST /api/respond", error);
    return new Response("respond failed", { status: 500 });
  }
}
