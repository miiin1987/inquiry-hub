"use client";

import React, { useState } from "react";
import { Inquiry } from "@/lib/types";
import { CategoryBadge, StatusBadge } from "./StatusBadge";

interface Props {
  inquiries: Inquiry[];
}

export function InquiryTable({ inquiries }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (inquiries.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        問い合わせデータがありません
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">受信</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">経路</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">カテゴリ</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">確信度</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">送信者</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">件名 / 内容</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600 w-20">状態</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {inquiries.map((inq) => (
            <React.Fragment key={inq.id}>
              <tr
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => setExpanded(expanded === inq.id ? null : inq.id)}
              >
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {new Date(inq.received_at).toLocaleString("ja-JP", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${inq.source === "gmail" ? "bg-orange-50 text-orange-700" : "bg-green-50 text-green-700"}`}>
                    {inq.source === "gmail" ? "Gmail" : "LINE"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <CategoryBadge category={inq.category} />
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {inq.ai_confidence != null
                    ? `${Math.round(inq.ai_confidence * 100)}%`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-gray-700 max-w-[120px] truncate">
                  {inq.sender_name ?? inq.sender_email ?? inq.sender_line_id ?? "不明"}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <div className="font-medium truncate max-w-xs">
                    {inq.subject ?? inq.content.slice(0, 40)}
                  </div>
                  {inq.subject && (
                    <div className="text-gray-400 truncate max-w-xs text-xs">
                      {inq.content.slice(0, 60)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={inq.status} />
                </td>
              </tr>
              {expanded === inq.id && (
                <tr className="bg-gray-50">
                  <td colSpan={7} className="px-6 py-4">
                    <div className="space-y-2">
                      <div className="text-xs text-gray-500">
                        <span className="font-medium">AI分類理由:</span>{" "}
                        {inq.ai_reasoning ?? "—"}
                      </div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap border-l-2 border-gray-300 pl-3">
                        {inq.content}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
