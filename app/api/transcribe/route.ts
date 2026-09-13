import { transcribe } from "@/lib/stt";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");

    if (!(audio instanceof File)) {
      return new Response("no audio", { status: 400 });
    }

    const text = await transcribe(audio);

    return Response.json({ text });
  } catch (error) {
    console.error("POST /api/transcribe", error);
    return new Response("transcribe failed", { status: 500 });
  }
}
