// ============================================
// TRACK MY FIN - AI REPORT API ENDPOINT
// ============================================

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export default async function handler(req, res) {
    // Enable CORS
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

    if (!OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    const prompt = `You are an empathetic, insightful, and practical personal finance assistant for a user in South Africa.
Write a personalized 3-paragraph financial report for the month of ${month}.

Data Summary:
- Income: R${income}
- Expenses: R${expenses}
- Net Balance: R${remaining}
- Essential Spending: R${categories?.Essential || 0}
- Lifestyle Spending: R${categories?.Lifestyle || 0}
- Financial/Debt Spending: R${categories?.Financial || 0}
- Top Expense Items: ${topTransactions ? topTransactions.map(t => `${t.description} (R${Math.abs(t.amount)})`).join(', ') : 'None'}
- Primary Goal: ${userGoal || 'Maintain financial health'}

Instructions:
Paragraph 1: Praise positive habits and give an overall overview of the month.
Paragraph 2: Highlight key areas where spending was high or where small savings could be made.
Paragraph 3: Give 2 actionable recommendations aligned with their primary goal.

Keep the tone encouragement-focused, constructive, concise, and easy to digest. Use standard text without Markdown formatting headers.`;

    const models = [
        'meta-llama/llama-3.3-70b-instruct:free',
        'deepseek/deepseek-r1-distill-llama-70b:free',
        'google/gemini-2.0-flash-lite-preview-02-05:free'
    ];

    for (const model of models) {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'https://trackmyfin.vercel.app',
                    'X-Title': 'Track My Fin',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.5
                })
            });

            if (!response.ok) {
                console.warn(`Model ${model} failed with status: ${response.status}`);
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
            console.error(`Error generating report with model ${model}:`, err);
        }
    }

    return res.status(500).json({ error: 'All AI models failed to generate report' });
}