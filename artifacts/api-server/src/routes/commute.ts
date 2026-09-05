import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import {
  CreateEventBody,
  CreateResponseBody,
  CreateResponseResponse,
  GetAdminResponsesResponse,
  GetAdminSummaryResponse,
  UpdateAdminPosterBody,
  UpdateAdminPosterParams,
  type AdminSummary,
} from "@workspace/api-zod";
import {
  db,
  commuteEventsTable,
  commutePosterRegistryTable,
  commuteResponsesTable,
} from "@workspace/db";

const router: IRouter = Router();
const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const posterSources = ["P01", "P02", "P03", "direct_unknown"] as const;
type PosterSource = (typeof posterSources)[number];
const adminPassword = () => process.env.ADMIN_PASSWORD;

type ScheduleDay = {
  day: (typeof weekdays)[number];
  active: boolean;
  arrival: string;
  departure: string;
  directions?: ("to_campus" | "from_campus")[];
};

type ResponseData = ReturnType<typeof normalizeResponse>;

function normalizeResponse(row: typeof commuteResponsesTable.$inferSelect) {
  return {
    id: row.id,
    createdAt: row.createdAt,
    role: row.role as "driver" | "rider",
    surveyVersion: row.surveyVersion === "v2" ? "v2" : "v1",
    posterSource: (row.posterSource ?? "direct_unknown") as PosterSource,
    submissionId: row.submissionId ?? `legacy-${row.id}`,
    livesInSageCreek: row.livesInSageCreek,
    livesOutsideSageCreek: row.livesOutsideSageCreek,
    neighborhood: row.neighborhood,
    studentStatus: ["fort_garry", "starting_fort_garry", "other"].includes(row.studentStatus)
      ? row.studentStatus as "fort_garry" | "starting_fort_garry" | "other"
      : "legacy",
    isUofMStudent: row.isUofMStudent,
    schedule: row.schedule as ScheduleDay[],
    weeklyTripCount: row.weeklyTripCount ?? 0,
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
    driverRateCents: row.driverRateCents,
    driverRateSelection: row.driverRateSelection,
    riderPriceCents: row.riderPriceCents,
    riderPriceSelection: row.riderPriceSelection,
    scheduleChangeFrequency: row.scheduleChangeFrequency,
    dealbreaker: row.dealbreaker,
    dealbreakerOther: row.dealbreakerOther,
    finalConcern: row.finalConcern,
    finalConcernOther: row.finalConcernOther,
    intentLevel: row.intentLevel,
    firstName: row.firstName,
    email: row.email,
    phone: row.phone,
    contactMethod: ["phone", "email", "both"].includes(row.contactMethod)
      ? row.contactMethod as "phone" | "email" | "both"
      : "none",
    contactPermission: row.contactPermission,
    prefersText: row.prefersText,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    referrer: row.referrer,
  };
}

function sourceLabel(source: PosterSource): string {
  return source === "direct_unknown" ? "Direct/Unknown" : source;
}

function parseDateRange(req: Request): { from?: Date; to?: Date } {
  const fromValue = typeof req.query.from === "string" ? req.query.from : undefined;
  const toValue = typeof req.query.to === "string" ? req.query.to : undefined;
  const from = fromValue && /^\d{4}-\d{2}-\d{2}$/.test(fromValue)
    ? new Date(`${fromValue}T00:00:00.000Z`)
    : undefined;
  const to = toValue && /^\d{4}-\d{2}-\d{2}$/.test(toValue)
    ? new Date(`${toValue}T00:00:00.000Z`)
    : undefined;
  return {
    from: from && !Number.isNaN(from.valueOf()) ? from : undefined,
    to: to && !Number.isNaN(to.valueOf()) ? new Date(to.valueOf() + 86_400_000) : undefined,
  };
}

function withinDateRange(createdAt: Date, range: { from?: Date; to?: Date }): boolean {
  return (!range.from || createdAt >= range.from) && (!range.to || createdAt < range.to);
}

function normalizeSource(value: unknown): PosterSource {
  return posterSources.includes(value as PosterSource) ? value as PosterSource : "direct_unknown";
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
    const directions = day.directions?.length ? day.directions : ["to_campus", "from_campus"];
    const arrival = directions.includes("to_campus") ? parseTime(day.arrival) : -1;
    const departure = directions.includes("from_campus") ? parseTime(day.departure) : -1;
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

function validateContactMethod(
  method: "phone" | "email" | "both" | "none" | undefined,
  email: string | null,
  phone: string | null,
): boolean {
  if (method === "none") return !email && !phone;
  if (method === "phone") return nonBlank(phone) && phone.replace(/\D/g, "").length >= 7;
  if (method === "email") return nonBlank(email) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  if (method === "both") {
    return nonBlank(phone) && phone.replace(/\D/g, "").length >= 7 &&
      nonBlank(email) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  }
  return validateContact(email, phone);
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
      .filter((entry) => entry.active)
      .forEach((entry) => {
        const directions = entry.directions?.length ? entry.directions : ["to_campus", "from_campus"];
        directions.forEach((direction) => {
          const time = direction === "to_campus" ? entry.arrival : entry.departure;
          if (time === "Varies") return;
          const key = `${entry.day}|${direction}|${time}`;
          const bucket = overlap.get(key) ?? {
            day: `${entry.day} · ${direction === "to_campus" ? "to campus" : "home"}`,
            time,
            drivers: 0,
            riders: 0,
          };
          bucket[row.role === "driver" ? "drivers" : "riders"] += 1;
          overlap.set(key, bucket);
        });
      });
  });
  const interested = (role: "driver" | "rider") =>
    rows.filter(
      (row) =>
        row.role === role &&
        (row.surveyVersion === "v2" || row.intentLevel === "Definitely" || row.intentLevel === "Probably"),
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
    attribution: [],
    posterRegistry: [],
  };
}

type EventData = typeof commuteEventsTable.$inferSelect;

type RegistryData = {
  posterId: PosterSource;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
};

function buildRegistry(rows: Array<typeof commutePosterRegistryTable.$inferSelect>): RegistryData[] {
  const saved = new Map(rows.map((row) => [row.posterId, row]));
  return posterSources.map((posterId) => {
    const row = saved.get(posterId);
    return {
      posterId,
      locationName: row?.locationName ?? null,
      latitude: row?.latitude ?? null,
      longitude: row?.longitude ?? null,
    };
  });
}

function buildAttributionSummary(
  rows: ResponseData[],
  events: EventData[],
  registry: RegistryData[],
) {
  return posterSources.map((source) => {
    const sourceEvents = events.filter((event) => normalizeSource(event.posterSource) === source);
    const landingEvents = sourceEvents.filter((event) => event.eventName === "landing_viewed");
    const starts = sourceEvents.filter((event) => event.eventName === "survey_started");
    const completed = rows.filter((row) => normalizeSource(row.posterSource) === source);
    const registryEntry = registry.find((entry) => entry.posterId === source);
    const landingVisits = landingEvents.length;
    return {
      ...(registryEntry ?? { posterId: source, locationName: null, latitude: null, longitude: null }),
      label: sourceLabel(source),
      landingVisits,
      estimatedUniqueVisitors: new Set(
        landingEvents.map((event) => event.anonymousVisitorId).filter(Boolean),
      ).size,
      surveyStarts: starts.length,
      completedSurveys: completed.length,
      completionRate: landingVisits ? completed.length / landingVisits : 0,
    };
  });
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? JSON.stringify(value) : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

const scheduleCsvHeaders = weekdays.flatMap((day) => [
  `${day}_active`,
  `${day}_directions`,
  `${day}_arrival`,
  `${day}_leave`,
]);

function csvValue(row: ResponseData, header: string): unknown {
  const scheduleDay = weekdays.find((day) => header.startsWith(`${day}_`));
  if (scheduleDay) {
    const entry = row.schedule.find((item) => item.day === scheduleDay);
    if (header.endsWith("_active")) return entry?.active ?? false;
    if (header.endsWith("_directions")) return entry?.directions ?? [];
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
  if (data.surveyVersion !== "v2") {
    res.status(400).json({ error: "This questionnaire version is no longer accepting new responses." });
    return;
  }
  if (!data.isUofMStudent) {
    res.status(400).json({ error: "This list is currently for U of M students at the Fort Garry campus." });
    return;
  }
  if (!data.livesInSageCreek && !data.livesOutsideSageCreek) {
    res.status(400).json({ error: "Please tell us whether you are near Sage Creek or outside it." });
    return;
  }
  if (data.livesOutsideSageCreek && !nonBlank(data.neighborhood)) {
    res.status(400).json({ error: "Add your neighbourhood so we can flag this response correctly." });
    return;
  }
  if (!validSchedule(data.schedule as ScheduleDay[])) {
    res.status(400).json({ error: "Please review the weekday schedule and time ranges." });
    return;
  }
  const normalizedSchedule = data.schedule as ScheduleDay[];
  const normalizedTripCount = normalizedSchedule.reduce((total, day) => {
    if (!day.active) return total;
    const directions = day.directions?.length ? day.directions : ["to_campus", "from_campus"];
    return total + directions.length;
  }, 0);
  if (!validateContactMethod(data.contactMethod, data.email, data.phone)) {
    res.status(400).json({ error: "Check the contact option and details before continuing." });
    return;
  }
  const roleFieldsValid =
    data.role === "driver"
      ? nonBlank(data.maxDetour) &&
        nonBlank(data.seats) &&
        nonBlank(data.driverRateSelection)
      : nonBlank(data.maxPickupWalk) &&
        nonBlank(data.riderPriceSelection);
  if (!roleFieldsValid) {
    res.status(400).json({ error: "Please complete the questions for your commute type." });
    return;
  }

  const existing = await db
    .select({ id: commuteResponsesTable.id, createdAt: commuteResponsesTable.createdAt })
    .from(commuteResponsesTable)
    .where(eq(commuteResponsesTable.submissionId, data.submissionId))
    .limit(1);
  if (existing[0]) {
    res.status(201).json(CreateResponseResponse.parse(existing[0]));
    return;
  }

  const [created] = await db
    .insert(commuteResponsesTable)
    .values({
      ...data,
      schedule: normalizedSchedule,
      weeklyTripCount: normalizedTripCount,
    })
    .onConflictDoNothing({ target: commuteResponsesTable.submissionId })
    .returning({ id: commuteResponsesTable.id, createdAt: commuteResponsesTable.createdAt });
  if (created) {
    res.status(201).json(CreateResponseResponse.parse(created));
    return;
  }
  const raced = await db
    .select({ id: commuteResponsesTable.id, createdAt: commuteResponsesTable.createdAt })
    .from(commuteResponsesTable)
    .where(eq(commuteResponsesTable.submissionId, data.submissionId))
    .limit(1);
  if (!raced[0]) {
    res.status(500).json({ error: "Could not save the questionnaire response." });
    return;
  }
  res.status(201).json(CreateResponseResponse.parse(raced[0]));
});

router.post("/events", async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const dedupeKey = [
    data.eventName,
    data.posterSource,
    data.browserSessionId,
    data.role ?? "",
    data.step ?? "",
  ].join("|");
  try {
    await db
      .insert(commuteEventsTable)
      .values({ ...data, dedupeKey })
      .onConflictDoNothing({ target: commuteEventsTable.dedupeKey });
  } catch (error) {
    req.log.error({ error }, "Could not record anonymous analytics event");
  }
  res.sendStatus(204);
});

router.get("/admin/summary", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const range = parseDateRange(req);
  const rows = (await db.select().from(commuteResponsesTable))
    .filter((row) => withinDateRange(row.createdAt, range))
    .map(normalizeResponse);
  const events = (await db.select().from(commuteEventsTable))
    .filter((event) => withinDateRange(event.createdAt, range));
  const registry = buildRegistry(await db.select().from(commutePosterRegistryTable));
  const summary = buildSummary(rows);
  summary.attribution = buildAttributionSummary(rows, events, registry);
  summary.posterRegistry = registry;
  res.json(GetAdminSummaryResponse.parse(summary));
});

router.get("/admin/responses", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const range = parseDateRange(req);
  const rows = uniqueResponses(
    (await db
      .select()
      .from(commuteResponsesTable)
      .orderBy(desc(commuteResponsesTable.createdAt)))
      .filter((row) => withinDateRange(row.createdAt, range))
      .map(normalizeResponse),
  );
  res.json(GetAdminResponsesResponse.parse(rows));
});

router.get("/admin/export.csv", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const range = parseDateRange(req);
  const rows = uniqueResponses(
    (await db
      .select()
      .from(commuteResponsesTable)
      .orderBy(asc(commuteResponsesTable.createdAt)))
      .filter((row) => withinDateRange(row.createdAt, range))
      .map(normalizeResponse),
  );
  const headers = [
    "id", "createdAt", "role", "surveyVersion", "posterSource", "submissionId", "livesInSageCreek",
    "livesOutsideSageCreek", "neighborhood", "studentStatus", "isUofMStudent", "weeklyTripCount",
    ...scheduleCsvHeaders,
    "arrivalFlexibility", "departureFlexibility", "rideDirection", "maxDetour",
    "seats", "maxPickupWalk", "currentTransportMethod", "currentCommuteDuration",
    "minimumMonthlyCompensation", "maximumMonthlyWillingnessToPay",
    "driverRateCents", "driverRateSelection", "riderPriceCents", "riderPriceSelection",
    "scheduleChangeFrequency", "dealbreaker", "dealbreakerOther", "finalConcern", "finalConcernOther",
    "intentLevel", "firstName", "email", "phone", "contactMethod", "contactPermission", "prefersText",
    "utmSource", "utmMedium", "utmCampaign", "referrer",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(csvValue(row, header))).join(",")),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="sage-creek-responses.csv"');
  res.send(csv);
});

router.patch("/admin/posters/:posterId", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const parsedParams = UpdateAdminPosterParams.safeParse(req.params);
  const parsedBody = UpdateAdminPosterBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success || parsedParams.data.posterId === "direct_unknown") {
    res.status(400).json({ error: "Poster ID, location name, latitude, and longitude are invalid." });
    return;
  }
  const [updated] = await db
    .insert(commutePosterRegistryTable)
    .values({
      posterId: parsedParams.data.posterId,
      ...parsedBody.data,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: commutePosterRegistryTable.posterId,
      set: { ...parsedBody.data, updatedAt: new Date() },
    })
    .returning();
  res.json({
    posterId: updated.posterId as PosterSource,
    locationName: updated.locationName,
    latitude: updated.latitude,
    longitude: updated.longitude,
  });
});

export default router;