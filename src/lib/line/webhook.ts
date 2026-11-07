import { createHmac } from "crypto";

export function verifyLineSignature(
  body: string,
  signature: string
): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET!;
  const hash = createHmac("sha256", channelSecret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

export interface LineTextMessageEvent {
  type: "message";
  message: {
    type: "text";
    id: string;
    text: string;
  };
  source: {
    type: string;
    userId?: string;
    groupId?: string;
  };
  replyToken: string;
  timestamp: number;
}

export interface LineWebhookBody {
  destination: string;
  events: LineTextMessageEvent[];
}
