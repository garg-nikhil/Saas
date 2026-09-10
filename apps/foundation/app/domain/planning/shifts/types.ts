export type ShiftDomainErrorCode =
  | "INVALID_TIME_FORMAT"
  | "MISSING_TIME_INPUTS"
  | "INVALID_SHIFT_DURATION";

export interface ShiftDomainError {
  code: ShiftDomainErrorCode;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface ParsedTime {
  hour: number;
  minute: number;
  totalMinutes: number;
}

export interface ShiftTimeInput {
  startTime?: string | null;
  endTime?: string | null;
}

export type ShiftDurationResult =
  | {
      success: true;
      durationMinutes: number;
      isOvernight: boolean;
      formatted: string;
    }
  | {
      success: false;
      error: ShiftDomainError;
    };
