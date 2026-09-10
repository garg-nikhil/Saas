import { Resend } from "resend";
import type {
  EmailMessage,
  EmailResult,
  EmailSendResult,
  IEmailAdapter,
} from "./types";

/**
 * Resend email adapter executing exclusively on the server.
 *
 * Security:
 * - RESEND_API_KEY is kept strictly on the server / Worker environment.
 * - Provider errors are sanitized to prevent internal leakages.
 * - Full email content and sensitive tokens are never written to logs.
 */
export class ResendEmailAdapter implements IEmailAdapter {
  private readonly client: Resend | null = null;

  constructor(
    private readonly apiKey?: string,
    private readonly defaultFrom: string = "Planning Infirmier <notifications@planning-infirmier.fr>",
    customClient?: Resend,
  ) {
    if (customClient) {
      this.client = customClient;
    } else if (apiKey) {
      this.client = new Resend(apiKey);
    }
  }

  async send(message: EmailMessage): Promise<EmailResult<EmailSendResult>> {
    if (!this.client) {
      return {
        data: null,
        error: {
          message: "Unable to send email: Email service is not configured.",
          code: "UNCONFIGURED",
        },
      };
    }

    if (!message.to || (Array.isArray(message.to) && message.to.length === 0)) {
      return {
        data: null,
        error: {
          message: "Unable to send email: Recipient address is required.",
          code: "INVALID_RECIPIENT",
        },
      };
    }

    if (!message.subject) {
      return {
        data: null,
        error: {
          message: "Unable to send email: Subject is required.",
          code: "INVALID_SUBJECT",
        },
      };
    }

    if (!message.html && !message.text) {
      return {
        data: null,
        error: {
          message: "Unable to send email: Message content (html or text) is required.",
          code: "EMPTY_BODY",
        },
      };
    }

    try {
      const from = message.from || this.defaultFrom;
      const to = Array.isArray(message.to) ? message.to : [message.to];

      const response = await this.client.emails.send({
        from,
        to,
        subject: message.subject,
        html: message.html || "",
        text: message.text,
        replyTo: message.replyTo,
        tags: message.tags,
      });

      if (response.error) {
        console.error("Resend provider error:", {
          message: response.error.message,
          name: response.error.name,
        });

        return {
          data: null,
          error: {
            message: "Unable to send email.",
            code: response.error.name || "PROVIDER_ERROR",
          },
        };
      }

      if (!response.data?.id) {
        return {
          data: null,
          error: {
            message: "Unable to send email.",
            code: "NO_MESSAGE_ID",
          },
        };
      }

      return {
        data: { id: response.data.id },
        error: null,
      };
    } catch (err) {
      console.error("Resend dispatch exception:", {
        type: err instanceof Error ? err.name : "UnknownException",
      });

      return {
        data: null,
        error: {
          message: "Unable to send email.",
          code: "DISPATCH_FAILED",
        },
      };
    }
  }
}
