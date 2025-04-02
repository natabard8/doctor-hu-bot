import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { initBot, stopBot } from "./telegram-bot";
import { config, validateConfig } from "./config";
import { log } from "./vite";
import { initGoogleSheets } from "./google-sheets";
import { scrapeHunchunWebsite, generatePromptFromScrapedData } from "./website-scraper";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize bot and error handling for required environment variables
  try {
    validateConfig();
    
    // Initialize the Telegram bot
    await initBot();
    log("Telegram bot started successfully", "server");
    
    // Initialize Google Sheets integration if enabled
    let sheetsStatus = "Disabled";
    if (config.googleSheetsEnabled) {
      const sheetsInitialized = await initGoogleSheets();
      sheetsStatus = sheetsInitialized ? "Connected" : "Failed to connect";
      log(`Google Sheets integration status: ${sheetsStatus}`, "server");
    }
    
    // Initialize website scraper if enabled
    let scrapedContent = "Not attempted";
    if (config.websiteScraperEnabled) {
      try {
        log("Initializing website scraper for Hunchun.ru...", "server");
        const scrapedData = await scrapeHunchunWebsite();
        scrapedContent = scrapedData.length > 0 ? 
          `Successfully scraped ${scrapedData.length} pages` : 
          "No content scraped";
        log(`Website scraper status: ${scrapedContent}`, "server");
      } catch (error: any) {
        log(`Website scraper error: ${error.message}`, "server");
        scrapedContent = `Error: ${error.message}`;
      }
    }
    
    // API routes for status and logs
    app.get("/api/status", (req, res) => {
      res.json({ 
        status: "ok", 
        message: "Telegram bot is running",
        env: {
          telegramToken: config.telegramToken ? "Set" : "Missing",
          openaiApiKey: config.openaiApiKey ? "Set" : "Missing",
          googleSheets: sheetsStatus,
          websiteScraper: config.websiteScraperEnabled ? scrapedContent : "Disabled"
        }
      });
    });
    
    // API endpoint to manually trigger website scraping
    app.post("/api/scrape-website", async (req, res) => {
      if (!config.websiteScraperEnabled) {
        return res.status(400).json({ success: false, message: "Website scraper is disabled in configuration" });
      }
      
      try {
        log("Manually triggering website scraper...", "server");
        const scrapedData = await scrapeHunchunWebsite();
        const result = scrapedData.length > 0 ? 
          `Successfully scraped ${scrapedData.length} pages` : 
          "No content scraped";
          
        return res.json({ 
          success: true, 
          message: result,
          pageCount: scrapedData.length
        });
      } catch (error: any) {
        log(`Manual website scraping error: ${error.message}`, "server");
        return res.status(500).json({ 
          success: false, 
          message: `Error scraping website: ${error.message}` 
        });
      }
    });
    
    // Graceful shutdown handler
    process.on("SIGINT", async () => {
      log("Shutting down bot...", "server");
      stopBot();
      process.exit(0);
    });
    
    process.on("SIGTERM", async () => {
      log("Shutting down bot...", "server");
      stopBot();
      process.exit(0);
    });
    
  } catch (error: any) {
    log(`Error starting bot: ${error.message}`, "server");
    
    // Set up error route to display the error
    app.get("/api/status", (req, res) => {
      res.status(500).json({ 
        status: "error", 
        message: error.message,
        env: {
          telegramToken: config.telegramToken ? "Set" : "Missing",
          openaiApiKey: config.openaiApiKey ? "Set" : "Missing",
          googleSheets: config.googleSheetsEnabled ? "Enabled but failed" : "Disabled"
        }
      });
    });
  }
  
  return httpServer;
}
