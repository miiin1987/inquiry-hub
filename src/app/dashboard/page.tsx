import { createServerClient } from "@/lib/supabase/server";
import { InquiryTable } from "@/components/dashboard/InquiryTable";
import { Inquiry, InquiryCategory } from "@/lib/types";
import { logout } from "@/app/login/actions";

export const revalidate = 30;

const CATEGORY_COUNTS: { label: string; category: InquiryCategory | null }[] = [
  { label: "すべて", category: null },
  { label: "売買", category: "売買" },
  { label: "賃貸", category: "賃貸" },
  { label: "修繕依頼", category: "修繕依頼" },
  { label: "クレーム", category: "クレーム" },
  { label: "その他", category: "その他" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; source?: string }>;
}) {
  const params = await searchParams;
  const supabase = createServerClient();

  let query = supabase
    .from("hub_inquiries")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(100);

  if (params.category) query = query.eq("category", params.category);
  if (params.source) query = query.eq("source", params.source);

  const { data: inquiries } = await query;

  // 統計情報
  const { data: stats } = await supabase
    .from("hub_inquiries")
    .select("category, status, source");

  const total = stats?.length ?? 0;
  const notified = stats?.filter((s) => s.status === "notified").length ?? 0;
  const failed = stats?.filter((s) => s.status === "failed").length ?? 0;
  const complaints = stats?.filter((s) => s.category === "クレーム").length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              マルチチャネル通知＋AI自動分類
            </h1>
            <p className="text-sm text-gray-500">問い合わせ管理ダッシュボード</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">30秒ごとに自動更新</span>
            <form action={logout}>
              <button
                type="submit"
                className="text-sm text-gray-500 hover:text-gray-900 px-3 py-1 rounded border border-gray-200 hover:border-gray-400 transition-colors"
              >
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* サマリーカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "総問い合わせ", value: total, color: "text-gray-900" },
            { label: "通知済", value: notified, color: "text-green-700" },
            { label: "クレーム", value: complaints, color: "text-red-700" },
            { label: "エラー", value: failed, color: "text-orange-700" },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-lg border border-gray-200 px-4 py-4">
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-xs text-gray-500 mt-1">{card.label}</div>
            </div>
          ))}
        </div>

        {/* フィルター */}
        <div className="flex flex-wrap gap-2 items-center">
          {CATEGORY_COUNTS.map(({ label, category }) => {
            const href = category
              ? `/dashboard?category=${encodeURIComponent(category)}${params.source ? `&source=${params.source}` : ""}`
              : `/dashboard${params.source ? `?source=${params.source}` : ""}`;
            const isActive = (params.category ?? null) === category;
            return (
              <a
                key={label}
                href={href}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {label}
              </a>
            );
          })}
          <div className="ml-auto flex gap-2">
            {["gmail", "line"].map((source) => {
              const isActive = params.source === source;
              const href = isActive
                ? `/dashboard${params.category ? `?category=${params.category}` : ""}`
                : `/dashboard?source=${source}${params.category ? `&category=${params.category}` : ""}`;
              return (
                <a
                  key={source}
                  href={href}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {source === "gmail" ? "Gmail" : "LINE"}
                </a>
              );
            })}
          </div>
        </div>

        {/* テーブル */}
        <InquiryTable inquiries={(inquiries as Inquiry[]) ?? []} />
      </main>
    </div>
  );
}
