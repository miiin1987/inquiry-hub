import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { NextRequest } from "next/server";

// after() をテスト内で制御できるようにモック
const afterCallbacks: Array<() => Promise<void>> = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal() as typeof import("next/server");
  return {
    ...actual,
    after: vi.fn((fn: () => Promise<void>) => { afterCallbacks.push(fn); }),
  };
});

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));

import { POST } from "./route";
import { createServerClient } from "@/lib/supabase/server";
import { after } from "next/server";

const CHANNEL_SECRET = "test-channel-secret";
const INTERNAL_SECRET = "test-internal-secret";

function makeSignature(body: string, secret = CHANNEL_SECRET): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

function makeLineBody(events: object[] = []) {
  return JSON.stringify({ destination: "Uxxxxxx", events });
}

function makeTextEvent(id: string, text: string, userId = "U123") {
  return {
    type: "message",
    message: { type: "text", id, text },
    source: { type: "user", userId },
    replyToken: "reply-token",
    timestamp: 1699999999000,
  };
}

function makeRequest(body: string, secret = CHANNEL_SECRET): NextRequest {
  return new NextRequest("http://localhost:3000/api/webhooks/line", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-line-signature": makeSignature(body, secret),
    },
    body,
  });
}

function makeInquiriesFrom(upsertResult: { data: { id: string } | null; error: unknown }) {
  return {
    upsert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(upsertResult),
      }),
    }),
  };
}

beforeEach(() => {
  process.env.LINE_CHANNEL_SECRET = CHANNEL_SECRET;
  process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
});

describe("POST /api/webhooks/line", () => {
  describe("署名検証", () => {
    it("正しい署名なら 200 を返す", async () => {
      const body = makeLineBody([]);
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockReturnValue(makeInquiriesFrom({ data: null, error: null })),
      } as unknown as ReturnType<typeof createServerClient>);

      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
    });

    it("署名が不正なら 401 を返す", async () => {
      const body = makeLineBody([makeTextEvent("msg-1", "テスト")]);
      const res = await POST(makeRequest(body, "wrong-secret"));
      expect(res.status).toBe(401);
    });
  });

  describe("正常処理", () => {
    it("テキストメッセージを保存し after() で classify を呼ぶ", async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeInquiriesFrom({ data: { id: "inq-id-001" }, error: null })
        ),
      } as unknown as ReturnType<typeof createServerClient>);

      const body = makeLineBody([makeTextEvent("msg-1", "賃貸物件を探しています")]);
      const res = await POST(makeRequest(body));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      // after() が登録されているが、まだ呼ばれていない
      expect(after).toHaveBeenCalledTimes(1);

      // after() コールバックを手動実行
      await afterCallbacks[0]();

      const fetchMock = vi.mocked(globalThis.fetch as typeof fetch);
      const classifyCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/api/classify")
      );
      expect(classifyCalls).toHaveLength(1);
      const bodyJson = JSON.parse((classifyCalls[0][1] as RequestInit).body as string);
      expect(bodyJson.inquiry_id).toBe("inq-id-001");
    });

    it("非テキストイベント（スタンプ等）はフィルタして保存しない", async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockReturnValue(makeInquiriesFrom({ data: null, error: null })),
      } as unknown as ReturnType<typeof createServerClient>);

      const body = makeLineBody([
        { type: "message", message: { type: "sticker", id: "stk-1" }, source: {}, timestamp: 0, replyToken: "" },
      ]);
      const res = await POST(makeRequest(body));

      expect(res.status).toBe(200);
      expect(after).not.toHaveBeenCalled();
    });

    it("イベントが空でも 200 を返す", async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockReturnValue(makeInquiriesFrom({ data: null, error: null })),
      } as unknown as ReturnType<typeof createServerClient>);

      const body = makeLineBody([]);
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
      expect(after).not.toHaveBeenCalled();
    });
  });

  describe("重複防止", () => {
    it("PGRST116（重複）: after() を呼ばず classify もしない", async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeInquiriesFrom({ data: null, error: { code: "PGRST116", message: "not exactly one row" } })
        ),
      } as unknown as ReturnType<typeof createServerClient>);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const body = makeLineBody([makeTextEvent("dup-msg-1", "重複メッセージ")]);
      const res = await POST(makeRequest(body));
      errorSpy.mockRestore();

      expect(res.status).toBe(200);
      expect(after).not.toHaveBeenCalled();
      // PGRST116 はエラーログを出さない
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe("DB エラー", () => {
    it("想定外 DB エラー: エラーログを出し after() を呼ばない（Webhook は 200 で返す）", async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeInquiriesFrom({ data: null, error: { code: "42501", message: "permission denied" } })
        ),
      } as unknown as ReturnType<typeof createServerClient>);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const body = makeLineBody([makeTextEvent("msg-err-1", "エラーテスト")]);
      const res = await POST(makeRequest(body));

      expect(res.status).toBe(200);  // LINE には常に 200 を返す（再送防止）
      expect(after).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unexpected upsert error"),
        expect.stringContaining("permission denied")
      );
      errorSpy.mockRestore();
    });
  });

  describe("after() の失敗ハンドリング", () => {
    it("classify が失敗しても after() 内でエラーを吸収する", async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockReturnValue(
          makeInquiriesFrom({ data: { id: "inq-id-002" }, error: null })
        ),
      } as unknown as ReturnType<typeof createServerClient>);

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("classify API down")));

      const body = makeLineBody([makeTextEvent("msg-2", "テスト")]);
      await POST(makeRequest(body));

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      // after コールバックが失敗してもエラーが外に漏れない
      await expect(afterCallbacks[0]()).resolves.toBeUndefined();
      errorSpy.mockRestore();
    });
  });
});
