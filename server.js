// server.js (Main backend entry point)

const express = require('express');
const dotenv = require('dotenv'); // Used for loading environment variables
const cors = require('cors'); // Import the CORS middleware
const path = require('path'); // Node.js built-in module for path manipulation

// Load environment variables from .env file
dotenv.config();

const app = express();
// The frontend is now expecting everything on port 3001
const PORT = process.env.PORT || 3001;

// --- CORS Configuration ---
// This is essential to allow your frontend (running on localhost:3000)
// to make requests to this backend (running on localhost:3001).
// For development, allowing all origins is fine. For production,
// you might want to restrict this to your frontend's specific domain.
app.use(cors({
  origin: 'http://localhost:3001', // Allow requests only from your frontend's origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
}));

// Middleware to parse JSON request bodies
app.use(express.json());

// For handling file uploads (like OCR images)
// Assuming you're using `multer` or a similar library in your `ocrRoutes` if needed.
// For now, if handling FormData directly in route, express.json() might not be enough.
// If you use 'express-formidable' or 'multer', ensure they are configured here or in the routes.
// Example: If using multer, you might do: const multer = require('multer'); app.use(multer().none());

// --- Import and Mount Routes ---

// 1. Chart & Market Data Routes
// These routes were previously on port 3000, now consolidated to 3001
const chartRoutes = require('./src/routes/chartRoutes');
app.use('/api/charts', chartRoutes); // All chart-related routes under /api/charts

// 2. AI Summary Service Endpoints
// These were also previously expected on port 3001, but now explicitly mounted here.
// Assuming aiSummaryService contains the logic for these,
// but the Express routes themselves might be defined here or in a dedicated route file for AI.
// For simplicity, let's assume direct mounting or a simple AI route file if not already done.
const AISummaryService = require('./src/services/aiSummaryService');
const aiService = new AISummaryService(); // Instantiate your AI service

// Assuming /analyze and /ocr are direct routes, not under /api/charts
app.post('/analyze', async (req, res) => {
  try {
    const { query } = req.body;
    // In a real app, you'd fetch relevant stock/economic/news data here
    // based on the query before passing to generateStockAnalysis or other AI methods.
    // For now, we'll just call a generic AI generation.
    const response = await aiService.generateStockAnalysis("AAPL", {
        symbol: "AAPL",
        data: [], // No historical data fetched here directly, AI works on query + context
        metadata: {
            priceRange: { current: 170.00, change: 5.00, changePercent: 2.94, min: 160, max: 175 },
            volumeRange: { min: 10000000, max: 100000000, average: 50000000 },
            timeRange: { start: "2024-01-01", end: "2024-06-14" },
            totalDataPoints: 100
        }
    }); // Simplified call for demonstration

    // To provide a chart, you'd need to:
    // 1. Parse the user query (e.g., "show chart for AAPL").
    // 2. Call your chartService to get actual HistoricalStockData.
    // 3. Include that data in the AI's response.
    // For now, let's make it more realistic by simulating.

    // Example: If query asks for AAPL chart, respond with data
    let historicalStockData = null;
    let historicalEconomicData = null;
    if (query.toLowerCase().includes('apple stock') || query.toLowerCase().includes('aapl chart')) {
        const ChartService = require('./src/services/chartService');
        const chartService = new ChartService();
        try {
            // Fetch real stock data for the chart from Alpha Vantage via chartService
            historicalStockData = await chartService.getStockData('AAPL', 'day', chartService.getDateString(-90), chartService.getDateString(0));
            // Ensure the structure matches HistoricalStockData interface
            if (historicalStockData && historicalStockData.data && historicalStockData.data.length > 0) {
                // Ensure metadata is correctly structured as per frontend types
                historicalStockData.metadata = historicalStockData.metadata || chartService.calculateMetadata(historicalStockData.data);
            }
        } catch (chartErr) {
            console.error("Error fetching stock data for AI response:", chartErr);
            // Optionally, return a message to the user that chart data couldn't be fetched
        }
    }
    // Example: If query asks for inflation data
    if (query.toLowerCase().includes('inflation rate') || query.toLowerCase().includes('economic data')) {
        // This is mock economic data as you don't have an economic data service yet
        historicalEconomicData = [
            { date: '2023-01-01', value: 6.5, indicator: 'Inflation Rate', country: 'US', unit: '%' },
            { date: '2023-04-01', value: 4.9, indicator: 'Inflation Rate', country: 'US', unit: '%' },
            { date: '2023-07-01', value: 3.2, indicator: 'Inflation Rate', country: 'US', unit: '%' },
            { date: '2023-10-01', value: 3.1, indicator: 'Inflation Rate', country: 'US', unit: '%' },
            { date: '2024-01-01', value: 3.1, indicator: 'Inflation Rate', country: 'US', unit: '%' },
            { date: '2024-04-01', value: 3.4, indicator: 'Inflation Rate', country: 'US', unit: '%' },
        ];
    }

    res.json({
      success: true,
      summary: response.fullResponse, // Using fullResponse as the main summary
      historicalStockData: historicalStockData, // Include the fetched stock data
      historicalEconomicData: historicalEconomicData, // Include mock economic data
      // imageUrl: 'http://example.com/generated-image.png', // Mock image
      // audioUrl: 'http://example.com/generated-audio.mp3', // Mock audio
    });

  } catch (error) {
    console.error('Error in /analyze endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// OCR endpoint (assuming it handles file uploads)
// You might need a middleware like `multer` or `express-formidable` here.
// For now, this is a placeholder. If you're using `express.json()` alone,
// you might receive an empty `req.body` for file uploads.
app.post('/ocr', async (req, res) => {
  try {
    // Implement actual OCR logic here using a library or an external service
    // For demonstration, returning mock extracted text
    const mockExtractedText = "This is extracted text from an image: 'Financial report shows a 15% increase in profits in Q1 2024.'"

    res.json({
      success: true,
      extractedText: mockExtractedText,
    });
  } catch (error) {
    console.error('Error in /ocr endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Basic route for server status check
app.get('/', (req, res) => {
  res.send(`Horizon AI Backend is running on port ${PORT}!`);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Access API at http://localhost:${PORT}`);
  console.log(`Chart API base: http://localhost:${PORT}/api/charts`);
  console.log(`AI Analyze endpoint: http://localhost:${PORT}/analyze`);
  console.log(`OCR endpoint: http://localhost:${PORT}/ocr`);
});
