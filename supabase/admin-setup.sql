-- ============================================================
-- 管理者ロール設定（schema.sql 実行後に行う手順）
--
-- 【事前準備】
--   Supabase Dashboard > Authentication > Users
--   「Add user」でメール/パスワードのユーザーを作成してください
--
-- 【実行手順】
--   1. 下記の 'admin@example.com' を実際の管理者メールアドレスに変更
--   2. Supabase SQL Editor に貼り付けて実行
--
-- 【セキュリティ補足】
--   app_metadata は service_role キーでのみ変更可能です。
--   ユーザー自身は app_metadata を変更できないため、
--   role の自己昇格はシステム上不可能です。
-- ============================================================

-- 管理者ロールを付与
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'admin@example.com';  -- ← 実際のメールアドレスに変更

-- 設定確認（実行後に結果を確認してください）
SELECT
  id,
  email,
  raw_app_meta_data ->> 'role' AS role,
  created_at
FROM auth.users
WHERE email = 'admin@example.com';  -- ← 同様に変更

-- 期待する出力:
-- role = 'admin' が表示されれば設定完了です
