"use server";

import { createSupabaseAuthClient } from "@/lib/supabase/auth-server";
import { redirect } from "next/navigation";

export type LoginState = { error: string } | null;

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }

  const supabase = await createSupabaseAuthClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: "メールアドレスまたはパスワードが正しくありません。" };
  }

  // app_metadata.role はサーバーサイドでのみ設定可能（ユーザーは変更不可）
  if (data.user.app_metadata?.role !== "admin") {
    await supabase.auth.signOut();
    return { error: "管理者権限がありません。システム管理者に連絡してください。" };
  }

  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  const supabase = await createSupabaseAuthClient();
  await supabase.auth.signOut();
  redirect("/login");
}
