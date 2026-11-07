import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // レスポンスを初期化し、プロキシ内でセッション Cookie を更新できるようにする
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() は Supabase Auth サーバーに問い合わせるため、
  // JWT の改ざんや期限切れを確実に検出できる
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 未ログイン → /login へリダイレクト
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ログイン済みだが管理者権限なし → /login?error=unauthorized
  if (user.app_metadata?.role !== "admin") {
    return NextResponse.redirect(
      new URL("/login?error=unauthorized", request.url)
    );
  }

  return supabaseResponse;
}

// /dashboard 配下のみ保護。API・LINE Webhook・Cron は対象外
export const config = {
  matcher: ["/dashboard/:path*"],
};
