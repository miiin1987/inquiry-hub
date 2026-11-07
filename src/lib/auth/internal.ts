import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

// タイミング攻撃対策: 文字列長が異なる場合でも一定時間で比較する
function timingSafeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf); // 長さ不一致でも比較時間を均一化
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * 内部 API の認証を検証する。
 * - INTERNAL_API_SECRET 未設定時は必ず 401 を返す（安全に失敗）
 * - Authorization: Bearer <secret> が一致した場合のみ null を返す
 * @returns null = 認証OK、NextResponse = 認証失敗（そのまま return する）
 */
export function verifyInternalAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.INTERNAL_API_SECRET;

  // 未設定時は認証を無効化せず安全に失敗
  if (!secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!timingSafeCompare(secret, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
