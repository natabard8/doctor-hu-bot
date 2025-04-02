import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const telegramUsers = pgTable("telegram_users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  chatId: text("chat_id").notNull(),
  phone: text("phone"),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  lastActive: timestamp("last_active").defaultNow().notNull(),
  isWaitingForUsername: boolean("is_waiting_for_username").default(false),
  isWaitingForMedicalInfo: boolean("is_waiting_for_medical_info").default(false),
  isWaitingForPhone: boolean("is_waiting_for_phone").default(false),
  isSilenced: boolean("is_silenced").default(false),
  lastTransferredToHuman: timestamp("last_transferred_to_human"),
  conversationHistory: text("conversation_history"),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  telegramUserId: integer("telegram_user_id").notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  isFromUser: boolean("is_from_user").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTelegramUserSchema = createInsertSchema(telegramUsers).pick({
  telegramId: true,
  username: true,
  firstName: true,
  lastName: true,
  chatId: true,
  phone: true,
  isWaitingForUsername: true,
  isWaitingForMedicalInfo: true,
  isWaitingForPhone: true,
  isSilenced: true,
  conversationHistory: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  telegramUserId: true,
  content: true,
  isFromUser: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertTelegramUser = z.infer<typeof insertTelegramUserSchema>;
export type TelegramUser = typeof telegramUsers.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
