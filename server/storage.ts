import { 
  users, type User, type InsertUser, 
  telegramUsers, type TelegramUser, type InsertTelegramUser,
  messages, type Message, type InsertMessage
} from "@shared/schema";
import { log } from "./vite";

// Storage interface with the methods we need
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Telegram user methods
  getTelegramUser(id: number): Promise<TelegramUser | undefined>;
  getTelegramUserByTelegramId(telegramId: string): Promise<TelegramUser | undefined>;
  createTelegramUser(user: InsertTelegramUser): Promise<TelegramUser>;
  updateTelegramUserUsername(id: number, username: string): Promise<TelegramUser>;
  updateTelegramUserPhone(id: number, phone: string): Promise<TelegramUser>;
  updateTelegramUserLastActive(id: number): Promise<void>;
  updateTelegramUserSilenceStatus(id: number, isSilenced: boolean): Promise<TelegramUser>;
  updateMedicalInfoStatus(id: number, isWaiting: boolean): Promise<TelegramUser>;
  transferToHuman(id: number): Promise<TelegramUser>;
  resetConversation(id: number): Promise<TelegramUser>;
  updateConversationHistory(id: number, history: string): Promise<TelegramUser>;
  
  // Message methods
  getMessages(telegramUserId: number, limit?: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private telegramUsers: Map<number, TelegramUser>;
  private messageStore: Map<number, Message>;
  
  private userCurrentId: number;
  private telegramUserCurrentId: number;
  private messageCurrentId: number;
  
  constructor() {
    this.users = new Map();
    this.telegramUsers = new Map();
    this.messageStore = new Map();
    
    this.userCurrentId = 1;
    this.telegramUserCurrentId = 1;
    this.messageCurrentId = 1;
    
    log("Memory storage initialized", "storage");
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    log(`Created user: ${user.username} (ID: ${id})`, "storage");
    return user;
  }
  
  // Telegram user methods
  async getTelegramUser(id: number): Promise<TelegramUser | undefined> {
    return this.telegramUsers.get(id);
  }
  
  async getTelegramUserByTelegramId(telegramId: string): Promise<TelegramUser | undefined> {
    return Array.from(this.telegramUsers.values()).find(
      (user) => user.telegramId === telegramId
    );
  }
  
  async createTelegramUser(insertUser: InsertTelegramUser): Promise<TelegramUser> {
    const id = this.telegramUserCurrentId++;
    const now = new Date();
    
    const user: TelegramUser = { 
      id, 
      telegramId: insertUser.telegramId,
      username: insertUser.username || null,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      chatId: insertUser.chatId,
      phone: null,
      registeredAt: now,
      lastActive: now,
      isWaitingForUsername: insertUser.isWaitingForUsername || false,
      isWaitingForMedicalInfo: insertUser.isWaitingForMedicalInfo || false,
      isWaitingForPhone: insertUser.isWaitingForPhone || false,
      isSilenced: insertUser.isSilenced || false,
      lastTransferredToHuman: null,
      conversationHistory: insertUser.conversationHistory || null
    };
    
    this.telegramUsers.set(id, user);
    log(`Created Telegram user: ${user.username || 'New User'} (ID: ${id}, Telegram ID: ${user.telegramId})`, "storage");
    return user;
  }
  
  async updateTelegramUserUsername(id: number, username: string): Promise<TelegramUser> {
    const user = this.telegramUsers.get(id);
    if (!user) {
      throw new Error(`Telegram user not found: ${id}`);
    }
    
    const updatedUser: TelegramUser = {
      ...user,
      username,
      isWaitingForUsername: false,
      lastActive: new Date()
    };
    
    this.telegramUsers.set(id, updatedUser);
    log(`Updated Telegram user username: ${id} to ${username}`, "storage");
    return updatedUser;
  }
  
  async updateTelegramUserLastActive(id: number): Promise<void> {
    const user = this.telegramUsers.get(id);
    if (!user) {
      throw new Error(`Telegram user not found: ${id}`);
    }
    
    const updatedUser: TelegramUser = {
      ...user,
      lastActive: new Date()
    };
    
    this.telegramUsers.set(id, updatedUser);
  }
  
  async updateTelegramUserPhone(id: number, phone: string): Promise<TelegramUser> {
    const user = this.telegramUsers.get(id);
    if (!user) {
      throw new Error(`Telegram user not found: ${id}`);
    }
    
    const updatedUser: TelegramUser = {
      ...user,
      phone,
      isWaitingForPhone: false,
      isWaitingForUsername: false, // Также сбрасываем флаг ожидания имени
      lastActive: new Date()
    };
    
    this.telegramUsers.set(id, updatedUser);
    log(`Updated Telegram user phone: ${id}`, "storage");
    return updatedUser;
  }
  
  async updateTelegramUserSilenceStatus(id: number, isSilenced: boolean): Promise<TelegramUser> {
    const user = this.telegramUsers.get(id);
    if (!user) {
      throw new Error(`Telegram user not found: ${id}`);
    }
    
    const updatedUser: TelegramUser = {
      ...user,
      isSilenced,
      lastActive: new Date()
    };
    
    this.telegramUsers.set(id, updatedUser);
    log(`Updated Telegram user silence status: ${id} to ${isSilenced}`, "storage");
    return updatedUser;
  }
  
  async updateMedicalInfoStatus(id: number, isWaiting: boolean): Promise<TelegramUser> {
    const user = this.telegramUsers.get(id);
    if (!user) {
      throw new Error(`Telegram user not found: ${id}`);
    }
    
    const updatedUser: TelegramUser = {
      ...user,
      isWaitingForMedicalInfo: isWaiting,
      lastActive: new Date()
    };
    
    this.telegramUsers.set(id, updatedUser);
    log(`Updated Telegram user medical info status: ${id} to waiting=${isWaiting}`, "storage");
    return updatedUser;
  }
  
  async transferToHuman(id: number): Promise<TelegramUser> {
    const user = this.telegramUsers.get(id);
    if (!user) {
      throw new Error(`Telegram user not found: ${id}`);
    }
    
    const updatedUser: TelegramUser = {
      ...user,
      lastTransferredToHuman: new Date(),
      lastActive: new Date()
    };
    
    this.telegramUsers.set(id, updatedUser);
    log(`Transferred user ${id} to human operator`, "storage");
    return updatedUser;
  }
  
  async resetConversation(id: number): Promise<TelegramUser> {
    const user = this.telegramUsers.get(id);
    if (!user) {
      throw new Error(`Telegram user not found: ${id}`);
    }
    
    const updatedUser: TelegramUser = {
      ...user,
      isSilenced: false,
      isWaitingForUsername: true, // Устанавливаем флаг ожидания имени при сбросе
      conversationHistory: null,
      lastActive: new Date()
    };
    
    this.telegramUsers.set(id, updatedUser);
    log(`Reset conversation for user ${id}`, "storage");
    return updatedUser;
  }
  
  async updateConversationHistory(id: number, history: string): Promise<TelegramUser> {
    const user = this.telegramUsers.get(id);
    if (!user) {
      throw new Error(`Telegram user not found: ${id}`);
    }
    
    const updatedUser: TelegramUser = {
      ...user,
      conversationHistory: history,
      lastActive: new Date()
    };
    
    this.telegramUsers.set(id, updatedUser);
    return updatedUser;
  }
  
  // Message methods
  async getMessages(telegramUserId: number, limit?: number): Promise<Message[]> {
    const userMessages = Array.from(this.messageStore.values())
      .filter((message) => message.telegramUserId === telegramUserId)
      .sort((a, b) => {
        // Sort by timestamp
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
    
    if (limit && limit > 0) {
      return userMessages.slice(-limit);
    }
    
    return userMessages;
  }
  
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.messageCurrentId++;
    const now = new Date();
    
    const message: Message = {
      ...insertMessage,
      id,
      timestamp: now
    };
    
    this.messageStore.set(id, message);
    return message;
  }
}

export const storage = new MemStorage();
