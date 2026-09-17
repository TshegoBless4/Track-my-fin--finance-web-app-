// ============================================
// api/categorize.js - Vercel Serverless Function
// Your API key is safe here - never exposed to the browser
// ============================================

export default async function handler(req, res) {
    // ============================================
    // CORS HEADERS (Applied at function level too)
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
        console.error('Missing API key: OPENROUTER_API_KEY not set');
        return res.status(500).json({ 
            error: 'Server configuration error',
            category: 'Lifestyle',
            confidence: 0.3
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
                'HTTP-Referer': 'https://track-my-fin.vercel.app',
                'X-Title': 'Track My Fin'
            },
            body: JSON.stringify({
               model: 'google/gemma-4-31b-it:free',
                messages: [
                    {
                        role: 'system',
                        content: `You are a financial categorizer for South African users.
Return ONLY a JSON object with "category" and "confidence" (0-1).

Category must be one of: Essential, Lifestyle, Financial, Income.

Essential = rent, groceries, Checkers, Pick n Pay, Shoprite, Woolworths food, medication, utilities, electricity, water, medical aid, school fees, transport, petrol, fuel
Lifestyle = restaurant, Uber, Bolt, Netflix, Spotify, DStv, coffee, takeaway, shopping, mall, clothing, entertainment, movies
Financial = bank fees, Capitec, FNB, Nedbank, Standard Bank, ABSA, insurance, loan, credit card, interest
Income = salary, deposit, payment received, freelance, stipend, allowance, refund

Confidence: How certain are you? (1.0 = completely certain, 0.5 = unsure)

Return JSON like: {"category":"Essential","confidence":0.92}`
                    },
                    {
                        role: 'user',
                        content: `Categorize this transaction: "${description}" for R${Math.abs(amount || 0)}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 60
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
                note: 'API error, using fallback'
            });
        }

        const data = await response.json();
        let result = data.choices[0].message.content.trim();

        // Remove markdown code blocks if present
        result = result.replace(/```json/g, '').replace(/```/g, '').trim();

        // ============================================
        // PARSE THE JSON RESPONSE
        // ============================================
        let parsed;
        try {
            parsed = JSON.parse(result);
        } catch(e) {
            console.error('Failed to parse AI response:', result);
            // If JSON parsing fails, try to extract category from text
            const categoryMatch = result.match(/(Essential|Lifestyle|Financial|Income)/i);
            parsed = {
                category: categoryMatch ? categoryMatch[1] : 'Lifestyle',
                confidence: 0.5
            };
        }

        // ============================================
        // VALIDATE CATEGORY
        // ============================================
        const validCategories = ['Essential', 'Lifestyle', 'Financial', 'Income'];
        if (!validCategories.includes(parsed.category)) {
            parsed.category = 'Lifestyle';
            parsed.confidence = 0.4;
        }

        // ============================================
        // RETURN SUCCESSFUL RESPONSE
        // ============================================
        return res.status(200).json({
            category: parsed.category,
            confidence: parsed.confidence || 0.7
        });

    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(200).json({
            category: 'Lifestyle',
            confidence: 0.3,
            note: 'Server error, using fallback'
        });
    }
}