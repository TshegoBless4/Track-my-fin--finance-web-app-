// ============================================
// api/report.js - Vercel Serverless Function
// AI-generated monthly financial reports
// ============================================

export default async function handler(req, res) {
    // ============================================
    // CORS HEADERS
    // ============================================
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ============================================
    // GET REPORT DATA
    // ============================================
    const {
        month,
        income,
        expenses,
        remaining,
        categories,
        topTransactions,
        userGoal
    } = req.body;

    if (!month) {
        return res.status(400).json({ error: 'Month is required' });
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
        console.error('Missing API key: OPENROUTER_API_KEY not set in Vercel');
        return res.status(200).json({
            summary: null,
            note: 'Missing API key',
            source: 'fallback'
        });
    }

    // ============================================
    // BUILD THE ANALYST PROMPT
    // ============================================
    const categoryLines = Object.entries(categories || {})
        .map(([cat, amt]) => `${cat}: R${Number(amt).toFixed(2)}`)
        .join(', ');

    const topTxnLines = (topTransactions || [])
        .slice(0, 3)
        .map(t => `${t.description} (R${Math.abs(Number(t.amount)).toFixed(2)})`)
        .join(', ');

    const userPrompt = `Month: ${month}
Income: R${Number(income).toFixed(2)}
Expenses: R${Number(expenses).toFixed(2)}
Remaining: R${Number(remaining).toFixed(2)}
Category breakdown: ${categoryLines || 'No categories'}
Top transactions: ${topTxnLines || 'None'}
User's financial goal: ${userGoal || 'Not specified'}

Write the report now.`;

    // ============================================
    // CALL OPENROUTER API WITH FALLBACK MODELS
    // ============================================
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://track-my-fin-finance-web-app.vercel.app',
                'X-Title': 'Track My Fin'
            },
            body: JSON.stringify({
                model: 'google/gemma-4-31b-it:free,nex-agi/nex-n2.5-mini:free,nex-agi/nex-n2.5-pro:free',
                messages: [
                    {
                        role: 'system',
                        content: `You are a warm, calm financial analyst for a young South African user.

Write a short monthly summary in plain, everyday English. Do not use financial jargon.

Structure your response as exactly three short paragraphs:
1. A one-sentence overview of the month (income, expenses, whether they stayed within their money).
2. The most notable pattern or category observation, mentioning specific numbers.
3. Exactly three specific recommendations tied to the user's stated financial goal, in a short numbered list.

Rules:
- Total length must be under 180 words.
- Be encouraging, never judgemental.
- Use South African Rand (R) for amounts.
- Do not invent numbers that were not given to you.
- Do not say "as an AI" or mention that you are a model.`
                    },
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ],
                temperature: 0.6,
                max_tokens: 400
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter report error:', response.status, errorText);
            return res.status(200).json({
                summary: null,
                note: 'AI report unavailable',
                debug_status: response.status,
                debug_details: errorText.substring(0, 300),
                source: 'fallback'
            });
        }

        const data = await response.json();
        let summary = '';

        if (data && data.choices && data.choices[0] && data.choices[0].message) {
            const content = data.choices[0].message.content;
            if (typeof content === 'string') {
                summary = content.trim();
            }
        }

        if (!summary || summary.length === 0) {
            return res.status(200).json({
                summary: null,
                note: 'Empty AI report',
                source: 'fallback'
            });
        }

        return res.status(200).json({
            summary: summary,
            source: 'ai'
        });

    } catch (error) {
        console.error('Report proxy error:', error);
        return res.status(200).json({
            summary: null,
            note: 'Server error',
            source: 'fallback'
        });
    }
}