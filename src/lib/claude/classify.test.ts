import { describe, it, expect, vi } from "vitest";

// @anthropic-ai/sdk のモック（モジュール評価時の Anthropic 初期化エラーを防ぐ）
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));

import { extractJson } from "./classify";

describe("extractJson", () => {
  describe("正常系", () => {
    it("生のJSONをそのまま返す", () => {
      const json = '{"category":"賃貸","confidence":0.9,"reasoning":"賃貸物件の問い合わせ"}';
      expect(extractJson(json)).toBe(json);
    });

    it("```json フェンスを除去する", () => {
      const input = '```json\n{"category":"賃貸","confidence":0.9,"reasoning":"..."}\n```';
      expect(extractJson(input)).toBe('{"category":"賃貸","confidence":0.9,"reasoning":"..."}');
    });

    it("``` フェンスを除去する（json省略）", () => {
      const input = '```\n{"category":"売買","confidence":0.8,"reasoning":"..."}\n```';
      expect(extractJson(input)).toBe('{"category":"売買","confidence":0.8,"reasoning":"..."}');
    });

    it("前後の空白・改行を除去する", () => {
      const json = '{"category":"その他","confidence":0.5,"reasoning":"..."}';
      expect(extractJson(`  ${json}  `)).toBe(json);
    });

    it("複数行JSONのフェンスを除去する", () => {
      const inner = '{\n  "category": "修繕依頼",\n  "confidence": 0.95,\n  "reasoning": "設備修理"\n}';
      const input = "```json\n" + inner + "\n```";
      expect(extractJson(input)).toBe(inner);
    });
  });

  describe("異常系", () => {
    it("フェンスが一部だけの場合は除去しない（先頭に他テキストあり）", () => {
      const input = 'prefix ```json\n{"category":"賃貸"}\n``` suffix';
      expect(extractJson(input)).toBe(input.trim());
    });

    it("空文字列はそのまま返す", () => {
      expect(extractJson("")).toBe("");
      expect(extractJson("   ")).toBe("");
    });

    it("extractJson後にJSON.parseが失敗する文字列はそのまま返す", () => {
      const input = "not valid json";
      expect(extractJson(input)).toBe(input);
      expect(() => JSON.parse(extractJson(input))).toThrow(SyntaxError);
    });

    it("フェンス内の不正なJSONもそのまま渡す（parseはcallerの責任）", () => {
      const input = "```json\n{invalid json}\n```";
      expect(extractJson(input)).toBe("{invalid json}");
      expect(() => JSON.parse(extractJson(input))).toThrow();
    });

    it("フェンス開始のみでフェンス終了なしの場合は除去しない", () => {
      const input = "```json\n{\"category\":\"賃貸\"}";
      expect(extractJson(input)).toBe(input.trim());
    });
  });
});
