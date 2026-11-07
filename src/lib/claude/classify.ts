import Anthropic from "@anthropic-ai/sdk";
import { ClassifyResult, InquiryCategory } from "@/lib/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_CATEGORIES: InquiryCategory[] = [
  "売買",
  "賃貸",
  "修繕依頼",
  "クレーム",
  "その他",
];

const SYSTEM_PROMPT = `あなたは不動産会社のお問い合わせ分類AIです。
受け取った問い合わせ内容を、以下の5つのカテゴリのうち最も適切なものに分類してください。

カテゴリ定義:
- 売買: 物件の購入・売却・査定・価格・購入目的の物件探し・内覧希望に関する問い合わせ
- 賃貸: 賃貸物件の入居・退去・契約・家賃・賃貸目的の物件探し・入居条件（ペット可など）に関する問い合わせ
- 修繕依頼: 設備の故障・修理・メンテナンス・リフォーム・水漏れなど修理を依頼する問い合わせ
- クレーム: 会社の対応・サービスへの苦情・強い不満・抗議を含む問い合わせ
- その他: 営業時間・アクセス・会社情報など、上記4カテゴリのいずれにも該当しない問い合わせ

分類の優先ルール:
1. 修繕依頼と強い苦情・不満が混在する場合は「クレーム」を優先する
2. 「借りたい」「賃貸物件を探す」「入居したい」「家賃」「ペット可」→ 賃貸（間取り表記だけでは賃貸と判断しない）
3. 「購入したい」「買いたい」「売却したい」「査定」「物件価格を知りたい」→ 売買
4. 購入か賃貸か判断できない場合は、「借りる」「購入」などの意図を表す言葉を重視する
5. 上記4カテゴリのいずれかに少しでも該当する場合は「その他」を使わない

必ず以下のJSON形式のみで回答してください（前後に他のテキストや改行を一切含めないこと）:
{"category":"カテゴリ名","confidence":0.95,"reasoning":"分類した理由を50字以内で"}

confidenceにはカテゴリ判定の確信度（0.0〜1.0の実数）を入れてください。`;

/**
 * 応答全体が Markdown コードフェンスで囲まれている場合のみフェンスを除去する。
 * フェンスがない通常の JSON はそのまま返す。
 */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

export async function classifyInquiry(content: string): Promise<ClassifyResult> {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  const parsed = JSON.parse(extractJson(text)) as {
    category: string;
    confidence: number;
    reasoning: string;
  };

  if (!VALID_CATEGORIES.includes(parsed.category as InquiryCategory)) {
    throw new Error(`Invalid category: ${parsed.category}`);
  }

  return {
    category: parsed.category as InquiryCategory,
    confidence: Math.min(1, Math.max(0, parsed.confidence)),
    reasoning: parsed.reasoning,
  };
}
