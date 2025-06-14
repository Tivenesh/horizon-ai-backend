// backend/index.js

// --- Imports ---
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Loads environment variables from .env file
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios'); // For making HTTP requests to external APIs
const multer = require('multer'); // For handling file uploads (OCR)


// --- Express App Setup ---
const app = express();
const PORT = process.env.PORT || 3001; // Backend will run on port 3001

// IMPORTANT: CORS Middleware - allows our Next.js frontend to talk to this backend
app.use(cors({
    origin: 'http://localhost:3000' // This must match your Next.js frontend's URL
}));
app.use(express.json()); // Enable parsing of JSON request bodies


// --- Initialize Generative AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });


// --- Helper Functions (Data Fetching & Generative AI - DEFINED FIRST!) ---

async function fetchNews(keyword) {
    const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(keyword)}&lang=en&country=us&max=5&token=${GNEWS_API_KEY}`;
    console.log(`[News API] Fetching news for: ${keyword}`);

    try {
        const response = await axios.get(url);
        const articles = response.data.articles.map(article => ({
            title: article.title,
            description: article.description,
            url: article.url
        }));
        console.log(`[News API] Fetched ${articles.length} articles.`);
        return { articles: articles }; // Return a structured object
    } catch (error) {
        console.error('[News API] Error fetching news:', error.message);
        return { error: 'Failed to fetch news data.' };
    }
}

async function getStockData(ticker) {
    const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    console.log(`[Stock API] Fetching stock data for: ${ticker}`);

    try {
        const response = await axios.get(url);
        const data = response.data["Global Quote"];

        if (data && Object.keys(data).length > 0) {
            const stockInfo = {
                ticker: data["01. symbol"],
                price: parseFloat(data["05. price"]),
                open: parseFloat(data["02. open"]),
                high: parseFloat(data["03. high"]),
                low: parseFloat(data["04. low"]),
                volume: parseInt(data["06. volume"]),
                latest_trading_day: data["07. latest trading day"],
                previous_close: parseFloat(data["08. previous close"]),
                change: parseFloat(data["09. change"]),
                change_percent: parseFloat(data["10. change percent"])
            };
            console.log(`[Stock API] Fetched data for ${stockInfo.ticker}: Price ${stockInfo.price}`);
            return { stock_data: stockInfo };
        } else {
            console.warn(`[Stock API] No data found for ticker: ${ticker}. Response:`, response.data);
            return { error: `No stock data found for ${ticker}. It might be an invalid ticker or a rate limit issue.` };
        }
    } catch (error) {
        console.error('[Stock API] Error fetching stock data:', error.message);
        return { error: 'Failed to fetch stock data.' };
    }
}

async function getBursaAnnouncements(symbol) {
    console.log(`[Mock API] Fetching Bursa announcements for: ${symbol}`);
    const mockAnnouncements = [
        {
            date: "2025-06-14",
            stock_code: symbol,
            company_name: "TENAGA NASIONAL BHD",
            category: "General Announcement",
            title: `Proposed Solar Farm Expansion by ${symbol}`,
            details: `${symbol} (Tenaga Nasional Bhd) has announced plans to invest heavily in a new 50MW solar farm in Kedah, aiming to boost renewable energy capacity. This is part of the national green energy initiative.`,
            source: "Bursa Malaysia Mock Data"
        },
        {
            date: "2025-06-12",
            stock_code: symbol,
            company_name: "TENAGA NASIONAL BHD",
            category: "Financial Results",
            title: `Q1 2025 Earnings Report for ${symbol}`,
            details: `${symbol} reported a 10% increase in net profit for Q1 2025, driven by strong electricity demand from industrial sectors. Revenue stood at RM 12.5 billion.`,
            source: "Bursa Malaysia Mock Data"
        },
        {
            date: "2025-06-11",
            stock_code: symbol,
            company_name: "TENAGA NASIONAL BHD",
            category: "Corporate Action",
            title: `Dividend Declaration by ${symbol}`,
            details: `${symbol} has declared a first interim dividend of 18 sen per share for the financial year ending December 31, 2025, payable on July 15, 2025.`,
            source: "Bursa Malaysia Mock Data"
        }
    ];
    console.log(`[Mock API] Provided ${mockAnnouncements.length} mock Bursa announcements.`);
    return { announcements: mockAnnouncements };
}

async function analyzeSocialSentiment(keyword) {
    console.log(`[Mock API] Analyzing social sentiment for: ${keyword}`);
    const mockSentiment = {
        keyword: keyword,
        positive_mentions: 75,
        negative_mentions: 15,
        neutral_mentions: 10,
        overall_sentiment: "mostly positive",
        top_themes: ["expansion plans", "market confidence", "regulatory outlook"],
        source: "Mock Social Media Analytics"
    };
    console.log(`[Mock API] Provided mock social sentiment for ${keyword}: ${mockSentiment.overall_sentiment}`);
    return { sentiment_data: mockSentiment };
}

async function getEconomicData(indicator) {
    console.log(`[Mock API] Fetching economic data for: ${indicator}`);
    const mockEconomicData = {
        inflation_rate: {
            date: "May 2025",
            value: "2.8%",
            source: "Department of Statistics Malaysia Mock"
        },
        gdp_growth: {
            date: "Q1 2025",
            value: "4.5%",
            source: "Bank Negara Malaysia Mock"
        },
        interest_rate: {
            date: "June 2025",
            value: "3.00%",
            source: "Bank Negara Malaysia Mock"
        }
    };

    if (indicator in mockEconomicData) {
        console.log(`[Mock API] Provided mock economic data for ${indicator}.`);
        return { economic_data: mockEconomicData[indicator] };
    } else {
        console.warn(`[Mock API] No mock economic data for indicator: ${indicator}`);
        return { error: `No mock economic data found for ${indicator}.` };
    }
}

async function generateImage(prompt) {
    const STABILITY_AI_API_KEY = process.env.STABILITY_AI_API_KEY;
    if (!STABILITY_AI_API_KEY) {
        console.error("[Stability AI] API key not set.");
        return { error: "Stability AI API key not found." };
    }

    const url = "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image";
    const headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${STABILITY_AI_API_KEY}`,
    };
    const body = {
        steps: 40,
        width: 1024,
        height: 1024,
        seed: 0,
        cfg_scale: 7.0,
        samples: 1,
        text_prompts: [{ text: prompt, weight: 1 }],
    };

    console.log(`[Stability AI] Generating image for prompt: "${prompt.substring(0, 50)}..."`);

    try {
        const response = await axios.post(url, body, { headers });
        if (response.data.artifacts && response.data.artifacts.length > 0) {
            const base64Image = response.data.artifacts[0].base64;
            const imageUrl = `data:image/png;base64,${base64Image}`;
            console.log("[Stability AI] Image generated successfully.");
            return { imageUrl: imageUrl };
        } else {
            console.error("[Stability AI] No image artifacts found in response:", response.data);
            return { error: "Failed to generate image." };
        }
    } catch (error) {
        console.error('[Stability AI] Error generating image:', error.response ? error.response.data : error.message);
        return { error: "Failed to generate image." };
    }
}

async function generateAudio(text, voiceId = "FGY2WhTYpPnrIDTdsKH5") { // Default voice ID for a clear voice
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
        console.error("[ElevenLabs] API key not set.");
        return { error: "ElevenLabs API key not found." };
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
    };
    const body = {
        text: text,
        model_id: "eleven_monolingual_v1", // You can experiment with other models
        voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
        }
    };

    console.log(`[ElevenLabs] Generating audio for text: "${text.substring(0, 50)}..."`);

    try {
        const response = await axios.post(url, body, { headers, responseType: 'arraybuffer' });
        const base64Audio = Buffer.from(response.data).toString('base64');
        const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
        console.log("[ElevenLabs] Audio generated successfully.");
        return { audioUrl: audioUrl };
    } catch (error) {
        console.error('[ElevenLabs] Error generating audio:', error.response ? error.response.data.toString('utf8') : error.message);
        return { error: "Failed to generate audio." };
    }
}

async function getEconomicIndicatorData(indicatorCode, countryCode = 'united states') {
    const TRADING_ECONOMICS_API_KEY = process.env.TRADING_ECONOMICS_API_KEY;
    if (!TRADING_ECONOMICS_API_KEY) {
        console.error("[Trading Economics API] API key not set.");
        return { error: "Trading Economics API key not found." };
    }

    let endpoint;
    // Map common indicator names to Trading Economics API paths/codes
    switch(indicatorCode.toLowerCase()) {
        case 'cpi':
            endpoint = 'consumer price index';
            break;
        case 'ppi':
            endpoint = 'producer price index';
            break;
        case 'fomc':
            // FOMC is specific to US interest rates. If 'fomc' is queried,
            // we'll fetch US interest rates data.
            endpoint = 'interest rate';
            countryCode = 'united states'; // Force US for FOMC context
            break;
        case 'interest_rate': // Added direct for general interest rate query
            endpoint = 'interest rate';
            break;
        case 'gdp':
            endpoint = 'gdp growth rate';
            break;
        // Add more mappings as you discover needed indicators from Trading Economics
        default:
            return { error: `Unsupported economic indicator: ${indicatorCode}. Please specify 'CPI', 'PPI', 'FOMC', 'interest_rate', or 'GDP'.` };
    }

    const url = `https://api.tradingeconomics.com/historical/country/${encodeURIComponent(countryCode)}/indicator/${encodeURIComponent(endpoint)}?c=${TRADING_ECONOMICS_API_KEY}`;
    console.log(`[Economic API] Fetching economic data for ${indicatorCode} (${countryCode})`);

    try {
        const response = await axios.get(url);
        const data = response.data; // Trading Economics returns an array of objects

        if (data && data.length > 0) {
            const chartData = data.map(item => ({
                date: item.Date.split('T')[0], // Extract just the date part
                value: item.Value,
                // Include other relevant fields if needed for frontend display or Gemini's analysis
                category: item.Category,
                unit: item.Unit,
                country: item.Country,
                title: item.Indicator // Use Indicator as title
            })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Ensure chronological order

            console.log(`[Economic API] Fetched ${chartData.length} data points for ${indicatorCode}.`);
            return {
                indicator: indicatorCode,
                country: countryCode,
                historical_economic_data: chartData,
                source: "Trading Economics"
            };
        } else {
            console.warn(`[Economic API] No historical data found for ${indicatorCode} (${countryCode}). Response:`, response.data);
            return { error: `No historical economic data found for ${indicatorCode} in ${countryCode}. It might be an invalid indicator/country or a rate limit issue.` };
        }
    } catch (error) {
        console.error(`[Economic API] Error fetching economic data for ${indicatorCode}:`, error.response ? (error.response.data || error.response.statusText) : error.message);
        return { error: `Failed to fetch economic data for ${indicatorCode}.` };
    }
}


async function getHistoricalStockData(ticker, period = 'daily') { // 'daily', 'weekly', 'monthly'
    const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    if (!ALPHA_VANTAGE_API_KEY) {
        console.error("[Alpha Vantage API] API key not set.");
        return { error: "Alpha Vantage API key not found." };
    }

    let functionName;
    let timeSeriesKey;

    // --- NEW MAPPING LOGIC FOR COMMON INDEXES ---
    let actualTicker = ticker.toUpperCase(); // Start with the passed ticker
    switch (actualTicker) {
        case 'NASDAQ':
        case '^IXIC': // If Gemini decides to pass ^IXIC
        case 'NASDAQ 100':
        case 'COMPQ': // Another common NASDAQ Composite symbol
            actualTicker = 'QQQ'; // Use NASDAQ 100 ETF as it's typically reliable on Alpha Vantage
            break;
        case 'S&P 500':
        case 'SP500':
        case '^GSPC': // If Gemini decides to pass ^GSPC
            actualTicker = 'SPY'; // Use S&P 500 ETF
            break;
        case 'DOW JONES':
        case 'DOW':
        case '^DJI': // If Gemini decides to pass ^DJI
            actualTicker = 'DIA'; // Use Dow Jones ETF
            break;
        // Add other specific mappings if needed (e.g., specific company aliases)
        default:
            // No change needed for standard tickers like AAPL, MSFT
            break;
    }
    // --- END NEW MAPPING LOGIC ---

    switch (period) {
        case 'daily':
            functionName = "TIME_SERIES_DAILY_ADJUSTED"; // Includes adjusted close for better accuracy
            timeSeriesKey = "Time Series (Daily)";
            break;
        case 'weekly':
            functionName = "TIME_SERIES_WEEKLY_ADJUSTED";
            timeSeriesKey = "Weekly Adjusted Time Series";
            break;
        case 'monthly':
            functionName = "TIME_SERIES_MONTHLY_ADJUSTED";
            timeSeriesKey = "Monthly Adjusted Time Series";
            break;
        default:
            return { error: "Invalid period specified for historical stock data. Choose 'daily', 'weekly', or 'monthly'." };
    }

    const url = `https://www.alphavantage.co/query?function=${functionName}&symbol=${encodeURIComponent(actualTicker)}&apikey=${ALPHA_VANTAGE_API_KEY}&outputsize=full`; // Use actualTicker
    console.log(`[Stock API] Fetching ${period} historical data for: ${actualTicker}`); // Log the actual ticker being used

    try {
        const response = await axios.get(url);
        const data = response.data[timeSeriesKey] || response.data; // Fallback for different time series keys

        if (data && Object.keys(data).length > 0 && typeof data !== 'string') { // Ensure data is an object, not an error message
            const historicalData = Object.entries(data).map(([date, values]) => ({
                date: date,
                // Alpha Vantage for TIME_SERIES_DAILY uses "1. open", etc.
                // Adjusted series will have "5. adjusted close"
                open: parseFloat(values["1. open"]),
                high: parseFloat(values["2. high"]),
                low: parseFloat(values["3. low"]),
                close: parseFloat(values["4. close"]),
                adjustedClose: parseFloat(values["5. adjusted close"] || values["4. close"]), // Use adjusted or fall back to close
                volume: parseInt(values["6. volume"])
            })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Ensure correct chronological sorting

            console.log(`[Stock API] Fetched ${historicalData.length} historical data points for ${actualTicker}.`);
            // Pass the actualTicker so the frontend can use it for chart title
            return { ticker: actualTicker, historical_data: historicalData, source: "Alpha Vantage" };
        } else {
            console.warn(`[Stock API] No historical ${period} data found for ticker: ${actualTicker}. Response:`, response.data);
            // Provide more specific error if Alpha Vantage returns error message
            if (response.data["Error Message"]) {
                return { error: `Alpha Vantage Error for ${actualTicker}: ${response.data["Error Message"]}` };
            }
            return { error: `No historical ${period} data found for ${actualTicker}. It might be an invalid ticker, or a rate limit issue, or data is not available.` };
        }
    } catch (error) {
        console.error(`[Stock API] Error fetching ${period} historical data for ${actualTicker}:`, error.message);
        return { error: `Failed to fetch ${period} historical data for ${actualTicker}.` };
    }
}


async function getBursaHistoricalData(symbol, period = 'daily') {
    console.log(`[Mock API] Fetching Bursa historical data for: ${symbol}, period: ${period}`);
    // Generate mock historical data for demonstration
    const today = new Date();
    const historicalData = [];
    for (let i = 0; i < 30; i++) { // Last 30 days/weeks/months
        const date = new Date(today);
        if (period === 'daily') {
            date.setDate(today.getDate() - i);
        } else if (period === 'weekly') {
            date.setDate(today.getDate() - (i * 7));
        } else if (period === 'monthly') {
            date.setMonth(today.getMonth() - i);
        }

        // Simple mock price fluctuation
        const basePrice = 5.0 + Math.sin(i / 5) * 0.5 + Math.cos(i / 10) * 0.3;
        const open = parseFloat((basePrice + (Math.random() - 0.5) * 0.1).toFixed(2));
        const close = parseFloat((basePrice + (Math.random() - 0.5) * 0.1).toFixed(2));
        const high = Math.max(open, close, parseFloat((basePrice + Math.random() * 0.2).toFixed(2)));
        const low = Math.min(open, close, parseFloat((basePrice - Math.random() * 0.2).toFixed(2)));
        const volume = Math.floor(1000000 + Math.random() * 500000);

        historicalData.unshift({ // Add to beginning to keep chronological order
            date: date.toISOString().split('T')[0],
            open,
            high,
            low,
            close,
            adjustedClose: close, // For simplicity in mock
            volume
        });
    }
    console.log(`[Mock API] Provided ${historicalData.length} mock Bursa historical data points.`);
    return { ticker: symbol, historical_data: historicalData, source: "Bursa Malaysia Mock Data" }; // Added ticker and source for frontend
}

// Multer setup for OCR
const upload = multer({ storage: multer.memoryStorage() }); // Store image in memory as buffer

// Add this helper function for OCR
async function performOcr(imageData, contentType) {
    const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY;
    if (!OCR_SPACE_API_KEY) {
        console.error("[OCR.space] API key not set.");
        return { error: "OCR.space API key not found." };
    }

    const url = 'https://api.ocr.space/parse/image';
    try {
        // Ensure the base64 string includes the data URL prefix
        const base64Prefix = `data:${contentType};base64,`;
        const base64Image = `${base64Prefix}${imageData.toString('base64')}`;

        const response = await axios.post(url, {
            base64Image: base64Image,
            language: 'eng', // Consider making this dynamic based on user or detected language
            isOverlayRequired: true // To get word bounding boxes if needed, or false for just text
        }, {
            headers: {
                'apikey': OCR_SPACE_API_KEY,
                'Content-Type': 'application/json' // Important for base64 payload
            }
        });

        const parsedResults = response.data.ParsedResults;
        if (parsedResults && parsedResults.length > 0) {
            const extractedText = parsedResults.map(result => result.ParsedText).join('\n');
            console.log("[OCR] Text extracted successfully.");
            return { extractedText: extractedText };
        } else if (response.data.IsErroredOnProcessing) {
            console.error("[OCR.space] Error processing image:", response.data.ErrorMessage);
            return { error: `OCR processing failed: ${response.data.ErrorMessage}` };
        } else {
            console.warn("[OCR.space] No text found in image or parsing failed:", response.data);
            return { error: "Could not extract text from image. No parsed results." };
        }
    } catch (error) {
        console.error('[OCR.space] Error performing OCR:', error.response ? (error.response.data || error.response.statusText) : error.message);
        return { error: "Failed to perform OCR. Please check the image and API key." };
    }
}


// --- API Routes ---

// Test route for the backend
app.get('/', (req, res) => {
    res.json({ message: 'Node.js Backend is live and cookin!' });
});


// Our main /analyze endpoint
app.post('/analyze', async (req, res) => {
    const { query } = req.body;

    if (!query) {
        return res.status(400).json({ error: "Query is required." });
    }

    try {
        const tools = [
            {
                function_declarations: [{
                    name: "fetch_news",
                    description: "Fetches current news articles related to a given company or topic.",
                    parameters: { type: "object", properties: { keyword: { type: "string", description: "The keyword, company name, or topic to search for news about." } }, required: ["keyword"] },
                }],
            },
            {
                function_declarations: [{
                    name: "get_stock_data",
                    description: "Retrieves current and historical stock data for a given US stock or ETF ticker symbol (e.g., AAPL for Apple, SPY for S&P 500 ETF).",
                    parameters: { type: "object", properties: { ticker: { type: "string", description: "The stock or ETF ticker symbol (e.g., MSFT, QQQ)." } }, required: ["ticker"] },
                }],
            },
            {
                function_declarations: [{
                    name: "get_bursa_announcements",
                    description: "Fetches recent official announcements and disclosures from Bursa Malaysia for a given stock symbol. Returns mock data for demonstration.",
                    parameters: { type: "object", properties: { symbol: { type: "string", description: "The Bursa Malaysia stock symbol (e.g., TNB, PETRONAS)." } }, required: ["symbol"] },
                }],
            },
            {
                function_declarations: [{
                    name: "analyze_social_sentiment",
                    description: "Analyzes mock social media sentiment (e.g., Twitter, Reddit) for a given keyword or stock ticker. Returns mock data for demonstration.",
                    parameters: { type: "object", properties: { keyword: { type: "string", description: "The keyword or stock ticker to analyze sentiment for." } }, required: ["keyword"] },
                }],
            },
            {
                function_declarations: [{
                    name: "get_economic_data",
                    description: "Retrieves mock economic indicators from sources like Department of Statistics Malaysia or Bank Negara Malaysia.",
                    parameters: { type: "object", properties: { indicator: { type: "string", description: "The economic indicator to fetch (e.g., 'inflation_rate', 'gdp_growth', 'interest_rate')." } }, required: ["indicator"] },
                }],

            },
            {
                function_declarations: [{
                    name: "get_historical_stock_data",
                    description: "Fetches historical daily, weekly, or monthly stock price data (Open, High, Low, Close, Volume, Adjusted Close) for a given US stock or ETF ticker symbol. This is useful for drawing stock charts, plotting price trends, and analyzing past performance. Use this when the user asks for 'chart', 'graph', 'historical data', 'performance', 'trend' for a US stock, ETF, or a major index like NASDAQ (use QQQ as ticker for NASDAQ 100 ETF), S&P 500 (use SPY as ticker for S&P 500 ETF), or Dow Jones (use DIA as ticker for Dow Jones ETF). Defaults to 'daily' period if not specified.",
                    parameters: {
                        type: "object",
                        properties: {
                            ticker: { type: "string", description: "The US stock, ETF, or index-tracking ETF ticker symbol (e.g., AAPL, MSFT, QQQ, SPY, DIA). If the user mentions a major index name like 'NASDAQ', 'S&P 500', or 'Dow Jones', use the common ETF ticker for that index (QQQ for NASDAQ, SPY for S&P 500, DIA for Dow Jones)." },
                            period: { type: "string", enum: ["daily", "weekly", "monthly"], description: "The time period for historical data (e.g., 'daily', 'weekly', 'monthly'). Defaults to 'daily' if not specified by the user." }
                        },
                        required: ["ticker"]
                    },
                }],
            },
            {
                function_declarations: [{
                    name: "get_bursa_historical_data",
                    description: "Fetches mock historical daily, weekly, or monthly stock price data (Open, High, Low, Close, Volume) for a given Bursa Malaysia stock symbol. Useful for charting trends. Returns mock data for demonstration.",
                    parameters: {
                        type: "object",
                        properties: {
                            symbol: { type: "string", description: "The Bursa Malaysia stock symbol (e.g., TNB, PETRONAS)." },
                            period: { type: "string", enum: ["daily", "weekly", "monthly"], description: "The time period for historical data (e.g., 'daily', 'weekly', 'monthly'). Defaults to 'daily'." }
                        },
                        required: ["symbol"]
                    },
                }],
            },
            {
                function_declarations: [{
                    name: "get_economic_indicator_data",
                    description: "Retrieves historical data for key economic indicators like CPI (Consumer Price Index), PPI (Producer Price Index), or interest rates (often influenced by FOMC). Useful for charting macroeconomic trends. Specify the indicator code and optionally the country (defaults to 'united states').",
                    parameters: {
                        type: "object",
                        properties: {
                            indicatorCode: { type: "string", description: "The code or common name for the economic indicator (e.g., 'CPI', 'PPI', 'FOMC' for interest rates, 'GDP')." },
                            countryCode: { type: "string", description: "The country for which to fetch the economic data (e.g., 'united states', 'malaysia'). Defaults to 'united states'." }
                        },
                        required: ["indicatorCode"]
                    },
                }],
            },
            { // NEW: Function to explicitly generate an image
                function_declarations: [{
                    name: "generate_image_tool",
                    description: "Generates an AI-powered infographic image based on a provided detailed prompt. Use this when the user explicitly asks for an 'image', 'picture', 'infographic', or 'visual representation' of market insights. The prompt for the image should be detailed and relevant to financial data, trends, or market context.",
                    parameters: {
                        type: "object",
                        properties: {
                            prompt: { type: "string", description: "A detailed description for the AI image generation, summarizing the desired visual content for financial market insights." }
                        },
                        required: ["prompt"]
                    },
                }],
            },
        ];

        const chat = model.startChat({ tools });
        const result = await chat.sendMessage(query);
        const call = result.response.functionCall;

        let functionResult = null;
        let historicalStockData = null; // Renamed to clearly differentiate from economic data
        let historicalEconomicData = null; // For economic indicators
        let imageUrl = null; // Initialize imageUrl to null

        if (call) {
            console.log('Gemini requested function call:', call);
            if (call.name === 'fetch_news') {
                functionResult = await fetchNews(call.args.keyword);
            } else if (call.name === 'get_stock_data') {
                functionResult = await getStockData(call.args.ticker);
            } else if (call.name === 'get_bursa_announcements') {
                functionResult = await getBursaAnnouncements(call.args.symbol);
            } else if (call.name === 'analyze_social_sentiment') {
                functionResult = await analyzeSocialSentiment(call.args.keyword);
            } else if (call.name === 'get_economic_data') {
                functionResult = await getEconomicData(call.args.indicator);
            } else if (call.name === 'get_historical_stock_data') {
                historicalStockData = await getHistoricalStockData(call.args.ticker, call.args.period);
                functionResult = historicalStockData; // Pass the result to Gemini
            } else if (call.name === 'get_bursa_historical_data') {
                historicalStockData = await getBursaHistoricalData(call.args.symbol, call.args.period);
                functionResult = historicalStockData; // Pass the result to Gemini
            } else if (call.name === 'get_economic_indicator_data') {
                historicalEconomicData = await getEconomicIndicatorData(call.args.indicatorCode, call.args.countryCode);
                functionResult = historicalEconomicData; // Pass the result to Gemini
            } else if (call.name === 'generate_image_tool') { // NEW: Handle image generation tool call
                const imageGenerationPrompt = call.args.prompt;
                const imageGenResult = await generateImage(imageGenerationPrompt);
                imageUrl = imageGenResult.imageUrl; // Set imageUrl here
                functionResult = imageGenResult; // Pass result (including potential error) to Gemini for final text
            }
        }

        let finalResponseText = '';
        if (functionResult) {
            // Check if functionResult itself indicates an error from the tool
            if (functionResult.error) {
                finalResponseText = `I'm sorry, I couldn't get the data. Reason: ${functionResult.error}`;
                // If it was an image generation error, clear imageUrl
                if (call && call.name === 'generate_image_tool') {
                    imageUrl = null;
                }
            } else {
                const responseWithFunctionResult = await chat.sendMessage([
                    {
                        function_response: {
                            name: call.name,
                            response: functionResult,
                        },
                    },
                ]);
                finalResponseText = responseWithFunctionResult.response.text();
            }

            // Assign historical data if available in the function result
            if (functionResult && functionResult.historical_data) {
                historicalStockData = functionResult.historical_data;
            }
            if (functionResult && functionResult.historical_economic_data) {
                historicalEconomicData = functionResult.historical_economic_data;
            }

            // If the image generation tool was called and successful, imageUrl is already set
            // No need to re-assign it here unless you want to ensure it's picked up from functionResult
            // if (call && call.name === 'generate_image_tool' && functionResult.imageUrl) {
            //     imageUrl = functionResult.imageUrl;
            // }


        } else {
            // If no function call was made by Gemini, just get the text response
            finalResponseText = result.response.text();
        }

        // REMOVED: Unconditional image generation. It's now handled by the 'generate_image_tool'
        // let imageUrl = null;
        // const imagePrompt = `Infographic summarizing stock market insights for "${query}". Financial data visualization, digital art, clean, clear, relevant to the Malaysian and US market context.`;
        // const imageResult = await generateImage(imagePrompt);
        // if (imageResult && imageResult.imageUrl) {
        //     imageUrl = imageResult.imageUrl;
        // } else {
        //     console.warn("Could not generate image:", imageResult?.error);
        // }

        let audioUrl = null; // Audio generation remains unconditional
        const audioResult = await generateAudio(finalResponseText);
        if (audioResult && audioResult.audioUrl) {
            audioUrl = audioResult.audioUrl;
        } else {
            console.warn("Could not generate audio:", audioResult?.error);
        }

        return res.json({
            summary: finalResponseText,
            imageUrl: imageUrl, // Will now only be present if 'generate_image_tool' was called
            audioUrl: audioUrl,
            historicalStockData: historicalStockData,
            historicalEconomicData: historicalEconomicData
        });

    } catch (error) {
        console.error('Error during AI analysis:', error);
        let userErrorMessage = "I'm sorry, I couldn't process your request due to an internal error. Please try again. If the problem persists, check the backend logs.";
        if (error.message && error.message.includes('functionCall')) {
            userErrorMessage = "I'm having trouble executing a tool to fulfill your request. This might be a temporary issue or an unexpected query. Please try rephrasing.";
        }
        res.status(500).json({ error: userErrorMessage, details: error.message });
    }
});


// Add new API route for OCR
app.post('/ocr', upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No image file uploaded." });
    }
    if (!req.file.buffer) {
        return res.status(400).json({ error: "Uploaded file is not a buffer." });
    }

    try {
        const ocrResult = await performOcr(req.file.buffer, req.file.mimetype); // Pass content type
        if (ocrResult.error) {
            return res.status(500).json(ocrResult);
        }
        return res.json(ocrResult);
    } catch (error) {
        console.error('Error during OCR processing:', error);
        res.status(500).json({ error: "Failed to process image for OCR.", details: error.message });
    }
});


// --- Server Listen ---
app.listen(PORT, () => {
    console.log(`Node.js server listening on http://localhost:${PORT}`);
});

;