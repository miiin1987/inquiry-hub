import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fetchNewEmails, FetchedEmail } from "@/lib/gmail/fetch";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // 前回の同期状態を取得
  const { data: syncState } = await supabase
    .from("hub_gmail_sync_state")
    .select("*")
    .single();

  const lastHistoryId = syncState?.last_history_id ?? null;

  // Gmail からメール取得（失敗時は 500 を返す。次回 Cron が同一開始点から再試行）
  let emails: FetchedEmail[] = [];
  let newHistoryId: string | null = null;
  try {
    const result = await fetchNewEmails(lastHistoryId);
    emails = result.emails;
    newHistoryId = result.newHistoryId;
    // newHistoryId が null = messages.get の失敗あり → 次回 Cron で再試行させる
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Gmail fetchNewEmails failed:", message);
    return NextResponse.json(
      { error: "Gmail fetch failed", processed: 0, saved: 0, upsertFailed: 0, historyAdvanced: false },
      { status: 500 }
    );
  }

  const savedIds: string[] = [];
  let upsertFailureCount = 0;

  for (const email of emails) {
    const { data, error } = await supabase
      .from("hub_inquiries")
      .upsert(
        {
          source: "gmail",
          external_id: email.messageId,
          sender_name: email.from || null,
          sender_email: email.fromEmail || null,
          subject: email.subject || null,
          content: email.body,
          received_at: email.date.toISOString(),
          status: "pending",
        },
        { onConflict: "source,external_id", ignoreDuplicates: true }
      )
      .select("id")
      .single();

    if (!data) {
      // PGRST116 = ignoreDuplicates による正常スキップ。それ以外は予期しないエラーとしてログに残す
      if (error && error.code !== "PGRST116") {
        console.error(`Unexpected upsert error for message ${email.messageId}:`, error.message);
        upsertFailureCount++;
      }
      continue;
    }
    savedIds.push(data.id);
  }

  // 失敗がゼロの場合のみ historyId を進める。
  // 失敗があれば次回 Cron が同じ開始点から再試行でき、成功済みは ignoreDuplicates で自動スキップされる。
  const historyAdvanced = newHistoryId !== null && upsertFailureCount === 0;

  if (historyAdvanced) {
    await supabase
      .from("hub_gmail_sync_state")
      .update({ last_history_id: newHistoryId, last_synced_at: new Date().toISOString() })
      .eq("id", syncState?.id ?? "");
  } else {
    if (newHistoryId === null) {
      console.error("Gmail sync: message fetch failures detected. History ID not advanced.");
    }
    if (upsertFailureCount > 0) {
      console.error(
        `Gmail sync: ${upsertFailureCount} upsert failure(s). History ID not advanced.`
      );
    }
  }

  // 新規メールを分類（失敗してもリトライしない。次回 Cron で ignoreDuplicates によりスキップされる）
  const origin = new URL(request.url).origin;
  for (const id of savedIds) {
    try {
      await fetch(`${origin}/api/classify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.INTERNAL_API_SECRET ?? ""}`,
        },
        body: JSON.stringify({ inquiry_id: id }),
      });
    } catch (err) {
      console.error("classify error for", id, err);
    }
  }

  return NextResponse.json({
    processed: emails.length,
    saved: savedIds.length,
    upsertFailed: upsertFailureCount,
    historyAdvanced,
    newHistoryId: historyAdvanced ? newHistoryId : null,
  });
}

// Vercel Cron Job からの GET も受け付ける
export async function GET(request: NextRequest) {
  return POST(request);
}
