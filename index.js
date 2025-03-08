const express = require('express');
const { google } = require('googleapis');
const NodeCache = require('node-cache');

// Load environment variables from .env file in development
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// Initialize cache with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300 });

const app = express();

// Configure Google Sheets Auth using environment variables
const initializeGoogleSheets = () => {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    
    return google.sheets({ version: 'v4', auth });
  } catch (error) {
    console.error('Failed to initialize Google Sheets API:', error);
    return null;
  }
};

// Endpoint to serve data from Google Sheets
app.get('/api/sheet-data', async (req, res) => {
  try {
    // Check if we have cached data
    const cachedData = cache.get('sheetData');
    if (cachedData) {
      console.log('Returning cached data');
      return res.json(cachedData);
    }

    console.log('Fetching fresh data from Google Sheets');
    
    // Initialize sheets API
    const sheets = initializeGoogleSheets();
    if (!sheets) {
      // Return mock data if initialization fails
      const mockData = {
        s: "ok",
        c: [100, 105, 95, 110, 115, 105, 100, 90, 95, 120]
      };
      return res.json(mockData);
    }
    
    // Get fresh data from Google Sheets
    const sheetId = process.env.SHEET_ID;
    const range = process.env.SHEET_RANGE || 'Sheet1!A:B';
    
    console.log("Attempting to fetch data for Sheet ID:", sheetId);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range,
    });

    // Process sheet data into format for TradingView
    const values = response.data.values || [];
    
    if (values.length === 0) {
      return res.status(404).json({ error: 'No data found in spreadsheet' });
    }
    
    // Skip header row if present
    const dataRows = values.slice(1);
    
    // Format data for TradingView
    const formattedData = {
      s: "ok",  // Status
      c: []     // Values
    };

    dataRows.forEach(row => {
      // Skip empty rows
      if (row[1] !== undefined && row[1] !== '') {
        // Try to convert to number
        const value = parseFloat(row[1]);
        if (!isNaN(value)) {
          formattedData.c.push(value);
        }
      }
    });

    // Store in cache
    cache.set('sheetData', formattedData);
    
    // Set CORS headers for TradingView
    res.header('Access-Control-Allow-Origin', '*');
    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch data from Google Sheets', 
      details: error.message 
    });
  }
});

// Endpoint to manually refresh the cache
app.get('/api/refresh-cache', async (req, res) => {
  cache.del('sheetData');
  res.json({ status: 'Cache cleared' });
});

// Simple status endpoint
app.get('/', (req, res) => {
  res.send(`
    <h1>Google Sheets to TradingView Middleware</h1>
    <p>Status: Running</p>
    <p>Endpoints:</p>
    <ul>
      <li><a href="/api/sheet-data">/api/sheet-data</a> - Get formatted data for TradingView</li>
      <li><a href="/api/refresh-cache">/api/refresh-cache</a> - Manually clear the cache</li>
    </ul>
  `);
});

// For local testing
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
