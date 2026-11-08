# 問い合わせ自動分類・Slack 通知システム（Inquiry Hub）

Gmail・LINE から届いた問い合わせを **Claude AI** が自動分類し、担当 Slack チャンネルへ通知する業務自動化システムです。  
ポートフォリオ用途の自主制作です。不動産会社向けのカテゴリ設定（売買・賃貸・修繕・クレーム）を想定しています。

## 主な機能

| 機能 | 詳細 |
|------|------|
| Gmail 同期 | Cron ジョブで定期的にメールを取得し、問い合わせとして登録 |
| LINE Webhook | LINE Messaging API の Webhook でメッセージを受信・登録 |
| AI 自動分類 | Claude API（`claude-haiku`）が内容を 5 カテゴリに分類 |
| Slack 通知 | 分類結果に応じた担当チャンネルへ問い合わせ内容を通知 |
| 管理ダッシュボード | 問い合わせ一覧・ステータス・分類結果の確認（Supabase 認証） |

**分類カテゴリ：** 売買 / 賃貸 / 修繕依頼 / クレーム / その他

## 使用技術

| カテゴリ | 技術 |
|----------|------|
| フレームワーク | Next.js / React / TypeScript |
| AI | Anthropic Claude API |
| データベース | Supabase（PostgreSQL） |
| 認証 | Supabase Auth |
| 外部連携 | Gmail API（Google OAuth2）/ LINE Messaging API / Slack API |
| デプロイ | Vercel（Cron Jobs 利用） |

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local.example` をコピーして `.env.local` を作成し、各値を設定します。

```bash
cp .env.local.example .env.local
```

主な環境変数：

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role キー |
| `ANTHROPIC_API_KEY` | Anthropic API キー |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | Gmail OAuth2 認証情報 |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API |
| `SLACK_BOT_TOKEN` / `SLACK_CHANNEL_*` | Slack Bot トークンと通知先チャンネル ID |
| `CRON_SECRET` | Cron ジョブの認証用シークレット |
| `INTERNAL_API_SECRET` | 内部 API 認証用シークレット |

### 3. Supabase スキーマの設定

```bash
# Supabase SQL Editor で実行
supabase/schema.sql
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) でアクセスできます。

### 5. テストの実行

```bash
npm test
```

## 注意事項

- 掲載内容はポートフォリオ用途の自主制作です。実際の顧客への導入実績ではありません。
- Gmail・LINE・Slack の各 API は別途アカウント登録とアプリ設定が必要です。
