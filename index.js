// backend/index.js

// --- Imports ---
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Loads environment variables from .env file
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios'); // For making HTTP requests to external APIs


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
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Using gemini-pro for text & function calling


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
    const STABILITY_API_KEY = process.env.STABILITY_AI_API_KEY;
    if (!STABILITY_API_KEY) {
        console.error("[Stability AI] API key not set.");
        return { error: "Stability AI API key not found." };
    }

    const url = "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image";
    const headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${STABILITY_API_KEY}`,
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
        ];

        const chat = model.startChat({ tools });
        const result = await chat.sendMessage(query);
        const call = result.response.functionCall;

        let functionResult = null;

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
            }
        }

        let finalResponseText = '';
        if (functionResult) {
            const responseWithFunctionResult = await chat.sendMessage([
                {
                    function_response: {
                        name: call.name,
                        response: functionResult,
                    },
                },
            ]);
            finalResponseText = responseWithFunctionResult.response.text();
        } else {
            finalResponseText = result.response.text();
        }

        let imageUrl = null;
        let audioUrl = null;

        const imagePrompt = `Infographic summarizing stock market insights for "${query}". Financial data visualization, digital art, clean, clear, relevant to the Malaysian and US market context.`;
        const imageResult = await generateImage(imagePrompt);
        if (imageResult && imageResult.imageUrl) {
            imageUrl = imageResult.imageUrl;
        } else {
            console.warn("Could not generate image:", imageResult?.error);
        }

        const audioResult = await generateAudio(finalResponseText);
        if (audioResult && audioResult.audioUrl) {
            audioUrl = audioResult.audioUrl;
        } else {
            console.warn("Could not generate audio:", audioResult?.error);
        }

        return res.json({
            summary: finalResponseText,
            imageUrl: imageUrl,
            audioUrl: audioUrl
        });

    } catch (error) {
        console.error('Error during AI analysis:', error);
        res.status(500).json({ error: "Failed to process query.", details: error.message });
    }
});


// --- Server Listen ---
app.listen(PORT, () => {
  console.log(`Node.js server listening on http://localhost:${PORT}`);
});