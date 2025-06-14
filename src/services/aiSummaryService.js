const { GoogleGenerativeAI } = require('@google/generative-ai');

class AISummaryService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
  }

  async generatePersonalizedInsights(userWatchlist, marketData, newsData = []) {
    try {
      const context = this.buildContext(userWatchlist, marketData, newsData);
      
      const prompt = `
        As a financial AI analyst, provide personalized insights for a user's stock portfolio.
        
        User's Watchlist: ${userWatchlist.join(', ')}
        
        Market Data Context:
        ${context.marketSummary}
        
        Recent News Context:
        ${context.newsSummary}
        
        Please provide:
        1. Portfolio Performance Summary (2-3 sentences)
        2. Key Risks and Opportunities (3-4 bullet points)
        3. Personalized Recommendations (2-3 specific actions)
        4. Market Outlook Impact (how current market affects their specific stocks)
        
        Keep the response professional but accessible, focusing on actionable insights.
        Use specific numbers and percentages where available.
      `;

      const response = await this.model.generateContent(prompt);
      const text = response.response.text();

      return this.parseAIResponse(text);
    } catch (error) {
      console.error('Error generating personalized insights:', error);
      throw new Error('Failed to generate personalized insights');
    }
  }

  async generateMarketSummary(marketData, newsData = []) {
    try {
      const prompt = `
        Analyze the current market conditions and provide a comprehensive summary.
        
        Market Data:
        ${JSON.stringify(marketData, null, 2)}
        
        Recent Financial News:
        ${newsData.map(news => `- ${news.title}: ${news.summary}`).join('\n')}
        
        Provide:
        1. Overall Market Sentiment (1-2 sentences)
        2. Key Market Drivers (3-4 main factors)
        3. Sector Analysis (top performing and underperforming sectors)
        4. Risk Assessment (current market risks)
        5. Short-term Outlook (next 1-2 weeks)
        
        Be concise but comprehensive. Use data points to support your analysis.
      `;

      const response = await this.model.generateContent(prompt);
      const text = response.response.text();

      return this.parseMarketSummary(text);
    } catch (error) {
      console.error('Error generating market summary:', error);
      throw new Error('Failed to generate market summary');
    }
  }

  async generateStockAnalysis(symbol, stockData, newsData = []) {
    try {
      const prompt = `
        Provide a detailed analysis for ${symbol} based on the following data:
        
        Stock Performance Data:
        ${JSON.stringify(stockData.metadata, null, 2)}
        
        Recent News:
        ${newsData.map(news => `- ${news.title}: ${news.summary}`).join('\n')}
        
        Provide:
        1. Current Performance Assessment
        2. Technical Analysis Summary
        3. Fundamental Factors
        4. News Impact Analysis
        5. Risk-Reward Assessment
        6. Short-term Price Target (if applicable)
        
        Be specific about price levels, percentages, and timeframes.
      `;

      const response = await this.model.generateContent(prompt);
      const text = response.response.text();

      return this.parseStockAnalysis(text);
    } catch (error) {
      console.error('Error generating stock analysis:', error);
      throw new Error('Failed to generate stock analysis');
    }
  }

  buildContext(watchlist, marketData, newsData) {
    const marketSummary = marketData.summary
      ? marketData.summary.map(stock => 
          `${stock.symbol}: ${stock.metadata.priceRange.changePercent.toFixed(2)}% change`
        ).join(', ')
      : 'No market data available';

    const newsSummary = newsData.length > 0
      ? newsData.slice(0, 5).map(news => news.title).join('; ')
      : 'No recent news available';

    return {
      marketSummary,
      newsSummary
    };
  }

  parseAIResponse(content) {
    const sections = content.split('\n\n');
    return {
      portfolioSummary: sections[0] || '',
      risksAndOpportunities: sections[1] || '',
      recommendations: sections[2] || '',
      marketOutlook: sections[3] || '',
      fullResponse: content,
      timestamp: new Date().toISOString()
    };
  }

  parseMarketSummary(content) {
    return {
      summary: content,
      sentiment: this.extractSentiment(content),
      keyPoints: this.extractKeyPoints(content),
      timestamp: new Date().toISOString()
    };
  }

  parseStockAnalysis(content) {
    return {
      analysis: content,
      recommendation: this.extractRecommendation(content),
      priceTarget: this.extractPriceTarget(content),
      timestamp: new Date().toISOString()
    };
  }

  extractSentiment(content) {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('bullish') || lowerContent.includes('positive') || lowerContent.includes('optimistic')) {
      return 'bullish';
    } else if (lowerContent.includes('bearish') || lowerContent.includes('negative') || lowerContent.includes('pessimistic')) {
      return 'bearish';
    }
    return 'neutral';
  }

  extractKeyPoints(content) {
    const lines = content.split('\n');
    return lines
      .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•') || line.match(/^\d+\./))
      .map(line => line.trim().replace(/^[-•\d.]\s*/, ''))
      .slice(0, 5);
  }

  extractRecommendation(content) {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('buy') || lowerContent.includes('strong buy')) {
      return 'buy';
    } else if (lowerContent.includes('sell') || lowerContent.includes('strong sell')) {
      return 'sell';
    } else if (lowerContent.includes('hold')) {
      return 'hold';
    }
    return 'neutral';
  }

  extractPriceTarget(content) {
    const priceMatch = content.match(/\$(\d+(?:\.\d{2})?)/);
    return priceMatch ? parseFloat(priceMatch[1]) : null;
  }
}

module.exports = AISummaryService;