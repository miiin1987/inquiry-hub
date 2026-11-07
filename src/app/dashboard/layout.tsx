import { redirect } from "next/navigation";
import { createSupabaseAuthClient } from "@/lib/supabase/auth-server";

// middleware の後にさらにサーバー側で認証を再検証する（多層防御）
// middleware は Cookie キャッシュを見るが、ここでは Supabase Auth サーバーに直接問い合わせる
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    redirect("/login");
  }

  return <>{children}</>;
}
