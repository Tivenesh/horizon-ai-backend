const axios = require('axios');

class ChartService {
  constructor() {
    this.baseURL = 'https://www.alphavantage.co/query';
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  }

  async getStockData(symbol, timespan = 'day', from, to, limit = 100) {
    try {
      let functionType = 'TIME_SERIES_DAILY';
      if (timespan === 'minute') functionType = 'TIME_SERIES_INTRADAY';
      if (timespan === 'week') functionType = 'TIME_SERIES_WEEKLY';
      if (timespan === 'month') functionType = 'TIME_SERIES_MONTHLY';

      const params = {
        function: functionType,
        symbol: symbol,
        apikey: this.apiKey,
        outputsize: 'full'
      };

      if (timespan === 'minute') {
        params.interval = '5min';
      }

      const response = await axios.get(this.baseURL, { params });

      return this.formatChartData(response.data, symbol, timespan);
    } catch (error) {
      console.error('Error fetching stock data:', error);
      throw new Error('Failed to fetch stock data');
    }
  }

  async getMultipleStocksData(symbols, timespan = 'day', from, to) {
    const promises = symbols.map(symbol => 
      this.getStockData(symbol, timespan, from, to)
    );
    
    const results = await Promise.allSettled(promises);
    return results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
  }

  formatChartData(rawData, symbol, timespan) {
    if (!rawData) {
      return { symbol, data: [] };
    }

    let timeSeriesData;
    if (timespan === 'minute') {
      timeSeriesData = rawData['Time Series (5min)'];
    } else if (timespan === 'week') {
      timeSeriesData = rawData['Weekly Time Series'];
    } else if (timespan === 'month') {
      timeSeriesData = rawData['Monthly Time Series'];
    } else {
      timeSeriesData = rawData['Time Series (Daily)'];
    }

    if (!timeSeriesData) {
      return { symbol, data: [] };
    }

    const formattedData = Object.entries(timeSeriesData)
      .map(([date, values]) => ({ // Removed type annotations here
        timestamp: new Date(date).getTime(),
        date: date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'] || '0'),
        price: parseFloat(values['4. close'])
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-100); // Get last 100 data points

    return {
      symbol,
      data: formattedData,
      metadata: this.calculateMetadata(formattedData)
    };
  }

  calculateMetadata(data) {
    if (!data.length) return {};

    const prices = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const change = lastPrice - firstPrice;
    const changePercent = (change / firstPrice) * 100;

    return {
      totalDataPoints: data.length,
      priceRange: {
        min: Math.min(...prices),
        max: Math.max(...prices),
        current: lastPrice,
        change: parseFloat(change.toFixed(2)),
        changePercent: parseFloat(changePercent.toFixed(2))
      },
      volumeRange: {
        min: Math.min(...volumes),
        max: Math.max(...volumes),
        average: volumes.reduce((a, b) => a + b, 0) / volumes.length
      },
      timeRange: {
        start: data[0]?.date,
        end: data[data.length - 1]?.date
      }
    };
  }

  async getMarketSummary(symbols) {
    try {
      const summaryData = await this.getMultipleStocksData(
        symbols, 
        'day', 
        this.getDateString(-30), // Last 30 days
        this.getDateString(0)
      );

      return {
        summary: summaryData,
        marketTrends: this.analyzeMarketTrends(summaryData),
        topPerformers: this.getTopPerformers(summaryData),
        insights: await this.generateMarketInsights(summaryData)
      };
    } catch (error) {
      console.error('Error generating market summary:', error);
      throw new Error('Failed to generate market summary');
    }
  }

  analyzeMarketTrends(data) {
    const trends = data.map(stock => ({
      symbol: stock.symbol,
      trend: stock.metadata.priceRange.changePercent > 0 ? 'bullish' : 'bearish',
      strength: Math.abs(stock.metadata.priceRange.changePercent),
      volume_trend: this.calculateVolumeTrend(stock.data)
    }));

    return {
      overall_sentiment: this.calculateOverallSentiment(trends),
      individual_trends: trends
    };
  }

  calculateVolumeTrend(data) {
    if (data.length < 2) return 'neutral';
    
    const recentVolume = data.slice(-5).reduce((sum, d) => sum + d.volume, 0) / 5;
    const earlierVolume = data.slice(0, 5).reduce((sum, d) => sum + d.volume, 0) / 5;
    
    const volumeChange = (recentVolume - earlierVolume) / earlierVolume * 100;
    
    if (volumeChange > 20) return 'increasing';
    if (volumeChange < -20) return 'decreasing';
    return 'stable';
  }

  calculateOverallSentiment(trends) {
    const bullishCount = trends.filter(t => t.trend === 'bullish').length;
    const bearishCount = trends.filter(t => t.trend === 'bearish').length;
    
    if (bullishCount > bearishCount * 1.5) return 'bullish';
    if (bearishCount > bullishCount * 1.5) return 'bearish';
    return 'neutral';
  }

  getTopPerformers(data) {
    return {
      gainers: data
        .filter(stock => stock.metadata.priceRange.changePercent > 0)
        .sort((a, b) => b.metadata.priceRange.changePercent - a.metadata.priceRange.changePercent)
        .slice(0, 5),
      losers: data
        .filter(stock => stock.metadata.priceRange.changePercent < 0)
        .sort((a, b) => a.metadata.priceRange.changePercent - b.metadata.priceRange.changePercent)
        .slice(0, 5)
    };
  }

  async generateMarketInsights(data) {
    // This would integrate with your AI service
    const insights = [];
    
    data.forEach(stock => {
      const metadata = stock.metadata;
      
      if (Math.abs(metadata.priceRange.changePercent) > 5) {
        insights.push({
          type: 'significant_movement',
          symbol: stock.symbol,
          message: `${stock.symbol} has moved ${metadata.priceRange.changePercent > 0 ? 'up' : 'down'} by ${Math.abs(metadata.priceRange.changePercent).toFixed(2)}% in the recent period.`,
          severity: Math.abs(metadata.priceRange.changePercent) > 10 ? 'high' : 'medium'
        });
      }
    });

    return insights;
  }

  getDateString(daysFromToday) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromToday);
    return date.toISOString().split('T')[0];
  }
}

module.exports = ChartService;