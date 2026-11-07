import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  // middleware からの unauthorized リダイレクト時にエラーを表示
  const initialError =
    params.error === "unauthorized"
      ? "管理者権限がありません。システム管理者に連絡してください。"
      : undefined;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <LoginForm initialError={initialError} />
    </div>
  );
}
