-- ============================================================
-- マルチチャネル通知＋AI自動分類システム Supabase スキーマ
-- 既存の "line-ai-bot" プロジェクトと共存するため hub_ プレフィックスを使用
--
-- 【実行前の注意】
--   - 既存テーブル・データへの変更は一切ありません（CREATE のみ）
--   - Supabase SQL Editor に貼り付けて実行してください
--   - 冪等設計（2回実行しても安全）
-- 【セキュリティ方針】
--   - anon ロールはすべての hub_ テーブルへのアクセスを禁止
--   - データアクセスは SUPABASE_SERVICE_ROLE_KEY を使うサーバーサイドのみ
--   - ダッシュボードは Next.js Server Component + service_role で読み取る
-- ============================================================


-- ============================================================
-- 1. テーブル定義
-- ============================================================

-- 問い合わせテーブル
CREATE TABLE IF NOT EXISTS hub_inquiries (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source          text NOT NULL CHECK (source IN ('gmail', 'line')),
  external_id     text NOT NULL,
  sender_name     text,
  sender_email    text,
  sender_line_id  text,
  subject         text,
  content         text NOT NULL,
  category        text CHECK (category IN ('売買', '賃貸', '修繕依頼', 'クレーム', 'その他')),
  ai_confidence   float,
  ai_reasoning    text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'classified', 'notified', 'failed')),
  received_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

-- 通知履歴テーブル
CREATE TABLE IF NOT EXISTS hub_notifications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  inquiry_id  uuid NOT NULL REFERENCES hub_inquiries(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('slack', 'line')),
  destination text NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'sent', 'failed')),
  retry_count int NOT NULL DEFAULT 0,
  last_error  text,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Gmail 同期状態テーブル（シングルトン: 常に1行）
CREATE TABLE IF NOT EXISTS hub_gmail_sync_state (
  id              uuid PRIMARY KEY,
  last_history_id text,
  last_synced_at  timestamptz NOT NULL DEFAULT now()
);

-- 初期レコード（固定UUID使用で冪等）
INSERT INTO hub_gmail_sync_state (id)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 2. インデックス
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_hub_inquiries_status      ON hub_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_hub_inquiries_category    ON hub_inquiries(category);
CREATE INDEX IF NOT EXISTS idx_hub_inquiries_source      ON hub_inquiries(source);
CREATE INDEX IF NOT EXISTS idx_hub_inquiries_received_at ON hub_inquiries(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_notifications_inquiry_id ON hub_notifications(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_hub_notifications_status     ON hub_notifications(status);


-- ============================================================
-- 3. updated_at 自動更新トリガー
--    hub_ 専用関数を新規作成（既存の update_updated_at_column() を上書きしない）
-- ============================================================

CREATE OR REPLACE FUNCTION hub_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_hub_inquiries_updated_at
  BEFORE UPDATE ON hub_inquiries
  FOR EACH ROW EXECUTE FUNCTION hub_update_updated_at_column();

CREATE OR REPLACE TRIGGER update_hub_notifications_updated_at
  BEFORE UPDATE ON hub_notifications
  FOR EACH ROW EXECUTE FUNCTION hub_update_updated_at_column();


-- ============================================================
-- 4. Row Level Security
--    全テーブルで RLS を有効化し、anon アクセスを完全禁止
--    アクセス可能なロール: service_role のみ
-- ============================================================

ALTER TABLE hub_inquiries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_gmail_sync_state ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 冪等対応: 既存ポリシーを削除してから再作成
-- （前回 SQL を実行済みの場合の anon ポリシー残骸もここで除去）
-- ----------------------------------------------------------------

-- hub_inquiries
DROP POLICY IF EXISTS "hub: service_role full access on hub_inquiries" ON hub_inquiries;
DROP POLICY IF EXISTS "hub: anon read hub_inquiries"                   ON hub_inquiries;

CREATE POLICY "hub: service_role full access on hub_inquiries"
  ON hub_inquiries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- hub_notifications
DROP POLICY IF EXISTS "hub: service_role full access on hub_notifications" ON hub_notifications;
DROP POLICY IF EXISTS "hub: anon read hub_notifications"                   ON hub_notifications;

CREATE POLICY "hub: service_role full access on hub_notifications"
  ON hub_notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- hub_gmail_sync_state
DROP POLICY IF EXISTS "hub: service_role full access on hub_gmail_sync_state" ON hub_gmail_sync_state;

CREATE POLICY "hub: service_role full access on hub_gmail_sync_state"
  ON hub_gmail_sync_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ※ anon・authenticated ロールへのポリシーは意図的に作成しない
--   RLS 有効 + ポリシーなし = デフォルト拒否（PostgreSQL の仕様）
