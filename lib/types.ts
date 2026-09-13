export type Message = { role: "user" | "assistant"; text: string };

export type RespondResult = {
  corrected: string;
  explanation: string;
  reply: string;
};
