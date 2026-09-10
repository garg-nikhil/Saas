/**
 * Internal domain representation of an outgoing email message.
 * Decoupled from provider-specific SDK request formats.
 */
export interface EmailMessage {
  /** Recipient email address or list of addresses */
  to: string | string[];
  /** Sender address (defaults to configured EMAIL_FROM if omitted) */
  from?: string;
  /** Subject line */
  subject: string;
  /** HTML content */
  html?: string;
  /** Plain text content */
  text?: string;
  /** Reply-to address */
  replyTo?: string;
  /** Optional tags for telemetry/categorization */
  tags?: Array<{ name: string; value: string }>;
}

export interface EmailSendResult {
  id: string;
}

export interface EmailError {
  message: string;
  code?: string;
}

export interface EmailResult<T> {
  data: T | null;
  error: EmailError | null;
}

/**
 * Provider-agnostic adapter interface for email delivery services.
 */
export interface IEmailAdapter {
  send(message: EmailMessage): Promise<EmailResult<EmailSendResult>>;
}

/**
 * Internal EmailService boundary contract used by application workflows.
 */
export interface IEmailService {
  sendEmail(message: EmailMessage): Promise<EmailResult<EmailSendResult>>;
}
