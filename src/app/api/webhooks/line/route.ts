import { NextRequest, NextResponse, after } from "next/server";
import { verifyLineSignature, LineWebhookBody } from "@/lib/line/webhook";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  if (!verifyLineSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body: LineWebhookBody = JSON.parse(rawBody);
  const supabase = createServerClient();

  const textEvents = body.events.filter(
    (e) => e.type === "message" && e.message.type === "text"
  );

  const savedIds: string[] = [];

  for (const event of textEvents) {
    const { data, error } = await supabase
      .from("hub_inquiries")
      .upsert(
        {
          source: "line",
          external_id: event.message.id,
          sender_line_id: event.source.userId ?? null,
          content: event.message.text,
          received_at: new Date(event.timestamp).toISOString(),
          status: "pending",
        },
        { onConflict: "source,external_id", ignoreDuplicates: true }
      )
      .select("id")
      .single();

    if (!data) {
      // PGRST116 = ignoreDuplicates による正常スキップ。それ以外は予期しないエラーとしてログに残す
      if (error && error.code !== "PGRST116") {
        console.error(`Unexpected upsert error for LINE message ${event.message.id}:`, error.message);
      }
      continue;
    }
    savedIds.push(data.id);
  }

  // レスポンスを即返却し、after() で分類処理をバックグラウンド実行
  // Vercel Fluid Compute では after() のコールバックが完了するまで関数が維持される
  if (savedIds.length > 0) {
    const origin = new URL(request.url).origin;
    after(async () => {
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
          console.error("classify trigger error for", id, ":", err);
        }
      }
    });
  }

  return NextResponse.json({ ok: true });
}
