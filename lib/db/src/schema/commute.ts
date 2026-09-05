import { createInsertSchema } from "drizzle-zod";
import { boolean, doublePrecision, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const commuteResponsesTable = pgTable("commute_responses", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  role: text("role").notNull(),
  surveyVersion: text("survey_version").notNull().default("v1"),
  livesInSageCreek: boolean("lives_in_sage_creek").notNull(),
  livesOutsideSageCreek: boolean("lives_outside_sage_creek").notNull().default(false),
  neighborhood: text("neighborhood"),
  studentStatus: text("student_status").notNull().default("legacy"),
  isUofMStudent: boolean("is_uofm_student").notNull(),
  schedule: jsonb("schedule").notNull(),
  weeklyTripCount: integer("weekly_trip_count"),
  arrivalFlexibility: text("arrival_flexibility").notNull(),
  departureFlexibility: text("departure_flexibility").notNull(),
  rideDirection: text("ride_direction").notNull(),
  maxDetour: text("max_detour"),
  seats: text("seats"),
  maxPickupWalk: text("max_pickup_walk"),
  currentTransportMethod: text("current_transport_method"),
  currentCommuteDuration: text("current_commute_duration"),
  minimumMonthlyCompensation: text("minimum_monthly_compensation"),
  maximumMonthlyWillingnessToPay: text("maximum_monthly_willingness_to_pay"),
  driverRateCents: integer("driver_rate_cents"),
  driverRateSelection: text("driver_rate_selection"),
  riderPriceCents: integer("rider_price_cents"),
  riderPriceSelection: text("rider_price_selection"),
  scheduleChangeFrequency: text("schedule_change_frequency").notNull(),
  dealbreaker: text("dealbreaker").notNull(),
  dealbreakerOther: text("dealbreaker_other"),
  finalConcern: text("final_concern"),
  finalConcernOther: text("final_concern_other"),
  intentLevel: text("intent_level").notNull(),
  firstName: text("first_name"),
  email: text("email"),
  phone: text("phone"),
  contactMethod: text("contact_method").notNull().default("none"),
  contactPermission: boolean("contact_permission").notNull().default(false),
  prefersText: boolean("prefers_text").notNull().default(false),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  referrer: text("referrer"),
  posterSource: text("poster_source"),
  submissionId: text("submission_id").unique(),
});

export const commuteEventsTable = pgTable("commute_events", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  eventName: text("event_name").notNull(),
  role: text("role"),
  step: integer("step"),
  posterSource: text("poster_source"),
  anonymousVisitorId: text("anonymous_visitor_id"),
  browserSessionId: text("browser_session_id"),
  dedupeKey: text("dedupe_key").unique(),
});

export const commutePosterRegistryTable = pgTable("commute_poster_registry", {
  posterId: text("poster_id").primaryKey(),
  locationName: text("location_name"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCommuteResponseSchema = createInsertSchema(commuteResponsesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCommuteResponse = z.infer<typeof insertCommuteResponseSchema>;
export type CommuteResponse = typeof commuteResponsesTable.$inferSelect;

export const insertCommuteEventSchema = createInsertSchema(commuteEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCommuteEvent = z.infer<typeof insertCommuteEventSchema>;
export type CommutePosterRegistry = typeof commutePosterRegistryTable.$inferSelect;