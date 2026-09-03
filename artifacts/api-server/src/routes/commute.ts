import { Router, type IRouter, type Request, type Response } from "express";
import { asc, desc } from "drizzle-orm";
import {
  CreateEventBody,
  CreateResponseBody,
  CreateResponseResponse,
  GetAdminResponsesResponse,
  GetAdminSummaryResponse,
  type AdminSummary,
} from "@workspace/api-zod";
import { db, commuteEventsTable, commuteResponsesTable } from "@workspace/db";

const router: IRouter = Router();
const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const adminPassword = () => process.env.ADMIN_PASSWORD;

type ScheduleDay = {
  day: (typeof weekdays)[number];
  active: boolean;
  arrival: string;
  departure: string;
};

type ResponseData = ReturnType<typeof normalizeResponse>;

function normalizeResponse(row: typeof commuteResponsesTable.$inferSelect) {
  return {
    id: row.id,
    createdAt: row.createdAt,
    role: row.role as "driver" | "rider",
    livesInSageCreek: row.livesInSageCreek,
    isUofMStudent: row.isUofMStudent,
    schedule: row.schedule as ScheduleDay[],
    arrivalFlexibility: row.arrivalFlexibility,
    departureFlexibility: row.departureFlexibility,
    rideDirection: row.rideDirection,
    maxDetour: row.maxDetour,
    seats: row.seats,
    maxPickupWalk: row.maxPickupWalk,
    currentTransportMethod: row.currentTransportMethod,
    currentCommuteDuration: row.currentCommuteDuration,
    minimumMonthlyCompensation: row.minimumMonthlyCompensation,
    maximumMonthlyWillingnessToPay: row.maximumMonthlyWillingnessToPay,
    scheduleChangeFrequency: row.scheduleChangeFrequency,
    dealbreaker: row.dealbreaker,
    dealbreakerOther: row.dealbreakerOther,
    intentLevel: row.intentLevel,
    email: row.email,
    phone: row.phone,
    prefersText: row.prefersText,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    referrer: row.referrer,
  };
}

function parseTime(value: string): number | null {
  if (value === "Varies") return -1;
  const match = /^(\d{1,2}):(00|30) (AM|PM)$/.exec(value);
  if (!match) return null;
  let hour = Number(match[1]);
  if (hour < 1 || hour > 12) return null;
  if (match[3] === "AM" && hour === 12) hour = 0;
  if (match[3] === "PM" && hour !== 12) hour += 12;
  return hour * 60 + Number(match[2]);
}

function validSchedule(schedule: ScheduleDay[]): boolean {
  if (schedule.length !== 5 || new Set(schedule.map((day) => day.day)).size !== 5) {
    return false;
  }
  return schedule.every((day) => {
    if (!day.active) return true;
    const arrival = parseTime(day.arrival);
    const departure = parseTime(day.departure);
    return (
      arrival !== null &&
      departure !== null &&
      (arrival === -1 || (arrival >= 360 && arrival <= 1320)) &&
      (departure === -1 || (departure >= 360 && departure <= 1380))
    );
  });
}

function nonBlank(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateContact(email: string | null, phone: string | null): boolean {
  const validEmail = nonBlank(email) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const validPhone = nonBlank(phone) && phone.replace(/\D/g, "").length >= 7;
  return Boolean(validEmail || validPhone);
}

function requireAdmin(req: Request, res: Response): boolean {
  const configured = adminPassword();
  const supplied = req.header("X-Admin-Password");
  if (!configured) {
    res.status(503).json({ error: "Admin password is not configured." });
    return false;
  }
  if (!supplied || supplied !== configured) {
    res.status(401).json({ error: "That admin password is not correct." });
    return false;
  }
  return true;
}

function distributions(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    if (nonBlank(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

function uniqueResponses(rows: ResponseData[]): ResponseData[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function uniqueScheduleEntries(row: ResponseData): ScheduleDay[] {
  const seen = new Set<string>();
  return row.schedule.filter((entry) => {
    const key = `${entry.day}|${entry.arrival}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSummary(inputRows: ResponseData[]): AdminSummary {
  const rows = uniqueResponses(inputRows);
  const activeDays = weekdays.map((day) => ({
    label: day[0].toUpperCase() + day.slice(1),
    count: rows.reduce(
      (total, row) =>
        total +
        (row.schedule.some((entry) => entry.day === day && entry.active) ? 1 : 0),
      0,
    ),
  }));
  const arrivalDistribution = distributions(
    rows.flatMap((row) =>
      uniqueScheduleEntries(row)
        .filter((entry) => entry.active)
        .map((entry) => entry.arrival),
    ),
  );
  const overlap = new Map<string, { day: string; time: string; drivers: number; riders: number }>();
  rows.forEach((row) => {
    uniqueScheduleEntries(row)
      .filter((entry) => entry.active && entry.arrival !== "Varies")
      .forEach((entry) => {
        const key = `${entry.day}|${entry.arrival}`;
        const bucket = overlap.get(key) ?? {
          day: entry.day,
          time: entry.arrival,
          drivers: 0,
          riders: 0,
        };
        bucket[row.role === "driver" ? "drivers" : "riders"] += 1;
        overlap.set(key, bucket);
      });
  });
  const interested = (role: "driver" | "rider") =>
    rows.filter(
      (row) =>
        row.role === role &&
        (row.intentLevel === "Definitely" || row.intentLevel === "Probably"),
    ).length;
  return {
    total: rows.length,
    drivers: rows.filter((row) => row.role === "driver").length,
    riders: rows.filter((row) => row.role === "rider").length,
    interestedDrivers: interested("driver"),
    interestedRiders: interested("rider"),
    driverCompensation: distributions(
      rows
        .filter((row) => row.role === "driver")
        .map((row) => row.minimumMonthlyCompensation),
    ),
    riderWillingness: distributions(
      rows
        .filter((row) => row.role === "rider")
        .map((row) => row.maximumMonthlyWillingnessToPay),
    ),
    weekdayActivity: activeDays,
    arrivalDistribution,
    reliability: distributions(rows.map((row) => row.scheduleChangeFrequency)),
    driverDealbreakers: distributions(
      rows.filter((row) => row.role === "driver").map((row) => row.dealbreaker),
    ),
    riderDealbreakers: distributions(
      rows.filter((row) => row.role === "rider").map((row) => row.dealbreaker),
    ),
    transportMethods: distributions(
      rows
        .filter((row) => row.role === "rider")
        .map((row) => row.currentTransportMethod),
    ),
    commuteDurations: distributions(
      rows
        .filter((row) => row.role === "rider")
        .map((row) => row.currentCommuteDuration),
    ),
    potentialOverlap: [...overlap.values()].sort(
      (a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time),
    ),
  };
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? JSON.stringify(value) : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

const scheduleCsvHeaders = weekdays.flatMap((day) => [
  `${day}_active`,
  `${day}_arrival`,
  `${day}_leave`,
]);

function csvValue(row: ResponseData, header: string): unknown {
  const scheduleDay = weekdays.find((day) => header.startsWith(`${day}_`));
  if (scheduleDay) {
    const entry = row.schedule.find((item) => item.day === scheduleDay);
    if (header.endsWith("_active")) return entry?.active ?? false;
    if (header.endsWith("_arrival")) return entry?.arrival ?? "";
    return entry?.departure ?? "";
  }
  return row[header as keyof ResponseData];
}

router.post("/responses", async (req, res): Promise<void> => {
  const parsed = CreateResponseBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid commute response");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  if (!data.livesInSageCreek || !data.isUofMStudent) {
    res.status(400).json({ error: "This list is currently for Sage Creek U of M students." });
    return;
  }
  if (!validSchedule(data.schedule as ScheduleDay[])) {
    res.status(400).json({ error: "Please review the weekday schedule and time ranges." });
    return;
  }
  if (!validateContact(data.email, data.phone)) {
    res.status(400).json({ error: "Add an email, phone number, or both to join the list." });
    return;
  }
  const roleFieldsValid =
    data.role === "driver"
      ? nonBlank(data.maxDetour) &&
        nonBlank(data.seats) &&
        nonBlank(data.minimumMonthlyCompensation)
      : nonBlank(data.maxPickupWalk) &&
        nonBlank(data.currentTransportMethod) &&
        nonBlank(data.currentCommuteDuration) &&
        nonBlank(data.maximumMonthlyWillingnessToPay);
  if (!roleFieldsValid) {
    res.status(400).json({ error: "Please complete the questions for your commute type." });
    return;
  }

  const [created] = await db
    .insert(commuteResponsesTable)
    .values({
      ...data,
      schedule: data.schedule,
    })
    .returning({ id: commuteResponsesTable.id, createdAt: commuteResponsesTable.createdAt });
  res.status(201).json(CreateResponseResponse.parse(created));
});

router.post("/events", async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db.insert(commuteEventsTable).values(parsed.data);
  res.sendStatus(204);
});

router.get("/admin/summary", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const rows = (await db.select().from(commuteResponsesTable)).map(normalizeResponse);
  res.json(GetAdminSummaryResponse.parse(buildSummary(rows)));
});

router.get("/admin/responses", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const rows = uniqueResponses(
    (await db
      .select()
      .from(commuteResponsesTable)
      .orderBy(desc(commuteResponsesTable.createdAt)))
      .map(normalizeResponse),
  );
  res.json(GetAdminResponsesResponse.parse(rows));
});

router.get("/admin/export.csv", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const rows = uniqueResponses(
    (await db
      .select()
      .from(commuteResponsesTable)
      .orderBy(asc(commuteResponsesTable.createdAt)))
      .map(normalizeResponse),
  );
  const headers = [
    "id", "createdAt", "role", "livesInSageCreek", "isUofMStudent",
    ...scheduleCsvHeaders,
    "arrivalFlexibility", "departureFlexibility", "rideDirection", "maxDetour",
    "seats", "maxPickupWalk", "currentTransportMethod", "currentCommuteDuration",
    "minimumMonthlyCompensation", "maximumMonthlyWillingnessToPay",
    "scheduleChangeFrequency", "dealbreaker", "dealbreakerOther", "intentLevel",
    "email", "phone", "prefersText", "utmSource", "utmMedium", "utmCampaign", "referrer",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(csvValue(row, header))).join(",")),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="sage-creek-responses.csv"');
  res.send(csv);
});

export default router;