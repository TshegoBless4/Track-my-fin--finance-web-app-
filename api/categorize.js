// api/categorize.js - This is a Vercel Serverless Function
// Your API key is safe here - never exposed to the browser

export default async function handler(req, res) {
    // Enable CORS for GitHub Pages
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only accept POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get the transaction data from the request
    const { description, amount } = req.body;
    
    if (!description) {
        return res.status(400).json({ error: 'Description is required' });
    }
    
    // Your OpenRouter API key - stored safely on the server
    // NEVER expose this key to the browser
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    
    if (!OPENROUTER_API_KEY) {
        console.error('Missing API key');
        return res.status(500).json({ error: 'Server configuration error' });
    }
    
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
                model: 'deepseek/deepseek-r1:free',
                messages: [
                    {
                        role: 'system',
                        content: `You are a financial categorizer for South African users.
                        Return ONLY one word: Essential, Lifestyle, Financial, or Income.
                        
Essential = rent, groceries, Checkers, Pick n Pay, Shoprite, Woolworths food, medication, utilities
Lifestyle = restaurant, Uber, Netflix, Spotify, coffee, takeaway, shopping, mall, clothing
Financial = bank fees, Capitec, FNB, Nedbank, Standard Bank, insurance, loan
Income = salary, deposit, freelance, stipend, allowance`
                    },
                    {
                        role: 'user',
                        content: `Categorize this transaction: "${description}" for R${Math.abs(amount)}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 10
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenRouter API error:', response.status, errorText);
            return res.status(response.status).json({ error: 'API call failed' });
        }
        
        const data = await response.json();
        let category = data.choices[0].message.content.trim();
        category = category.replace(/[^a-zA-Z]/g, '');
        
        const validCategories = ['Essential', 'Lifestyle', 'Financial', 'Income'];
        if (!validCategories.includes(category)) {
            category = 'Lifestyle';
        }
        
        return res.status(200).json({ category });
        
    } catch (error) {
        console.error('Proxy error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}