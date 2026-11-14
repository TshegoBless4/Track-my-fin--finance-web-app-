// api/fin.js — Fin, the Track My Fin AI companion (my own file; categorize.js and report.js are untouched)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const SYSTEM_PROMPT = `You are Fin, the friendly AI money companion inside Track My Fin, a personal finance app for South Africans. All amounts are in South African rand (R).

Personality: calm, warm, nonjudgmental, concise and practical. Never scold. Say "You're close to your budget limit" rather than "Warning, you overspent". Offer options ("Would you like to explore a smaller weekly target?") rather than orders.

Rules:
- Use ONLY the figures in the CONTEXT json for the user's numbers. If something is missing, say you can't see it and suggest where in the app to add it. Never invent balances, dates or transactions.
- Be clear about what is calculated from their records and what is your suggestion.
- You are educational guidance, not a licensed financial adviser. Do not recommend specific products, shares or lenders. For big decisions, suggest they check with a qualified adviser.
- Keep replies under about 150 words unless the user asks for a plan. Short paragraphs. Plain text only: no markdown headings, no tables. A short "-" list is fine for steps.
- If the user wants to be debt-free by a date, use debtTargetDate and the debts in CONTEXT, favour the avalanche method (highest interest first) and say what monthly amount that implies.`;

// Model order. Free model names change often, so you can override this list without touching code:
// set FIN_MODELS in Vercel to a comma-separated list, e.g. "openrouter/free,meta-llama/llama-3.3-70b-instruct".
// A paid model with no credit fails instantly (402), so listing it first costs no time.
const MODELS = (process.env.FIN_MODELS || 'meta-llama/llama-3.3-70b-instruct,openrouter/free,openrouter/auto')
    .split(',').map(m => m.trim()).filter(Boolean);
const BUDGET_MS = 8500; // Vercel Hobby functions stop at ~10 s, so stay under it and report why

const HEADERS = key => ({
    'Authorization': `Bearer ${key}`,
    'HTTP-Referer': 'https://track-my-fin-finance-web-app.vercel.app',
    'X-Title': 'Track My Fin',
    'Content-Type': 'application/json'
});

// Some models reject a conversation that starts with the assistant or repeats a role.
function tidy(messages) {
    const out = [];
    for (const m of messages) {
        if (!out.length && m.role !== 'user') continue;
        if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n' + m.content;
        else out.push({ role: m.role, content: m.content });
    }
    return out;
}

async function ask(model, key, payload, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST', headers: HEADERS(key), signal: ctrl.signal,
            body: JSON.stringify({ model, ...payload })
        });
        const text = await r.text();
        let data = null; try { data = JSON.parse(text); } catch (e) { /* not json */ }
        if (!r.ok) return { ok: false, model, status: r.status, message: (data && data.error && (data.error.message || data.error)) || text.slice(0, 160) };
        let reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (Array.isArray(reply)) reply = reply.map(p => (p && p.text) || '').join('');
        if (!reply || !String(reply).trim()) return { ok: false, model, status: 200, message: 'empty reply' };
        return { ok: true, reply: String(reply).replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim() };
    } catch (err) {
        return { ok: false, model, status: 0, message: err.name === 'AbortError' ? 'timed out' : String(err.message || err) };
    } finally { clearTimeout(timer); }
}

function hintFor(attempts) {
    const codes = attempts.map(a => a.status);
    const detail = attempts.map(a => `${a.model}: ${a.status || 'no answer'} ${String(a.message || '').slice(0, 70)}`.trim()).join(' | ');
    let lead = 'OpenRouter could not answer.';
    if (codes.includes(401) || codes.includes(403)) lead = 'OpenRouter rejected the API key (401/403). Check the key in Vercel, then redeploy.';
    else if (codes.includes(402)) lead = 'A paid model needs credit (402): add credit at openrouter.ai/credits.';
    else if (codes.includes(404)) lead = 'A model name is out of date (404): set FIN_MODELS in Vercel to a current model.';
    else if (codes.includes(429)) lead = 'OpenRouter is rate-limiting these models (429): try again in a minute.';
    else if (attempts.length && attempts.every(a => a.message === 'timed out')) lead = 'The AI models were too slow to answer in time.';
    return lead + ' Details: ' + detail;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const key = (OPENROUTER_API_KEY || '').trim();

    // Connection check: open /api/fin?test=1 in the browser. Never prints the key itself.
    if (req.method === 'GET') {
        const out = { deployed: true, keyFound: !!key, keyLooksRight: key.startsWith('sk-or-'), models: MODELS };
        if (req.query && req.query.test && key) {
            const probe = { messages: [{ role: 'user', content: 'Reply with the single word: ok' }], max_tokens: 200 };
            const rs = await Promise.all(MODELS.map(m => ask(m, key, probe, 8000)));
            out.perModel = rs.map((r, i) => ({ model: MODELS[i], ok: r.ok, status: r.ok ? 200 : r.status, message: r.ok ? 'answered' : r.message }));
            out.liveTest = rs.some(r => r.ok) ? 'passed (at least one model answers)' : 'failed';
            if (!rs.some(r => r.ok)) out.hint = hintFor(rs);
        } else if (!key) out.hint = 'No OPENROUTER_API_KEY is visible to this function. Add it in Vercel (Settings > Environment Variables) and redeploy.';
        return res.status(200).json(out);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body || {};
    const incoming = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const messages = tidy(incoming
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content.slice(0, 1200) })));

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
        return res.status(400).json({ error: 'A user message is required' });
    }
    if (!key) return res.status(503).json({ error: 'AI not configured', hint: 'The server has no OPENROUTER_API_KEY (add it in Vercel, then redeploy).' });

    let context = '{}';
    try { context = JSON.stringify(body.context || {}).slice(0, 6000); } catch (e) { /* ignore */ }
    const page = typeof body.page === 'string' ? body.page.slice(0, 20) : 'overview';
    const system = `${SYSTEM_PROMPT}\n\nThe user is currently on the "${page}" page.\nCONTEXT (their saved Track My Fin data): ${context}`;
    const payload = { messages: [{ role: 'system', content: system }, ...messages], max_tokens: 450, temperature: 0.5 };

    const started = Date.now(), attempts = [];
    for (const model of MODELS) {
        const left = BUDGET_MS - (Date.now() - started);
        if (left < 1500) break;
        const r = await ask(model, key, payload, Math.min(left, 4500));
        if (r.ok) return res.status(200).json({ reply: r.reply, source: 'ai' });
        console.warn(`Fin: ${model} failed (${r.status}) ${r.message}`);
        attempts.push(r);
        if (r.status === 401 || r.status === 403) break; // a bad key will not get better with another model
    }
    // The browser answers from the user's saved figures when it receives a 503, and shows this reason
    return res.status(503).json({ error: 'AI temporarily unavailable', hint: hintFor(attempts), attempts });
}