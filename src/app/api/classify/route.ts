import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { classifyInquiry } from "@/lib/claude/classify";
import { verifyInternalAuth } from "@/lib/auth/internal";

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
    .single();

  if (fetchError || !inquiry) {
    return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
  }

  if (inquiry.status !== "pending") {
    return NextResponse.json({ skipped: true, status: inquiry.status });
  }

  try {
    const result = await classifyInquiry(inquiry.content);

    await supabase
      .from("hub_inquiries")
      .update({
        category: result.category,
        ai_confidence: result.confidence,
        ai_reasoning: result.reasoning,
        status: "classified",
        updated_at: new Date().toISOString(),
      })
      .eq("id", inquiry_id);

    // 通知処理を呼び出し（内部 API のため認証ヘッダーを付与）
    const origin = new URL(request.url).origin;
    await fetch(`${origin}/api/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.INTERNAL_API_SECRET ?? ""}`,
      },
      body: JSON.stringify({ inquiry_id }),
    });

    return NextResponse.json({ success: true, category: result.category });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("classify error:", message);

    await supabase
      .from("hub_inquiries")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", inquiry_id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
