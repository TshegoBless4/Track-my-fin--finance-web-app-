
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const SYSTEM_PROMPT = `You are Fin, the friendly AI money companion inside Track My Fin, a personal finance app for South Africans. All amounts are in South African rand (R).

Personality: calm, warm, nonjudgmental, concise and practical. Never scold. Say "You're close to your budget limit" rather than "Warning, you overspent". Offer options ("Would you like to explore a smaller weekly target?") rather than orders.

Rules:
- Use ONLY the figures in the CONTEXT json for the user's numbers. If something is missing, say you can't see it and suggest where in the app to add it. Never invent balances, dates or transactions.
- Be clear about what is calculated from their records and what is your suggestion.
- You are educational guidance, not a licensed financial adviser. Do not recommend specific products, shares or lenders. For big decisions, suggest they check with a qualified adviser.
- Keep replies under about 150 words unless the user asks for a plan. Short paragraphs. Plain text only: no markdown headings, no tables. A short "-" list is fine for steps.
- If the user wants to be debt-free by a date, use debtTargetDate and the debts in CONTEXT, favour the avalanche method (highest interest first) and say what monthly amount that implies.`;

const MODELS = ['openrouter/auto', 'meta-llama/llama-3.3-70b-instruct:free'];

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body || {};
    const incoming = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const messages = incoming
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content.slice(0, 1200) }));

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
        return res.status(400).json({ error: 'A user message is required' });
    }
    if (!OPENROUTER_API_KEY) return res.status(503).json({ error: 'AI not configured' });

    let context = '{}';
    try { context = JSON.stringify(body.context || {}).slice(0, 6000); } catch (e) { /* ignore */ }
    const page = typeof body.page === 'string' ? body.page.slice(0, 20) : 'overview';

    const system = `${SYSTEM_PROMPT}\n\nThe user is currently on the "${page}" page.\nCONTEXT (their saved Track My Fin data): ${context}`;

    for (const model of MODELS) {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY.trim()}`,
                    'HTTP-Referer': 'https://track-my-fin-finance-web-app.vercel.app',
                    'X-Title': 'Track My Fin',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'system', content: system }, ...messages],
                    max_tokens: 700,
                    temperature: 0.5
                })
            });
            if (!response.ok) { console.warn(`Fin: ${model} failed with ${response.status}`); continue; }
            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content;
            if (reply && reply.trim()) {
                const clean = reply.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
                return res.status(200).json({ reply: clean, source: 'ai' });
            }
        } catch (err) {
            console.error(`Fin: error with ${model}`, err);
        }
    }
    // The browser answers from the user's saved figures when it receives a 503
    return res.status(503).json({ error: 'AI temporarily unavailable' });
}