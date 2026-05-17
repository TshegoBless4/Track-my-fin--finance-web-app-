// ============================================
// TRACK MY FIN - BATCH PROCESSING WITH POST-REVIEW
// Transactions are saved first, then user can review flagged ones
// ============================================

// ============================================
// API CONFIGURATION - USING VERCEL PROXY (SAFE)
// Your API key is stored on Vercel server, NOT in this file
// ============================================

// Determine which API URL to use (local vs production)
const isLocal = window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1' ||
                window.location.hostname.includes('vercel.app') === false;

// Vercel proxy URL - change 'track-my-fin' to your actual Vercel project name
const VERCEL_PROXY_URL = 'https://track-my-fin.vercel.app/api/categorize';

// For local development with Vercel CLI, use localhost
const LOCAL_PROXY_URL = 'http://localhost:3000/api/categorize';

// Use the appropriate URL
const API_URL = isLocal ? LOCAL_PROXY_URL : VERCEL_PROXY_URL;

// For GitHub Pages, we use the proxy (API key is safe on Vercel server)
// For local testing, you need to run `vercel dev` to test the proxy locally
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
        } catch(e) {
            console.error('Failed to load data', e);
        }
    }
    updateAll();
}

function saveData() {
    localStorage.setItem('trackmyfin_data', JSON.stringify(transactions));
}

// ============================================
// AI API CALL - USING VERCEL PROXY (SAFE)
// API key is stored on Vercel server, never exposed to browser
// ============================================
async function categorizeWithAPI(description, amount) {
    if (!USE_REAL_API) return null;
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: description,
                amount: amount
            })
        });
        
        if (!response.ok) {
            console.error('Proxy error:', response.status);
            return null;
        }
        
        const data = await response.json();
        
        if (data.category) {
            return { 
                category: data.category, 
                confidence: data.confidence || 0.8 
            };
        }
        
        return null;
        
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

// ============================================
// KEYWORD FALLBACK WITH CONFIDENCE
// ============================================
function categorizeWithKeywords(description) {
    const desc = description.toLowerCase();
    
    // Income keywords
    if (desc.includes('salary') || desc.includes('deposit') || 
        desc.includes('income') || desc.includes('wage') ||
        desc.includes('payment received') || desc.includes('freelance')) {
        return { category: 'Income', confidence: 0.9 };
    }
    
    // Essential keywords (South African focused)
    if (desc.includes('checkers') || desc.includes('pick n pay') || 
        desc.includes('shoprite') || desc.includes('woolworths') ||
        desc.includes('grocery') || desc.includes('rent') ||
        desc.includes('medication') || desc.includes('electricity') ||
        desc.includes('water') || desc.includes('medical aid') ||
        desc.includes('school fees') || desc.includes('transport') ||
        desc.includes('petrol') || desc.includes('fuel')) {
        return { category: 'Essential', confidence: 0.85 };
    }
    
    // Financial keywords (South African banks)
    if (desc.includes('capitec') || desc.includes('fnb') || 
        desc.includes('nedbank') || desc.includes('standard bank') ||
        desc.includes('absa') || desc.includes('bank fee') ||
        desc.includes('insurance') || desc.includes('loan') ||
        desc.includes('credit card') || desc.includes('interest')) {
        return { category: 'Financial', confidence: 0.85 };
    }
    
    // Low confidence for ambiguous or mall transactions
    if (desc.includes('payment') || desc.includes('transfer') || desc.includes('mall') ||
        desc.includes('online') || desc.includes('shopping')) {
        return { category: 'Lifestyle', confidence: 0.4 };
    }
    
    // Default
    return { category: 'Lifestyle', confidence: 0.5 };
}

// ============================================
// CHECK IF NEEDS REVIEW
// ============================================
function needsReview(confidence, description) {
    const desc = description.toLowerCase();
    // Always flag ambiguous transactions
    if (desc.includes('payment') || desc.includes('transfer') || desc.includes('online')) {
        return true;
    }
    // Flag low confidence
    return confidence < 0.7;
}

// ============================================
// MAIN CATEGORIZATION (API first, fallback second)
// ============================================
async function categorizeTransaction(description, amount) {
    let result;
    
    // Try API first if enabled
    if (USE_REAL_API) {
        const apiResult = await categorizeWithAPI(description, amount);
        if (apiResult) {
            result = apiResult;
        } else {
            result = categorizeWithKeywords(description);
        }
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
    const originalText = addBtn.innerText;
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
        source: USE_REAL_API ? 'api' : 'fallback'
    });
    
    saveData();
    updateAll();
    
    addBtn.innerText = originalText;
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
        const originalText = uploadBtn.innerText;
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
                        source: USE_REAL_API ? 'api' : 'fallback'
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
        
        uploadBtn.innerText = originalText;
        uploadBtn.disabled = false;
        
        if (needsReviewCount > 0) {
            showToast(`✅ Added ${addedCount} transactions. ${needsReviewCount} need review.`, 'warning');
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
            background: rgba(230, 184, 92, 0.9);
            backdrop-filter: blur(10px);
            color: #2c2c2a;
            padding: 14px 22px;
            border-radius: 50px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 1px solid rgba(255,255,255,0.3);
        `;
        const container = document.querySelector('.container');
        const summaryCards = document.querySelector('.summary-cards');
        container.insertBefore(banner, summaryCards);
    }
    
    banner.innerHTML = `
        <span>⚠️ ${count} transaction${count > 1 ? 's' : ''} need review (low confidence)</span>
        <button onclick="showPendingReviews()" style="background:#726772; padding: 8px 18px; border-radius: 40px;">Review Now</button>
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
            background: rgba(100, 90, 100, 0.3);
            backdrop-filter: blur(8px);
            display: flex; align-items: center;
            justify-content: center; z-index: 1000; overflow-y: auto;
        `;
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div style="background: rgba(255,255,255,0.25); backdrop-filter: blur(20px); padding: 28px; border-radius: 36px; max-width: 600px; width: 90%; max-height: 80%; overflow-y: auto; border: 1px solid rgba(255,255,255,0.4);">
            <h3 style="color: #726772;">⚠️ Review Transactions (${pendingTransactions.length})</h3>
            <p style="margin-bottom: 15px; color: rgba(255,255,255,0.8);">These transactions have low confidence scores. Please verify each one.</p>
            
            <div id="pendingReviewsList">
                ${pendingTransactions.map(t => `
                    <div id="review-${t.id}" style="border: 1px solid rgba(255,255,255,0.2); padding: 15px; margin-bottom: 12px; border-radius: 24px; background: rgba(255,255,255,0.1);">
                        <p><strong>${escapeHtml(t.description)}</strong></p>
                        <p>Amount: R${Math.abs(t.amount).toFixed(2)} | Confidence: ${Math.round(t.confidence * 100)}%</p>
                        <p>Suggested: <strong>${t.category}</strong></p>
                        <select id="cat-${t.id}" style="padding: 8px; border-radius: 40px; margin-top: 8px;">
                            <option ${t.category === 'Essential' ? 'selected' : ''}>Essential</option>
                            <option ${t.category === 'Lifestyle' ? 'selected' : ''}>Lifestyle</option>
                            <option ${t.category === 'Financial' ? 'selected' : ''}>Financial</option>
                            <option ${t.category === 'Income' ? 'selected' : ''}>Income</option>
                        </select>
                        <button onclick="approveTransaction(${t.id})" style="margin-left: 10px; padding: 6px 18px;">✓ Approve</button>
                    </div>
                `).join('')}
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button onclick="approveAllPending()" style="flex:1;">✅ Approve All</button>
                <button onclick="closeReviewModal()" style="flex:1; background: rgba(200,170,170,0.5);">Close</button>
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
        
        const element = document.getElementById(`review-${id}`);
        if (element) element.remove();
        
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
        btn.style.background = showOnlyPending ? '#e07a5f' : '#726772';
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
        <div class="transaction-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.2); flex-wrap: wrap; gap: 8px; background: rgba(255,255,255,0.12); backdrop-filter: blur(8px); border-radius: 24px; margin-bottom: 10px;">
            <span style="min-width: 100px; font-size: 12px; color: rgba(255,255,255,0.7);">${t.date}</span>
            <span style="flex: 2; font-weight: 500; color: rgba(255,255,255,0.9);">${escapeHtml(t.description.substring(0, 40))}</span>
            <span style="min-width: 100px; text-align: right; font-weight: 600; color: ${t.amount > 0 ? '#8aa68b' : '#e07a5f'}">
                ${t.amount > 0 ? '+' : ''}R${Math.abs(t.amount).toFixed(2)}
            </span>
            <select onchange="updateTransactionCategory(${t.id}, this.value)" style="padding: 5px 12px; border-radius: 30px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3);">
                <option ${t.category === 'Essential' ? 'selected' : ''}>Essential</option>
                <option ${t.category === 'Lifestyle' ? 'selected' : ''}>Lifestyle</option>
                <option ${t.category === 'Financial' ? 'selected' : ''}>Financial</option>
                <option ${t.category === 'Income' ? 'selected' : ''}>Income</option>
            </select>
            ${t.needsReview && !t.reviewed ? '<span style="background:#e07a5f; color:white; padding:2px 10px; border-radius: 20px; font-size:10px;">⚠️ Needs Review</span>' : ''}
            ${t.reviewed && t.source === 'user_reviewed' ? '<span style="font-size:10px; color:#8aa68b;">✓ Reviewed</span>' : ''}
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
                backgroundColor: ['#726772', '#9e8e9e', '#c4b4b4'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.8)' } } } }
    });
}

function showToast(message, type) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `position: fixed; bottom: 25px; right: 25px; padding: 12px 24px; border-radius: 50px; z-index: 1000; background: rgba(255,255,255,0.25); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.4); color: #5a4a5a; font-weight: 500; animation: fadeOut 3s forwards;`;
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
    const filterContainer = document.querySelector('.flex-between');
    if (filterContainer && !document.getElementById('filterPendingBtn')) {
        const btn = document.createElement('button');
        btn.id = 'filterPendingBtn';
        btn.innerText = 'Show Pending Only';
        btn.style.cssText = 'background: #726772; padding: 6px 16px; font-size: 12px; border-radius: 30px; margin-right: 10px;';
        btn.onclick = toggleShowPending;
        filterContainer.insertBefore(btn, filterContainer.children[1]);
    }
}

// ============================================
// SAMPLE DATA
// ============================================
function loadSampleData() {
    if (transactions.length === 0) {
        transactions = [
            { id: 1, date: '2026-05-10', description: 'Salary Deposit', amount: 18500, category: 'Income', confidence: 0.95, needsReview: false, reviewed: true, source: 'sample' },
            { id: 2, date: '2026-05-09', description: 'Checkers Groceries', amount: -845.50, category: 'Essential', confidence: 0.9, needsReview: false, reviewed: true, source: 'sample' },
            { id: 3, date: '2026-05-08', description: 'H&M Clearwater Mall', amount: -320, category: 'Lifestyle', confidence: 0.45, needsReview: true, reviewed: false, source: 'sample' },
            { id: 4, date: '2026-05-07', description: 'Online Payment', amount: -500, category: 'Lifestyle', confidence: 0.3, needsReview: true, reviewed: false, source: 'sample' }
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
    console.log('✅ Track My Fin ready.');
    if (!USE_REAL_API) {
        console.log('⚠️ API disabled - using keyword fallback');
    } else {
        console.log('🤖 API enabled - using Vercel proxy');
    }
}

init();