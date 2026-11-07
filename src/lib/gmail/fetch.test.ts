import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./client", () => ({
  createGmailClient: vi.fn(),
}));

import { fetchNewEmails } from "./fetch";
import { createGmailClient } from "./client";

const USER_EMAIL = "test@example.com";
const LABEL_ID = "Label_123456789";

function makeMockGmail(overrides: {
  historyList?: ReturnType<typeof vi.fn>;
  messagesList?: ReturnType<typeof vi.fn>;
  messagesGet?: ReturnType<typeof vi.fn>;
  getProfile?: ReturnType<typeof vi.fn>;
}) {
  return {
    users: {
      history: {
        list: overrides.historyList ?? vi.fn().mockResolvedValue({ data: { historyId: "999", history: [] } }),
      },
      messages: {
        list: overrides.messagesList ?? vi.fn().mockResolvedValue({ data: { messages: [] } }),
        get: overrides.messagesGet ?? vi.fn().mockResolvedValue({ data: {} }),
      },
      getProfile: overrides.getProfile ?? vi.fn().mockResolvedValue({ data: { historyId: "999" } }),
    },
  };
}

describe("fetchNewEmails", () => {
  beforeEach(() => {
    process.env.GMAIL_USER_EMAIL = USER_EMAIL;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.GMAIL_LABEL_FILTER;
    delete process.env.GMAIL_USER_EMAIL;
  });

  describe("GMAIL_LABEL_FILTER 未設定", () => {
    it("空の結果を即時返し Gmail API を呼ばない", async () => {
      delete process.env.GMAIL_LABEL_FILTER;

      const result = await fetchNewEmails(null);

      expect(result).toEqual({ emails: [], newHistoryId: null });
      expect(createGmailClient).not.toHaveBeenCalled();
    });

    it("lastHistoryId があっても API を呼ばない", async () => {
      delete process.env.GMAIL_LABEL_FILTER;

      const result = await fetchNewEmails("some-history-id");

      expect(result).toEqual({ emails: [], newHistoryId: null });
      expect(createGmailClient).not.toHaveBeenCalled();
    });
  });

  describe("GMAIL_LABEL_FILTER 設定済み", () => {
    beforeEach(() => {
      process.env.GMAIL_LABEL_FILTER = LABEL_ID;
    });

    it("History API に labelId を渡す", async () => {
      const mockHistoryList = vi.fn().mockResolvedValue({
        data: { historyId: "999", history: [] },
      });
      vi.mocked(createGmailClient).mockReturnValue(
        makeMockGmail({ historyList: mockHistoryList }) as unknown as ReturnType<typeof createGmailClient>
      );

      await fetchNewEmails("old-history-id");

      expect(mockHistoryList).toHaveBeenCalledWith(
        expect.objectContaining({ labelId: LABEL_ID })
      );
    });

    it("messages.list に labelIds を渡す（初回同期）", async () => {
      const mockMessagesList = vi.fn().mockResolvedValue({
        data: { messages: [] },
      });
      vi.mocked(createGmailClient).mockReturnValue(
        makeMockGmail({ messagesList: mockMessagesList }) as unknown as ReturnType<typeof createGmailClient>
      );

      await fetchNewEmails(null);

      expect(mockMessagesList).toHaveBeenCalledWith(
        expect.objectContaining({ labelIds: [LABEL_ID] })
      );
    });

    it("History API が失敗した場合 messages.list に labelIds を渡してフォールバック", async () => {
      const mockHistoryList = vi.fn().mockRejectedValue(new Error("historyId expired"));
      const mockMessagesList = vi.fn().mockResolvedValue({ data: { messages: [] } });
      vi.mocked(createGmailClient).mockReturnValue(
        makeMockGmail({ historyList: mockHistoryList, messagesList: mockMessagesList }) as unknown as ReturnType<typeof createGmailClient>
      );

      await fetchNewEmails("expired-history-id");

      expect(mockMessagesList).toHaveBeenCalledWith(
        expect.objectContaining({ labelIds: [LABEL_ID] })
      );
    });

    it("ラベル外のメールは取得しない（messages が空のとき emails も空）", async () => {
      vi.mocked(createGmailClient).mockReturnValue(
        makeMockGmail({}) as unknown as ReturnType<typeof createGmailClient>
      );

      const result = await fetchNewEmails(null);

      expect(result.emails).toHaveLength(0);
    });

    it("labelAdded と messageAdded の両イベントを historyTypes に渡す", async () => {
      const mockHistoryList = vi.fn().mockResolvedValue({
        data: { historyId: "999", history: [] },
      });
      vi.mocked(createGmailClient).mockReturnValue(
        makeMockGmail({ historyList: mockHistoryList }) as unknown as ReturnType<typeof createGmailClient>
      );

      await fetchNewEmails("old-history-id");

      expect(mockHistoryList).toHaveBeenCalledWith(
        expect.objectContaining({
          historyTypes: expect.arrayContaining(["messageAdded", "labelAdded"]),
        })
      );
    });

    it("messages.get が失敗した場合 newHistoryId は null になる（再処理のため）", async () => {
      const mockHistoryList = vi.fn().mockResolvedValue({
        data: {
          historyId: "999",
          history: [{ messagesAdded: [{ message: { id: "msg-fail-1" } }] }],
        },
      });
      const mockMessagesGet = vi.fn().mockRejectedValue(new Error("API error"));

      vi.mocked(createGmailClient).mockReturnValue(
        makeMockGmail({ historyList: mockHistoryList, messagesGet: mockMessagesGet }) as unknown as ReturnType<typeof createGmailClient>
      );

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await fetchNewEmails("old-history-id");
      errorSpy.mockRestore();

      expect(result.newHistoryId).toBeNull();
      expect(result.emails).toHaveLength(0);
    });

    it("messages.get の一部が失敗しても成功分の emails は返し newHistoryId は null", async () => {
      const bodyData = Buffer.from("テスト本文").toString("base64");
      const mockHistoryList = vi.fn().mockResolvedValue({
        data: {
          historyId: "999",
          history: [
            {
              messagesAdded: [
                { message: { id: "msg-ok-1" } },
                { message: { id: "msg-fail-1" } },
              ],
            },
          ],
        },
      });
      let callCount = 0;
      const mockMessagesGet = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            data: {
              payload: {
                headers: [
                  { name: "From", value: "Test <t@t.com>" },
                  { name: "Subject", value: "件名" },
                  { name: "Date", value: "Thu, 7 Nov 2026 10:00:00 +0900" },
                ],
                body: { data: bodyData },
              },
            },
          });
        }
        return Promise.reject(new Error("second message failed"));
      });

      vi.mocked(createGmailClient).mockReturnValue(
        makeMockGmail({ historyList: mockHistoryList, messagesGet: mockMessagesGet }) as unknown as ReturnType<typeof createGmailClient>
      );

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await fetchNewEmails("old-history-id");
      errorSpy.mockRestore();

      expect(result.emails).toHaveLength(1);
      expect(result.newHistoryId).toBeNull();
    });

    it("全 messages.get が成功すれば newHistoryId が設定される", async () => {
      const bodyData = Buffer.from("テスト本文").toString("base64");
      const mockHistoryList = vi.fn().mockResolvedValue({
        data: {
          historyId: "999",
          history: [{ messagesAdded: [{ message: { id: "msg-ok-1" } }] }],
        },
      });
      const mockMessagesGet = vi.fn().mockResolvedValue({
        data: {
          payload: {
            headers: [
              { name: "From", value: "Test <t@t.com>" },
              { name: "Subject", value: "件名" },
              { name: "Date", value: "Thu, 7 Nov 2026 10:00:00 +0900" },
            ],
            body: { data: bodyData },
          },
        },
      });

      vi.mocked(createGmailClient).mockReturnValue(
        makeMockGmail({ historyList: mockHistoryList, messagesGet: mockMessagesGet }) as unknown as ReturnType<typeof createGmailClient>
      );

      const result = await fetchNewEmails("old-history-id");

      expect(result.newHistoryId).toBe("999");
      expect(result.emails).toHaveLength(1);
    });
  });
});
