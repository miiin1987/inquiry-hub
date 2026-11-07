import { Inquiry, InquiryCategory } from "@/lib/types";

const SLACK_API_URL = "https://slack.com/api/chat.postMessage";

const CATEGORY_CHANNEL_MAP: Record<InquiryCategory, string> = {
  売買: process.env.SLACK_CHANNEL_SALE ?? "",
  賃貸: process.env.SLACK_CHANNEL_RENT ?? "",
  修繕依頼: process.env.SLACK_CHANNEL_REPAIR ?? "",
  クレーム: process.env.SLACK_CHANNEL_COMPLAINT ?? "",
  その他: process.env.SLACK_CHANNEL_OTHER ?? "",
};

const CATEGORY_EMOJI: Record<InquiryCategory, string> = {
  売買: "🏠",
  賃貸: "🔑",
  修繕依頼: "🔧",
  クレーム: "⚠️",
  その他: "📋",
};

export function getSlackChannelForCategory(category: InquiryCategory): string {
  return CATEGORY_CHANNEL_MAP[category];
}

export async function sendSlackNotification(
  inquiry: Inquiry,
  channelId: string
): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN!;
  const category = inquiry.category!;
  const emoji = CATEGORY_EMOJI[category];
  const source = inquiry.source === "gmail" ? "Gmail" : "LINE";
  const confidence = inquiry.ai_confidence
    ? `${Math.round(inquiry.ai_confidence * 100)}%`
    : "不明";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} 新規問い合わせ【${category}】`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*チャンネル:*\n${source}` },
        { type: "mrkdwn", text: `*送信者:*\n${inquiry.sender_name ?? inquiry.sender_email ?? inquiry.sender_line_id ?? "不明"}` },
        { type: "mrkdwn", text: `*AI確信度:*\n${confidence}` },
        { type: "mrkdwn", text: `*受信時刻:*\n${new Date(inquiry.received_at).toLocaleString("ja-JP")}` },
      ],
    },
    ...(inquiry.subject
      ? [{ type: "section", text: { type: "mrkdwn", text: `*件名:* ${inquiry.subject}` } }]
      : []),
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*内容:*\n${inquiry.content.slice(0, 500)}${inquiry.content.length > 500 ? "…" : ""}`,
      },
    },
    ...(inquiry.ai_reasoning
      ? [{ type: "context", elements: [{ type: "mrkdwn", text: `🤖 分類理由: ${inquiry.ai_reasoning}` }] }]
      : []),
  ];

  const res = await fetch(SLACK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel: channelId, blocks }),
  });

  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
}
