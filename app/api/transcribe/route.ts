import { transcribe } from "@/lib/stt";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");

    if (!(audio instanceof File)) {
      return Response.json({ error: "failed" }, { status: 400 });
    }

    const text = await transcribe(audio);

    return Response.json({ text });
  } catch (error) {
    console.error("POST /api/transcribe", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
