import { describe, it, expect, vi } from "vitest";
import {
  EmailService,
  ResendEmailAdapter,
  createEmailService,
  type IEmailAdapter,
  type EmailMessage,
} from "../app/services/email";

describe("Milestone 4A — Email Service & Resend Adapter", () => {
  describe("1. Contracts and Decoupling", () => {
    it("exports EmailService, ResendEmailAdapter and createEmailService", () => {
      expect(EmailService).toBeDefined();
      expect(ResendEmailAdapter).toBeDefined();
      expect(typeof createEmailService).toBe("function");
    });

    it("EmailService delegates message delivery to injected adapter", async () => {
      const mockAdapter: IEmailAdapter = {
        send: vi.fn().mockResolvedValue({
          data: { id: "msg-12345" },
          error: null,
        }),
      };

      const service = new EmailService(mockAdapter, "Factory <factory@example.com>");
      const result = await service.sendEmail({
        to: "user@example.fr",
        subject: "Bienvenue",
        html: "<p>Bonjour</p>",
      });

      expect(result.data?.id).toBe("msg-12345");
      expect(result.error).toBeNull();
      expect(mockAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "Factory <factory@example.com>",
          to: "user@example.fr",
          subject: "Bienvenue",
          html: "<p>Bonjour</p>",
        }),
      );
    });
  });

  describe("2. ResendEmailAdapter Validation & Error Normalization", () => {
    it("returns normalized error when API key is missing", async () => {
      const adapter = new ResendEmailAdapter(undefined);
      const result = await adapter.send({
        to: "user@example.fr",
        subject: "Test",
        text: "Hello",
      });

      expect(result.data).toBeNull();
      expect(result.error?.message).toContain("not configured");
      expect(result.error?.code).toBe("UNCONFIGURED");
    });

    it("rejects empty recipient address", async () => {
      const adapter = new ResendEmailAdapter("re_test_key");
      const result = await adapter.send({
        to: "",
        subject: "Test",
        text: "Hello",
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe("INVALID_RECIPIENT");
    });

    it("rejects empty subject", async () => {
      const adapter = new ResendEmailAdapter("re_test_key");
      const result = await adapter.send({
        to: "user@test.com",
        subject: "",
        text: "Hello",
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe("INVALID_SUBJECT");
    });

    it("rejects empty body (neither html nor text)", async () => {
      const adapter = new ResendEmailAdapter("re_test_key");
      const result = await adapter.send({
        to: "user@test.com",
        subject: "Subject",
      });

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe("EMPTY_BODY");
    });

    it("normalizes provider errors and does not crash on dispatch failure", async () => {
      const mockResendClient = {
        emails: {
          send: vi.fn().mockResolvedValue({
            data: null,
            error: {
              name: "validation_error",
              message: "Invalid domain sending address",
            },
          }),
        },
      } as any;

      const adapter = new ResendEmailAdapter(
        "re_test_key",
        "Test <test@test.com>",
        mockResendClient,
      );

      const result = await adapter.send({
        to: "recipient@test.com",
        subject: "Hello",
        html: "<p>Content</p>",
      });

      expect(result.data).toBeNull();
      expect(result.error?.message).toBe("Unable to send email.");
      expect(result.error?.code).toBe("validation_error");
    });

    it("returns message ID on successful dispatch", async () => {
      const mockResendClient = {
        emails: {
          send: vi.fn().mockResolvedValue({
            data: { id: "email_sent_999" },
            error: null,
          }),
        },
      } as any;

      const adapter = new ResendEmailAdapter(
        "re_test_key",
        "Test <test@test.com>",
        mockResendClient,
      );

      const result = await adapter.send({
        to: "recipient@test.com",
        subject: "Hello",
        html: "<p>Content</p>",
      });

      expect(result.data?.id).toBe("email_sent_999");
      expect(result.error).toBeNull();
    });
  });

  describe("3. Security & Logging Hygiene", () => {
    it("does not log sensitive full email bodies or credentials", async () => {
      const consoleLogSpy = vi.spyOn(console, "log");
      const consoleErrorSpy = vi.spyOn(console, "error");

      const secretApiKey = "re_live_secret_key_123456789";
      const sensitiveBody = "Your confidential temporary reset link is: https://example.com/reset?token=xyz";

      const mockResendClient = {
        emails: {
          send: vi.fn().mockRejectedValue(new Error("Network timeout")),
        },
      } as any;

      const adapter = new ResendEmailAdapter(
        secretApiKey,
        "Test <test@test.com>",
        mockResendClient,
      );

      await adapter.send({
        to: "secret_user@example.com",
        subject: "Confidential notification",
        html: sensitiveBody,
      });

      const loggedOutput = [
        ...consoleLogSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
      ].flat().join(" ");

      expect(loggedOutput).not.toContain(secretApiKey);
      expect(loggedOutput).not.toContain(sensitiveBody);

      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
