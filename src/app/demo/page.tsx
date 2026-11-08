"use client";

/**
 * /demo  ─ 認証不要のサンプルデモページ
 *
 * - Supabase / Claude API / LINE / Slack には一切接続しない
 * - 本番データを取得・送信しない
 * - 架空の不動産会社「株式会社みらい不動産」への問い合わせデータをハードコード
 */

import { useState, useMemo } from "react";
import type { Inquiry, InquiryCategory, InquiryStatus } from "@/lib/types";
import { InquiryTable } from "@/components/dashboard/InquiryTable";

// ─── サンプルデータ 15件 ────────────────────────────────────────────
// 架空の不動産会社への問い合わせ。個人情報・実在データは含みません。

const DEMO_INQUIRIES: Inquiry[] = [
  // ── 売買 (3件) ────────────────────────────────────────────
  {
    id: "demo-01", source: "line", external_id: "ext-001",
    sender_name: "田中 様", sender_email: null, sender_line_id: "U0001",
    subject: null,
    content: "渋谷区の中古マンションを2,500万円前後で探しています。3LDK以上で駐車場付きが希望です。内覧の相談をしたいのですが、対応可能でしょうか。",
    category: "売買", ai_confidence: 0.97,
    ai_reasoning: "「中古マンションを探している」「内覧の相談」から購入目的の問い合わせと判断。",
    status: "notified",
    received_at: "2026-11-08T09:12:00+09:00", created_at: "2026-11-08T09:12:01+09:00", updated_at: "2026-11-08T09:12:35+09:00",
  },
  {
    id: "demo-02", source: "gmail", external_id: "ext-002",
    sender_name: "山本 様", sender_email: "yamamoto@example-demo.com", sender_line_id: null,
    subject: "所有物件の売却査定依頼",
    content: "世田谷区に戸建て（築15年）を所有しております。売却を検討しており、査定をお願いしたいです。来週以降に訪問査定を希望しています。",
    category: "売買", ai_confidence: 0.95,
    ai_reasoning: "「売却」「査定」というキーワードが明確に含まれているため売買と判断。",
    status: "notified",
    received_at: "2026-11-07T14:30:00+09:00", created_at: "2026-11-07T14:30:01+09:00", updated_at: "2026-11-07T14:31:20+09:00",
  },
  {
    id: "demo-03", source: "line", external_id: "ext-003",
    sender_name: "鈴木 様", sender_email: null, sender_line_id: "U0003",
    subject: null,
    content: "先日ウェブサイトで見た物件（物件コード: MN-204）の内覧を希望します。土日の午前中に対応可能な日程を教えてください。",
    category: "売買", ai_confidence: 0.91,
    ai_reasoning: "「内覧を希望」「物件コード」の記載から物件購入に向けた問い合わせと判断。",
    status: "classified",
    received_at: "2026-11-08T11:04:00+09:00", created_at: "2026-11-08T11:04:01+09:00", updated_at: "2026-11-08T11:04:28+09:00",
  },
  // ── 賃貸 (4件) ────────────────────────────────────────────
  {
    id: "demo-04", source: "line", external_id: "ext-004",
    sender_name: "佐藤 様", sender_email: null, sender_line_id: "U0004",
    subject: null,
    content: "小型犬を飼っているのですが、ペット可の1LDKを新宿区か渋谷区で探しています。予算は月10万円以内です。来月入居希望なので急いでいます。",
    category: "賃貸", ai_confidence: 0.98,
    ai_reasoning: "「ペット可」「1LDK」「入居希望」から賃貸物件の探索と判断。",
    status: "notified",
    received_at: "2026-11-08T08:55:00+09:00", created_at: "2026-11-08T08:55:01+09:00", updated_at: "2026-11-08T08:55:40+09:00",
  },
  {
    id: "demo-05", source: "gmail", external_id: "ext-005",
    sender_name: "高橋 様", sender_email: "takahashi@example-demo.com", sender_line_id: null,
    subject: "賃貸物件のご相談",
    content: "来春から転勤で東京に赴任します。港区または品川区の駅徒歩10分以内で2LDK以上、オートロック付きの物件を探しています。家賃は月25万円まで。",
    category: "賃貸", ai_confidence: 0.96,
    ai_reasoning: "「賃貸物件」「入居希望条件」が明確に述べられており賃貸と判断。",
    status: "notified",
    received_at: "2026-11-07T16:20:00+09:00", created_at: "2026-11-07T16:20:01+09:00", updated_at: "2026-11-07T16:21:05+09:00",
  },
  {
    id: "demo-06", source: "line", external_id: "ext-006",
    sender_name: "伊藤 様", sender_email: null, sender_line_id: "U0006",
    subject: null,
    content: "現在入居中の物件（契約番号: TL-1023）の更新時に家賃交渉は可能でしょうか。周辺相場より高いと感じているので、見直しをお願いしたいです。",
    category: "賃貸", ai_confidence: 0.88,
    ai_reasoning: "「家賃交渉」「契約更新」から賃貸に関する問い合わせと判断。購入ではなく賃貸継続の文脈。",
    status: "notified",
    received_at: "2026-11-06T13:45:00+09:00", created_at: "2026-11-06T13:45:01+09:00", updated_at: "2026-11-06T13:46:12+09:00",
  },
  {
    id: "demo-07", source: "gmail", external_id: "ext-007",
    sender_name: "渡辺 様", sender_email: "watanabe@example-demo.com", sender_line_id: null,
    subject: "1DK物件の空き状況について",
    content: "目黒区で1DKの物件を探しています。家賃8万円以下、2階以上、エアコン付きが条件です。今月中に契約できる空き物件はありますか。",
    category: "賃貸", ai_confidence: 0.94,
    ai_reasoning: "「物件を探している」「家賃条件」「今月中に契約」から賃貸の問い合わせと判断。",
    status: "notified",
    received_at: "2026-11-07T10:08:00+09:00", created_at: "2026-11-07T10:08:01+09:00", updated_at: "2026-11-07T10:09:30+09:00",
  },
  // ── 修繕依頼 (3件) ───────────────────────────────────────
  {
    id: "demo-08", source: "line", external_id: "ext-008",
    sender_name: "小林 様", sender_email: null, sender_line_id: "U0008",
    subject: null,
    content: "洗面台の蛇口から水漏れが止まりません。タオルで抑えていますが、床が濡れてきました。今日中に対応してもらえますか。物件は目黒区のNR-301です。",
    category: "修繕依頼", ai_confidence: 0.99,
    ai_reasoning: "「水漏れが止まらない」「今日中に対応」から緊急の修繕依頼と判断。",
    status: "notified",
    received_at: "2026-11-08T07:30:00+09:00", created_at: "2026-11-08T07:30:01+09:00", updated_at: "2026-11-08T07:30:52+09:00",
  },
  {
    id: "demo-09", source: "gmail", external_id: "ext-009",
    sender_name: "加藤 様", sender_email: "kato@example-demo.com", sender_line_id: null,
    subject: "エアコン故障の修理依頼",
    content: "入居中のエアコン（品番: PAT-2200X）が動かなくなりました。電源は入るのですが冷風が出ません。先日から猛暑が続いており困っています。早急な対応をお願いします。",
    category: "修繕依頼", ai_confidence: 0.97,
    ai_reasoning: "「エアコン故障」「修理依頼」「早急な対応」から修繕依頼と明確に判断。",
    status: "notified",
    received_at: "2026-11-07T12:00:00+09:00", created_at: "2026-11-07T12:00:01+09:00", updated_at: "2026-11-07T12:01:08+09:00",
  },
  {
    id: "demo-10", source: "line", external_id: "ext-010",
    sender_name: "松本 様", sender_email: null, sender_line_id: "U0010",
    subject: null,
    content: "玄関の鍵が壊れて外から開けられなくなりました。今夜帰れないので至急対応をお願いします。",
    category: "修繕依頼", ai_confidence: 0.98,
    ai_reasoning: "「鍵が壊れた」「至急対応」から緊急修繕依頼と判断。",
    status: "classified",
    received_at: "2026-11-08T18:42:00+09:00", created_at: "2026-11-08T18:42:01+09:00", updated_at: "2026-11-08T18:42:22+09:00",
  },
  // ── クレーム (2件) ────────────────────────────────────────
  {
    id: "demo-11", source: "line", external_id: "ext-011",
    sender_name: "井上 様", sender_email: null, sender_line_id: "U0011",
    subject: null,
    content: "先日対応いただいた担当者の方の態度がひどかったです。質問しても「わかりません」の繰り返しで、全く誠意が感じられませんでした。責任者を出してください。",
    category: "クレーム", ai_confidence: 0.96,
    ai_reasoning: "「態度がひどかった」「誠意が感じられない」「責任者を出して」から強い不満・クレームと判断。",
    status: "notified",
    received_at: "2026-11-07T15:10:00+09:00", created_at: "2026-11-07T15:10:01+09:00", updated_at: "2026-11-07T15:10:55+09:00",
  },
  {
    id: "demo-12", source: "gmail", external_id: "ext-012",
    sender_name: "木村 様", sender_email: "kimura@example-demo.com", sender_line_id: null,
    subject: "契約時の説明と実態が異なる件について",
    content: "契約時に「防音設備完備」と説明されましたが、実際には上の階の生活音がひどく、眠れない状態です。虚偽の説明で契約させられたと感じており、法的対応も検討しています。",
    category: "クレーム", ai_confidence: 0.93,
    ai_reasoning: "「虚偽の説明」「法的対応を検討」から深刻なクレームと判断。",
    status: "failed",
    received_at: "2026-11-06T17:00:00+09:00", created_at: "2026-11-06T17:00:01+09:00", updated_at: "2026-11-06T17:03:45+09:00",
  },
  // ── その他 (3件) ─────────────────────────────────────────
  {
    id: "demo-13", source: "line", external_id: "ext-013",
    sender_name: "橋本 様", sender_email: null, sender_line_id: "U0013",
    subject: null,
    content: "週末も営業していますか？土曜日の午後に相談に行きたいのですが、事前予約が必要ですか。",
    category: "その他", ai_confidence: 0.90,
    ai_reasoning: "「営業時間」「事前予約」に関する問い合わせで、売買・賃貸・修繕のいずれにも該当しないため「その他」と判断。",
    status: "notified",
    received_at: "2026-11-08T10:33:00+09:00", created_at: "2026-11-08T10:33:01+09:00", updated_at: "2026-11-08T10:33:38+09:00",
  },
  {
    id: "demo-14", source: "gmail", external_id: "ext-014",
    sender_name: "藤原 様", sender_email: "fujiwara@example-demo.com", sender_line_id: null,
    subject: "オフィスへのアクセス方法を教えてください",
    content: "来週の月曜日に御社へ伺う予定ですが、最寄り駅からのアクセス方法を教えていただけますか。またパーキングはありますか。",
    category: "その他", ai_confidence: 0.87,
    ai_reasoning: "「アクセス方法」「パーキング」に関する問い合わせで、4つのカテゴリに該当しないため「その他」と判断。",
    status: "notified",
    received_at: "2026-11-06T09:50:00+09:00", created_at: "2026-11-06T09:50:01+09:00", updated_at: "2026-11-06T09:51:18+09:00",
  },
  {
    id: "demo-15", source: "line", external_id: "ext-015",
    sender_name: "岡田 様", sender_email: null, sender_line_id: "U0015",
    subject: null,
    content: "来月引越しを予定しています。信頼できる引越し業者を紹介してもらえますか？荷物は少ない方です。",
    category: "その他", ai_confidence: 0.82,
    ai_reasoning: "「引越し業者の紹介」は不動産取引・修繕・クレームには該当しないため「その他」と判断。",
    status: "notified",
    received_at: "2026-11-05T16:25:00+09:00", created_at: "2026-11-05T16:25:01+09:00", updated_at: "2026-11-05T16:26:00+09:00",
  },
];

// ─── カテゴリ / ソースフィルター定義 ────────────────────────────────

type CategoryFilter = InquiryCategory | null;
type SourceFilter = "gmail" | "line" | null;

const CATEGORY_OPTIONS: { label: string; value: CategoryFilter }[] = [
  { label: "すべて", value: null },
  { label: "売買",   value: "売買" },
  { label: "賃貸",   value: "賃貸" },
  { label: "修繕依頼", value: "修繕依頼" },
  { label: "クレーム", value: "クレーム" },
  { label: "その他", value: "その他" },
];

export default function DemoPage() {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>(null);
  const [activeSource, setActiveSource] = useState<SourceFilter>(null);

  const filtered = useMemo(() => {
    return DEMO_INQUIRIES.filter((inq) => {
      if (activeCategory && inq.category !== activeCategory) return false;
      if (activeSource && inq.source !== activeSource) return false;
      return true;
    });
  }, [activeCategory, activeSource]);

  // KPI（全件ベースで常に表示）
  const total      = DEMO_INQUIRIES.length;
  const notified   = DEMO_INQUIRIES.filter(i => i.status === "notified").length;
  const complaints = DEMO_INQUIRIES.filter(i => i.category === "クレーム").length;
  const failed     = DEMO_INQUIRIES.filter(i => i.status === "failed").length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* デモ告知バナー */}
      <div className="bg-amber-50 border-b-2 border-amber-300 px-6 py-3">
        <div className="max-w-7xl mx-auto text-center text-sm text-amber-800">
          <span className="font-bold">⚠️ デモ版</span>
          {" "}これはサンプルデータを使用した操作デモです。表示されているデータはすべて架空のものです。
          実在する企業・個人とは一切関係なく、Supabase・Claude API・LINE・Slackには接続していません。
        </div>
      </div>

      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              マルチチャネル通知＋AI自動分類
            </h1>
            <p className="text-sm text-gray-500">
              問い合わせ管理ダッシュボード
              <span className="ml-2 text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                DEMO
              </span>
            </p>
          </div>
          <div className="text-xs text-gray-400">
            架空会社「株式会社みらい不動産」のサンプルデータ
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* KPIカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "総問い合わせ", value: total,      color: "text-gray-900" },
            { label: "通知済",       value: notified,   color: "text-green-700" },
            { label: "クレーム",     value: complaints, color: "text-red-700" },
            { label: "エラー",       value: failed,     color: "text-orange-700" },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-lg border border-gray-200 px-4 py-4">
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-xs text-gray-500 mt-1">{card.label}</div>
            </div>
          ))}
        </div>

        {/* フィルター */}
        <div className="flex flex-wrap gap-2 items-center">
          {CATEGORY_OPTIONS.map(({ label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => setActiveCategory(value)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                activeCategory === value
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            {(["gmail", "line"] as const).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setActiveSource(activeSource === src ? null : src)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  activeSource === src
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {src === "gmail" ? "Gmail" : "LINE"}
              </button>
            ))}
          </div>
        </div>

        {/* 問い合わせテーブル */}
        <InquiryTable inquiries={filtered} />

        {/* フッター説明 */}
        <div className="text-xs text-gray-400 border-t border-gray-200 pt-4 pb-8">
          <p>
            このデモページは架空の不動産会社への問い合わせデータ（15件）を使用した表示サンプルです。
            実際のシステムでは Gmail・LINE から問い合わせを受信し、Claude AI が自動分類、担当 Slack チャンネルへ通知します。
          </p>
        </div>
      </main>
    </div>
  );
}
