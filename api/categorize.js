// ============================================
// api/categorize.js - Vercel Serverless Function
// AI categorization for Track My Fin
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
    // GET TRANSACTION DATA
    // ============================================
    const { description, amount, type } = req.body;

    if (!description) {
        return res.status(400).json({ error: 'Description is required' });
    }

    // ============================================
    // RULE 1: INCOME SHORT-CIRCUIT
    // Money coming in is ALWAYS Income. No AI needed.
    // ============================================
    if (type === 'income') {
        return res.status(200).json({
            category: 'Income',
            confidence: 0.95,
            source: 'ai'
        });
    }

    // ============================================
    // RULE 2: FOR EXPENSES, THE AI ONLY CHOOSES
    // BETWEEN Essential, Lifestyle, OR Financial.
    // Income is never a valid answer here.
    // ============================================
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
        console.error('Missing API key: OPENROUTER_API_KEY not set in Vercel');
        return res.status(200).json({
            category: 'Lifestyle',
            confidence: 0.3,
            note: 'Server configuration error: missing API key',
            source: 'fallback'
        });
    }

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
                model: 'nex-agi/nex-n2.5-mini:free',
                messages: [
                    {
                        role: 'system',
                        content: `You are a financial categorizer for South African users.

You categorize EXPENSES only. The user has already told you that this transaction is money going OUT.

You must return exactly ONE of these three words:
- Essential (groceries, rent, medication, utilities, transport, school fees, petrol, electricity, water)
- Lifestyle (dining, coffee, takeout, streaming, shopping, entertainment, clothing, hobbies)
- Financial (bank fees, insurance, loans, credit cards, interest, account fees)

Do NOT return "Income". This is an expense, not income.
Do NOT explain. Do NOT add punctuation. Do NOT add quotes.
Return one word only: Essential, Lifestyle, or Financial.`
                    },
                    {
                        role: 'user',
                        content: `Expense description: "${description}" for R${Math.abs(amount || 0)}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 5
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API error:', response.status, errorText);
            return res.status(200).json({
                category: 'Lifestyle',
                confidence: 0.3,
                note: 'API error, using fallback',
                debug_status: response.status,
                source: 'fallback'
            });
        }

        const data = await response.json();

        // ============================================
        // EXTRACT RAW TEXT FROM ANY SHAPE
        // ============================================
        let rawText = '';

        if (data && data.choices && data.choices[0]) {
            const choice = data.choices[0];
            if (choice.message && typeof choice.message.content === 'string') {
                rawText = choice.message.content;
            } else if (choice.message && typeof choice.message.content === 'object') {
                rawText = JSON.stringify(choice.message.content);
            } else if (typeof choice.text === 'string') {
                rawText = choice.text;
            } else if (typeof choice.content === 'string') {
                rawText = choice.content;
            }
        }

        if (!rawText || rawText.length === 0) {
            console.error('Empty AI response:', JSON.stringify(data).substring(0, 500));
            return res.status(200).json({
                category: 'Lifestyle',
                confidence: 0.3,
                note: 'Empty AI response',
                source: 'fallback'
            });
        }

        // ============================================
        // FIND A VALID EXPENSE CATEGORY
        // Note: Income is NOT valid here
        // ============================================
        const validCategories = ['Essential', 'Lifestyle', 'Financial'];
        let matchedCategory = null;

        for (const valid of validCategories) {
            const regex = new RegExp(`\\b${valid}\\b`, 'i');
            if (regex.test(rawText)) {
                matchedCategory = valid;
                break;
            }
        }

        if (matchedCategory) {
            return res.status(200).json({
                category: matchedCategory,
                confidence: 0.85,
                source: 'ai'
            });
        }

        console.error('Could not extract category from AI text:', rawText.substring(0, 200));
        return res.status(200).json({
            category: 'Lifestyle',
            confidence: 0.4,
            note: 'Could not parse AI response',
            debug_raw_text: rawText.substring(0, 200),
            source: 'fallback'
        });

    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(200).json({
            category: 'Lifestyle',
            confidence: 0.3,
            note: 'Server error',
            source: 'fallback'
        });
    }
}