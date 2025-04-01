import { google } from 'googleapis';
import { log } from './vite';
import { config } from './config';
import { TelegramUser } from '@shared/schema';

/**
 * Utility for working with Google Sheets API to save user data
 */

// Cache spreadsheet ID 
let spreadsheetId: string | null = null;

/**
 * Initialize Google Sheets API
 */
export async function initGoogleSheets(): Promise<boolean> {
  try {
    if (!config.googleSheetsEnabled) {
      log('Google Sheets integration is disabled in config', 'sheets');
      return false;
    }

    if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
      log('Missing Google service account credentials (GOOGLE_SERVICE_ACCOUNT)', 'sheets');
      return false;
    }

    if (!config.googleSheetsId) {
      log('Missing Google Sheets ID in config (GOOGLE_SHEETS_ID)', 'sheets');
      return false;
    }

    spreadsheetId = config.googleSheetsId;
    log('Google Sheets integration initialized', 'sheets');
    
    // Immediately test the connection to catch any issues
    const testClient = await getGoogleSheetsClient();
    if (!testClient) {
      log('Google Sheets client initialization failed - please check your service account credentials', 'sheets');
      return false;
    }
    
    return true;
  } catch (error: any) {
    log(`Failed to initialize Google Sheets: ${error.message}`, 'sheets');
    return false;
  }
}

/**
 * Get authorized Google Sheets client
 */
async function getGoogleSheetsClient() {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
      log('Missing Google service account credentials', 'sheets');
      return null;
    }
    
    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    } catch (parseError: any) {
      log(`Failed to parse Google service account credentials: ${parseError.message}`, 'sheets');
      return null;
    }
    
    if (!credentials.client_email || !credentials.private_key) {
      log('Invalid Google service account format - missing required fields', 'sheets');
      return null;
    }
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    
    const client = await auth.getClient();
    const sheets = google.sheets({ 
      version: 'v4', 
      auth: client as any // type cast to fix TS type error
    });
    
    // Test connection by attempting to get spreadsheet info
    if (spreadsheetId) {
      try {
        await sheets.spreadsheets.get({ spreadsheetId });
        log('Successfully connected to Google Sheets', 'sheets');
      } catch (testError: any) {
        log(`Google Sheets connection test failed: ${testError.message}`, 'sheets');
        if (testError.message.includes('permission')) {
          log('This is likely a permissions issue. Make sure the service account email has access to the spreadsheet', 'sheets');
          if (credentials.client_email) {
            log(`Service account email: ${credentials.client_email} - Please share the spreadsheet with this email address`, 'sheets');
          }
        }
        return null;
      }
    }
    
    return sheets;
  } catch (error: any) {
    log(`Failed to get Google Sheets client: ${error.message}`, 'sheets');
    return null;
  }
}

/**
 * Check if the header row exists, if not create it
 */
async function ensureHeaderRow() {
  try {
    if (!spreadsheetId) return false;
    
    const sheets = await getGoogleSheetsClient();
    if (!sheets) return false;
    
    // Check if the header row exists
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Leads!A1:J1',
    });
    
    const headerRow = response.data.values?.[0];
    if (headerRow && headerRow.length > 0) {
      return true; // Header already exists
    }
    
    // Create header row
    const headers = [
      'ID', 'Telegram ID', 'Username', 'First Name', 'Last Name', 
      'Phone', 'Registration Date', 'Last Active', 'Source', 'Notes'
    ];
    
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Leads!A1:J1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers],
      },
    });
    
    // Format header row
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.8,
                    green: 0.8,
                    blue: 0.8,
                  },
                  horizontalAlignment: 'CENTER',
                  textFormat: {
                    bold: true,
                  },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
        ],
      },
    });
    
    log('Created header row in Google Sheets', 'sheets');
    return true;
  } catch (error: any) {
    log(`Failed to ensure header row: ${error.message}`, 'sheets');
    return false;
  }
}

/**
 * Add or update user data in Google Sheets
 */
export async function saveUserToSheets(user: TelegramUser, source: string = "Telegram Bot", notes: string = ""): Promise<boolean> {
  try {
    if (!config.googleSheetsEnabled || !spreadsheetId) {
      log('Google Sheets integration is not enabled or initialized', 'sheets');
      return false;
    }
    
    const sheets = await getGoogleSheetsClient();
    if (!sheets) return false;
    
    // Ensure header row exists
    await ensureHeaderRow();
    
    // Check if user already exists in sheet
    const searchResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Leads!A:B',
    });
    
    const rows = searchResponse.data.values || [];
    let rowIndex = -1;
    
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] === user.telegramId) {
        rowIndex = i + 1; // 1-based index for sheets API
        break;
      }
    }
    
    // Format date as readable strings
    const registeredDate = user.registeredAt ? new Date(user.registeredAt).toLocaleString('ru-RU') : '';
    const lastActiveDate = user.lastActive ? new Date(user.lastActive).toLocaleString('ru-RU') : '';
    
    const userData = [
      user.id.toString(),
      user.telegramId,
      user.username || '',
      user.firstName || '',
      user.lastName || '',
      user.phone || '',
      registeredDate,
      lastActiveDate,
      source,
      notes
    ];
    
    if (rowIndex === -1) {
      // Add new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Leads!A:J',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [userData],
        },
      });
      
      log(`Added user ${user.id} to Google Sheets`, 'sheets');
    } else {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Leads!A${rowIndex}:J${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [userData],
        },
      });
      
      log(`Updated user ${user.id} in Google Sheets`, 'sheets');
    }
    
    return true;
  } catch (error: any) {
    log(`Failed to save user to Google Sheets: ${error.message}`, 'sheets');
    return false;
  }
}

/**
 * Add a new message or interaction to the interaction log
 */
export async function logInteractionToSheets(
  userId: number, 
  telegramId: string, 
  messageContent: string, 
  isFromUser: boolean,
  interactionType: 'message' | 'command' | 'button' | 'phone' | 'other' = 'message'
): Promise<boolean> {
  try {
    if (!config.googleSheetsEnabled || !spreadsheetId) {
      return false;
    }
    
    const sheets = await getGoogleSheetsClient();
    if (!sheets) return false;
    
    // Check if Interactions sheet exists
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId
    });
    
    const sheets_list = spreadsheet.data.sheets || [];
    let interactionsSheetExists = false;
    let interactionsSheetId = null;
    
    for (const sheet of sheets_list) {
      if (sheet.properties?.title === 'Interactions') {
        interactionsSheetExists = true;
        interactionsSheetId = sheet.properties?.sheetId;
        break;
      }
    }
    
    // Create Interactions sheet if it doesn't exist
    if (!interactionsSheetExists) {
      const addSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: 'Interactions',
                }
              }
            }
          ]
        }
      });
      
      interactionsSheetId = addSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;
      
      // Add header row
      const headers = [
        'Timestamp', 'User ID', 'Telegram ID', 'Type', 'Direction', 'Content'
      ];
      
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Interactions!A1:F1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers],
        },
      });
      
      // Format header row
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: interactionsSheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: {
                      red: 0.8,
                      green: 0.8,
                      blue: 0.8,
                    },
                    horizontalAlignment: 'CENTER',
                    textFormat: {
                      bold: true,
                    },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
              },
            },
          ],
        },
      });
    }
    
    // Truncate message if it's too long
    const truncatedMessage = messageContent.length > 500 
      ? `${messageContent.substring(0, 497)}...` 
      : messageContent;
    
    // Add interaction row
    const timestamp = new Date().toLocaleString('ru-RU');
    const direction = isFromUser ? 'от пользователя' : 'от бота';
    
    const interactionData = [
      timestamp,
      userId.toString(),
      telegramId,
      interactionType,
      direction,
      truncatedMessage
    ];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Interactions!A:F',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [interactionData],
      },
    });
    
    return true;
  } catch (error: any) {
    log(`Failed to log interaction to Google Sheets: ${error.message}`, 'sheets');
    return false;
  }
}