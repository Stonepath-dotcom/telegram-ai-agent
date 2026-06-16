/**
 * Web Search Service
 *
 * Uses DuckDuckGo HTML endpoint (no API key required, free, unlimited).
 * Falls back to DuckDuckGo Instant Answer API for direct facts.
 *
 * For premium providers (optional, env-driven):
 * - TAVILY_API_KEY: if set, uses Tavily (1000 req/month free)
 * - SERPER_API_KEY: if set, uses Serper.dev (2500 req free trial)
 */

const USER_AGENT = 'Mozilla/5.0 (compatible; GloAgent/3.0; +https://github.com/Stonepath-dotcom/telegram-ai-agent)';

class WebSearchService {
  /**
   * Search the web. Returns top results with title, url, snippet.
   * @param {string} query - search query
   * @param {number} maxResults - default 5
   * @returns {Promise<Array<{title, url, snippet}>>}
   */
  async search(query, maxResults = 5) {
    // Prefer Tavily if key is set
    if (process.env.TAVILY_API_KEY) {
      try {
        return await this._searchTavily(query, maxResults);
      } catch (e) {
        console.warn(`⚠️ Tavily search failed, falling back to DuckDuckGo: ${e.message}`);
      }
    }
    // Prefer Serper if key is set
    if (process.env.SERPER_API_KEY) {
      try {
        return await this._searchSerper(query, maxResults);
      } catch (e) {
        console.warn(`⚠️ Serper search failed, falling back to DuckDuckGo: ${e.message}`);
      }
    }
    // Default: DuckDuckGo HTML (free, no key)
    return await this._searchDuckDuckGo(query, maxResults);
  }

  /**
   * Format search results as a readable Telegram message
   */
  formatResults(query, results) {
    if (!results || results.length === 0) {
      return `🔍 *Tidak ada hasil untuk:* \`${this._escape(query)}\``;
    }
    let msg = `🔍 *Hasil pencarian:* \`${this._escape(query.substring(0, 100))}\`\n\n`;
    results.slice(0, 5).forEach((r, i) => {
      const title = this._escape(r.title).substring(0, 80);
      const snippet = this._escape(r.snippet || '').substring(0, 180);
      msg += `${i + 1}. *${title}*\n   ${snippet}\n   🔗 ${r.url}\n\n`;
    });
    return msg;
  }

  /**
   * Get a quick summary by combining search results with AI
   */
  async searchAndSummarize(query, aiService, maxResults = 3) {
    const results = await this.search(query, maxResults);
    if (results.length === 0) {
      return 'Maaf, tidak menemukan hasil untuk pertanyaanmu.';
    }

    const context = results
      .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet || ''}`)
      .join('\n\n');

    const prompt = `User asks: "${query}"

Here are relevant web search results:

${context}

Based on the above, give a concise, factual answer (max 3 short paragraphs). Cite sources inline as [1], [2], etc. Respond in the same language the user used.`;

    return await aiService.chat(prompt, [], 'normal');
  }

  // ============================================
  // Private: DuckDuckGo HTML search (free, no API key)
  // ============================================
  async _searchDuckDuckGo(query, maxResults) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`DuckDuckGo HTML ${response.status}`);
      }

      const html = await response.text();
      return this._parseDuckDuckGoHtml(html, maxResults);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('DuckDuckGo search timeout (15s)');
      }
      throw err;
    }
  }

  _parseDuckDuckGoHtml(html, maxResults) {
    const results = [];
    // DuckDuckGo HTML results have this structure:
    // <a rel="nofollow" class="result__a" href="...">Title</a>
    // <a class="result__snippet" href="...">Snippet</a>
    const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = resultRegex.exec(html)) && results.length < maxResults) {
      let url = match[1];
      const title = this._stripHtml(match[2]).trim();
      const snippet = this._stripHtml(match[3]).trim();

      // DuckDuckGo wraps URLs in a redirect — unwrap
      const uddgMatch = url.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        try {
          url = decodeURIComponent(uddgMatch[1]);
        } catch (e) { /* keep original */ }
      }

      if (title && url) {
        results.push({ title, url, snippet });
      }
    }

    // Fallback parser — DuckDuckGo HTML structure varies
    if (results.length === 0) {
      const linkRegex = /<a[^>]+class="result__a"[^>]+href="(\/\/duckduckgo\.com\/l\/\?uddg=[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      while ((match = linkRegex.exec(html)) && results.length < maxResults) {
        let url = match[1];
        const uddgMatch = url.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          try { url = decodeURIComponent(uddgMatch[1]); } catch (e) { /* keep */ }
        }
        const title = this._stripHtml(match[2]).trim();
        if (title && url) results.push({ title, url, snippet: '' });
      }
    }

    return results;
  }

  _stripHtml(s) {
    return String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
  }

  // ============================================
  // Private: Tavily search (premium, requires TAVILY_API_KEY)
  // ============================================
  async _searchTavily(query, maxResults) {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: maxResults,
        include_answer: true,
      }),
    });
    if (!response.ok) throw new Error(`Tavily ${response.status}`);
    const data = await response.json();
    return (data.results || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content || '',
    }));
  }

  // ============================================
  // Private: Serper.dev search (premium, requires SERPER_API_KEY)
  // ============================================
  async _searchSerper(query, maxResults) {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: maxResults }),
    });
    if (!response.ok) throw new Error(`Serper ${response.status}`);
    const data = await response.json();
    return (data.organic || []).map(r => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet || '',
    }));
  }

  _escape(s) {
    return String(s || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }
}

const webSearchService = new WebSearchService();
export default webSearchService;
