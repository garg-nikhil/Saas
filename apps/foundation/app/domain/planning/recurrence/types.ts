export type RecurrenceFrequency = "daily" | "weekly";

export type RecurrenceDomainErrorCode =
  | "INVALID_START_DATE"
  | "INVALID_END_DATE"
  | "INVALID_DATE_RANGE"
  | "UNSUPPORTED_FREQUENCY"
  | "INVALID_INTERVAL"
  | "INVALID_WEEKDAYS"
  | "MISSING_WEEKDAYS"
  | "INVALID_GENERATION_RANGE"
  | "EXCEEDED_MAX_RANGE";

export interface RecurrenceDomainError {
  code: RecurrenceDomainErrorCode;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface RecurrenceRuleInput {
  startDate: string;
  endDate?: string | null;
  frequency: string;
  interval: number;
  daysOfWeek?: number[] | string[] | null;
  isActive?: boolean;
}

export interface GenerationRangeInput {
  from: string;
  to: string;
  maxDaysLimit?: number;
}

export type RecurrenceValidationResult =
  | { success: true }
  | { success: false; error: RecurrenceDomainError };

export type RecurrenceGenerationResult =
  | {
      success: true;
      occurrences: string[];
    }
  | {
      success: false;
      error: RecurrenceDomainError;
    };
