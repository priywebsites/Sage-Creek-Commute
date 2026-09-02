import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const commuteResponsesTable = pgTable("commute_responses", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  role: text("role").notNull(),
  livesInSageCreek: boolean("lives_in_sage_creek").notNull(),
  isUofMStudent: boolean("is_uofm_student").notNull(),
  schedule: jsonb("schedule").notNull(),
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
  scheduleChangeFrequency: text("schedule_change_frequency").notNull(),
  dealbreaker: text("dealbreaker").notNull(),
  dealbreakerOther: text("dealbreaker_other"),
  intentLevel: text("intent_level").notNull(),
  email: text("email"),
  phone: text("phone"),
  prefersText: boolean("prefers_text").notNull().default(false),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  referrer: text("referrer"),
});

export const commuteEventsTable = pgTable("commute_events", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  eventName: text("event_name").notNull(),
  role: text("role"),
  step: integer("step"),
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