const express = require('express');
const ChartService = require('../services/chartService');
const AISummaryService = require('../services/aiSummaryService');

const router = express.Router();
const chartService = new ChartService();
const aiService = new AISummaryService();

// Get stock chart data
router.get('/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timespan = 'day', from, to, limit = 100 } = req.query;

    // Default to last 30 days if no date range provided
    const fromDate = from || chartService.getDateString(-30);
    const toDate = to || chartService.getDateString(0);

    const data = await chartService.getStockData(symbol, timespan, fromDate, toDate, limit);
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get multiple stocks data for comparison
router.post('/compare', async (req, res) => {
  try {
    const { symbols, timespan = 'day', from, to } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        error: 'Symbols array is required'
      });
    }

    const fromDate = from || chartService.getDateString(-30);
    const toDate = to || chartService.getDateString(0);

    const data = await chartService.getMultipleStocksData(symbols, timespan, fromDate, toDate);
    
    res.json({
      success: true,
      data,
      comparison: {
        bestPerformer: data.reduce((best, current) => 
          current.metadata.priceRange.changePercent > best.metadata.priceRange.changePercent ? current : best
        ),
        worstPerformer: data.reduce((worst, current) => 
          current.metadata.priceRange.changePercent < worst.metadata.priceRange.changePercent ? current : worst
        )
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get market summary with AI insights
router.get('/market-summary', async (req, res) => {
  try {
    const { symbols } = req.query;
    const defaultSymbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX'];
    const stockSymbols = symbols ? symbols.split(',') : defaultSymbols;

    const marketData = await chartService.getMarketSummary(stockSymbols);
    
    // Generate AI-powered market insights
    const aiInsights = await aiService.generateMarketSummary(marketData);
    
    res.json({
      success: true,
      data: {
        ...marketData,
        aiInsights
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get personalized insights for user's watchlist
router.post('/personalized-insights', async (req, res) => {
  try {
    const { watchlist, userId } = req.body;

    if (!watchlist || !Array.isArray(watchlist)) {
      return res.status(400).json({
        success: false,
        error: 'Watchlist array is required'
      });
    }

    // Get market data for user's watchlist
    const marketData = await chartService.getMultipleStocksData(
      watchlist,
      'day',
      chartService.getDateString(-30),
      chartService.getDateString(0)
    );

    // Generate personalized AI insights
    const personalizedInsights = await aiService.generatePersonalizedInsights(
      watchlist,
      { summary: marketData }
    );

    res.json({
      success: true,
      data: {
        watchlist,
        marketData,
        insights: personalizedInsights,
        userId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get detailed stock analysis
router.get('/analysis/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    // Get stock data
    const stockData = await chartService.getStockData(
      symbol,
      'day',
      chartService.getDateString(-30),
      chartService.getDateString(0)
    );

    // Generate AI analysis
    const analysis = await aiService.generateStockAnalysis(symbol, stockData);

    res.json({
      success: true,
      data: {
        symbol,
        stockData,
        analysis
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get chart configuration presets
router.get('/presets', (req, res) => {
  const presets = {
    timeRanges: [
      { label: '1 Day', value: '1D', timespan: 'minute', days: 1 },
      { label: '1 Week', value: '1W', timespan: 'hour', days: 7 },
      { label: '1 Month', value: '1M', timespan: 'day', days: 30 },
      { label: '3 Months', value: '3M', timespan: 'day', days: 90 },
      { label: '1 Year', value: '1Y', timespan: 'week', days: 365 },
      { label: '5 Years', value: '5Y', timespan: 'month', days: 1825 }
    ],
    chartTypes: [
      { label: 'Line Chart', value: 'line', icon: 'TrendingUp' },
      { label: 'Candlestick', value: 'candlestick', icon: 'BarChart3' },
      { label: 'Area Chart', value: 'area', icon: 'Area' },
      { label: 'Volume Chart', value: 'volume', icon: 'BarChart' }
    ],
    indicators: [
      { label: 'Moving Average (20)', value: 'ma20', type: 'overlay' },
      { label: 'Moving Average (50)', value: 'ma50', type: 'overlay' },
      { label: 'Bollinger Bands', value: 'bb', type: 'overlay' },
      { label: 'RSI', value: 'rsi', type: 'oscillator' },
      { label: 'MACD', value: 'macd', type: 'oscillator' }
    ],
    colorSchemes: [
      { name: 'Default', primary: '#3B82F6', secondary: '#10B981', background: '#F8FAFC' },
      { name: 'Dark', primary: '#60A5FA', secondary: '#34D399', background: '#1F2937' },
      { name: 'Sunset', primary: '#F59E0B', secondary: '#EF4444', background: '#FEF3C7' },
      { name: 'Ocean', primary: '#0EA5E9', secondary: '#06B6D4', background: '#E0F7FA' }
    ]
  };

  res.json({
    success: true,
    data: presets
  });
});

module.exports = router;