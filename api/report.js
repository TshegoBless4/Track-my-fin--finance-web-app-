// ============================================
// TRACK MY FIN - AI REPORT API ENDPOINT
// ============================================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { month, income, expenses, remaining, categories, topTransactions, userGoal } = req.body || {};

    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required' });
    }

    const prompt = `You are a helpful personal finance assistant in South Africa.
Write a personalized 3-paragraph financial report for ${month}.

Data Summary:
- Income: R${income}
- Expenses: R${expenses}
- Net Balance: R${remaining}
- Essential: R${categories?.Essential || 0}
- Lifestyle: R${categories?.Lifestyle || 0}
- Financial: R${categories?.Financial || 0}
- Top Expense: ${topTransactions ? topTransactions.map(t => `${t.description} (R${Math.abs(t.amount)})`).join(', ') : 'None'}
- Goal: ${userGoal || 'Maintain financial health'}

Paragraph 1: Praise positive habits and give an overall overview of the month.
Paragraph 2: Highlight key areas where spending was high or where small savings could be made.
Paragraph 3: Give 2 actionable recommendations aligned with their primary goal.

Keep the tone encouragement-focused, constructive, concise, and easy to digest. Return clean text without Markdown formatting headers.`;

    // Active free model roster on OpenRouter
    const models = [
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'deepseek/deepseek-r1:free',
        'qwen/qwen-2.5-coder-32b-instruct:free'
    ];

    if (OPENROUTER_API_KEY) {
        const cleanKey = OPENROUTER_API_KEY.trim();

        for (const model of models) {
            try {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${cleanKey}`,
                        'HTTP-Referer': 'https://track-my-fin-finance-web-app.vercel.app',
                        'X-Title': 'Track My Fin',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.5
                    })
                });

                if (!response.ok) {
                    const errBody = await response.text();
                    console.warn(`Model ${model} failed with status ${response.status}: ${errBody}`);
                    continue;
                }

                const data = await response.json();
                const summary = data.choices?.[0]?.message?.content;

                if (summary) {
                    return res.status(200).json({
                        summary: summary.trim(),
                        source: 'ai'
                    });
                }
            } catch (err) {
                console.error(`Error querying model ${model}:`, err);
            }
        }
    } else {
        console.warn("OPENROUTER_API_KEY is not defined in Vercel environment variables.");
    }

    // Diagnostic Fallback Engine
    return res.status(200).json({
        summary: `During ${month}, you brought in R${Number(income).toFixed(2)} in total income against R${Number(expenses).toFixed(2)} in total expenses, leaving you with a net balance of R${Number(remaining).toFixed(2)}.`,
        source: 'rule-based',
        debug: {
            hasApiKey: !!OPENROUTER_API_KEY,
            keyLength: OPENROUTER_API_KEY ? OPENROUTER_API_KEY.trim().length : 0
        }
    });
}