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

    const { promptType, month, income, expenses, remaining, categories, topTransactions, userGoal, debts, monthlyBudget } = req.body || {};

    let prompt = '';

    if (promptType === 'debt_coach') {
        prompt = `You are Fin, a friendly and encouraging personal finance AI coach in South Africa.
Analyze the user's debts and monthly budget to provide a short, motivating, and actionable debt-payoff strategy (using the avalanche or snowball method where appropriate).
Debts: ${JSON.stringify(debts)}
Monthly Budget for Debt: R${monthlyBudget}
User Goal: ${userGoal}

Keep it conversational, warm, and concise (under 4 paragraphs). Return plain text only without Markdown headers.`;
    } else {
        if (!month) {
            return res.status(400).json({ error: 'Month parameter is required' });
        }

        prompt = `You are a personal finance assistant in South Africa.
Write a personalized 3-paragraph financial summary for ${month}.

Data:
- Income: R${income}
- Expenses: R${expenses}
- Net Balance: R${remaining}
- Essential Spending: R${categories?.Essential || 0}
- Lifestyle Spending: R${categories?.Lifestyle || 0}
- Financial Obligations: R${categories?.Financial || 0}
- Top Expense: ${topTransactions ? topTransactions.map(t => `${t.description} (R${Math.abs(t.amount)})`).join(', ') : 'None'}
- Goal: ${userGoal || 'Maintain financial health'}

Paragraph 1: Praise positive financial habits and give an overall overview of the month.
Paragraph 2: Highlight spending breakdown and key observations.
Paragraph 3: Provide 2 actionable recommendations toward their goal.

Return plain text only without Markdown headers.`;
    }

    // OpenRouter fallback sequence starting with auto-router
    const models = [
        'openrouter/auto',
        'google/gemini-2.0-flash-lite-001',
        'meta-llama/llama-3.3-70b-instruct:free',
        'deepseek/deepseek-r1:free'
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
                        max_tokens: 500,
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
    }

    // Rule-based fallback if all API routes fail
    return res.status(200).json({
        summary: `During ${month}, you brought in R${Number(income).toFixed(2)} in total income against R${Number(expenses).toFixed(2)} in total expenses, leaving you with a net positive balance of R${Number(remaining).toFixed(2)}.

Your primary expense distribution shows R${Number(categories?.Essential || 0).toFixed(2)} spent on Essential needs, R${Number(categories?.Lifestyle || 0).toFixed(2)} on Lifestyle, and R${Number(categories?.Financial || 0).toFixed(2)} toward Financial obligations. Keeping lifestyle costs measured against essential requirements is a great indicator of financial awareness.

To align with your goal of "${userGoal || 'maintaining balance'}", consider allocating at least 20% of your remaining R${Number(remaining).toFixed(2)} (approx. R${(Number(remaining) * 0.2).toFixed(2)}) directly toward savings or debt clearance at the start of the month before discretionary spending begins.`,
        source: 'rule-based'
    });
}