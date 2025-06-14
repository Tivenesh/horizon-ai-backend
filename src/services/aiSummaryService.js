const { GoogleGenerativeAI } = require('@google/generative-ai');

class AISummaryService {
  constructor() {
    // Initialize GoogleGenerativeAI with your API key
    // Ensure process.env.GEMINI_API_KEY is set in your .env file
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Use gemini-2.0-flash as it's efficient for text generation
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  }

  /**
   * Generates personalized financial insights for a user's watchlist.
   * @param {string[]} userWatchlist - Array of stock symbols in the user's watchlist.
   * @param {object} marketData - Comprehensive market data, including summary of watched stocks.
   * @param {Array<object>} newsData - Relevant news articles (e.g., from a news API).
   * @returns {Promise<object>} - An object containing parsed personalized insights.
   */
  async generatePersonalizedInsights(userWatchlist, marketData, newsData = []) {
    try {
      const context = this.buildContext(userWatchlist, marketData, newsData);

      // Enhanced prompt for personalized insights, requesting specific sections
      const prompt = `
        As a highly experienced financial AI analyst, your task is to provide concise, actionable, and personalized insights for a user's stock portfolio based on their watchlist and recent market conditions. Focus on how the broader market and specific news impact their holdings.

        User's Watchlist: ${userWatchlist.join(', ')}

        Recent Market Performance (from their watchlist):
        ${context.marketSummary}

        Recent Key News Headlines:
        ${context.newsSummary}

        Please structure your response into the following clear sections:
        1.  **Portfolio Performance Summary**: A brief, 2-3 sentence overview of how their watchlist has performed recently, noting any significant movers.
        2.  **Key Risks and Opportunities**: Identify 3-4 distinct risks (e.g., sector-specific downturns, company-specific challenges) and opportunities (e.g., growth catalysts, undervalued assets) relevant to their watchlist. Use bullet points.
        3.  **Personalized Recommendations**: Provide 2-3 specific, actionable recommendations (e.g., "Consider reviewing TSLA for volatility," "AAPL looks stable for long-term holding," "Explore diversification into X sector").
        4.  **Market Outlook Impact**: Explain, in 2-3 sentences, how the current overall market outlook (bullish/bearish) or recent economic reports might specifically influence their watched stocks.

        Ensure your analysis is professional, data-driven, and easy for a non-expert user to understand.
      `;

      // Call Gemini API to generate content
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
      const apiKey = "" // If you want to use models other than gemini-2.0-flash or imagen-3.0-generate-002, provide an API key here. Otherwise, leave this as-is.
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      const result = await response.json(); // Await the JSON parsing

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        return this.parseAIResponse(text);
      } else {
        console.error("Gemini API response structure unexpected:", result);
        throw new Error("Invalid response from AI service.");
      }

    } catch (error) {
      console.error('Error generating personalized insights:', error);
      throw new Error(`Failed to generate personalized insights: ${error.message}`);
    }
  }

  /**
   * Generates a comprehensive market summary based on provided data.
   * @param {object} marketData - Overall market data (e.g., top gainers/losers, trends).
   * @param {Array<object>} newsData - Recent financial news articles.
   * @returns {Promise<object>} - An object containing parsed market summary insights.
   */
  async generateMarketSummary(marketData, newsData = []) {
    try {
      // Enhanced prompt for market summary, requesting specific sections and tone
      const prompt = `
        As a leading financial market AI analyst, provide a comprehensive yet concise overview of the current market conditions. Use the provided market data and recent news to inform your analysis.

        Market Data Summary:
        ${JSON.stringify(marketData, null, 2)}

        Recent Financial News Headlines (if available):
        ${newsData.length > 0 ? newsData.map(news => `- ${news.title}: ${news.summary}`).join('\n') : 'No recent news provided.'}

        Please provide the following:
        1.  **Overall Market Sentiment**: A clear, 1-2 sentence assessment (e.g., "bullish," "bearish," "neutral," or "mixed") with a brief justification.
        2.  **Key Market Drivers**: List 3-4 primary factors currently influencing the market (e.g., inflation, interest rates, tech innovation, geopolitical events). Use bullet points.
        3.  **Sector Performance Analysis**: Identify and briefly describe the top 2-3 performing and underperforming sectors mentioned in the data, if discernible.
        4.  **Risk Assessment**: Summarize current major risks to the market (e.g., recession fears, supply chain disruptions, regulatory changes).
        5.  **Short-term Outlook**: Provide a forward-looking statement (next 1-2 weeks) on potential market direction or volatility.

        Maintain a professional, analytical, and objective tone.
      `;

      // Call Gemini API to generate content
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
      const apiKey = "" // If you want to use models other than gemini-2.0-flash or imagen-3.0-generate-002, provide an API key here. Otherwise, leave this as-is.
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      const result = await response.json(); // Await the JSON parsing

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        return this.parseMarketSummary(text);
      } else {
        console.error("Gemini API response structure unexpected:", result);
        throw new Error("Invalid response from AI service.");
      }

    } catch (error) {
      console.error('Error generating market summary:', error);
      throw new Error(`Failed to generate market summary: ${error.message}`);
    }
  }

  /**
   * Generates a detailed stock-specific analysis.
   * @param {string} symbol - The stock symbol.
   * @param {object} stockData - Historical and metadata for the specific stock.
   * @param {Array<object>} newsData - Recent news relevant to the stock.
   * @returns {Promise<object>} - An object containing parsed stock analysis insights.
   */
  async generateStockAnalysis(symbol, stockData, newsData = []) {
    try {
      const prompt = `
        Provide a detailed financial analysis for ${symbol} based on its recent performance and relevant news. Act as a senior stock analyst.

        Stock Performance Data (Metadata):
        ${JSON.stringify(stockData.metadata, null, 2)}

        Recent News relevant to ${symbol}:
        ${newsData.length > 0 ? newsData.map(news => `- ${news.title}: ${news.summary}`).join('\n') : 'No specific news provided.'}

        Please provide:
        1.  **Current Performance Assessment**: A summary of ${symbol}'s recent price and volume movements.
        2.  **Technical Analysis Summary**: Based on basic indicators (like change %, trends), provide a brief technical outlook.
        3.  **Fundamental Factors**: Discuss any fundamental aspects implied by the data or general knowledge (e.g., industry position, growth prospects).
        4.  **News Impact Analysis**: How might the provided news (if any) specifically affect ${symbol}?
        5.  **Risk-Reward Assessment**: Briefly outline the potential risks and rewards of investing in ${symbol} currently.
        6.  **Short-term Price Target (Optional)**: If confident, provide a realistic short-term price target based on the analysis, or state why one cannot be given.

        Be specific with numbers, percentages, and timeframes where possible.
      `;

      // Call Gemini API to generate content
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
      const apiKey = "" // If you want to use models other than gemini-2.0-flash or imagen-3.0-generate-002, provide an API key here. Otherwise, leave this as-is.
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      const result = await response.json(); // Await the JSON parsing

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        return this.parseStockAnalysis(text);
      } else {
        console.error("Gemini API response structure unexpected:", result);
        throw new Error("Invalid response from AI service.");
      }

    } catch (error) {
      console.error('Error generating stock analysis:', error);
      throw new Error(`Failed to generate stock analysis: ${error.message}`);
    }
  }

  // Helper to build context for AI prompts
  buildContext(watchlist, marketData, newsData) {
    const marketSummary = marketData.summary
      ? marketData.summary.map(stock =>
          `${stock.symbol}: ${stock.metadata.priceRange.changePercent.toFixed(2)}% change, Current: $${stock.metadata.priceRange.current.toFixed(2)}`
        ).join(', ')
      : 'No detailed market data available.';

    const newsSummary = newsData.length > 0
      ? newsData.slice(0, 5).map(news => news.title).join('; ')
      : 'No recent news available.';

    return {
      marketSummary,
      newsSummary
    };
  }

  // --- Parsing functions for AI responses (these might need fine-tuning based on actual AI output) ---
  // The AI might not always adhere perfectly to the structure, so these are basic attempts.
  parseAIResponse(content) {
    // Attempt to parse sections based on headings
    const sections = {};
    const lines = content.split('\n');
    let currentSection = '';

    lines.forEach(line => {
      if (line.startsWith('1. **Portfolio Performance Summary**:')) {
        currentSection = 'portfolioSummary';
        sections[currentSection] = line.replace('1. **Portfolio Performance Summary**:', '').trim();
      } else if (line.startsWith('2. **Key Risks and Opportunities**:')) {
        currentSection = 'risksAndOpportunities';
        sections[currentSection] = line.replace('2. **Key Risks and Opportunities**:', '').trim();
      } else if (line.startsWith('3. **Personalized Recommendations**:')) {
        currentSection = 'recommendations';
        sections[currentSection] = line.replace('3. **Personalized Recommendations**:', '').trim();
      } else if (line.startsWith('4. **Market Outlook Impact**:')) {
        currentSection = 'marketOutlook';
        sections[currentSection] = line.replace('4. **Market Outlook Impact**:', '').trim();
      } else if (currentSection) {
        sections[currentSection] += '\n' + line.trim();
      }
    });

    return {
      portfolioSummary: sections.portfolioSummary || '',
      risksAndOpportunities: sections.risksAndOpportunities || '',
      recommendations: sections.recommendations || '',
      marketOutlook: sections.marketOutlook || '',
      fullResponse: content,
      timestamp: new Date().toISOString()
    };
  }

  parseMarketSummary(content) {
    const sections = {};
    const lines = content.split('\n');
    let currentSection = '';

    lines.forEach(line => {
      if (line.startsWith('1. **Overall Market Sentiment**:')) {
        currentSection = 'sentiment';
        sections[currentSection] = line.replace('1. **Overall Market Sentiment**:', '').trim();
      } else if (line.startsWith('2. **Key Market Drivers**:')) {
        currentSection = 'drivers';
        sections[currentSection] = line.replace('2. **Key Market Drivers**:', '').trim();
      } else if (line.startsWith('3. **Sector Performance Analysis**:')) {
        currentSection = 'sectorAnalysis';
        sections[currentSection] = line.replace('3. **Sector Performance Analysis**:', '').trim();
      } else if (line.startsWith('4. **Risk Assessment**:')) {
        currentSection = 'riskAssessment';
        sections[currentSection] = line.replace('4. **Risk Assessment**:', '').trim();
      } else if (line.startsWith('5. **Short-term Outlook**:')) {
        currentSection = 'outlook';
        sections[currentSection] = line.replace('5. **Short-term Outlook**:', '').trim();
      } else if (currentSection) {
        sections[currentSection] += '\n' + line.trim();
      }
    });

    return {
      overallSentiment: sections.sentiment || '',
      keyMarketDrivers: sections.drivers || '',
      sectorPerformance: sections.sectorAnalysis || '',
      riskAssessment: sections.riskAssessment || '',
      shortTermOutlook: sections.outlook || '',
      fullResponse: content,
      timestamp: new Date().toISOString()
    };
  }

  parseStockAnalysis(content) {
    const sections = {};
    const lines = content.split('\n');
    let currentSection = '';

    lines.forEach(line => {
      if (line.startsWith('1. **Current Performance Assessment**:')) {
        currentSection = 'performance';
        sections[currentSection] = line.replace('1. **Current Performance Assessment**:', '').trim();
      } else if (line.startsWith('2. **Technical Analysis Summary**:')) {
        currentSection = 'technical';
        sections[currentSection] = line.replace('2. **Technical Analysis Summary**:', '').trim();
      } else if (line.startsWith('3. **Fundamental Factors**:')) {
        currentSection = 'fundamental';
        sections[currentSection] = line.replace('3. **Fundamental Factors**:', '').trim();
      } else if (line.startsWith('4. **News Impact Analysis**:')) {
        currentSection = 'newsImpact';
        sections[currentSection] = line.replace('4. **News Impact Analysis**:', '').trim();
      } else if (line.startsWith('5. **Risk-Reward Assessment**:')) {
        currentSection = 'riskReward';
        sections[currentSection] = line.replace('5. **Risk-Reward Assessment**:', '').trim();
      } else if (line.startsWith('6. **Short-term Price Target (Optional)**:')) {
        currentSection = 'priceTarget';
        sections[currentSection] = line.replace('6. **Short-term Price Target (Optional)**:', '').trim();
      } else if (currentSection) {
        sections[currentSection] += '\n' + line.trim();
      }
    });

    return {
      currentPerformance: sections.performance || '',
      technicalAnalysis: sections.technical || '',
      fundamentalFactors: sections.fundamental || '',
      newsImpact: sections.newsImpact || '',
      riskReward: sections.riskReward || '',
      priceTarget: sections.priceTarget || this.extractPriceTarget(content), // Fallback to old extraction
      fullResponse: content,
      timestamp: new Date().toISOString()
    };
  }

  // Existing helper functions (ensure these are still present in your file)
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
