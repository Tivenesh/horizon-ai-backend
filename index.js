// backend/index.js

// --- Imports ---
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv'); // Explicitly import dotenv for config()
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache'); // For caching API responses
const Joi = require('joi'); // For input validation
const winston = require('winston'); // For structured logging

// --- Load Environment Variables ---
dotenv.config(); // <<< CRITICAL: This loads your .env file into process.env

// --- Express App Setup ---
const app = express();
const PORT = process.env.PORT || 3001;

// --- Logger Setup ---
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// --- Cache Setup ---
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // Cache for 1 hour (3600 seconds)

// --- Middleware ---
app.use(cors({
    origin: 'http://localhost:3000' // Adjust to your frontend URL
}));
app.use(express.json());

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again after 15 minutes.' }
});
app.use(limiter);

// --- Input Validation Schemas (Joi) ---
const analyzeSchema = Joi.object({
    query: Joi.string().trim().min(1).required()
});

const economicDataQuerySchema = Joi.object({
    indicatorCode: Joi.string().valid('CPI', 'PPI', 'FOMC', 'interest_rate', 'GDP').required(),
    countryCode: Joi.string().default('united states'),
    startDate: Joi.date().iso().optional(), // Joi uses 'iso' for ISO 8601 date strings
    endDate: Joi.date().iso().optional()
});

const ocrSchema = Joi.object({}); // No body validation for file upload, handled by multer


// --- Initialize Generative AI ---
// Ensure GEMINI_API_KEY is loaded correctly by dotenv.config()
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });


// --- Helper Functions (All Defined Here) ---

async function fetchNews(keyword) {
    const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
    if (!GNEWS_API_KEY) {
        logger.error('[News API] GNEWS_API_KEY is not set.');
        return { error: 'GNews API key not found.', text: 'I cannot fetch news as the API key is not configured.' };
    }

    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(keyword)}&lang=en&country=us&max=5&token=${GNEWS_API_KEY}`;
    logger.info(`[News API] Fetching news for: "${keyword}"`);

    try {
        const response = await axios.get(url);
        if (response.data.articles && response.data.articles.length > 0) {
            const articles = response.data.articles.map(article => ({
                title: article.title,
                description: article.description,
                url: article.url,
                image: article.image || null,
                publishedAt: article.publishedAt || new Date().toISOString(),
                source: {
                    name: article.source?.name || 'Unknown',
                    url: article.source?.url || '#'
                }
            }));
            logger.info(`[News API] Fetched ${articles.length} articles for "${keyword}".`);
            return { articles: articles, text: `Here are some recent news articles about ${keyword}:\n\n` + articles.map(a => `- ${a.title}: ${a.url}`).join('\n') };
        } else {
            logger.warn(`[News API] No articles found for "${keyword}". Response:`, response.data);
            return { error: `No news articles found for "${keyword}".`, text: `I couldn't find any recent news articles for "${keyword}".` };
        }
    } catch (error) {
        logger.error(`[News API] Error fetching news for "${keyword}":`, error.message);
        return { error: `Failed to fetch news for "${keyword}".`, text: `I encountered an issue fetching news for "${keyword}".` };
    }
}

async function getStockData(ticker) {
    const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    if (!ALPHA_VANTAGE_API_KEY) {
        logger.error('[Stock API] ALPHA_VANTAGE_API_KEY is not set.');
        return { error: 'Alpha Vantage API key not found.', text: 'I cannot fetch stock data as the API key is not configured.' };
    }

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    logger.info(`[Stock API] Fetching live stock data for: "${ticker}"`);

    try {
        const response = await axios.get(url);
        const data = response.data["Global Quote"];

        if (data && Object.keys(data).length > 0 && data["01. symbol"]) {
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
            logger.info(`[Stock API] Fetched live data for ${stockInfo.ticker}: Price ${stockInfo.price}`);
            return {
                stock_data: stockInfo,
                text: `Here's the latest data for ${stockInfo.ticker} as of ${stockInfo.latest_trading_day}:\n` +
                      `Price: $${stockInfo.price.toFixed(2)}\n` +
                      `Change: $${stockInfo.change.toFixed(2)} (${stockInfo.change_percent.toFixed(2)}%)`
            };
        } else {
            logger.warn(`[Stock API] No live data found for ticker: "${ticker}". Response:`, response.data);
            if (response.data["Error Message"]) {
                return { error: `Alpha Vantage Error for "${ticker}": ${response.data["Error Message"]}`, text: `I couldn't get live data for "${ticker}". Alpha Vantage said: "${response.data["Error Message"]}"` };
            }
            return { error: `No live stock data found for "${ticker}".`, text: `I couldn't find live stock data for "${ticker}". It might be an invalid ticker.` };
        }
    } catch (error) {
        logger.error(`[Stock API] Error fetching live stock data for "${ticker}":`, error.message);
        return { error: 'Failed to fetch stock data.', text: `I encountered an issue fetching live stock data for "${ticker}".` };
    }
}

async function getBursaAnnouncements(symbol) {
    logger.info(`[Mock API] Fetching Bursa announcements for: "${symbol}"`);
    const mockAnnouncements = [
        {
            date: "2025-06-14",
            stock_code: symbol.toUpperCase(),
            company_name: `${symbol.toUpperCase()} BERHAD`,
            category: "General Announcement",
            title: `Proposed Solar Farm Expansion by ${symbol.toUpperCase()}`,
            details: `${symbol.toUpperCase()} (Mock Bhd) has announced plans to invest heavily in a new 50MW solar farm in Kedah, aiming to boost renewable energy capacity. This is part of the national green energy initiative.`,
            source: "Bursa Malaysia Mock Data"
        },
        {
            date: "2025-06-12",
            stock_code: symbol.toUpperCase(),
            company_name: `${symbol.toUpperCase()} BERHAD`,
            category: "Financial Results",
            title: `Q1 2025 Earnings Report for ${symbol.toUpperCase()}`,
            details: `${symbol.toUpperCase()} reported a 10% increase in net profit for Q1 2025, driven by strong electricity demand from industrial sectors. Revenue stood at RM 12.5 billion.`,
            source: "Bursa Malaysia Mock Data"
        },
        {
            date: "2025-06-11",
            stock_code: symbol.toUpperCase(),
            company_name: `${symbol.toUpperCase()} BERHAD`,
            category: "Corporate Action",
            title: `Dividend Declaration by ${symbol.toUpperCase()}`,
            details: `${symbol.toUpperCase()} has declared a first interim dividend of 18 sen per share for the financial year ending December 31, 2025, payable on July 15, 2025.`,
            source: "Bursa Malaysia Mock Data"
        }
    ];
    logger.info(`[Mock API] Provided ${mockAnnouncements.length} mock Bursa announcements for "${symbol}".`);
    return {
        announcements: mockAnnouncements,
        text: `Here are some recent mock announcements for ${symbol.toUpperCase()}:\n\n` +
              mockAnnouncements.map(a => `- ${a.title} (${a.date})`).join('\n') +
              `\n\n(This is mock data for demonstration purposes as no live Bursa API is integrated.)`
    };
}

async function analyzeSocialSentiment(keyword) {
    logger.info(`[Mock API] Analyzing social sentiment for: "${keyword}"`);
    const mockSentiment = {
        keyword: keyword,
        positive_mentions: 75,
        negative_mentions: 15,
        neutral_mentions: 10,
        overall_sentiment: "mostly positive",
        top_themes: ["expansion plans", "market confidence", "regulatory outlook"],
        source: "Mock Social Media Analytics"
    };
    logger.info(`[Mock API] Provided mock social sentiment for "${keyword}": ${mockSentiment.overall_sentiment}`);
    return {
        sentiment_data: mockSentiment,
        text: `Based on mock social media analytics for "${keyword}", the overall sentiment is ${mockSentiment.overall_sentiment}. ` +
              `There were ${mockSentiment.positive_mentions} positive, ${mockSentiment.negative_mentions} negative, and ${mockSentiment.neutral_mentions} neutral mentions. ` +
              `Top themes include: ${mockSentiment.top_themes.join(', ')}. ` +
              `(This is mock data for demonstration purposes.)`
    };
}

async function getEconomicIndicatorData(indicatorCode, countryCode = 'united states', startDate, endDate) {
    const cacheKey = `economic_${indicatorCode}_${countryCode}_${startDate || 'all'}_${endDate || 'all'}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
        logger.info(`[Cache] Hit for ${cacheKey}`);
        if (!cachedData.text) {
             cachedData.text = `Here's the cached historical data for ${cachedData.indicator || indicatorCode} in ${cachedData.country || countryCode}. You can now plot this data on a graph.`;
        }
        return cachedData;
    }

    const TRADING_ECONOMICS_API_KEY = process.env.TRADING_ECONOMICS_API_KEY;
    if (!TRADING_ECONOMICS_API_KEY) {
        logger.error('[Economic API] TRADING_ECONOMICS_API_KEY is not set.');
        return { error: 'Trading Economics API key not found.', text: 'I cannot fetch economic data as the API key is not configured.' };
    }

    let endpoint;
    const countryName = countryCode.toLowerCase();

    switch(indicatorCode.toLowerCase()) {
        case 'cpi':
            endpoint = 'consumer price index';
            break;
        case 'ppi':
            endpoint = 'producer price index';
            break;
        case 'fomc':
        case 'interest_rate':
            endpoint = 'interest rate';
            countryCode = (indicatorCode.toLowerCase() === 'fomc' || countryName === 'united states') ? 'united states' : countryName;
            break;
        case 'gdp':
            endpoint = 'gdp growth rate';
            break;
        default:
            return { error: `Unsupported economic indicator: "${indicatorCode}"`, text: `I can only fetch data for 'CPI', 'PPI', 'FOMC' (for US interest rates), 'interest_rate', or 'GDP'.` };
    }

    let url = `https://api.tradingeconomics.com/historical/country/${encodeURIComponent(countryCode)}/indicator/${encodeURIComponent(endpoint)}?c=${TRADING_ECONOMICS_API_KEY}`;
    if (startDate && endDate) {
        url += `&d1=${startDate}&d2=${endDate}`;
    }

    logger.info(`[Economic API] Fetching economic data for "${indicatorCode}" in "${countryCode}" from Trading Economics.`);

    try {
        const response = await axios.get(url);
        const data = response.data;

        if (data && data.length > 0) {
            const chartData = data
                .filter(item => {
                    const itemDate = new Date(item.Date);
                    const start = startDate ? new Date(startDate) : null;
                    const end = endDate ? new Date(endDate) : null;
                    return (!start || itemDate >= start) && (!end || itemDate <= end);
                })
                .map(item => ({
                    date: item.Date.split('T')[0],
                    value: item.Value,
                    category: item.Category,
                    unit: item.Unit,
                    country: item.Country,
                    title: item.Indicator
                }))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            const result = {
                indicator: indicatorCode,
                country: countryCode,
                historical_economic_data: chartData,
                source: "Trading Economics",
                text: `Here's the historical data for the ${chartData[0]?.title || indicatorCode} in ${chartData[0]?.country || countryCode}. You can now plot this data on a graph.`
            };

            cache.set(cacheKey, result);
            logger.info(`[Economic API] Fetched ${chartData.length} data points for ${indicatorCode}. Cached.`);
            return result;
        } else {
            logger.warn(`[Economic API] No historical data found for ${indicatorCode} (${countryCode}). Response:`, response.data);
            return { error: `No historical economic data found for "${indicatorCode}" in "${countryCode}".`, text: `I couldn't find historical economic data for "${indicatorCode}" in "${countryCode}". It might be an invalid indicator or country, or data is not available.` };
        }
    } catch (error) {
        logger.error(`[Economic API] Error fetching ${indicatorCode}:`, error.response ? (error.response.data || error.response.statusText) : error.message);
        let errorMessage = `Failed to fetch economic data for "${indicatorCode}".`;
        if (error.response && error.response.status === 401) {
            errorMessage = `Authentication failed for Trading Economics API. Check your API key.`;
        } else if (error.response && error.response.status === 429) {
            errorMessage = `Trading Economics API rate limit exceeded. Please try again later.`;
        }
        return { error: errorMessage, text: `I encountered an issue fetching economic data for "${indicatorCode}": ${errorMessage}` };
    }
}

async function getHistoricalStockData(ticker, period = 'daily') { // 'daily', 'weekly', 'monthly'
    const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    if (!ALPHA_VANTAGE_API_KEY) {
        logger.error('[Stock API] ALPHA_VANTAGE_API_KEY is not set.');
        return { error: 'Alpha Vantage API key not found.', text: 'I cannot fetch historical stock data as the API key is not configured.' };
    }

    let functionName;
    let timeSeriesKey;
    let actualTicker = ticker.toUpperCase();

    switch (actualTicker) {
        case 'NASDAQ':
        case '^IXIC':
        case 'NASDAQ 100':
        case 'COMPQ':
            actualTicker = 'QQQ';
            break;
        case 'S&P 500':
        case 'SP500':
        case '^GSPC':
            actualTicker = 'SPY';
            break;
        case 'DOW JONES':
        case 'DOW':
        case '^DJI':
            actualTicker = 'DIA';
            break;
        default:
            break;
    }

    switch (period) {
        case 'daily':
            functionName = "TIME_SERIES_DAILY_ADJUSTED";
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
            return { error: "Invalid period specified for historical stock data. Choose 'daily', 'weekly', or 'monthly'.", text: "I can only retrieve daily, weekly, or monthly historical data." };
    }

    const url = `https://www.alphavantage.co/query?function=${functionName}&symbol=${encodeURIComponent(actualTicker)}&apikey=${ALPHA_VANTAGE_API_KEY}&outputsize=full`;
    logger.info(`[Stock API] Fetching ${period} historical data for: "${actualTicker}"`);

    try {
        const response = await axios.get(url);
        const data = response.data[timeSeriesKey];

        if (data && Object.keys(data).length > 0 && typeof data !== 'string') {
            const historicalData = Object.entries(data).map(([date, values]) => ({
                date: date,
                open: parseFloat(values["1. open"]),
                high: parseFloat(values["2. high"]),
                low: parseFloat(values["3. low"]),
                close: parseFloat(values["4. close"]),
                adjustedClose: parseFloat(values["5. adjusted close"] || values["4. close"]),
                volume: parseInt(values["6. volume"])
            })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            logger.info(`[Stock API] Fetched ${historicalData.length} historical data points for "${actualTicker}".`);
            return {
                ticker: actualTicker,
                historical_data: historicalData,
                source: "Alpha Vantage",
                text: `Here's the ${period} historical data for ${actualTicker}. You can use this to plot a chart showing its price trends.`
            };
        } else {
            logger.warn(`[Stock API] No historical ${period} data found for ticker: "${actualTicker}". Response:`, response.data);
            if (response.data["Error Message"]) {
                return { error: `Alpha Vantage Error for "${actualTicker}": ${response.data["Error Message"]}`, text: `I couldn't get historical data for "${actualTicker}". Alpha Vantage said: "${response.data["Error Message"]}"` };
            }
            return { error: `No historical ${period} data found for "${actualTicker}".`, text: `I couldn't find historical ${period} data for "${actualTicker}". It might be an invalid ticker or a rate limit issue.` };
        }
    } catch (error) {
        logger.error(`[Stock API] Error fetching ${period} historical data for "${actualTicker}":`, error.message);
        let errorMessage = `Failed to fetch ${period} historical data for "${actualTicker}".`;
        if (error.response && error.response.status === 401) {
            errorMessage = `Authentication failed for Alpha Vantage API. Check your API key.`;
        } else if (error.response && error.response.status === 429) {
            errorMessage = `Alpha Vantage API rate limit exceeded. Please try again later.`;
        }
        return { error: errorMessage, text: `I encountered an issue fetching historical stock data for "${actualTicker}": ${errorMessage}` };
    }
}


async function getBursaHistoricalData(symbol, period = 'daily') {
    logger.info(`[Mock API] Fetching Bursa historical data for: "${symbol}", period: "${period}"`);
    const today = new Date();
    const historicalData = [];
    for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        if (period === 'daily') {
            date.setDate(today.getDate() - i);
        } else if (period === 'weekly') {
            date.setDate(today.getDate() - (i * 7));
        } else if (period === 'monthly') {
            date.setMonth(today.getMonth() - i);
        }

        const basePrice = 5.0 + Math.sin(i / 5) * 0.5 + Math.cos(i / 10) * 0.3;
        const open = parseFloat((basePrice + (Math.random() - 0.5) * 0.1).toFixed(2));
        const close = parseFloat((basePrice + (Math.random() - 0.5) * 0.1).toFixed(2));
        const high = Math.max(open, close, parseFloat((basePrice + Math.random() * 0.2).toFixed(2)));
        const low = Math.min(open, close, parseFloat((basePrice - Math.random() * 0.2).toFixed(2)));
        const volume = Math.floor(1000000 + Math.random() * 500000);

        historicalData.unshift({
            date: date.toISOString().split('T')[0],
            open,
            high,
            low,
            close,
            adjustedClose: close,
            volume
        });
    }
    logger.info(`[Mock API] Provided ${historicalData.length} mock Bursa historical data points for "${symbol}".`);
    return {
        ticker: symbol,
        historical_data: historicalData,
        source: "Bursa Malaysia Mock Data",
        text: `Here's the mock ${period} historical data for ${symbol}. You can use this to plot a chart showing its price trends. (This is mock data)`
    };
}

async function generateImage(prompt) {
    const STABILITY_AI_API_KEY = process.env.STABILITY_AI_API_KEY;
    if (!STABILITY_AI_API_KEY) {
        logger.error("[Stability AI] STABILITY_AI_API_KEY is not set.");
        return { error: "Stability AI API key not found.", text: "I cannot generate an image as the API key is not configured." };
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

    logger.info(`[Stability AI] Generating image for prompt: "${prompt.substring(0, 50)}..."`);

    try {
        const response = await axios.post(url, body, { headers });
        if (response.data.artifacts && response.data.artifacts.length > 0) {
            const base64Image = response.data.artifacts[0].base64;
            const imageUrl = `data:image/png;base64,${base64Image}`;
            logger.info("[Stability AI] Image generated successfully.");
            return { imageUrl: imageUrl, text: "Here is the AI-generated image based on your request. I hope this visual insight is helpful!" };
        } else {
            logger.warn("[Stability AI] No image artifacts found in response:", response.data);
            return { error: "No image artifacts found in generation response.", text: "I tried to generate an image, but the service did not return any image data." };
        }
    } catch (error) {
        logger.error('[Stability AI] Error generating image:', error.response ? error.response.data : error.message);
        let errorMessage = "Failed to generate image.";
        if (error.response && error.response.status === 400) {
            errorMessage = `Stability AI API error: ${JSON.stringify(error.response.data)}. This might be due to an invalid or inappropriate prompt.`;
        } else if (error.response && error.response.status === 401) {
            errorMessage = `Authentication failed for Stability AI. Check your API key.`;
        } else if (error.response && error.response.status === 429) {
            errorMessage = `Stability AI API rate limit exceeded. Please try again later.`;
        }
        return { error: errorMessage, text: `I encountered an issue generating the image: ${errorMessage}` };
    }
}

async function generateAudio(text, voiceId = "FGY2WhTYpPnrIDTdsKH5") { // Default voice ID for a clear voice
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
        logger.error("[ElevenLabs] ELEVENLABS_API_KEY is not set.");
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

    logger.info(`[ElevenLabs] Generating audio for text: "${text.substring(0, 50)}..."`);

    try {
        const response = await axios.post(url, body, { headers, responseType: 'arraybuffer' });
        const base64Audio = Buffer.from(response.data).toString('base64');
        const audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
        logger.info("[ElevenLabs] Audio generated successfully.");
        return { audioUrl: audioUrl };
    } catch (error) {
        logger.error('[ElevenLabs] Error generating audio:', error.response ? error.response.data.toString('utf8') : error.message);
        let errorMessage = "Failed to generate audio.";
        if (error.response && error.response.data && typeof error.response.data === 'object' && error.response.data.detail) {
            errorMessage = `ElevenLabs API Error: ${error.response.data.detail.message || JSON.stringify(error.response.data.detail)}`;
        } else if (error.message.includes('401')) {
            errorMessage = `Authentication failed for ElevenLabs. Check your API key.`;
        } else if (error.message.includes('429')) {
            errorMessage = `ElevenLabs API rate limit exceeded.`;
        }
        return { error: errorMessage };
    }
}

async function performOcr(imageData, contentType) {
    const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY;
    if (!OCR_SPACE_API_KEY) {
        logger.error("[OCR.space] OCR_SPACE_API_KEY is not set.");
        return { error: "OCR.space API key not found." };
    }

    const url = 'https://api.ocr.space/parse/image';
    try {
        const base64Prefix = `data:${contentType};base64,`;
        const base64Image = `${base64Prefix}${imageData.toString('base64')}`;

        const response = await axios.post(url, {
            base64Image: base64Image,
            language: 'eng',
            isOverlayRequired: true
        }, {
            headers: {
                'apikey': OCR_SPACE_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        const parsedResults = response.data.ParsedResults;
        if (parsedResults && parsedResults.length > 0) {
            const extractedText = parsedResults.map(result => result.ParsedText).join('\n');
            logger.info("[OCR] Text extracted successfully.");
            return { extractedText: extractedText };
        } else if (response.data.IsErroredOnProcessing) {
            logger.error("[OCR.space] Error processing image:", response.data.ErrorMessage);
            return { error: `OCR processing failed: ${response.data.ErrorMessage}` };
        } else {
            logger.warn("[OCR.space] No text found in image or parsing failed:", response.data);
            return { error: "Could not extract text from image. No parsed results." };
        }
    } catch (error) {
        logger.error('[OCR.space] Error performing OCR:', error.response ? (error.response.data || error.response.statusText) : error.message);
        let errorMessage = "Failed to perform OCR.";
        if (error.response && error.response.status === 401) {
            errorMessage = `Authentication failed for OCR.space. Check your API key.`;
        } else if (error.response && error.response.status === 429) {
            errorMessage = `OCR.space API rate limit exceeded. Please try again later.`;
        }
        return { error: errorMessage };
    }
}


// --- API Routes ---

app.get('/', (req, res) => {
    logger.info('Test route accessed');
    res.json({ message: 'Enhanced Node.js Backend is live!' });
});

app.post('/analyze', async (req, res) => {
    const { error, value } = analyzeSchema.validate(req.body);
    if (error) {
        logger.warn(`Validation error for /analyze: ${error.details[0].message}`);
        return res.status(400).json({ error: error.details[0].message });
    }

    const { query } = value;
    logger.info(`[API - /analyze] Processing query: "${query}"`);

    try {
        // --- Gemini Tool Definitions ---
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
                    description: "Retrieves current stock data for a given US stock or ETF ticker symbol (e.g., AAPL for Apple, SPY for S&P 500 ETF).",
                    parameters: { type: "object", properties: { ticker: { type: "string", description: "The stock or ETF ticker symbol (e.g., MSFT, QQQ)." } }, required: ["ticker"] },
                }],
            },
            {
                function_declarations: [{
                    name: "get_bursa_announcements",
                    description: "Fetches recent official announcements and disclosures from Bursa Malaysia for a given stock symbol. Returns mock data for demonstration.",
                    parameters: { type: "object", properties: { symbol: { type: "string", description: "The Bursa Malaysia stock symbol (e.g., TNB)." } }, required: ["symbol"] },
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
                    name: "get_economic_indicator_data",
                    description: "Retrieves historical data for key economic indicators like CPI (Consumer Price Index), PPI (Producer Price Index), or interest rates (often influenced by FOMC). Useful for charting macroeconomic trends. Specify the indicator code and optionally the country (defaults to 'united states').",
                    parameters: {
                        type: "object",
                        properties: {
                            indicatorCode: { type: "string", description: "The code or common name for the economic indicator (e.g., 'CPI', 'PPI', 'FOMC' for interest rates, 'GDP')." },
                            countryCode: { type: "string", description: "The country for which to fetch the economic data (e.g., 'united states', 'malaysia'). Defaults to 'united states'." },
                            startDate: { type: "string", format: "date-time", description: "Start date in ISO 8601 format (e.g., '2020-01-01'). Optional. Filters results." },
                            endDate: { type: "string", format: "date-time", description: "End date in ISO 8601 format (e.g., '2023-12-31'). Optional. Filters results." }
                        },
                        required: ["indicatorCode"]
                    },
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
                            symbol: { type: "string", description: "The Bursa Malaysia stock symbol (e.g., TNB)." },
                            period: { type: "string", enum: ["daily", "weekly", "monthly"], description: "The time period for historical data (e.g., 'daily', 'weekly', 'monthly'). Defaults to 'daily'." }
                        },
                        required: ["symbol"]
                    },
                }],
            },
            {
                function_declarations: [{
                    name: "generate_image_tool",
                    description: "Generates an AI-powered infographic image based on a detailed prompt. Use this when the user explicitly asks for an 'image', 'picture', 'infographic', or 'visual representation' of market insights. The prompt for the image should be detailed and relevant to financial data, trends, or market context.",
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

        // --- DEBUGGING LOG for functionCall object ---
        if (call) {
            logger.info(`[DEBUG] Full Gemini functionCall object:`, JSON.stringify(call, null, 2));
        } else {
            logger.info(`[DEBUG] Gemini did not request a function call.`);
        }
        // --- END DEBUGGING LOG ---

        let toolResponse = null;
        let finalResponseText = '';
        let imageUrl = null;
        let historicalStockData = null;
        let historicalEconomicData = null;
        let articlesData = null; // For news articles

        if (call) {
            // --- NEW: Handle empty/invalid call.name before switch ---
            if (!call.name || typeof call.name !== 'string' || call.name.trim() === '') {
                logger.error(`[Gemini Error] Function call object has empty, missing, or invalid 'name' property. Full object:`, JSON.stringify(call, null, 2));
                return res.status(500).json({
                    error: "AI service returned an invalid function call (empty name). Please try again or rephrase your query.",
                    details: "Gemini function call name was empty or malformed."
                });
            }
            // --- END NEW CHECK ---

            logger.info(`[Gemini] Requested function call: ${call.name} with args:`, call.args);

            switch (call.name) {
                case 'fetch_news':
                    toolResponse = await fetchNews(call.args.keyword);
                    if (toolResponse && toolResponse.articles) {
                        articlesData = toolResponse.articles; // Store articles for frontend
                    }
                    break;
                case 'get_stock_data':
                    toolResponse = await getStockData(call.args.ticker);
                    break;
                case 'get_bursa_announcements':
                    toolResponse = await getBursaAnnouncements(call.args.symbol);
                    break;
                case 'analyze_social_sentiment':
                    toolResponse = await analyzeSocialSentiment(call.args.keyword);
                    break;
                case 'get_economic_indicator_data':
                    toolResponse = await getEconomicIndicatorData(
                        call.args.indicatorCode,
                        call.args.countryCode,
                        call.args.startDate,
                        call.args.endDate
                    );
                    break;
                case 'get_historical_stock_data':
                    toolResponse = await getHistoricalStockData(call.args.ticker, call.args.period);
                    break;
                case 'get_bursa_historical_data':
                    toolResponse = await getBursaHistoricalData(call.args.symbol, call.args.period);
                    break;
                case 'generate_image_tool':
                    toolResponse = await generateImage(call.args.prompt);
                    if (toolResponse && toolResponse.imageUrl) {
                        imageUrl = toolResponse.imageUrl;
                    }
                    break;
                default:
                    logger.warn(`[Gemini] Unhandled function call: '${call.name}'. This tool might not be implemented in the backend's switch statement.`);
                    return res.status(400).json({ error: `AI requested an unrecognized function: '${call.name}'. Please try again or rephrase.`, details: `Unhandled tool: ${call.name}` });
            }

            if (toolResponse && toolResponse.error) {
                logger.error(`[Tool Execution Error] Function '${call.name}' failed: ${toolResponse.error}`);
                const errorResponseForGemini = { error: toolResponse.error };
                const responseWithFunctionError = await chat.sendMessage([
                    {
                        function_response: {
                            name: call.name,
                            response: errorResponseForGemini,
                        },
                    },
                ]);
                finalResponseText = responseWithFunctionError.response.text();
                if (call.name === 'generate_image_tool') {
                    imageUrl = null; // Clear image URL if generation failed
                }
            } else {
                const responseWithFunctionResult = await chat.sendMessage([
                    {
                        function_response: {
                            name: call.name,
                            response: toolResponse,
                        },
                    },
                ]);
                finalResponseText = responseWithFunctionResult.response.text();

                if (toolResponse && toolResponse.historical_data) {
                    historicalStockData = toolResponse.historical_data;
                }
                if (toolResponse && toolResponse.historical_economic_data) {
                    historicalEconomicData = toolResponse.historical_economic_data;
                }
            }

        } else {
            logger.info('[Gemini] No specific tool invoked for query, generating direct text response.');
            finalResponseText = result.response.text();
        }

        let audioUrl = null;
        if (finalResponseText) {
            const audioResult = await generateAudio(finalResponseText);
            if (audioResult && audioResult.audioUrl) {
                audioUrl = audioResult.audioUrl;
            } else {
                logger.warn("[ElevenLabs] Could not generate audio:", audioResult?.error);
            }
        }

        logger.info('[API] Sending final response to frontend.');
        return res.json({
            summary: finalResponseText,
            imageUrl: imageUrl,
            audioUrl: audioUrl,
            historicalStockData: historicalStockData,
            historicalEconomicData: historicalEconomicData,
            articles: articlesData // Include news articles if fetched
        });

    } catch (error) {
        logger.error('[API Error] Unhandled error during AI analysis:', error);
        let userErrorMessage = "I'm sorry, I encountered a critical error processing your request. Please try again. If the problem persists, ensure the backend server is running correctly and check its logs.";

        if (error.message && error.message.includes('functionCall') && !error.message.includes('response')) {
             userErrorMessage = "I'm having trouble figuring out how to fulfill your request with my available tools. This might be a temporary issue or an unexpected query. Please try rephrasing.";
        } else if (error.message && error.message.includes('API key')) {
            userErrorMessage = "I'm experiencing an issue connecting to my AI service. Please check the backend API key configuration.";
        } else if (error.response && error.response.status === 429) {
            userErrorMessage = "My AI service is experiencing high demand. Please wait a moment and try again.";
        } else if (error.message.includes('Request failed with status code')) {
            userErrorMessage = `A service I rely on responded with an error (${error.message}). The data might be temporarily unavailable.`;
        }

        res.status(500).json({ error: userErrorMessage, details: error.message });
    }
});


// Dedicated endpoint for economic data requests (can be called directly by frontend if desired)
app.post('/economic-data', async (req, res) => {
    const { error, value } = economicDataQuerySchema.validate(req.body);
    if (error) {
        logger.warn(`Validation error for /economic-data: ${error.details[0].message}`);
        return res.status(400).json({ error: error.details[0].message });
    }

    const { indicatorCode, countryCode, startDate, endDate } = value;
    logger.info(`[API - /economic-data] Received request for ${indicatorCode} in ${countryCode}.`);

    try {
        const result = await getEconomicIndicatorData(indicatorCode, countryCode, startDate, endDate);

        if (result.error) {
            logger.error(`[API - /economic-data] Error fetching economic data: ${result.error}`);
            return res.status(500).json({ error: result.error });
        }
        logger.info(`[API - /economic-data] Successfully fetched data for ${indicatorCode}.`);
        return res.json(result);
    } catch (err) {
        logger.error(`[API - /economic-data] Unhandled error processing economic data request: ${err.message}`);
        res.status(500).json({ error: 'Internal server error processing economic data.', details: err.message });
    }
});

// OCR API Route
const upload = multer({ storage: multer.memoryStorage() }); // Store image in memory as buffer
app.post('/ocr', upload.single('image'), async (req, res) => {
    logger.info('[API - /ocr] Received OCR request.');
    if (!req.file) {
        logger.warn('[OCR] No image file uploaded.');
        return res.status(400).json({ error: "No image file uploaded." });
    }
    if (!req.file.buffer) {
        logger.warn('[OCR] Uploaded file is not a buffer.');
        return res.status(400).json({ error: "Uploaded file is not a valid buffer." });
    }

    try {
        const ocrResult = await performOcr(req.file.buffer, req.file.mimetype);
        if (ocrResult.error) {
            logger.error('[OCR] Processing failed:', ocrResult.error);
            return res.status(500).json(ocrResult);
        }
        logger.info('[OCR] Text extracted successfully.');
        return res.json(ocrResult);
    } catch (error) {
        logger.error('[OCR] Unhandled error during OCR processing:', error);
        res.status(500).json({ error: "Failed to process image for OCR due to an internal error.", details: error.message });
    }
});


// --- Server Listen ---
app.listen(PORT, () => {
    logger.info(`Node.js server listening on http://localhost:${PORT}`);
});