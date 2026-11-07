import { InquiryCategory, InquiryStatus } from "@/lib/types";

const CATEGORY_STYLES: Record<InquiryCategory, string> = {
  売買: "bg-blue-100 text-blue-800",
  賃貸: "bg-green-100 text-green-800",
  修繕依頼: "bg-yellow-100 text-yellow-800",
  クレーム: "bg-red-100 text-red-800",
  その他: "bg-gray-100 text-gray-700",
};

const STATUS_STYLES: Record<InquiryStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  classified: "bg-blue-100 text-blue-700",
  notified: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<InquiryStatus, string> = {
  pending: "処理中",
  classified: "分類済",
  notified: "通知済",
  failed: "失敗",
};

export function CategoryBadge({ category }: { category: InquiryCategory | null }) {
  if (!category) return <span className="text-gray-400 text-xs">未分類</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_STYLES[category]}`}>
      {category}
    </span>
  );
}

export function StatusBadge({ status }: { status: InquiryStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
