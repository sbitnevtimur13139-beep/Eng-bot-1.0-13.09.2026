import { ParseError, respond } from "@/lib/llm";
import { auth } from "@/lib/auth";
import type { Message } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const { history, userText } = (await req.json()) as {
      history: Message[];
      userText: string;
    };

    const result = await respond(history ?? [], userText);

    return Response.json(result);
  } catch (error) {
    console.error("POST /api/respond", error);

    // parse — модель ответила мусором, failed — всё остальное.
    const kind = error instanceof ParseError ? "parse" : "failed";

    return Response.json({ error: kind }, { status: 500 });
  }
}
