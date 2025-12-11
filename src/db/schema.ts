import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  doublePrecision,
  varchar,
} from "drizzle-orm/pg-core";

export const books = pgTable("books", {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  price: integer().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const crimes = pgTable("crimes", {
  id: uuid().primaryKey().defaultRandom(),
  priorityLevel: integer("priority_level").notNull(), // 1–10
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  description: text("description").notNull(),
  address: text("address"),
  assignedUnitId: varchar("assigned_unit_id"),
  assignedAt: timestamp("assigned_at", { withTimezone: false }),
  createdAt: timestamp("created_at").defaultNow(),
});
