import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";

export const books = pgTable("books", {
  id: uuid().primaryKey(),
  title: text().notNull(),
  price: integer().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});
