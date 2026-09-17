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

    // ============================================
    // HANDLE PREFLIGHT (OPTIONS) REQUEST
    // ============================================
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ============================================
    // ONLY ACCEPT POST REQUESTS
    // ============================================
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ============================================
    // GET TRANSACTION DATA FROM REQUEST
    // ============================================
    const { description, amount } = req.body;

    if (!description) {
        return res.status(400).json({ error: 'Description is required' });
    }

    // ============================================
    // GET API KEY FROM ENVIRONMENT VARIABLES
    // ============================================
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
        console.error('Missing API key: OPENROUTER_API_KEY not set in Vercel');
        return res.status(200).json({
            category: 'Lifestyle',
            confidence: 0.3,
            note: 'Server configuration error: missing API key'
        });
    }

    // ============================================
    // CALL OPENROUTER API
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
                model: 'google/gemma-4-31b-it:free',
                messages: [
                    {
                        role: 'system',
                        content: `You are a financial categorizer for South African users.
Return ONLY one word from this list: Essential, Lifestyle, Financial, or Income.

Essential = rent, groceries, Checkers, Pick n Pay, Shoprite, Woolworths food, medication, utilities, electricity, water, medical aid, school fees, transport, petrol, fuel
Lifestyle = restaurant, Uber, Bolt, Netflix, Spotify, DStv, coffee, takeaway, shopping, mall, clothing, entertainment, movies
Financial = bank fees, Capitec, FNB, Nedbank, Standard Bank, ABSA, insurance, loan, credit card, interest
Income = salary, deposit, payment received, freelance, stipend, allowance, refund

Do not explain. Do not add extra words. Return only the single category word.`
                    },
                    {
                        role: 'user',
                        content: `Categorize this transaction: "${description}" for R${Math.abs(amount || 0)}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 10
            })
        });

        // ============================================
        // CHECK FOR API ERRORS
        // ============================================
        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API error:', response.status, errorText);
            return res.status(200).json({
                category: 'Lifestyle',
                confidence: 0.3,
                note: 'API error, using fallback',
                debug_status: response.status,
                debug_details: errorText
            });
        }

        const data = await response.json();

        // ============================================
        // PARSE THE RESPONSE
        // ============================================
        let rawText = '';
        try {
            rawText = data.choices[0].message.content.trim();
        } catch (e) {
            console.error('Unexpected response shape:', JSON.stringify(data));
            return res.status(200).json({
                category: 'Lifestyle',
                confidence: 0.3,
                note: 'Unexpected AI response'
            });
        }

        // Extract just the category word from the response
        const validCategories = ['Essential', 'Lifestyle', 'Financial', 'Income'];
        let category = 'Lifestyle';
        let matched = false;

        for (const valid of validCategories) {
            if (rawText.toLowerCase().includes(valid.toLowerCase())) {
                category = valid;
                matched = true;
                break;
            }
        }

        // ============================================
        // RETURN SUCCESSFUL RESPONSE
        // ============================================
        return res.status(200).json({
            category: category,
            confidence: matched ? 0.85 : 0.4,
            source: 'ai'
        });

    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(200).json({
            category: 'Lifestyle',
            confidence: 0.3,
            note: 'Server error, using fallback',
            debug_details: String(error)
        });
    }
}