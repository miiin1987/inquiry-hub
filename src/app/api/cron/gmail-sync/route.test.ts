import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/gmail/fetch", () => ({ fetchNewEmails: vi.fn() }));

import { POST } from "./route";
import { createServerClient } from "@/lib/supabase/server";
import { fetchNewEmails } from "@/lib/gmail/fetch";

const CRON_SECRET = "test-cron-secret";
const INTERNAL_SECRET = "test-internal-secret";

const SAMPLE_EMAIL = {
  messageId: "msg-id-001",
  subject: "テスト件名",
  from: "送信者",
  fromEmail: "sender@example.com",
  body: "テスト本文",
  date: new Date("2026-11-07T00:00:00Z"),
};

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/cron/gmail-sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
}

function makeSyncStateFrom() {
  return {
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: "sync-row-id", last_history_id: null },
        error: null,
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  };
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

/** syncState の update.eq が呼ばれたか検査できる拡張ヘルパー */
function makeSupabaseMockWithTracking(
  upsertResult: { data: { id: string } | null; error: unknown }
) {
  const updateEqMock = vi.fn().mockResolvedValue({ error: null });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "hub_gmail_sync_state") {
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "sync-row-id", last_history_id: "prev-id" },
              error: null,
            }),
          }),
          update: updateMock,
        };
      }
      if (table === "hub_inquiries") return makeInquiriesFrom(upsertResult);
      return {};
    }),
  };
  return { supabase, updateMock, updateEqMock };
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
  );
});

describe("POST /api/cron/gmail-sync", () => {
  describe("認証", () => {
    it("CRON_SECRET が違う場合は 401 を返す", async () => {
      const req = new NextRequest("http://localhost:3000/api/cron/gmail-sync", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-secret" },
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe("重複防止", () => {
    it("重複メール(PGRST116): classify を呼ばず saved=0 を返し エラーログを出さない", async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "hub_gmail_sync_state") return makeSyncStateFrom();
          if (table === "hub_inquiries")
            return makeInquiriesFrom({
              data: null,
              error: { code: "PGRST116", message: "not exactly one row" },
            });
          return {};
        }),
      } as unknown as ReturnType<typeof createServerClient>);

      vi.mocked(fetchNewEmails).mockResolvedValue({
        emails: [SAMPLE_EMAIL],
        newHistoryId: "99999",
      });

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.processed).toBe(1);
      expect(body.saved).toBe(0);

      // classify は呼ばれない
      const fetchMock = vi.mocked(globalThis.fetch as typeof fetch);
      const classifyCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/api/classify")
      );
      expect(classifyCalls).toHaveLength(0);

      // PGRST116 はエラーログを出さない
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("新規メール: upsert が id を返したとき classify を 1 回呼び saved=1 を返す", async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "hub_gmail_sync_state") return makeSyncStateFrom();
          if (table === "hub_inquiries")
            return makeInquiriesFrom({ data: { id: "new-id-001" }, error: null });
          return {};
        }),
      } as unknown as ReturnType<typeof createServerClient>);

      vi.mocked(fetchNewEmails).mockResolvedValue({
        emails: [SAMPLE_EMAIL],
        newHistoryId: "99999",
      });

      const res = await POST(makeRequest());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.processed).toBe(1);
      expect(body.saved).toBe(1);

      const fetchMock = vi.mocked(globalThis.fetch as typeof fetch);
      const classifyCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/api/classify")
      );
      expect(classifyCalls).toHaveLength(1);

      const [, classifyInit] = classifyCalls[0];
      const bodyJson = JSON.parse((classifyInit as RequestInit).body as string);
      expect(bodyJson.inquiry_id).toBe("new-id-001");
    });

    it("同じメールを 2 件送っても 1 件目が新規・2 件目が重複なら saved=1 classify=1 回", async () => {
      let callCount = 0;
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "hub_gmail_sync_state") return makeSyncStateFrom();
          if (table === "hub_inquiries") {
            callCount++;
            return makeInquiriesFrom(
              callCount === 1
                ? { data: { id: "new-id-001" }, error: null }
                : { data: null, error: { code: "PGRST116" } }
            );
          }
          return {};
        }),
      } as unknown as ReturnType<typeof createServerClient>);

      vi.mocked(fetchNewEmails).mockResolvedValue({
        emails: [SAMPLE_EMAIL, { ...SAMPLE_EMAIL, messageId: "msg-id-002" }],
        newHistoryId: "99999",
      });

      const res = await POST(makeRequest());
      const body = await res.json();

      expect(body.processed).toBe(2);
      expect(body.saved).toBe(1);

      const fetchMock = vi.mocked(globalThis.fetch as typeof fetch);
      const classifyCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/api/classify")
      );
      expect(classifyCalls).toHaveLength(1);
    });

    it("想定外 DB エラー: console.error を出力して continue する（classify は呼ばない）", async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "hub_gmail_sync_state") return makeSyncStateFrom();
          if (table === "hub_inquiries")
            return makeInquiriesFrom({
              data: null,
              error: { code: "42501", message: "permission denied for table hub_inquiries" },
            });
          return {};
        }),
      } as unknown as ReturnType<typeof createServerClient>);

      vi.mocked(fetchNewEmails).mockResolvedValue({
        emails: [SAMPLE_EMAIL],
        newHistoryId: "99999",
      });

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const res = await POST(makeRequest());
      const body = await res.json();

      expect(body.saved).toBe(0);
      // PGRST116 以外のエラーはログに出る
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unexpected upsert error"),
        expect.stringContaining("permission denied")
      );
      errorSpy.mockRestore();
    });

    it("GMAIL_LABEL_FILTER 未設定で fetchNewEmails が空を返したとき saved=0", async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "hub_gmail_sync_state") return makeSyncStateFrom();
          return {};
        }),
      } as unknown as ReturnType<typeof createServerClient>);

      vi.mocked(fetchNewEmails).mockResolvedValue({
        emails: [],
        newHistoryId: null,
      });

      const res = await POST(makeRequest());
      const body = await res.json();

      expect(body.processed).toBe(0);
      expect(body.saved).toBe(0);
    });
  });

  describe("historyId 更新タイミング", () => {
    it("全成功: historyId が更新される (historyAdvanced=true)", async () => {
      const { supabase, updateMock } = makeSupabaseMockWithTracking({
        data: { id: "new-id-001" },
        error: null,
      });
      vi.mocked(createServerClient).mockReturnValue(supabase as unknown as ReturnType<typeof createServerClient>);
      vi.mocked(fetchNewEmails).mockResolvedValue({
        emails: [SAMPLE_EMAIL],
        newHistoryId: "99999",
      });

      const res = await POST(makeRequest());
      const body = await res.json();

      expect(body.historyAdvanced).toBe(true);
      expect(body.newHistoryId).toBe("99999");
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ last_history_id: "99999" })
      );
    });

    it("newHistoryId が null（messages.get 失敗）: historyId を更新しない", async () => {
      const { supabase, updateMock } = makeSupabaseMockWithTracking({
        data: { id: "new-id-001" },
        error: null,
      });
      vi.mocked(createServerClient).mockReturnValue(supabase as unknown as ReturnType<typeof createServerClient>);
      vi.mocked(fetchNewEmails).mockResolvedValue({
        emails: [],
        newHistoryId: null,  // fetch 失敗のシグナル
      });

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await POST(makeRequest());
      const body = await res.json();
      errorSpy.mockRestore();

      expect(body.historyAdvanced).toBe(false);
      expect(body.newHistoryId).toBeNull();
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("upsert 失敗あり: historyId を更新しない（再処理のため）", async () => {
      const { supabase, updateMock } = makeSupabaseMockWithTracking({
        data: null,
        error: { code: "42501", message: "permission denied" },
      });
      vi.mocked(createServerClient).mockReturnValue(supabase as unknown as ReturnType<typeof createServerClient>);
      vi.mocked(fetchNewEmails).mockResolvedValue({
        emails: [SAMPLE_EMAIL],
        newHistoryId: "99999",
      });

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await POST(makeRequest());
      const body = await res.json();
      errorSpy.mockRestore();

      expect(body.historyAdvanced).toBe(false);
      expect(body.upsertFailed).toBe(1);
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("PGRST116（重複）のみ: historyId は更新される（失敗扱いではない）", async () => {
      const { supabase, updateMock } = makeSupabaseMockWithTracking({
        data: null,
        error: { code: "PGRST116", message: "not exactly one row" },
      });
      vi.mocked(createServerClient).mockReturnValue(supabase as unknown as ReturnType<typeof createServerClient>);
      vi.mocked(fetchNewEmails).mockResolvedValue({
        emails: [SAMPLE_EMAIL],
        newHistoryId: "99999",
      });

      const res = await POST(makeRequest());
      const body = await res.json();

      expect(body.historyAdvanced).toBe(true);
      expect(body.upsertFailed).toBe(0);
      expect(updateMock).toHaveBeenCalled();
    });
  });

  describe("再試行・復旧", () => {
    it("失敗後の再実行: 失敗分が upsert され、既存分は PGRST116 でスキップされる", async () => {
      let callCount = 0;
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "hub_gmail_sync_state") return makeSyncStateFrom();
          if (table === "hub_inquiries") {
            callCount++;
            return makeInquiriesFrom(
              callCount === 1
                ? { data: null, error: { code: "PGRST116" } }  // 既存分
                : { data: { id: "retry-id" }, error: null }     // 再試行成功
            );
          }
          return {};
        }),
      } as unknown as ReturnType<typeof createServerClient>);

      vi.mocked(fetchNewEmails).mockResolvedValue({
        emails: [
          { ...SAMPLE_EMAIL, messageId: "already-saved" },
          { ...SAMPLE_EMAIL, messageId: "retry-msg" },
        ],
        newHistoryId: "99999",
      });

      const res = await POST(makeRequest());
      const body = await res.json();

      expect(body.processed).toBe(2);
      expect(body.saved).toBe(1);     // 再試行分のみ保存
      expect(body.upsertFailed).toBe(0);
      expect(body.historyAdvanced).toBe(true);  // 今回は全成功

      const fetchMock = vi.mocked(globalThis.fetch as typeof fetch);
      const classifyCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes("/api/classify")
      );
      expect(classifyCalls).toHaveLength(1);  // 新規1件のみ分類
    });

    it("fetchNewEmails が throw した場合は 500 を返す", async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockReturnValue(makeSyncStateFrom()),
      } as unknown as ReturnType<typeof createServerClient>);

      vi.mocked(fetchNewEmails).mockRejectedValue(new Error("Gmail API down"));

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await POST(makeRequest());
      errorSpy.mockRestore();

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Gmail fetch failed");
    });
  });
});
