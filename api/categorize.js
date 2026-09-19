// ============================================
// TRACK MY FIN - CATEGORIZATION API ENDPOINT
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

    const { description, amount, type } = req.body || {};

    if (!description) {
        return res.status(400).json({ error: 'Description is required' });
    }

    // Default categories
    const categories = ['Essential', 'Lifestyle', 'Financial', 'Income'];

    // Income shortcut
    if (type === 'income' || amount > 0) {
        return res.status(200).json({
            category: 'Income',
            confidence: 0.95,
            source: 'ai'
        });
    }

    // If API key is missing, return failure to let frontend fallback handle it
    if (!OPENROUTER_API_KEY) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    const systemPrompt = `You are a financial categorization assistant. Categorize the transaction description into exactly ONE of these categories: ${categories.join(', ')}.
Rules:
- Essential: Groceries, utilities, rent, petrol/fuel, transport, medical, school fees, medication.
- Lifestyle: Dining out, shopping, entertainment, hobbies, general merchandise, online purchases.
- Financial: Bank fees, loans, credit cards, insurance, investments, transfers.
- Income: Salary, wages, deposits, freelance work.

Respond strictly in valid JSON format with no markdown formatting or commentary:
{"category": "CategoryName", "confidence": 0.85}`;

    const userPrompt = `Description: "${description}", Amount: R${Math.abs(amount || 0)}`;

    // Models to try sequentially to avoid rate-limit failures
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
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                console.warn(`Model ${model} failed with status: ${response.status}`);
                continue;
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (content) {
                // Clean potential markdown wrap code blocks
                const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(jsonStr);

                if (parsed.category && categories.includes(parsed.category)) {
                    return res.status(200).json({
                        category: parsed.category,
                        confidence: parsed.confidence || 0.85,
                        source: 'ai'
                    });
                }
            }
        } catch (err) {
            console.error(`Error calling model ${model}:`, err);
        }
    }

    return res.status(500).json({ error: 'All AI models failed to categorize' });
}