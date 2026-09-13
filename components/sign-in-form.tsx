"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";

type Status = "idle" | "sending" | "sent" | "error";

export default function SignInForm({
  googleEnabled,
}: {
  googleEnabled: boolean;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === "sending") return;

    setStatus("sending");
    setMessage("");

    const { error } = await signIn.magicLink({
      email: email.trim(),
      callbackURL: "/",
    });

    if (error) {
      console.error("magicLink", error);
      setStatus("error");
      setMessage("Не получилось отправить письмо, попробуйте ещё раз.");
      return;
    }

    setStatus("sent");
    setMessage("Письмо отправлено. Откройте ссылку из него, она живёт 5 минут.");
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col justify-center p-4">
      <Card>
        <CardContent className="space-y-5">
          <div className="space-y-1">
            <h1 className="text-xl font-medium">Speaking Bot</h1>
            <p className="text-muted-foreground text-sm">
              Войдите, чтобы начать разговор на английском.
            </p>
          </div>

          {googleEnabled && (
            <>
              <Button
                className="w-full"
                onClick={() => signIn.social({ provider: "google", callbackURL: "/" })}
              >
                Войти через Google
              </Button>

              <div className="text-muted-foreground text-center text-xs">
                или по ссылке на почту
              </div>
            </>
          )}

          <form className="space-y-3" onSubmit={sendLink}>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="вы@example.com"
              disabled={status === "sending"}
            />
            <Button
              type="submit"
              variant={googleEnabled ? "outline" : "default"}
              className="w-full"
              disabled={status === "sending" || !email.trim()}
            >
              {status === "sending" ? "Отправляю..." : "Прислать ссылку для входа"}
            </Button>
          </form>

          {message && (
            <p
              className={
                status === "error"
                  ? "text-destructive text-sm"
                  : "text-muted-foreground text-sm"
              }
            >
              {message}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
