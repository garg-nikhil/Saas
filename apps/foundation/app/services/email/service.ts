import type { Env } from "../../context";
import { ResendEmailAdapter } from "./resend.server";
import type {
  EmailMessage,
  EmailResult,
  EmailSendResult,
  IEmailAdapter,
  IEmailService,
} from "./types";

/**
 * Internal EmailService implementation providing an isolated boundary
 * between application code and transactional email providers.
 */
export class EmailService implements IEmailService {
  constructor(
    private readonly adapter: IEmailAdapter,
    private readonly defaultFrom?: string,
  ) {}

  async sendEmail(message: EmailMessage): Promise<EmailResult<EmailSendResult>> {
    const enrichedMessage: EmailMessage = {
      ...message,
      from: message.from || this.defaultFrom,
    };

    return await this.adapter.send(enrichedMessage);
  }
}

/**
 * Creates the internal EmailService boundary instance using Worker environment bindings.
 */
export function createEmailService(
  env: Env,
  customAdapter?: IEmailAdapter,
): IEmailService {
  if (customAdapter) {
    return new EmailService(customAdapter, env.EMAIL_FROM);
  }

  const apiKey = env.RESEND_API_KEY || process.env.RESEND_API_KEY;
  const defaultFrom =
    env.EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    "SaaS Factory <notifications@factory.local>";

  const adapter = new ResendEmailAdapter(apiKey, defaultFrom);
  return new EmailService(adapter, defaultFrom);
}
