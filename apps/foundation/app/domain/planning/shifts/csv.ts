import { calculateShiftDuration } from "./duration";

export interface ShiftExportItem {
  id: string;
  date: string; // YYYY-MM-DD
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
  shiftType?: {
    name: string;
    shortCode?: string | null;
    color?: string | null;
    isWork: boolean;
  } | null;
}

const WEEKDAY_NAMES_FR = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

/**
 * Escapes a cell value according to CSV RFC-4180 rules.
 */
function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  const stringValue = String(value);
  if (
    stringValue.includes(";") ||
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return `"${stringValue}"`;
}

/**
 * Generates a standard UTF-8 CSV string for shifts in the planning calendar.
 */
export function generateShiftsCsv(
  shiftsList: ShiftExportItem[],
  monthLabel?: string
): string {
  const headers = [
    "Date",
    "Jour",
    "Garde / Type",
    "Code",
    "Début",
    "Fin",
    "Durée (heures)",
    "Garde de nuit",
    "Travaillé",
    "Notes",
  ];

  const rows: string[][] = [];

  // Sort shifts chronologically
  const sorted = [...shiftsList].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const timeA = a.startTime || "";
    const timeB = b.startTime || "";
    return timeA.localeCompare(timeB);
  });

  for (const s of sorted) {
    const [year, month, day] = s.date.split("-").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeekStr = WEEKDAY_NAMES_FR[dateObj.getDay()] || "";

    let durationHours = "0.00";
    let isOvernight = "Non";

    if (s.startTime && s.endTime) {
      const dur = calculateShiftDuration({
        startTime: s.startTime,
        endTime: s.endTime,
      });
      if (dur.success) {
        durationHours = (dur.durationMinutes / 60).toFixed(2);
        isOvernight = dur.isOvernight ? "Oui" : "Non";
      }
    }

    const typeName = s.shiftType?.name || "Garde";
    const shortCode = s.shiftType?.shortCode || "";
    const startTimeStr = s.startTime || "-";
    const endTimeStr = s.endTime || "-";
    const isWorkStr = s.shiftType ? (s.shiftType.isWork ? "Oui" : "Non") : "Oui";
    const notesStr = s.notes || "";

    rows.push([
      s.date,
      dayOfWeekStr,
      typeName,
      shortCode,
      startTimeStr,
      endTimeStr,
      durationHours,
      isOvernight,
      isWorkStr,
      notesStr,
    ]);
  }

  // Prepend UTF-8 BOM so Excel automatically recognizes UTF-8 accented characters
  const bom = "\uFEFF";
  const headerLine = headers.map(escapeCsvCell).join(";");
  const dataLines = rows.map((r) => r.map(escapeCsvCell).join(";")).join("\r\n");

  return `${bom}${headerLine}\r\n${dataLines}`;
}
