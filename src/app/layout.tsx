import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "マルチチャネル通知＋AI自動分類",
  description: "GmailとLINEからの問い合わせをAIで自動分類してSlackへ通知するシステム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
