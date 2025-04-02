import axios from 'axios';
import * as cheerio from 'cheerio';
import { log } from './vite';

interface ScrapedData {
  title: string;
  content: string;
  url: string;
}

/**
 * Scrape information from Hunchun website
 */
export async function scrapeHunchunWebsite(): Promise<ScrapedData[]> {
  try {
    const baseUrl = 'https://hunchun.ru';
    const mainPageData = await fetchPage(baseUrl);
    
    if (!mainPageData) {
      return [];
    }
    
    // Get main page data
    const scrapedData: ScrapedData[] = [mainPageData];
    
    // Extract links to other important pages
    const links = extractLinks(mainPageData.content, baseUrl);
    
    // Fetch content from each link (limited to most important pages)
    const importantLinks = links.slice(0, 5); // Limit to 5 pages to avoid overloading
    
    for (const link of importantLinks) {
      const pageData = await fetchPage(link);
      if (pageData) {
        scrapedData.push(pageData);
      }
    }
    
    log(`Successfully scraped ${scrapedData.length} pages from Hunchun website`, 'scraper');
    return scrapedData;
  } catch (error: any) {
    log(`Error scraping website: ${error.message}`, 'scraper');
    return [];
  }
}

/**
 * Fetch a single page and extract its content
 */
async function fetchPage(url: string): Promise<ScrapedData | null> {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    // Remove unnecessary elements that might contain irrelevant content
    $('script').remove();
    $('style').remove();
    $('.sidebar').remove(); // Assuming sidebar contains navigation, not content
    
    const title = $('title').text().trim();
    
    // Collect main content
    const content = $('main, article, .content, .main-content, body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    
    return {
      title,
      content,
      url,
    };
  } catch (error: any) {
    log(`Error fetching page ${url}: ${error.message}`, 'scraper');
    return null;
  }
}

/**
 * Extract links from HTML content
 */
function extractLinks(htmlContent: string, baseUrl: string): string[] {
  const $ = cheerio.load(htmlContent);
  const links: string[] = [];
  
  // Get all links
  $('a').each((_, element) => {
    const href = $(element).attr('href');
    
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      // Convert relative URLs to absolute
      const absoluteUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
      
      // Only include links from the same domain
      if (absoluteUrl.includes(baseUrl.replace('https://', ''))) {
        if (!links.includes(absoluteUrl)) {
          links.push(absoluteUrl);
        }
      }
    }
  });
  
  return links;
}

/**
 * Process scraped data into a format suitable for the bot
 */
export function generatePromptFromScrapedData(data: ScrapedData[]): string {
  if (data.length === 0) {
    return '';
  }
  
  let prompt = 'АКТУАЛЬНАЯ ИНФОРМАЦИЯ с официального сайта клиники в Хуньчуне (https://hunchun.ru):\n\n';
  
  data.forEach((page, index) => {
    // Ignore pages with very short content
    if (page.content.length < 100) return;
    
    prompt += `СТРАНИЦА "${page.title}":\n`;
    
    // Extract most relevant content
    // For the main page, include more content
    const contentLength = index === 0 ? 1200 : 800;
    const relevantContent = page.content.substring(0, contentLength);
    
    // Clean up content by removing excess whitespace and normalizing line breaks
    const cleanedContent = relevantContent
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
      
    prompt += `${cleanedContent}...\n\n`;
  });
  
  prompt += 'ВАЖНО: Активно используй эту информацию в своих ответах, особенно когда говоришь о специфике клиник, услугах и преимуществах лечения в Хуньчуне. Это актуальные данные с официального сайта, которые помогут тебе точнее отвечать на вопросы о лечении в Китае.';
  
  return prompt;
}