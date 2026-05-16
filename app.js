// ============================================
// TRACK MY FIN - BATCH PROCESSING WITH POST-REVIEW
// Transactions are saved first, then user can review flagged ones
// ============================================

// ============================================
// API CONFIGURATION (OpenRouter)
// ============================================
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = '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';

let USE_REAL_API = true;

// ============================================
// DATA STORAGE
// ============================================
let transactions = [];
let categoryChart = null;

function loadData() {
    const saved = localStorage.getItem('trackmyfin_data');
    if (saved) {
        try {
            transactions = JSON.parse(saved);
        } catch(e) {}
    }
    updateAll();
}

function saveData() {
    localStorage.setItem('trackmyfin_data', JSON.stringify(transactions));
}

// ============================================
// AI API CALL WITH CONFIDENCE SCORING
// ============================================
async function categorizeWithAPI(description, amount) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'HTTP-Referer': 'https://trackmyfin.demo',
                'X-Title': 'Track My Fin'
            },
            body: JSON.stringify({
                model: 'deepseek/deepseek-r1:free',
                messages: [
                    {
                        role: 'system',
                        content: `You are a financial categorizer. Return ONLY a JSON object with "category" and "confidence" (0-1).
                        
Category: Essential, Lifestyle, Financial, or Income.
Confidence: How certain are you? (1.0 = completely certain, 0.5 = unsure, 0.0 = no idea)

Return JSON like: {"category":"Lifestyle","confidence":0.85}`
                    },
                    {
                        role: 'user',
                        content: `Transaction: "${description}" for R${Math.abs(amount)}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 60
            })
        });

        if (!response.ok) return null;
        const data = await response.json();
        let result = data.choices[0].message.content.trim();
        result = result.replace(/```json/g, '').replace(/```/g, '');
        const parsed = JSON.parse(result);
        return { category: parsed.category, confidence: parsed.confidence || 0.7 };
        
    } catch (error) {
        return null;
    }
}

// ============================================
// KEYWORD FALLBACK WITH CONFIDENCE
// ============================================
function categorizeWithKeywords(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('salary') || desc.includes('deposit')) {
        return { category: 'Income', confidence: 0.9 };
    }
    if (desc.includes('checkers') || desc.includes('pick n pay') || desc.includes('shoprite')) {
        return { category: 'Essential', confidence: 0.85 };
    }
    if (desc.includes('fee') || desc.includes('bank') || desc.includes('insurance')) {
        return { category: 'Financial', confidence: 0.85 };
    }
    if (desc.includes('payment') || desc.includes('transfer') || desc.includes('mall')) {
        return { category: 'Lifestyle', confidence: 0.4 };
    }
    return { category: 'Lifestyle', confidence: 0.5 };
}

// ============================================
// CHECK IF NEEDS REVIEW
// ============================================
function needsReview(confidence, description) {
    const desc = description.toLowerCase();
    if (desc.includes('payment') || desc.includes('transfer')) {
        return true;
    }
    return confidence < 0.7;
}

// ============================================
// MAIN CATEGORIZATION
// ============================================
async function categorizeTransaction(description, amount) {
    let result;
    if (USE_REAL_API && API_KEY) {
        const apiResult = await categorizeWithAPI(description, amount);
        result = apiResult || categorizeWithKeywords(description);
    } else {
        result = categorizeWithKeywords(description);
    }
    
    return {
        category: result.category,
        confidence: result.confidence,
        needsReview: needsReview(result.confidence, description)
    };
}

// ============================================
// ADD SINGLE TRANSACTION
// ============================================
async function addTransaction() {
    const description = document.getElementById('descInput').value.trim();
    let amount = parseFloat(document.getElementById('amountInput').value);
    const type = document.getElementById('typeSelect').value;
    
    if (!description || isNaN(amount) || amount === 0) {
        alert('Please enter a valid description and amount');
        return;
    }
    
    if (type === 'expense' && amount > 0) amount = -amount;
    if (type === 'income' && amount < 0) amount = Math.abs(amount);
    
    const addBtn = event.target;
    addBtn.innerText = '🤖 Analyzing...';
    addBtn.disabled = true;
    
    const result = await categorizeTransaction(description, amount);
    
    transactions.unshift({
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        description: description,
        amount: amount,
        category: result.category,
        confidence: result.confidence,
        needsReview: result.needsReview,
        reviewed: !result.needsReview,
        source: 'api'
    });
    
    saveData();
    updateAll();
    
    addBtn.innerText = 'Add Transaction';
    addBtn.disabled = false;
    
    if (result.needsReview) {
        showToast(`⚠️ "${description.substring(0, 30)}" needs review (${Math.round(result.confidence*100)}% confidence)`, 'warning');
    } else {
        showToast(`✅ Added: ${description.substring(0, 30)} → ${result.category}`, 'success');
    }
    
    document.getElementById('descInput').value = '';
    document.getElementById('amountInput').value = '';
}

// ============================================
// UPLOAD CSV - BATCH PROCESS (NO INTERRUPTIONS)
// ============================================
async function uploadCSV() {
    const file = document.getElementById('csvFile').files[0];
    if (!file) {
        alert('Please select a CSV file');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const lines = e.target.result.split('\n');
        let addedCount = 0;
        let needsReviewCount = 0;
        
        const uploadBtn = event.target;
        uploadBtn.innerText = '🤖 Processing...';
        uploadBtn.disabled = true;
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = line.split(',');
            if (parts.length >= 3) {
                const date = parts[0].replace(/"/g, '').trim();
                const description = parts[1].replace(/"/g, '').trim();
                const amount = parseFloat(parts[2].replace(/"/g, '').trim());
                
                if (!isNaN(amount) && description) {
                    const result = await categorizeTransaction(description, amount);
                    
                    transactions.unshift({
                        id: Date.now() + i,
                        date: date || new Date().toISOString().split('T')[0],
                        description: description,
                        amount: amount,
                        category: result.category,
                        confidence: result.confidence,
                        needsReview: result.needsReview,
                        reviewed: !result.needsReview,
                        source: 'api'
                    });
                    
                    addedCount++;
                    if (result.needsReview) needsReviewCount++;
                    
                    if (addedCount % 5 === 0) {
                        uploadBtn.innerText = `🤖 Processed ${addedCount}...`;
                    }
                }
            }
        }
        
        saveData();
        updateAll();
        
        uploadBtn.innerText = 'Process Statement';
        uploadBtn.disabled = false;
        
        // Show summary with review count
        if (needsReviewCount > 0) {
            showToast(`✅ Added ${addedCount} transactions. ${needsReviewCount} need review. Click "Show Pending Reviews" to fix.`, 'warning');
            showReviewBanner(needsReviewCount);
        } else {
            showToast(`✅ Added ${addedCount} transactions. All good!`, 'success');
        }
        
        document.getElementById('csvFile').value = '';
    };
    reader.readAsText(file);
}

// ============================================
// SHOW REVIEW BANNER
// ============================================
function showReviewBanner(count) {
    let banner = document.getElementById('reviewBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'reviewBanner';
        banner.style.cssText = `
            background: #e6b85c; color: #2c2c2a; padding: 12px 20px; 
            border-radius: 8px; margin-bottom: 20px; 
            display: flex; justify-content: space-between; align-items: center;
        `;
        const container = document.querySelector('.container');
        const summaryCards = document.querySelector('.summary-cards');
        container.insertBefore(banner, summaryCards);
    }
    
    banner.innerHTML = `
        <span>⚠️ ${count} transaction${count > 1 ? 's' : ''} need review (low confidence)</span>
        <button onclick="showPendingReviews()" style="background:#2c7a6e; padding: 5px 15px;">Review Now</button>
    `;
    banner.style.display = 'flex';
}

function hideReviewBanner() {
    const banner = document.getElementById('reviewBanner');
    if (banner) banner.style.display = 'none';
}

// ============================================
// SHOW PENDING REVIEWS MODAL
// ============================================
function showPendingReviews() {
    const pendingTransactions = transactions.filter(t => t.needsReview && !t.reviewed);
    
    if (pendingTransactions.length === 0) {
        hideReviewBanner();
        showToast('No pending reviews!', 'success');
        return;
    }
    
    let modal = document.getElementById('reviewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reviewModal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; align-items: center;
            justify-content: center; z-index: 1000; overflow-y: auto;
        `;
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div style="background: white; padding: 25px; border-radius: 16px; max-width: 600px; width: 90%; max-height: 80%; overflow-y: auto;">
            <h3 style="color: #e07a5f;">⚠️ Review Transactions (${pendingTransactions.length})</h3>
            <p style="margin-bottom: 15px;">These transactions have low confidence scores. Please verify each one.</p>
            
            <div id="pendingReviewsList">
                ${pendingTransactions.map(t => `
                    <div id="review-${t.id}" style="border: 1px solid #eee; padding: 12px; margin-bottom: 10px; border-radius: 8px;">
                        <p><strong>${escapeHtml(t.description)}</strong></p>
                        <p>Amount: R${Math.abs(t.amount).toFixed(2)} | Confidence: ${Math.round(t.confidence * 100)}%</p>
                        <p>Suggested: <strong>${t.category}</strong></p>
                        <select id="cat-${t.id}" style="padding: 5px; border-radius: 8px;">
                            <option ${t.category === 'Essential' ? 'selected' : ''}>Essential</option>
                            <option ${t.category === 'Lifestyle' ? 'selected' : ''}>Lifestyle</option>
                            <option ${t.category === 'Financial' ? 'selected' : ''}>Financial</option>
                            <option ${t.category === 'Income' ? 'selected' : ''}>Income</option>
                        </select>
                        <button onclick="approveTransaction(${t.id})" style="margin-left: 10px; padding: 5px 15px;">✓ Approve</button>
                    </div>
                `).join('')}
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button onclick="approveAllPending()" style="flex:1;">✅ Approve All</button>
                <button onclick="closeReviewModal()" style="flex:1; background:#888;">Close</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function approveTransaction(id) {
    const transaction = transactions.find(t => t.id === id);
    if (transaction) {
        const newCategory = document.getElementById(`cat-${id}`).value;
        transaction.category = newCategory;
        transaction.needsReview = false;
        transaction.reviewed = true;
        transaction.source = 'user_reviewed';
        saveData();
        
        // Remove from modal list
        const element = document.getElementById(`review-${id}`);
        if (element) element.remove();
        
        // Check if all are done
        const remaining = document.querySelectorAll('#pendingReviewsList > div').length;
        if (remaining === 0) {
            closeReviewModal();
            hideReviewBanner();
            updateAll();
            showToast('All transactions reviewed!', 'success');
        } else {
            updateAll();
        }
    }
}

function approveAllPending() {
    const pending = transactions.filter(t => t.needsReview && !t.reviewed);
    pending.forEach(t => {
        t.needsReview = false;
        t.reviewed = true;
        t.source = 'user_reviewed';
    });
    saveData();
    updateAll();
    closeReviewModal();
    hideReviewBanner();
    showToast(`✅ Approved all ${pending.length} transactions`, 'success');
}

function closeReviewModal() {
    const modal = document.getElementById('reviewModal');
    if (modal) modal.style.display = 'none';
}

// ============================================
// EDIT TRANSACTION (from list)
// ============================================
function updateTransactionCategory(id, newCategory) {
    const transaction = transactions.find(t => t.id === id);
    if (transaction) {
        transaction.category = newCategory;
        transaction.needsReview = false;
        transaction.reviewed = true;
        transaction.source = 'user_corrected';
        saveData();
        updateAll();
        showToast('Category updated', 'success');
        hideReviewBanner();
    }
}

// ============================================
// CLEAR DATA
// ============================================
function clearAllData() {
    if (confirm('Delete ALL transactions?')) {
        transactions = [];
        saveData();
        updateAll();
        hideReviewBanner();
        showToast('All data cleared', 'success');
    }
}

// ============================================
// SHOW ONLY PENDING REVIEWS (filter)
// ============================================
let showOnlyPending = false;

function toggleShowPending() {
    showOnlyPending = !showOnlyPending;
    updateTransactionList();
    const btn = document.getElementById('filterPendingBtn');
    if (btn) {
        btn.style.background = showOnlyPending ? '#e07a5f' : '#2c7a6e';
        btn.innerText = showOnlyPending ? 'Show All' : 'Show Pending Only';
    }
}

// ============================================
// UPDATE UI
// ============================================
function updateAll() {
    updateSummary();
    updateTransactionList();
    updateChart();
    
    // Update banner
    const pendingCount = transactions.filter(t => t.needsReview && !t.reviewed).length;
    if (pendingCount > 0) {
        showReviewBanner(pendingCount);
    } else {
        hideReviewBanner();
    }
}

function updateSummary() {
    let income = 0, expense = 0;
    transactions.forEach(t => {
        if (t.amount > 0) income += t.amount;
        else expense += Math.abs(t.amount);
    });
    document.getElementById('incomeAmount').innerHTML = `R${income.toFixed(2)}`;
    document.getElementById('expenseAmount').innerHTML = `R${expense.toFixed(2)}`;
    document.getElementById('remainingAmount').innerHTML = `R${(income - expense).toFixed(2)}`;
}

function updateTransactionList() {
    const container = document.getElementById('transactionList');
    let filtered = [...transactions];
    if (showOnlyPending) {
        filtered = filtered.filter(t => t.needsReview && !t.reviewed);
    }
    filtered = filtered.slice(0, 50);
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">📭 No transactions to show.</div>';
        return;
    }
    
    container.innerHTML = filtered.map(t => `
        <div class="transaction-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 8px; ${t.needsReview && !t.reviewed ? 'background: #fff3cd;' : ''}">
            <span style="min-width: 100px; font-size: 12px;">${t.date}</span>
            <span style="flex: 2; font-weight: 500;">${escapeHtml(t.description.substring(0, 40))}</span>
            <span style="min-width: 100px; text-align: right; font-weight: 600; color: ${t.amount > 0 ? '#8aa68b' : '#e07a5f'}">
                ${t.amount > 0 ? '+' : ''}R${Math.abs(t.amount).toFixed(2)}
            </span>
            <select onchange="updateTransactionCategory(${t.id}, this.value)" style="padding: 5px 10px; border-radius: 20px;">
                <option ${t.category === 'Essential' ? 'selected' : ''}>Essential</option>
                <option ${t.category === 'Lifestyle' ? 'selected' : ''}>Lifestyle</option>
                <option ${t.category === 'Financial' ? 'selected' : ''}>Financial</option>
                <option ${t.category === 'Income' ? 'selected' : ''}>Income</option>
            </select>
            ${t.needsReview && !t.reviewed ? '<span style="background:#e07a5f; color:white; padding:2px 8px; border-radius:12px; font-size:10px;">⚠️ Needs Review</span>' : ''}
            ${t.reviewed && t.source === 'user_reviewed' ? '<span style="font-size:10px; color:#2c7a6e;">✓ Reviewed</span>' : ''}
        </div>
    `).join('');
}

function updateChart() {
    let essential = 0, lifestyle = 0, financial = 0;
    transactions.forEach(t => {
        if (t.amount < 0) {
            if (t.category === 'Essential') essential += Math.abs(t.amount);
            else if (t.category === 'Lifestyle') lifestyle += Math.abs(t.amount);
            else if (t.category === 'Financial') financial += Math.abs(t.amount);
            else lifestyle += Math.abs(t.amount);
        }
    });
    
    document.getElementById('essentialAmount').innerHTML = `R${essential.toFixed(2)}`;
    document.getElementById('lifestyleAmount').innerHTML = `R${lifestyle.toFixed(2)}`;
    document.getElementById('financialAmount').innerHTML = `R${financial.toFixed(2)}`;
    
    const ctx = document.getElementById('categoryChart').getContext('2d');
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Essential', 'Lifestyle', 'Financial'],
            datasets: [{
                data: [essential, lifestyle, financial],
                backgroundColor: ['#2c7a6e', '#e6b85c', '#e07a5f'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
    });
}

function showToast(message, type) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `position: fixed; bottom: 20px; right: 20px; padding: 12px 20px; border-radius: 8px; z-index: 1000; background: ${type === 'warning' ? '#e6b85c' : '#2c7a6e'}; color: ${type === 'warning' ? '#2c2c2a' : 'white'}; animation: fadeOut 3s forwards;`;
        document.body.appendChild(toast);
    }
    toast.innerText = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// ADD FILTER BUTTON TO HTML
// ============================================
function addFilterButton() {
    const container = document.querySelector('.section h3');
    if (container && !document.getElementById('filterPendingBtn')) {
        const btn = document.createElement('button');
        btn.id = 'filterPendingBtn';
        btn.innerText = 'Show Pending Only';
        btn.style.cssText = 'float: right; background: #2c7a6e; padding: 5px 12px; font-size: 12px;';
        btn.onclick = toggleShowPending;
        container.parentElement.querySelector('.flex-between').appendChild(btn);
    }
}

// ============================================
// SAMPLE DATA
// ============================================
function loadSampleData() {
    if (transactions.length === 0) {
        transactions = [
            { id: 1, date: '2026-05-10', description: 'Salary Deposit', amount: 18500, category: 'Income', confidence: 0.95, needsReview: false, reviewed: true, source: 'api' },
            { id: 2, date: '2026-05-09', description: 'Checkers Groceries', amount: -845.50, category: 'Essential', confidence: 0.9, needsReview: false, reviewed: true, source: 'api' },
            { id: 3, date: '2026-05-08', description: 'H&M Clearwater Mall', amount: -320, category: 'Lifestyle', confidence: 0.45, needsReview: true, reviewed: false, source: 'api' },
            { id: 4, date: '2026-05-07', description: 'Online Payment', amount: -500, category: 'Lifestyle', confidence: 0.3, needsReview: true, reviewed: false, source: 'api' }
        ];
        saveData();
    }
}

// ============================================
// INIT
// ============================================
function init() {
    loadData();
    loadSampleData();
    updateAll();
    addFilterButton();
    console.log('✅ Track My Fin ready. Transactions are saved first, then you can review flagged ones.');
}

init();