import { Inquiry } from "@/lib/types";

const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

export async function sendLineEmergencyNotification(
  inquiry: Inquiry
): Promise<void> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN!;
  const staffUserIds = (process.env.LINE_STAFF_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (staffUserIds.length === 0) {
    throw new Error("LINE_STAFF_USER_IDS is not configured");
  }

  const messageText = [
    "🚨 【緊急】クレーム案件が届きました",
    "",
    `送信者: ${inquiry.sender_name ?? inquiry.sender_line_id ?? "不明"}`,
    `チャンネル: ${inquiry.source === "gmail" ? "Gmail" : "LINE"}`,
    `受信時刻: ${new Date(inquiry.received_at).toLocaleString("ja-JP")}`,
    "",
    "内容（先頭100文字）:",
    inquiry.content.slice(0, 100) + (inquiry.content.length > 100 ? "…" : ""),
  ].join("\n");

  await Promise.all(
    staffUserIds.map((userId) =>
      fetch(LINE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          to: userId,
          messages: [{ type: "text", text: messageText }],
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`LINE Push failed for ${userId}: ${res.status} ${body}`);
        }
      })
    )
  );
}
