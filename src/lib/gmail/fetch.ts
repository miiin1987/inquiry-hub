import { gmail_v1 } from "googleapis";
import { createGmailClient } from "./client";

export interface FetchedEmail {
  messageId: string;
  subject: string;
  from: string;
  fromEmail: string;
  body: string;
  date: Date;
}

function decodeBase64Url(str: string): string {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractEmailAddress(from: string): string {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from;
}

function extractSenderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from;
}

function getBodyFromParts(parts: gmail_v1.Schema$MessagePart[]): string {
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    if (part.parts) {
      const nested = getBodyFromParts(part.parts);
      if (nested) return nested;
    }
  }
  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data) {
      return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, "");
    }
  }
  return "";
}

export async function fetchNewEmails(
  lastHistoryId: string | null
): Promise<{ emails: FetchedEmail[]; newHistoryId: string | null }> {
  // GMAIL_LABEL_FILTER 未設定時は安全のため同期を停止する
  // 環境変数には Gmail ラベル ID（例: Label_1234567890）を設定すること。
  // 表示名（例: "問い合わせ"）ではなく ID が必要な点に注意。
  const labelId = process.env.GMAIL_LABEL_FILTER;
  if (!labelId) {
    console.warn("GMAIL_LABEL_FILTER is not set. Gmail sync is disabled.");
    return { emails: [], newHistoryId: null };
  }

  const gmail = createGmailClient();
  const userId = process.env.GMAIL_USER_EMAIL!;

  let messageIds: string[] = [];
  let newHistoryId: string | null = null;

  if (lastHistoryId) {
    try {
      const historyRes = await gmail.users.history.list({
        userId,
        startHistoryId: lastHistoryId,
        historyTypes: ["messageAdded", "labelAdded"],
        labelId,
      });

      newHistoryId = historyRes.data.historyId ?? lastHistoryId;

      // messageAdded（到着時にラベル付き）と labelAdded（後付けラベル）を両方捕捉し重複排除
      const idSet = new Set<string>();
      const history = historyRes.data.history ?? [];
      for (const record of history) {
        for (const msg of record.messagesAdded ?? []) {
          if (msg.message?.id) idSet.add(msg.message.id);
        }
        for (const msg of record.labelsAdded ?? []) {
          if (msg.message?.id) idSet.add(msg.message.id);
        }
      }
      messageIds = [...idSet];
    } catch {
      // historyId が古すぎる場合は直近24時間分にフォールバック
      lastHistoryId = null;
    }
  }

  if (!lastHistoryId) {
    const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const listRes = await gmail.users.messages.list({
      userId,
      q: `after:${since}`,
      labelIds: [labelId],
      maxResults: 50,
    });

    messageIds = (listRes.data.messages ?? []).map((m) => m.id!).filter(Boolean);

    // 最新の historyId を取得
    const profileRes = await gmail.users.getProfile({ userId });
    newHistoryId = profileRes.data.historyId ?? null;
  }

  const emails: FetchedEmail[] = [];
  const failedMessageIds: string[] = [];

  for (const messageId of messageIds) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId,
        id: messageId,
        format: "full",
      });

      const payload = msgRes.data.payload;
      if (!payload) continue;

      const headers = payload.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

      const from = getHeader("From");
      const subject = getHeader("Subject");
      const dateStr = getHeader("Date");

      let body = "";
      if (payload.parts) {
        body = getBodyFromParts(payload.parts);
      } else if (payload.body?.data) {
        body = decodeBase64Url(payload.body.data);
      }

      if (!body.trim()) continue;

      emails.push({
        messageId,
        subject,
        from: extractSenderName(from),
        fromEmail: extractEmailAddress(from),
        body: body.trim(),
        date: dateStr ? new Date(dateStr) : new Date(),
      });
    } catch (err) {
      console.error(`Failed to fetch message ${messageId}:`, err);
      failedMessageIds.push(messageId);
    }
  }

  // 1件でも取得失敗があれば newHistoryId を null にして呼び出し元に再処理を促す
  if (failedMessageIds.length > 0) {
    console.error(
      `Gmail fetch: ${failedMessageIds.length} message(s) failed. ` +
      `History ID will not be advanced. Failed IDs: ${failedMessageIds.join(", ")}`
    );
    return { emails, newHistoryId: null };
  }

  return { emails, newHistoryId };
}
