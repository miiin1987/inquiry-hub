import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { sendSlackNotification, getSlackChannelForCategory } from "@/lib/slack/notify";
import { sendLineEmergencyNotification } from "@/lib/line/notify";
import { Inquiry } from "@/lib/types";
import { verifyInternalAuth } from "@/lib/auth/internal";

const MAX_RETRY = 3;

export async function POST(request: NextRequest) {
  const authError = verifyInternalAuth(request);
  if (authError) return authError;

  const { inquiry_id } = (await request.json()) as { inquiry_id: string };

  if (!inquiry_id) {
    return NextResponse.json({ error: "inquiry_id is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: inquiry, error: fetchError } = await supabase
    .from("hub_inquiries")
    .select("*")
    .eq("id", inquiry_id)
    .single<Inquiry>();

  if (fetchError || !inquiry || !inquiry.category) {
    return NextResponse.json({ error: "Inquiry not found or not classified" }, { status: 404 });
  }

  const channelId = getSlackChannelForCategory(inquiry.category);
  const results: { channel: string; status: "sent" | "failed"; error?: string }[] = [];

  // Slack 通知
  const { data: existingSlack } = await supabase
    .from("hub_notifications")
    .select("id, retry_count, status")
    .eq("inquiry_id", inquiry_id)
    .eq("channel", "slack")
    .single();

  const slackRetryCount = existingSlack?.retry_count ?? 0;
  if (!existingSlack || (existingSlack.status === "failed" && slackRetryCount < MAX_RETRY)) {
    try {
      await sendSlackNotification(inquiry, channelId);

      if (existingSlack) {
        await supabase
          .from("hub_notifications")
          .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", existingSlack.id);
      } else {
        await supabase.from("hub_notifications").insert({
          inquiry_id,
          channel: "slack",
          destination: channelId,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
      }
      results.push({ channel: "slack", status: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (existingSlack) {
        await supabase
          .from("hub_notifications")
          .update({ status: "failed", retry_count: slackRetryCount + 1, last_error: message, updated_at: new Date().toISOString() })
          .eq("id", existingSlack.id);
      } else {
        await supabase.from("hub_notifications").insert({
          inquiry_id,
          channel: "slack",
          destination: channelId,
          status: "failed",
          retry_count: 1,
          last_error: message,
        });
      }
      results.push({ channel: "slack", status: "failed", error: message });
    }
  }

  // LINE 緊急通知（クレームのみ）
  // sendLineEmergencyNotification は全スタッフへ一括送信するため、
  // 1回の送受信で全員分の notifications レコードをまとめて更新する
  if (inquiry.category === "クレーム") {
    const staffIds = (process.env.LINE_STAFF_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (staffIds.length > 0) {
      // 各staffIdのnotificationレコードを取得
      const existingByStaffId: Record<string, { id: string; retry_count: number; status: string } | null> = {};
      let shouldSend = false;

      for (const staffId of staffIds) {
        const { data: existingLine } = await supabase
          .from("hub_notifications")
          .select("id, retry_count, status")
          .eq("inquiry_id", inquiry_id)
          .eq("channel", "line")
          .eq("destination", staffId)
          .single();
        existingByStaffId[staffId] = existingLine ?? null;
        if (!existingLine || (existingLine.status === "failed" && (existingLine.retry_count ?? 0) < MAX_RETRY)) {
          shouldSend = true;
        }
      }

      if (shouldSend) {
        try {
          await sendLineEmergencyNotification(inquiry);

          for (const staffId of staffIds) {
            const existing = existingByStaffId[staffId];
            if (existing) {
              await supabase
                .from("hub_notifications")
                .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq("id", existing.id);
            } else {
              await supabase.from("hub_notifications").insert({
                inquiry_id,
                channel: "line",
                destination: staffId,
                status: "sent",
                sent_at: new Date().toISOString(),
              });
            }
          }
          results.push({ channel: "line", status: "sent" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          for (const staffId of staffIds) {
            const existing = existingByStaffId[staffId];
            if (existing) {
              await supabase
                .from("hub_notifications")
                .update({ status: "failed", retry_count: (existing.retry_count ?? 0) + 1, last_error: message, updated_at: new Date().toISOString() })
                .eq("id", existing.id);
            } else {
              await supabase.from("hub_notifications").insert({
                inquiry_id,
                channel: "line",
                destination: staffId,
                status: "failed",
                retry_count: 1,
                last_error: message,
              });
            }
          }
          results.push({ channel: "line", status: "failed", error: message });
        }
      }
    }
  }

  // 全通知成功なら inquiries.status を notified に更新
  const allSent = results.every((r) => r.status === "sent");
  if (allSent && results.length > 0) {
    await supabase
      .from("hub_inquiries")
      .update({ status: "notified", updated_at: new Date().toISOString() })
      .eq("id", inquiry_id);
  }

  return NextResponse.json({ results });
}
