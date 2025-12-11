import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey(),
  fullName: text().notNull(),
  phone: text(),
  createdAt: timestamp().notNull().defaultNow(),
});
