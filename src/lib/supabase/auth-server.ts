import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// セッション読み取り・Auth 操作用クライアント（anon キー）
// データ取得には使わない。service_role は server.ts を使う。
export async function createSupabaseAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component のレンダリング中は cookie を設定できない。
            // トークンの自動更新は middleware が担う。
          }
        },
      },
    }
  );
}
