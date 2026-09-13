"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { signOut } from "@/lib/auth-client";
import { START_MESSAGE } from "@/lib/prompt";
import type { Message, RespondResult } from "@/lib/types";

const HISTORY_LIMIT = 20;
const MAX_RECORDING_SECONDS = 60;
const AUDIO_MIME = "audio/webm";

const ERROR_PARSE = "Не получилось разобрать, попробуйте ещё раз.";
const ERROR_GENERIC = "Что-то сломалось, попробуйте ещё раз.";
const ERROR_EMPTY = "Ничего не расслышал, скажите ещё раз.";
const ERROR_MIC = "Нужен доступ к микрофону";

type FeedItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; result: RespondResult }
  | { id: string; kind: "assistant-plain"; text: string }
  | { id: string; kind: "pending"; label: string }
  | { id: string; kind: "notice"; text: string };

function newId() {
  return Math.random().toString(36).slice(2);
}

function startFeed(): FeedItem[] {
  return [{ id: newId(), kind: "assistant-plain", text: START_MESSAGE }];
}

function startHistory(): Message[] {
  return [{ role: "assistant", text: START_MESSAGE }];
}

/** Маршрут помечает причину: parse — мусор от модели, failed — всё остальное. */
async function readErrorKind(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error === "parse" ? "parse" : "failed";
  } catch {
    return "failed";
  }
}

function formatTime(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function Chat() {
  const [feed, setFeed] = useState<FeedItem[]>(startFeed);
  const [history, setHistory] = useState<Message[]>(startHistory);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const limitRef = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed]);

  function replace(id: string, next: FeedItem) {
    setFeed((prev) => prev.map((item) => (item.id === id ? next : item)));
  }

  function append(item: FeedItem) {
    setFeed((prev) => [...prev, item]);
  }

  function reset() {
    setFeed(startFeed());
    setHistory(startHistory());
    setDraft("");
  }

  // Шаг раунда: история + реплика уходят в модель, ответ становится карточкой.
  async function runRespond(text: string) {
    const pendingId = newId();
    append({ id: pendingId, kind: "pending", label: "Думаю..." });

    try {
      const res = await fetch("/api/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, userText: text }),
      });

      if (!res.ok) {
        const kind = await readErrorKind(res);
        replace(pendingId, {
          id: pendingId,
          kind: "notice",
          text: kind === "parse" ? ERROR_PARSE : ERROR_GENERIC,
        });
        return;
      }

      const result = (await res.json()) as RespondResult;
      replace(pendingId, { id: pendingId, kind: "assistant", result });

      // В историю идёт сырая реплика пользователя и только reply бота.
      // Corrected и explanation в историю не попадают никогда.
      setHistory((prev) =>
        [
          ...prev,
          { role: "user" as const, text },
          { role: "assistant" as const, text: result.reply },
        ].slice(-HISTORY_LIMIT),
      );
    } catch (error) {
      // Сеть отвалилась до ответа сервера.
      console.error("Запрос к /api/respond не дошёл", error);
      replace(pendingId, {
        id: pendingId,
        kind: "notice",
        text: ERROR_GENERIC,
      });
    }
  }

  async function sendText(userText: string) {
    const text = userText.trim();
    if (!text || busy) return;

    setBusy(true);
    append({ id: newId(), kind: "user", text });

    try {
      await runRespond(text);
    } finally {
      setBusy(false);
    }
  }

  async function sendVoice(blob: Blob) {
    if (busy) return;

    setBusy(true);
    const listeningId = newId();
    append({ id: listeningId, kind: "pending", label: "Слушаю..." });

    try {
      const form = new FormData();
      form.append("audio", blob, "audio.webm");

      const res = await fetch("/api/transcribe", { method: "POST", body: form });

      if (!res.ok) {
        replace(listeningId, {
          id: listeningId,
          kind: "notice",
          text: ERROR_GENERIC,
        });
        return;
      }

      const { text } = (await res.json()) as { text: string };
      const userText = text.trim();

      // Пустая транскрипция: в историю не пишем ничего.
      if (!userText) {
        replace(listeningId, {
          id: listeningId,
          kind: "notice",
          text: ERROR_EMPTY,
        });
        return;
      }

      replace(listeningId, { id: listeningId, kind: "user", text: userText });
      await runRespond(userText);
    } catch (error) {
      console.error("Запрос к /api/transcribe не дошёл", error);
      replace(listeningId, {
        id: listeningId,
        kind: "notice",
        text: ERROR_GENERIC,
      });
    } finally {
      setBusy(false);
    }
  }

  function stopRecording() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (limitRef.current !== null) {
      window.clearTimeout(limitRef.current);
      limitRef.current = null;
    }

    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);

    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function startRecording() {
    if (busy || recorderRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: AUDIO_MIME });
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: AUDIO_MIME });
        chunksRef.current = [];
        if (blob.size > 0) void sendVoice(blob);
      };

      recorderRef.current = recorder;
      recorder.start();

      setMicError(null);
      setRecording(true);
      setElapsed(0);

      tickRef.current = window.setInterval(
        () => setElapsed((value) => value + 1),
        1000,
      );
      limitRef.current = window.setTimeout(
        () => stopRecording(),
        MAX_RECORDING_SECONDS * 1000,
      );
    } catch (error) {
      console.error("Не удалось начать запись", error);

      // Отказ в доступе — одно сообщение, любая другая причина — другое.
      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError");

      setMicError(denied ? ERROR_MIC : ERROR_GENERIC);
    }
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-2xl flex-col p-4">
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {feed.map((item) => {
          if (item.kind === "user") {
            return (
              <div key={item.id} className="flex justify-end">
                <div className="bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2 text-sm">
                  {item.text}
                </div>
              </div>
            );
          }

          if (item.kind === "assistant-plain") {
            return (
              <Card key={item.id} className="max-w-[90%]">
                <CardContent className="text-lg font-medium">
                  {item.text}
                </CardContent>
              </Card>
            );
          }

          if (item.kind === "notice") {
            return (
              <Card key={item.id} className="max-w-[90%]">
                <CardContent className="text-muted-foreground text-sm">
                  {item.text}
                </CardContent>
              </Card>
            );
          }

          if (item.kind === "pending") {
            return (
              <div
                key={item.id}
                className="text-muted-foreground px-3 py-2 text-sm"
              >
                {item.label}
              </div>
            );
          }

          return (
            <Card key={item.id} className="max-w-[90%]">
              <CardContent className="space-y-3">
                <p className="text-sm">
                  <span className="text-muted-foreground">Corrected: </span>
                  {item.result.corrected}
                </p>
                <p className="text-muted-foreground text-sm whitespace-pre-line">
                  {item.result.explanation}
                </p>
                <p className="text-lg font-medium">{item.result.reply}</p>
              </CardContent>
            </Card>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-3 border-t pt-4">
        {micError && (
          <p className="text-destructive text-center text-sm">{micError}</p>
        )}

        <Button
          size="lg"
          variant={recording ? "destructive" : "default"}
          className="h-16 w-full touch-none text-base select-none"
          disabled={busy}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            void startRecording();
          }}
          onPointerUp={stopRecording}
          onPointerCancel={stopRecording}
        >
          {recording
            ? `Отпустите  ${formatTime(elapsed)}`
            : "Держите и говорите"}
        </Button>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft;
            setDraft("");
            void sendText(text);
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Или напишите ответ текстом"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !draft.trim()}>
            Отправить
          </Button>
        </form>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={reset}>
            Начать заново
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut();
              router.push("/sign-in");
            }}
          >
            Выйти
          </Button>
        </div>
      </div>
    </main>
  );
}
