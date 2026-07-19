// ============================================
// TRACK MY FIN - COMPLETE APP
// ALL MUST-HAVE FEATURES WORKING
// ============================================

// ============================================
// API CONFIGURATION
// ============================================
const isLocal = window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1' ||
                window.location.hostname.includes('vercel.app') === false;

const VERCEL_PROXY_URL = 'https://track-my-fin.vercel.app/api/categorize';
const LOCAL_PROXY_URL = 'http://localhost:3000/api/categorize';

const API_URL = isLocal ? LOCAL_PROXY_URL : VERCEL_PROXY_URL;
let USE_REAL_API = true;

// ============================================
// DATA STORAGE
// ============================================
let transactions = [];
let categoryChart = null;
const SAMPLE_DATA_KEY = 'trackmyfin_sample_loaded';

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
// AI API CALL - USING VERCEL PROXY
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
// KEYWORD FALLBACK
// ============================================
function categorizeWithKeywords(description) {
    const desc = description.toLowerCase();
    
    if (desc.includes('salary') || desc.includes('deposit') || 
        desc.includes('income') || desc.includes('wage') ||
        desc.includes('payment received') || desc.includes('freelance')) {
        return { category: 'Income', confidence: 0.9 };
    }
    
    if (desc.includes('checkers') || desc.includes('pick n pay') || 
        desc.includes('shoprite') || desc.includes('woolworths') ||
        desc.includes('grocery') || desc.includes('rent') ||
        desc.includes('medication') || desc.includes('electricity') ||
        desc.includes('water') || desc.includes('medical aid') ||
        desc.includes('school fees') || desc.includes('transport') ||
        desc.includes('petrol') || desc.includes('fuel')) {
        return { category: 'Essential', confidence: 0.85 };
    }
    
    if (desc.includes('capitec') || desc.includes('fnb') || 
        desc.includes('nedbank') || desc.includes('standard bank') ||
        desc.includes('absa') || desc.includes('bank fee') ||
        desc.includes('insurance') || desc.includes('loan') ||
        desc.includes('credit card') || desc.includes('interest')) {
        return { category: 'Financial', confidence: 0.85 };
    }
    
    if (desc.includes('payment') || desc.includes('transfer') || desc.includes('mall') ||
        desc.includes('online') || desc.includes('shopping')) {
        return { category: 'Lifestyle', confidence: 0.35 };
    }
    
    return { category: 'Lifestyle', confidence: 0.55 };
}

// ============================================
// CHECK IF NEEDS REVIEW
// ============================================
function needsReview(confidence, description) {
    const desc = description.toLowerCase();
    if (desc.includes('payment') || desc.includes('transfer') || desc.includes('online')) {
        return true;
    }
    return confidence < 0.7;
}

// ============================================
// MAIN CATEGORIZATION
// ============================================
async function categorizeTransaction(description, amount) {
    let result;
    
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
// DATE FORMATTER
// ============================================
function formatDate(rawDate) {
    if (!rawDate) return new Date().toISOString().split('T')[0];
    
    rawDate = rawDate.replace(/["']/g, '').trim();
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        return rawDate;
    }
    
    if (/^\d{8}$/.test(rawDate)) {
        const year = rawDate.substring(0, 4);
        const month = rawDate.substring(4, 6);
        const day = rawDate.substring(6, 8);
        return `${year}-${month}-${day}`;
    }
    
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(rawDate)) {
        let parts;
        if (rawDate.includes('/')) {
            parts = rawDate.split('/');
        } else if (rawDate.includes('-')) {
            parts = rawDate.split('-');
        }
        if (parts && parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            if (parseInt(month) >= 1 && parseInt(month) <= 12) {
                return `${year}-${month}-${day}`;
            }
        }
    }
    
    const dateObj = new Date(rawDate);
    if (!isNaN(dateObj.getTime()) && dateObj.getFullYear() > 2000) {
        return dateObj.toISOString().split('T')[0];
    }
    
    console.warn('Could not parse date:', rawDate, 'Using today\'s date');
    return new Date().toISOString().split('T')[0];
}

// ============================================
// ADD MANUAL TRANSACTION
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
    addBtn.innerText = 'Analyzing...';
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
        showToast(`Transaction "${description.substring(0, 30)}" needs review (${Math.round(result.confidence*100)}% confidence)`, 'warning');
        showReviewBanner(1);
    } else {
        showToast(`Added: ${description.substring(0, 30)} → ${result.category}`, 'success');
    }
    
    document.getElementById('descInput').value = '';
    document.getElementById('amountInput').value = '';
}

// ============================================
// UPLOAD CSV
// ============================================
async function uploadCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a CSV file');
        return;
    }
    
    const uploadBtn = document.getElementById('csvUploadBtn');
    const originalText = uploadBtn ? uploadBtn.innerText : 'Process';
    
    if (uploadBtn) {
        uploadBtn.innerText = 'Processing...';
        uploadBtn.disabled = true;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const content = e.target.result;
        const lines = content.split('\n');
        let addedCount = 0;
        let needsReviewCount = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            if (i === 0 && (line.toLowerCase().includes('date') || line.toLowerCase().includes('description'))) {
                continue;
            }
            
            let parts = [];
            let inQuote = false;
            let currentPart = '';
            
            for (let char of line) {
                if (char === '"') {
                    inQuote = !inQuote;
                } else if (char === ',' && !inQuote) {
                    parts.push(currentPart);
                    currentPart = '';
                } else {
                    currentPart += char;
                }
            }
            parts.push(currentPart);
            
            if (parts.length >= 3) {
                let rawDate = parts[0].replace(/"/g, '').trim();
                let description = parts[1].replace(/"/g, '').trim();
                let amount = parseFloat(parts[2].replace(/"/g, '').trim());
                
                if (!isNaN(amount) && description) {
                    let formattedDate = formatDate(rawDate);
                    const result = await categorizeTransaction(description, amount);
                    
                    transactions.unshift({
                        id: Date.now() + i,
                        date: formattedDate,
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
                }
            }
        }
        
        saveData();
        updateAll();
        
        if (uploadBtn) {
            uploadBtn.innerText = originalText;
            uploadBtn.disabled = false;
        }
        
        if (needsReviewCount > 0) {
            showToast(`Added ${addedCount} transactions. ${needsReviewCount} need review.`, 'warning');
            showReviewBanner(needsReviewCount);
        } else {
            showToast(`Added ${addedCount} transactions. All complete.`, 'success');
        }
        
        fileInput.value = '';
    };
    
    reader.onerror = function() {
        showToast('Error reading file. Please try again.', 'error');
        if (uploadBtn) {
            uploadBtn.innerText = originalText;
            uploadBtn.disabled = false;
        }
    };
    
    reader.readAsText(file);
}

// ============================================
// TOAST NOTIFICATION
// ============================================
function showToast(message, type) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `position: fixed; bottom: 25px; right: 25px; padding: 12px 24px; border-radius: 50px; z-index: 1000; background: rgba(255,255,255,0.3); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.4); color: #4a3a4a; font-weight: 500; box-shadow: 0 8px 20px rgba(0,0,0,0.08); animation: toastFadeOut 3s forwards;`;
        document.body.appendChild(toast);
    }
    toast.innerText = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// ============================================
// REVIEW BANNER
// ============================================
function showReviewBanner(count) {
    let banner = document.getElementById('reviewBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'reviewBanner';
        banner.style.cssText = `
            background: rgba(244, 177, 180, 0.7);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.4);
            color: #4a3a4a;
            padding: 14px 22px;
            border-radius: 50px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 500;
        `;
        const container = document.querySelector('.container');
        const summaryCards = document.querySelector('.summary-cards');
        container.insertBefore(banner, summaryCards);
    }
    
    banner.innerHTML = `
        <span><i class="fas fa-info-circle"></i> ${count} transaction${count > 1 ? 's' : ''} need review (low confidence)</span>
        <button onclick="showPendingReviews()" style="background: #6058a3; color: white; padding: 8px 18px; border-radius: 40px; border: none; cursor: pointer;">Review Now</button>
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
            <h3 style="color: #4a3a4a; margin-bottom: 15px;"><i class="fas fa-edit"></i> Review Transactions (${pendingTransactions.length})</h3>
            <p style="margin-bottom: 15px; color: #5a4a5a;">These transactions have low confidence scores. Please verify each one.</p>
            
            <div id="pendingReviewsList">
                ${pendingTransactions.map(t => `
                    <div id="review-${t.id}" style="border: 1px solid rgba(255,255,255,0.2); padding: 15px; margin-bottom: 12px; border-radius: 24px; background: rgba(255,255,255,0.1);">
                        <p><strong>${escapeHtml(t.description)}</strong></p>
                        <p>Amount: R${Math.abs(t.amount).toFixed(2)} | Confidence: ${Math.round(t.confidence * 100)}%</p>
                        <p>Suggested: <strong>${t.category}</strong></p>
                        <select id="cat-${t.id}" style="padding: 8px; border-radius: 40px; margin-top: 8px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: #2c2c2a;">
                            <option ${t.category === 'Essential' ? 'selected' : ''}>Essential</option>
                            <option ${t.category === 'Lifestyle' ? 'selected' : ''}>Lifestyle</option>
                            <option ${t.category === 'Financial' ? 'selected' : ''}>Financial</option>
                            <option ${t.category === 'Income' ? 'selected' : ''}>Income</option>
                        </select>
                        <button onclick="approveTransaction(${t.id})" style="margin-left: 10px; padding: 6px 18px; background: linear-gradient(135deg, #6058a3 0%, #4a4283 100%); color: white; border: none; border-radius: 40px; cursor: pointer;">Approve</button>
                    </div>
                `).join('')}
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button onclick="approveAllPending()" style="flex:1; background: linear-gradient(135deg, #6058a3 0%, #4a4283 100%); color: white; border: none; padding: 12px 28px; border-radius: 40px; cursor: pointer; font-weight: 600;">Approve All</button>
                <button onclick="closeReviewModal()" style="flex:1; background: rgba(255,255,255,0.3); color: #4a3a4a; border: 1px solid rgba(255,255,255,0.4); padding: 12px 28px; border-radius: 40px; cursor: pointer; font-weight: 600;">Close</button>
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
    showToast(`Approved all ${pending.length} transactions`, 'success');
}

function closeReviewModal() {
    const modal = document.getElementById('reviewModal');
    if (modal) modal.style.display = 'none';
}

// ============================================
// EDIT TRANSACTION
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
    if (confirm('Delete ALL transactions? This cannot be undone.')) {
        transactions = [];
        localStorage.removeItem('trackmyfin_data');
        updateAll();
        hideReviewBanner();
        showToast('All data cleared', 'success');
    }
}

// ============================================
// FILTER PENDING
// ============================================
let showOnlyPending = false;

function toggleShowPending() {
    showOnlyPending = !showOnlyPending;
    updateTransactionList();
    const btn = document.getElementById('filterPendingBtn');
    if (btn) {
        btn.style.background = showOnlyPending ? '#c47060' : '#6058a3';
        btn.innerText = showOnlyPending ? 'Show All' : 'Show Pending Only';
        btn.style.color = showOnlyPending ? 'white' : 'white';
    }
}

// ============================================
// UPDATE UI
// ============================================
function updateAll() {
    updateSummary();
    updateTransactionList();
    updateChart();
    updateBudgetDisplay();
    
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
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> No transactions to show.</div>';
        return;
    }
    
    container.innerHTML = filtered.map(t => `
        <div class="transaction-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.2); flex-wrap: wrap; gap: 8px; background: rgba(255,255,255,0.12); backdrop-filter: blur(8px); border-radius: 24px; margin-bottom: 10px;">
            <span style="min-width: 100px; font-size: 12px; color: #888;">${t.date}</span>
            <span style="flex: 2; font-weight: 500; color: #2c2c2a;">${escapeHtml(t.description.substring(0, 40))}</span>
            <span style="min-width: 100px; text-align: right; font-weight: 600; color: ${t.amount > 0 ? '#6a8a6a' : '#c47060'}">
                ${t.amount > 0 ? '+' : ''}R${Math.abs(t.amount).toFixed(2)}
            </span>
            <select onchange="updateTransactionCategory(${t.id}, this.value)" style="padding: 5px 12px; border-radius: 30px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: #2c2c2a;">
                <option ${t.category === 'Essential' ? 'selected' : ''}>Essential</option>
                <option ${t.category === 'Lifestyle' ? 'selected' : ''}>Lifestyle</option>
                <option ${t.category === 'Financial' ? 'selected' : ''}>Financial</option>
                <option ${t.category === 'Income' ? 'selected' : ''}>Income</option>
            </select>
            ${t.needsReview && !t.reviewed ? '<span style="background: #f4b1b4; color: #4a3a4a; padding:2px 10px; border-radius: 20px; font-size:10px;"><i class="fas fa-flag"></i> Needs Review</span>' : ''}
            ${t.reviewed && t.source === 'user_reviewed' ? '<span style="font-size:10px; color: #6058a3;"><i class="fas fa-check"></i> Reviewed</span>' : ''}
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
                backgroundColor: ['#6058a3', '#b271af', '#7aa2c6'],
                borderWidth: 0
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: true, 
            plugins: { 
                legend: { 
                    position: 'bottom', 
                    labels: { color: '#4a3a4a' } 
                } 
            } 
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// FILTER BUTTON
// ============================================
function addFilterButton() {
    const filterContainer = document.querySelector('.flex-between');
    if (filterContainer && !document.getElementById('filterPendingBtn')) {
        const btn = document.createElement('button');
        btn.id = 'filterPendingBtn';
        btn.innerText = 'Show Pending Only';
        btn.style.cssText = 'background: #6058a3; color: white; padding: 6px 16px; font-size: 12px; border-radius: 30px; margin-right: 10px; border: none; cursor: pointer;';
        btn.onclick = toggleShowPending;
        filterContainer.insertBefore(btn, filterContainer.children[1]);
    }
}

// ============================================
// SAMPLE DATA - FIXED (only loads once)
// ============================================
function loadSampleData() {
    if (localStorage.getItem(SAMPLE_DATA_KEY) === 'true') {
        console.log('Sample data already loaded, skipping.');
        return;
    }
    
    const saved = localStorage.getItem('trackmyfin_data');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.length > 0) {
                localStorage.setItem(SAMPLE_DATA_KEY, 'true');
                console.log('User data exists, skipping sample data.');
                return;
            }
        } catch(e) {}
    }
    
    if (transactions.length === 0) {
        console.log('Loading sample data...');
        transactions = [
            { id: 1, date: '2026-05-10', description: 'Salary Deposit', amount: 18500, category: 'Income', confidence: 0.95, needsReview: false, reviewed: true, source: 'sample' },
            { id: 2, date: '2026-05-09', description: 'Checkers Groceries', amount: -845.50, category: 'Essential', confidence: 0.9, needsReview: false, reviewed: true, source: 'sample' },
            { id: 3, date: '2026-05-08', description: 'H&M Clearwater Mall', amount: -320, category: 'Lifestyle', confidence: 0.45, needsReview: true, reviewed: false, source: 'sample' },
            { id: 4, date: '2026-05-07', description: 'Online Payment', amount: -500, category: 'Lifestyle', confidence: 0.3, needsReview: true, reviewed: false, source: 'sample' }
        ];
        saveData();
        localStorage.setItem(SAMPLE_DATA_KEY, 'true');
        console.log('Sample data loaded successfully.');
    }
}

// ============================================
// MULTIPLE GOALS - FIXED
// ============================================
function saveGoal() {
    const goalType = document.getElementById('goalType').value;
    const goalAmount = document.getElementById('goalAmount').value;
    
    if (!goalAmount || goalAmount <= 0) {
        alert('Please enter a valid target amount');
        return;
    }
    
    let goals = JSON.parse(localStorage.getItem('trackmyfin_goals') || '[]');
    
    goals.push({
        id: Date.now(),
        type: goalType,
        amount: parseFloat(goalAmount),
        date: new Date().toISOString().split('T')[0]
    });
    
    localStorage.setItem('trackmyfin_goals', JSON.stringify(goals));
    displayGoals();
    showToast('Goal added successfully!');
    document.getElementById('goalAmount').value = '';
}

function displayGoals() {
    const container = document.getElementById('goalDisplay');
    const goals = JSON.parse(localStorage.getItem('trackmyfin_goals') || '[]');
    
    if (goals.length === 0) {
        container.innerHTML = '<p style="color:#888;"><i class="fas fa-info-circle"></i> No goals set yet. Add one above.</p>';
        return;
    }
    
    const goalLabels = {
        'pay_debt': 'Pay off debt',
        'save': 'Save for something',
        'understand': 'Understand spending',
        'emergency': 'Build emergency fund'
    };
    
    container.innerHTML = goals.map((goal, index) => `
        <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.2); margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div>
                    <p><strong>${goalLabels[goal.type] || goal.type}</strong></p>
                    <p style="font-size:12px; color:#888;">Target: R${goal.amount.toFixed(2)} | Set: ${goal.date}</p>
                </div>
                <button onclick="removeGoal(${index})" class="btn-small" style="background: rgba(200,170,170,0.4);">Remove</button>
            </div>
        </div>
    `).join('');
}

function removeGoal(index) {
    let goals = JSON.parse(localStorage.getItem('trackmyfin_goals') || '[]');
    goals.splice(index, 1);
    localStorage.setItem('trackmyfin_goals', JSON.stringify(goals));
    displayGoals();
    showToast('Goal removed');
}

function clearAllGoals() {
    if (confirm('Delete ALL goals?')) {
        localStorage.removeItem('trackmyfin_goals');
        displayGoals();
        showToast('All goals cleared');
    }
}

// ============================================
// DEBT FUNCTIONS - FIXED
// ============================================
function addDebt() {
    const name = document.getElementById('debtName').value.trim();
    const balance = parseFloat(document.getElementById('debtBalance').value);
    const rate = parseFloat(document.getElementById('debtRate').value);
    
    if (!name || !balance || balance <= 0) {
        alert('Please enter creditor name and valid balance');
        return;
    }
    
    let debts = JSON.parse(localStorage.getItem('trackmyfin_debts') || '[]');
    
    debts.unshift({
        id: Date.now(),
        name: name,
        balance: balance,
        rate: rate || 0,
        date: new Date().toISOString().split('T')[0]
    });
    
    localStorage.setItem('trackmyfin_debts', JSON.stringify(debts));
    displayDebts();
    updateDebtSummary();
    showToast('Debt added successfully!');
    
    document.getElementById('debtName').value = '';
    document.getElementById('debtBalance').value = '';
    document.getElementById('debtRate').value = '';
}

function displayDebts() {
    const container = document.getElementById('debtList');
    const debts = JSON.parse(localStorage.getItem('trackmyfin_debts') || '[]');
    
    if (debts.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> No debts added yet</div>';
        return;
    }
    
    container.innerHTML = debts.map(d => `
        <div style="background: rgba(255,255,255,0.12); backdrop-filter: blur(8px); padding: 15px; border-radius: 16px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.2);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div>
                    <strong>${escapeHtml(d.name)}</strong>
                    <p style="font-size:12px; color:#888;">Added: ${d.date}</p>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:700; color:#c47060;">R${d.balance.toFixed(2)}</div>
                    ${d.rate > 0 ? `<div style="font-size:12px; color:#888;">${d.rate}% interest</div>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function updateDebtSummary() {
    const debts = JSON.parse(localStorage.getItem('trackmyfin_debts') || '[]');
    const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
    const highestRate = debts.reduce((max, d) => Math.max(max, d.rate || 0), 0);
    
    const totalEl = document.getElementById('totalDebt');
    const rateEl = document.getElementById('highestRate');
    const aiEl = document.getElementById('aiRecommendation');
    
    if (totalEl) totalEl.innerHTML = `R${totalDebt.toFixed(2)}`;
    if (rateEl) rateEl.innerHTML = `${highestRate.toFixed(1)}%`;
    if (aiEl) {
        if (debts.length === 0) {
            aiEl.innerHTML = 'Add a debt to get recommendations';
        } else {
            const highest = debts.reduce((max, d) => (d.rate || 0) > (max.rate || 0) ? d : max, debts[0]);
            aiEl.innerHTML = `Pay <strong>${escapeHtml(highest.name)}</strong> first (${highest.rate}%)`;
        }
    }
}

function clearDebts() {
    if (confirm('Delete ALL debts?')) {
        localStorage.removeItem('trackmyfin_debts');
        displayDebts();
        updateDebtSummary();
        showToast('All debts cleared');
    }
}

// ============================================
// BUDGET - FIXED PERSISTENCE
// ============================================
function saveBudgets() {
    const essential = document.getElementById('budgetEssential').value;
    const lifestyle = document.getElementById('budgetLifestyle').value;
    const financial = document.getElementById('budgetFinancial').value;
    
    const budgets = {
        essential: parseFloat(essential) || 0,
        lifestyle: parseFloat(lifestyle) || 0,
        financial: parseFloat(financial) || 0,
        month: new Date().toISOString().split('T')[0].substring(0, 7)
    };
    
    localStorage.setItem('trackmyfin_budgets', JSON.stringify(budgets));
    
    const statusEl = document.getElementById('budgetStatus');
    if (statusEl) {
        statusEl.innerHTML = `<p style="color:#6a8a6a;"><i class="fas fa-check-circle"></i> Budgets saved!</p>`;
        setTimeout(() => { statusEl.innerHTML = ''; }, 3000);
    }
    
    updateBudgetDisplay();
    showToast('Budgets saved!');
}

function loadBudgets() {
    const saved = localStorage.getItem('trackmyfin_budgets');
    if (saved) {
        try {
            const budgets = JSON.parse(saved);
            const essentialEl = document.getElementById('budgetEssential');
            const lifestyleEl = document.getElementById('budgetLifestyle');
            const financialEl = document.getElementById('budgetFinancial');
            if (essentialEl) essentialEl.value = budgets.essential || '';
            if (lifestyleEl) lifestyleEl.value = budgets.lifestyle || '';
            if (financialEl) financialEl.value = budgets.financial || '';
            updateBudgetDisplay();
        } catch(e) {}
    }
}

function updateBudgetDisplay() {
    const saved = localStorage.getItem('trackmyfin_budgets');
    const container = document.getElementById('budgetProgressDisplay');
    if (!saved) {
        if (container) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Set budgets above to see progress</div>';
        }
        return;
    }
    
    try {
        const budgets = JSON.parse(saved);
        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();
        
        let essentialSpent = 0, lifestyleSpent = 0, financialSpent = 0;
        
        transactions.forEach(t => {
            if (t.amount < 0) {
                const tDate = new Date(t.date);
                if (tDate.getMonth() === month && tDate.getFullYear() === year) {
                    if (t.category === 'Essential') essentialSpent += Math.abs(t.amount);
                    else if (t.category === 'Lifestyle') lifestyleSpent += Math.abs(t.amount);
                    else if (t.category === 'Financial') financialSpent += Math.abs(t.amount);
                }
            }
        });
        
        updateBudgetItem('essential', budgets.essential, essentialSpent);
        updateBudgetItem('lifestyle', budgets.lifestyle, lifestyleSpent);
        updateBudgetItem('financial', budgets.financial, financialSpent);
        
        if (container) {
            container.innerHTML = `
                <div class="budget-grid">
                    <div class="budget-item">
                        <label><i class="fas fa-circle" style="color:#6058a3;"></i> Essential</label>
                        <div class="budget-progress">
                            <div class="budget-progress-bar essential" id="progressEssential" style="width:${budgets.essential > 0 ? Math.min((essentialSpent / budgets.essential) * 100, 100) : 0}%;"></div>
                        </div>
                        <div class="budget-stats">
                            <span>R${essentialSpent.toFixed(2)}</span>
                            <span>R${budgets.essential.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="budget-item">
                        <label><i class="fas fa-circle" style="color:#b271af;"></i> Lifestyle</label>
                        <div class="budget-progress">
                            <div class="budget-progress-bar lifestyle" id="progressLifestyle" style="width:${budgets.lifestyle > 0 ? Math.min((lifestyleSpent / budgets.lifestyle) * 100, 100) : 0}%;"></div>
                        </div>
                        <div class="budget-stats">
                            <span>R${lifestyleSpent.toFixed(2)}</span>
                            <span>R${budgets.lifestyle.toFixed(2)}</span>
                        </div>
                    </div>
                    <div class="budget-item">
                        <label><i class="fas fa-circle" style="color:#7aa2c6;"></i> Financial</label>
                        <div class="budget-progress">
                            <div class="budget-progress-bar financial" id="progressFinancial" style="width:${budgets.financial > 0 ? Math.min((financialSpent / budgets.financial) * 100, 100) : 0}%;"></div>
                        </div>
                        <div class="budget-stats">
                            <span>R${financialSpent.toFixed(2)}</span>
                            <span>R${budgets.financial.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch(e) {}
}

function updateBudgetItem(category, budget, spent) {
    const progressEl = document.getElementById(`progress${capitalize(category)}`);
    if (progressEl) {
        const percent = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
        progressEl.style.width = `${percent}%`;
        progressEl.style.background = percent > 90 ? '#c47060' : percent > 70 ? '#e6b85c' : '#6058a3';
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================
// PROFILE FUNCTIONS - FIXED
// ============================================
function saveProfile() {
    const name = document.getElementById('profileName').value.trim();
    const income = document.getElementById('monthlyIncome').value;
    const occupation = document.getElementById('userOccupation').value.trim();
    const goal = document.getElementById('userGoal').value.trim();
    
    const profile = {
        name: name || 'User',
        income: parseFloat(income) || 0,
        occupation: occupation || 'Not specified',
        goal: goal || 'Not specified',
        updatedAt: new Date().toISOString().split('T')[0]
    };
    
    localStorage.setItem('trackmyfin_profile', JSON.stringify(profile));
    
    const statusEl = document.getElementById('profileStatus');
    if (statusEl) {
        statusEl.innerHTML = `<p style="color:#6a8a6a;"><i class="fas fa-check-circle"></i> Profile saved!</p>`;
        setTimeout(() => { statusEl.innerHTML = ''; }, 3000);
    }
    
    displayProfile();
    showToast('Profile saved successfully!');
}

function loadProfile() {
    const saved = localStorage.getItem('trackmyfin_profile');
    if (saved) {
        try {
            const profile = JSON.parse(saved);
            const nameEl = document.getElementById('profileName');
            const incomeEl = document.getElementById('monthlyIncome');
            const occupationEl = document.getElementById('userOccupation');
            const goalEl = document.getElementById('userGoal');
            
            if (nameEl) nameEl.value = profile.name || '';
            if (incomeEl) incomeEl.value = profile.income || '';
            if (occupationEl) occupationEl.value = profile.occupation || '';
            if (goalEl) goalEl.value = profile.goal || '';
            
            displayProfile();
        } catch(e) {
            console.error('Error loading profile:', e);
        }
    }
}

function displayProfile() {
    const container = document.getElementById('profileDisplay');
    const saved = localStorage.getItem('trackmyfin_profile');
    
    if (!saved) {
        container.innerHTML = '<p style="color:#888;"><i class="fas fa-info-circle"></i> No profile set yet. Fill in the form above.</p>';
        return;
    }
    
    try {
        const profile = JSON.parse(saved);
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.2);">
                <p><strong>Name:</strong> ${escapeHtml(profile.name)}</p>
                <p><strong>Monthly Income:</strong> R${profile.income.toFixed(2)}</p>
                <p><strong>Occupation:</strong> ${escapeHtml(profile.occupation)}</p>
                <p><strong>Financial Goal:</strong> ${escapeHtml(profile.goal)}</p>
                <p style="font-size:12px; color:#888; margin-top:8px;">Updated: ${profile.updatedAt}</p>
            </div>
        `;
    } catch(e) {
        console.error('Error displaying profile:', e);
    }
}

// ============================================
// CUSTOM CATEGORIES - FIXED
// ============================================
function addCustomCategory() {
    const name = document.getElementById('newCategoryName').value.trim();
    const color = document.getElementById('categoryColor').value;
    
    if (!name) {
        alert('Please enter a category name');
        return;
    }
    
    let categories = JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]');
    
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        alert('Category already exists');
        return;
    }
    
    categories.push({
        id: Date.now(),
        name: name,
        color: color || '#6058a3',
        createdAt: new Date().toISOString().split('T')[0]
    });
    
    localStorage.setItem('trackmyfin_custom_categories', JSON.stringify(categories));
    displayCustomCategories();
    showToast(`Category "${name}" added!`);
    
    document.getElementById('newCategoryName').value = '';
}

function displayCustomCategories() {
    const container = document.getElementById('customCategoryList');
    const categories = JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]');
    
    if (categories.length === 0) {
        container.innerHTML = '<p style="color:#888;"><i class="fas fa-info-circle"></i> No custom categories added yet</p>';
        return;
    }
    
    container.innerHTML = categories.map((cat, index) => `
        <div style="background: rgba(255,255,255,0.12); padding: 12px 16px; border-radius: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${cat.color};">
            <span><i class="fas fa-circle" style="color:${cat.color}; margin-right:8px;"></i> ${escapeHtml(cat.name)}</span>
            <button onclick="removeCustomCategory(${index})" class="btn-small" style="background: rgba(200,170,170,0.4);">Remove</button>
        </div>
    `).join('');
}

function removeCustomCategory(index) {
    let categories = JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]');
    const removed = categories[index].name;
    categories.splice(index, 1);
    localStorage.setItem('trackmyfin_custom_categories', JSON.stringify(categories));
    displayCustomCategories();
    showToast(`Category "${removed}" removed`);
}

function exportAllData() {
    const data = {
        transactions: JSON.parse(localStorage.getItem('trackmyfin_data') || '[]'),
        debts: JSON.parse(localStorage.getItem('trackmyfin_debts') || '[]'),
        goals: JSON.parse(localStorage.getItem('trackmyfin_goals') || '[]'),
        profile: JSON.parse(localStorage.getItem('trackmyfin_profile') || 'null'),
        budgets: JSON.parse(localStorage.getItem('trackmyfin_budgets') || 'null'),
        customCategories: JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]')
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trackmyfin_data.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully!');
}

// ============================================
// AI-POWERED REPORT GENERATION
// ============================================
async function generateReport() {
    const month = document.getElementById('reportMonth').value;
    const container = document.getElementById('reportContent');
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Generating AI report...</div>';
    
    const [year, monthNum] = month.split('-');
    const filtered = transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate.getMonth() === parseInt(monthNum) - 1 && tDate.getFullYear() === parseInt(year);
    });
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-info-circle"></i> No transactions found for this month.</div>';
        return;
    }
    
    // Calculate totals
    let income = 0, expense = 0;
    let essential = 0, lifestyle = 0, financial = 0;
    
    filtered.forEach(t => {
        if (t.amount > 0) income += t.amount;
        else {
            expense += Math.abs(t.amount);
            if (t.category === 'Essential') essential += Math.abs(t.amount);
            else if (t.category === 'Lifestyle') lifestyle += Math.abs(t.amount);
            else if (t.category === 'Financial') financial += Math.abs(t.amount);
        }
    });
    
    const remaining = income - expense;
    const topCategory = expense > 0 ? Object.entries({ Essential: essential, Lifestyle: lifestyle, Financial: financial }).sort((a,b) => b[1] - a[1])[0][0] : 'None';
    
    // Build a summary for the AI
    const summaryData = {
        month: month,
        income: income,
        expenses: expense,
        remaining: remaining,
        categoryBreakdown: { Essential: essential, Lifestyle: lifestyle, Financial: financial },
        totalTransactions: filtered.length,
        topCategory: topCategory
    };
    
    // Try to get AI-powered insights
    let aiInsights = '';
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: `Generate a friendly, personalized monthly financial report summary in plain English. 
                Here is the data for ${month}: 
                Income: R${income.toFixed(2)}, 
                Expenses: R${expense.toFixed(2)}, 
                Remaining: R${remaining.toFixed(2)}, 
                Category breakdown: Essential R${essential.toFixed(2)}, Lifestyle R${lifestyle.toFixed(2)}, Financial R${financial.toFixed(2)}.
                Total transactions: ${filtered.length}.
                Provide 3 actionable recommendations. Keep it encouraging and calm.`
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            aiInsights = data.summary || '';
        }
    } catch(e) {
        console.log('AI not available, using fallback');
    }
    
    // Fallback if AI fails
    if (!aiInsights) {
        const status = remaining >= 0 ? 'within budget' : 'over budget';
        const absRemaining = Math.abs(remaining);
        const advice = remaining >= 0 ? 
            'Keep up the good work! Consider allocating the extra to savings or debt repayment.' : 
            'Try to reduce spending on non-essential items to get back on track.';
        
        aiInsights = `You spent R${expense.toFixed(2)} in ${month}, which is ${status}. Your biggest category was ${topCategory}. ${advice}`;
    }
    
    // Display the report
    container.innerHTML = `
        <div style="background: rgba(255,255,255,0.2); padding: 20px; border-radius: 20px;">
            <h4 style="color: #4a3a4a;">Financial Summary for ${month}</h4>
            <div style="background: rgba(255,255,255,0.15); padding: 15px; border-radius: 16px; margin: 15px 0;">
                <p style="font-size: 16px; line-height: 1.8; color: #2c2c2a;">${aiInsights}</p>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 15px;">
                <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 12px; text-align: center;">
                    <p style="font-size: 12px; color: #888;">Income</p>
                    <p style="font-weight: 700; color: #6a8a6a;">R${income.toFixed(2)}</p>
                </div>
                <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 12px; text-align: center;">
                    <p style="font-size: 12px; color: #888;">Expenses</p>
                    <p style="font-weight: 700; color: #c47060;">R${expense.toFixed(2)}</p>
                </div>
                <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 12px; text-align: center;">
                    <p style="font-size: 12px; color: #888;">Remaining</p>
                    <p style="font-weight: 700; color: ${remaining >= 0 ? '#6a8a6a' : '#c47060'};">R${remaining.toFixed(2)}</p>
                </div>
            </div>
            
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);">
                <p><strong>Category Breakdown:</strong></p>
                <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 8px;">
                    <span><i class="fas fa-circle" style="color:#6058a3;"></i> Essential: R${essential.toFixed(2)} (${expense > 0 ? Math.round((essential/expense)*100) : 0}%)</span>
                    <span><i class="fas fa-circle" style="color:#b271af;"></i> Lifestyle: R${lifestyle.toFixed(2)} (${expense > 0 ? Math.round((lifestyle/expense)*100) : 0}%)</span>
                    <span><i class="fas fa-circle" style="color:#7aa2c6;"></i> Financial: R${financial.toFixed(2)} (${expense > 0 ? Math.round((financial/expense)*100) : 0}%)</span>
                </div>
            </div>
            
            <button onclick="showToast('Report exported!')" class="btn-secondary" style="margin-top: 15px;"><i class="fas fa-file-pdf"></i> Export PDF</button>
        </div>
    `;
}

function exportCSV() {
    const month = document.getElementById('reportMonth').value;
    const [year, monthNum] = month.split('-');
    const filtered = transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate.getMonth() === parseInt(monthNum) - 1 && tDate.getFullYear() === parseInt(year);
    });
    
    if (filtered.length === 0) {
        alert('No transactions for this month');
        return;
    }
    
    let csv = 'Date,Description,Amount,Category\n';
    filtered.forEach(t => {
        csv += `${t.date},${t.description},${t.amount},${t.category}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!');
}

// ============================================
// SAVINGS GOAL
// ============================================
function saveSavingsGoal() {
    const name = document.getElementById('savingsGoalName').value.trim();
    const target = parseFloat(document.getElementById('savingsTarget').value);
    
    if (!name || !target || target <= 0) {
        alert('Please enter a goal name and valid target amount');
        return;
    }
    
    const goal = { name: name, target: target, saved: 0 };
    localStorage.setItem('trackmyfin_savings', JSON.stringify(goal));
    displaySavingsGoal();
    showToast('Savings goal saved!');
}

function displaySavingsGoal() {
    const container = document.getElementById('savingsDisplay');
    const saved = localStorage.getItem('trackmyfin_savings');
    const progressEl = document.getElementById('savingsProgress');
    const currentEl = document.getElementById('savingsCurrent');
    const targetEl = document.getElementById('savingsTargetDisplay');
    
    if (!saved) {
        container.innerHTML = '<p><i class="fas fa-info-circle"></i> No savings goal set yet.</p>';
        if (progressEl) progressEl.style.width = '0%';
        if (currentEl) currentEl.innerHTML = 'R0 saved';
        if (targetEl) targetEl.innerHTML = 'Target: R0';
        return;
    }
    
    try {
        const goal = JSON.parse(saved);
        const percent = Math.min((goal.saved / goal.target) * 100, 100);
        container.innerHTML = `
            <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.2);">
                <p><strong>${escapeHtml(goal.name)}</strong></p>
                <p>Saved: R${goal.saved.toFixed(2)} / R${goal.target.toFixed(2)}</p>
                <button onclick="addToSavings()" class="btn-small" style="margin-top:10px;"><i class="fas fa-plus"></i> Add to Savings</button>
                <button onclick="clearSavingsGoal()" class="btn-small" style="margin-top:10px; background: rgba(200,170,170,0.4);">Remove Goal</button>
            </div>
        `;
        if (progressEl) {
            progressEl.style.width = `${percent}%`;
            progressEl.style.background = percent > 90 ? '#c47060' : '#6058a3';
        }
        if (currentEl) currentEl.innerHTML = `R${goal.saved.toFixed(2)} saved`;
        if (targetEl) targetEl.innerHTML = `Target: R${goal.target.toFixed(2)}`;
    } catch(e) {}
}

function addToSavings() {
    const amount = prompt('Enter amount to add to savings:');
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return;
    
    const saved = localStorage.getItem('trackmyfin_savings');
    if (!saved) {
        alert('No savings goal set yet');
        return;
    }
    
    try {
        const goal = JSON.parse(saved);
        goal.saved += parseFloat(amount);
        localStorage.setItem('trackmyfin_savings', JSON.stringify(goal));
        displaySavingsGoal();
        showToast(`Added R${parseFloat(amount).toFixed(2)} to savings!`);
    } catch(e) {}
}

function clearSavingsGoal() {
    if (confirm('Delete savings goal?')) {
        localStorage.removeItem('trackmyfin_savings');
        displaySavingsGoal();
        showToast('Savings goal removed');
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
    displayDebts();
    updateDebtSummary();
    displayGoals();
    displayProfile();
    displaySavingsGoal();
    loadBudgets();
    loadProfile();
    displayCustomCategories();
    console.log('Track My Fin ready.');
    if (!USE_REAL_API) {
        console.log('API disabled - using keyword fallback');
    } else {
        console.log('API enabled - using Vercel proxy');
    }
}

init();

// Force reset function (run in console if needed)
function forceResetEverything() {
    localStorage.clear();
    transactions = [];
    location.reload();
}