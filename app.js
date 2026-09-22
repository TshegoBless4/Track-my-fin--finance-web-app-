// ============================================
// TRACK MY FIN - COMPLETE APP
// ============================================

// ============================================
// API CONFIGURATION
// ============================================
const isLocal = window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1';

const VERCEL_PROXY_URL = '/api/categorize';
const VERCEL_REPORT_URL = '/api/report';
const LOCAL_PROXY_URL = 'http://localhost:3000/api/categorize';
const LOCAL_REPORT_URL = 'http://localhost:3000/api/report';

const API_URL = isLocal ? LOCAL_PROXY_URL : VERCEL_PROXY_URL;
const REPORT_URL = isLocal ? LOCAL_REPORT_URL : VERCEL_REPORT_URL;
let USE_REAL_API = true;

console.log('Using categorize URL:', API_URL);
console.log('Using report URL:', REPORT_URL);

// ============================================
// DATA STORAGE
// ============================================
let transactions = [];      
let categoryChart = null;
const SAMPLE_DATA_KEY = 'trackmyfin_sample_loaded';

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('transactionList')) updateTransactionList();
    if (document.getElementById('categoryChart')) updateDashboardSummary();
    if (document.getElementById('debtList')) displayDebts();
    if (document.getElementById('budgetProgressDisplay')) loadBudgets();
    if (document.getElementById('profileDisplay')) loadProfile();
});

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
// CATEGORY HELPERS
// ============================================
function getAllCategories() {
    const defaults = ['Essential', 'Lifestyle', 'Financial', 'Income'];
    const custom = JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]')
        .map(c => c.name);
    return [...defaults, ...custom];
}

function getCategoryColor(categoryName) {
    const defaultColors = {
        'Essential': '#6058a3',
        'Lifestyle': '#b271af',
        'Financial': '#7aa2c6',
        'Income': '#6a8a6a'
    };
    if (defaultColors[categoryName]) return defaultColors[categoryName];
    
    const custom = JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]');
    const match = custom.find(c => c.name === categoryName);
    return match ? match.color : '#888888';
}

// ============================================
// AI CATEGORIZATION CALL
// ============================================
async function categorizeWithAPI(description, amount, type) {
    if (!USE_REAL_API) return null;
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: description,
                amount: amount,
                type: type || 'expense'
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
                confidence: data.confidence || 0.8,
                source: data.source || 'ai'
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
function categorizeWithKeywords(description, type) {
    if (type === 'income') {
        return { category: 'Income', confidence: 0.9 };
    }
    
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
async function categorizeTransaction(description, amount, type) {
    if (type === 'income') {
        return {
            category: 'Income',
            confidence: 0.95,
            needsReview: false,
            source: 'ai'
        };
    }
    
    let result;
    
    if (USE_REAL_API) {
        const apiResult = await categorizeWithAPI(description, amount, type);
        if (apiResult) {
            result = apiResult;
        } else {
            result = categorizeWithKeywords(description, type);
            result.source = 'fallback';
        }
    } else {
        result = categorizeWithKeywords(description, type);
        result.source = 'fallback';
    }
    
    return {
        category: result.category,
        confidence: result.confidence,
        needsReview: needsReview(result.confidence, description),
        source: result.source || 'fallback'
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
async function addTransaction(event) {
    const descEl = document.getElementById('descInput');
    const amountEl = document.getElementById('amountInput');
    const typeEl = document.getElementById('typeSelect');
    
    if (!descEl || !amountEl || !typeEl) return;

    const description = descEl.value.trim();
    let amount = parseFloat(amountEl.value);
    const type = typeEl.value;
    
    if (!description || isNaN(amount) || amount === 0) {
        alert('Please enter a valid description and amount');
        return;
    }
    
    if (type === 'expense' && amount > 0) amount = -amount;
    if (type === 'income' && amount < 0) amount = Math.abs(amount);
    
    const addBtn = event ? event.target : null;
    let originalText = 'Add';
    if (addBtn) {
        originalText = addBtn.innerText;
        addBtn.innerText = 'Analyzing...';
        addBtn.disabled = true;
    }
    
    // 1. Check if a custom rule matches this description first
    const matchedRuleCategory = getCategoryForDescription(description);
    
    let category, confidence, needsReview, source;
    
    if (matchedRuleCategory) {
        // If a rule matches, use it immediately with 100% confidence
        category = matchedRuleCategory;
        confidence = 1.0;
        needsReview = false;
        source = 'user_rule';
    } else {
        // Otherwise, fall back to your normal AI / keyword categorization
        const result = await categorizeTransaction(description, amount, type);
        category = result.category;
        confidence = result.confidence;
        needsReview = result.needsReview;
        source = result.source;
    }
    
    transactions.unshift({
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        description: description,
        amount: amount,
        category: category,
        confidence: confidence,
        needsReview: needsReview,
        reviewed: !needsReview,
        source: source
    });
    
    saveData();
    updateAll();
    
    if (addBtn) {
        addBtn.innerText = originalText;
        addBtn.disabled = false;
    }
    
    if (needsReview) {
        showToast(`Transaction "${description.substring(0, 30)}" needs review (${Math.round(confidence*100)}% confidence)`, 'warning');
        showReviewBanner(1);
    } else {
        showToast(`Added: ${description.substring(0, 30)} → ${category}`, 'success');
    }
    
    descEl.value = '';
    amountEl.value = '';
}

// ============================================
// DELETE SINGLE TRANSACTION
// ============================================
// Delete a single transaction by ID
function generateTransactionId() {
    return 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

// Single-Transaction Deletion Handler
// Single-Transaction Deletion Handler
function deleteTransaction(transactionId) {
    // Filter out the target transaction using String coercion to support both numeric and string IDs
    transactions = transactions.filter(t => String(t.id) !== String(transactionId));

    // Persist state and trigger cascading updates
    saveAndSyncAppData();
    
    // User feedback toast
    if (typeof showToast === 'function') {
        showToast('Transaction deleted', 'success');
    }
}

// Centralized State Sync Pipeline
function saveAndSyncAppData() {
    // Persist to localStorage safely
    try {
        localStorage.setItem('trackmyfin_data', JSON.stringify(transactions));
    } catch (error) {
        console.error("Failed to save data to localStorage:", error);
    }

    // Refresh UI components safely
    if (typeof updateAll === 'function') {
        updateAll();
    } else {
        // Fallback to individual updates if updateAll is missing
        if (typeof updateSummary === 'function') updateSummary();
        if (typeof updateTransactionList === 'function') updateTransactionList();
        if (typeof updateBudgetDisplay === 'function') updateBudgetDisplay();
        if (typeof updateChart === 'function') updateChart();
    }
}

// Edge-case handler: Refund detection and duplicate checking
function processIncomingTransaction(tx, existingList) {
    const descLower = tx.description.toLowerCase();
    
    // Refund / Reversal detection
    if (descLower.includes('refund') || descLower.includes('reversal') || descLower.includes('cashback')) {
        tx.type = 'income';
        tx.category = 'Income';
        tx.amount = Math.abs(tx.amount);
    }

    // Duplicate Detection (Same date, amount, and description)
    const isDuplicate = existingList.some(existing => 
        existing.date === tx.date && 
        Math.abs(existing.amount) === Math.abs(tx.amount) && 
        existing.description.toLowerCase().trim() === tx.description.toLowerCase().trim()
    );

    return { transaction: tx, isDuplicate };
}

// ============================================
// 2. CSV IMPORT & EDGE-CASE PROCESSOR
// ============================================

// Helper: Create a unique signature for duplicate checking
function generateTransactionSignature(t) {
    const cleanDate = t.date ? t.date.trim() : '';
    const cleanAmount = parseFloat(t.amount || 0).toFixed(2);
    const cleanMerchant = t.merchant ? t.merchant.trim().toUpperCase() : (t.description ? t.description.trim().toUpperCase() : '');
    return `${cleanDate}_${cleanAmount}_${cleanMerchant}`;
}

function processImportedTransactions(incomingRows) {
    let existingTransactions = JSON.parse(localStorage.getItem('trackmyfin_data')) || transactions || [];
    
    // Build a Set of existing signatures for duplicate checking
    const existingSignatures = new Set(existingTransactions.map(generateTransactionSignature));
    
    let addedCount = 0;
    let potentialDuplicateCount = 0;
    const processedBatch = [];

    for (let row of incomingRows) {
        row.id = row.id || generateTransactionId();
        
        const signature = generateTransactionSignature(row);
        if (existingSignatures.has(signature)) {
            potentialDuplicateCount++;
            row.isPotentialDuplicate = true; // Marked for Review Modal UI
        }
        
        // Add signature to catch duplicates within the same batch
        existingSignatures.add(signature);

        // Force into review queue
        row.needsReview = true; 
        row.reviewed = false;

        processedBatch.push(row);
        addedCount++;
    }

    // Append newly uploaded batch to existing transactions
    transactions = [...processedBatch, ...existingTransactions];
    saveAndSyncAppData();

    // Trigger review banner & show pending reviews
    const pendingCount = transactions.filter(t => t.needsReview && !t.reviewed).length;
    showReviewBanner(pendingCount);
    
    if (potentialDuplicateCount > 0) {
        showToast(`Imported ${addedCount} transactions (${potentialDuplicateCount} potential duplicates found)`, 'warning');
    } else {
        showToast(`Imported ${addedCount} transactions sent to review queue.`, 'success');
    }

    showPendingReviews();
}
// ============================================
// UPLOAD CSV (CORRECTED)
// ============================================
async function uploadCSV() {
    const fileInput = document.getElementById('csvFile');
    if (!fileInput) return;
    
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
        const incomingRows = [];
        
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
                    const txnType = amount > 0 ? 'income' : 'expense';
                    
                    // --- REPLACED HARDCODED LOGIC WITH YOUR ACTUAL CATEGORIZATION & REVIEW PIPELINE ---
                    const matchedRuleCategory = getCategoryForDescription(description);
                    let category, confidence, needsReview, source;
                    
                    if (matchedRuleCategory) {
                        category = matchedRuleCategory;
                        confidence = 1.0;
                        needsReview = false;
                        source = 'user_rule';
                    } else {
                        const result = await categorizeTransaction(description, amount, txnType);
                        category = result.category;
                        confidence = result.confidence;
                        needsReview = result.needsReview;
                        source = result.source;
                    }
                    
                    incomingRows.push({
                        id: generateTransactionId(),
                        date: formattedDate,
                        description: description,
                        merchant: description,
                        amount: amount,
                        category: category,
                        type: txnType,
                        confidence: confidence,
                        needsReview: needsReview,
                        reviewed: !needsReview,
                        source: source
                    });
                }
            }
        }
        
        // Pass collected rows into our robust batch processor
        processImportedTransactions(incomingRows);
        
        if (uploadBtn) {
            uploadBtn.innerText = originalText;
            uploadBtn.disabled = false;
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
        if (container && summaryCards) {
            container.insertBefore(banner, summaryCards);
        } else if (container) {
            container.prepend(banner);
        } else {
            return;
        }
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
        closeReviewModal();
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
        <div style="background: rgba(255,255,255,0.25); backdrop-filter: blur(20px); padding: 28px; border-radius: 36px; max-width: 650px; width: 90%; max-height: 80vh; overflow-y: auto; border: 1px solid rgba(255,255,255,0.4); color: #2c2c2a;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="color: #4a3a4a; margin: 0;"><i class="fas fa-edit"></i> Review Transactions (${pendingTransactions.length})</h3>
                <button onclick="closeReviewModal()" style="background: transparent; border: none; font-size: 18px; cursor: pointer; color: #5a4a5a;">&times;</button>
            </div>
            <p style="margin-bottom: 15px; color: #5a4a5a; font-size: 14px;">Review and approve transactions individually or clear duplicate uploads.</p>
            
            <div id="pendingReviewsList">
                ${pendingTransactions.map(t => `
                    <div id="review-${t.id}" style="border: 1px solid ${t.isPotentialDuplicate ? 'rgba(229, 115, 115, 0.6)' : 'rgba(255,255,255,0.3)'}; padding: 15px; margin-bottom: 12px; border-radius: 24px; background: ${t.isPotentialDuplicate ? 'rgba(255, 180, 180, 0.2)' : 'rgba(255,255,255,0.15)'};">
                        
                        ${t.isPotentialDuplicate ? `
                            <div style="display:inline-block; background: rgba(211, 47, 47, 0.85); color: white; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
                                 Potential Duplicate
                            </div>
                        ` : ''}

                        <p style="margin: 4px 0;"><strong>${escapeHtml(t.description)}</strong></p>
                        <p style="margin: 4px 0; font-size: 13px; color: #5a4a5a;">Date: ${t.date} | Amount: <strong>R${Math.abs(t.amount).toFixed(2)}</strong> | Confidence: ${Math.round((t.confidence || 0.8) * 100)}%</p>
                        
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
                            <label style="font-size: 12px; color: #5a4a5a;">Category:</label>
                            <select id="cat-${t.id}" style="padding: 6px 12px; border-radius: 20px; background: rgba(255,255,255,0.3); border: 1px solid rgba(255,255,255,0.4); color: #2c2c2a; font-size: 13px;">
                                ${getAllCategories().map(cat => 
                                    `<option value="${cat}" ${t.category === cat ? 'selected' : ''}>${cat}</option>`
                                ).join('')}
                            </select>
                            
                            <button onclick="approveTransaction('${t.id}')" style="padding: 6px 16px; background: linear-gradient(135deg, #6058a3 0%, #4a4283 100%); color: white; border: none; border-radius: 20px; cursor: pointer; font-size: 13px;">
                                Approve
                            </button>
                            <button onclick="skipReviewTransaction('${t.id}')" style="padding: 6px 12px; background: rgba(196, 112, 96, 0.9); color: white; border: none; border-radius: 20px; cursor: pointer; font-size: 13px;">
                                Delete / Ignore
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div style="display: flex; gap: 12px; margin-top: 20px;">
                <button onclick="approveAllPending()" style="flex:1; background: linear-gradient(135deg, #6058a3 0%, #4a4283 100%); color: white; border: none; padding: 12px 28px; border-radius: 40px; cursor: pointer; font-weight: 600;">Approve All Remaining</button>
                <button onclick="closeReviewModal()" style="flex:1; background: rgba(255,255,255,0.3); color: #4a3a4a; border: 1px solid rgba(255,255,255,0.4); padding: 12px 28px; border-radius: 40px; cursor: pointer; font-weight: 600;">Close</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function approveTransaction(id) {
    // String matching handles both numeric IDs and generated string UUIDs
    const transaction = transactions.find(t => String(t.id) === String(id));
    if (transaction) {
        const catSelect = document.getElementById(`cat-${id}`);
        if (catSelect) transaction.category = catSelect.value;
        
        transaction.needsReview = false;
        transaction.reviewed = true;
        transaction.isPotentialDuplicate = false;
        transaction.source = 'user_reviewed';
        
        saveAndSyncAppData();
        
        const element = document.getElementById(`review-${id}`);
        if (element) element.remove();
        
        const remaining = transactions.filter(t => t.needsReview && !t.reviewed).length;
        if (remaining === 0) {
            closeReviewModal();
            hideReviewBanner();
            showToast('All transactions reviewed!', 'success');
        } else {
            showReviewBanner(remaining);
        }
    }
}

function skipReviewTransaction(id) {
    // Remove the transaction from the array
    transactions = transactions.filter(t => String(t.id) !== String(id));
    saveAndSyncAppData();
    
    // Remove its element from the modal UI
    const element = document.getElementById(`review-${id}`);
    if (element) element.remove();
    
    const remaining = transactions.filter(t => t.needsReview && !t.reviewed).length;
    if (remaining === 0) {
        closeReviewModal();
        hideReviewBanner();
        showToast('All pending transactions resolved!', 'success');
    } else {
        showReviewBanner(remaining);
    }
}

function approveAllPending() {
    const pending = transactions.filter(t => t.needsReview && !t.reviewed);
    pending.forEach(t => {
        t.needsReview = false;
        t.reviewed = true;
        t.isPotentialDuplicate = false;
        t.source = 'user_reviewed';
    });
    
    saveAndSyncAppData();
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
        btn.style.color = 'white';
    }
}

// ============================================
// UPDATE UI
// ============================================
function updateAll() {
    updateDashboardSummary(); // Runs the updated robust calculation
    updateTransactionList();
    updateChart();
    updateBudgetDisplay();
    
    const pendingCount = (typeof transactions !== 'undefined' ? transactions : [])
        .filter(t => t.needsReview && !t.reviewed).length;
        
    if (pendingCount > 0) {
        showReviewBanner(pendingCount);
    } else {
        hideReviewBanner();
    }
}

// Retained as an alias in case other parts of your code call updateSummary()
function updateSummary() {
    updateDashboardSummary();
}

function updateDashboardSummary() {
    let totalIncome = 0;
    let totalExpenses = 0;

    // Retrieve transactions safely from global scope or window object
    const list = (typeof transactions !== 'undefined' && Array.isArray(transactions)) 
        ? transactions 
        : (window.transactions || []);

    list.forEach(t => {
        // 1. Sanitize amount (handle string inputs, currency symbols, comma decimals)
        let amt = 0;
        if (typeof t.amount === 'number') {
            amt = t.amount;
        } else if (typeof t.amount === 'string') {
            amt = parseFloat(t.amount.replace(/[^0-9.-]/g, '')) || 0;
        }

        // 2. Determine Income vs Expense
        if (t.type === 'income' || t.type === 'Income') {
            totalIncome += Math.abs(amt);
        } else if (t.type === 'expense' || t.type === 'Expense') {
            totalExpenses += Math.abs(amt);
        } else {
            // Fallback for objects without an explicit t.type property
            if (t.category && t.category !== 'Income' && amt > 0) {
                totalExpenses += Math.abs(amt);
            } else if (amt > 0) {
                totalIncome += Math.abs(amt);
            } else {
                totalExpenses += Math.abs(amt);
            }
        }
    });

    const remaining = totalIncome - totalExpenses;

    // 3. Target your exact HTML IDs from index.html
    const incomeEl = document.getElementById('incomeAmount');
    const expensesEl = document.getElementById('expenseAmount');
    const remainingEl = document.getElementById('remainingAmount');

    if (incomeEl) incomeEl.textContent = `R${totalIncome.toFixed(2)}`;
    if (expensesEl) expensesEl.textContent = `R${totalExpenses.toFixed(2)}`;
    if (remainingEl) remainingEl.textContent = `R${remaining.toFixed(2)}`;
}

function updateChart() {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;

    const totals = {};
    let totalExpense = 0;

    const list = (typeof transactions !== 'undefined') ? transactions : [];

    list.forEach(t => {
        let amt = 0;
        if (typeof t.amount === 'number') amt = t.amount;
        else if (typeof t.amount === 'string') amt = parseFloat(t.amount.replace(/[^0-9.-]/g, '')) || 0;

        // Count as spending if negative OR if categorized as an expense
        if (amt < 0 || (t.category && t.category !== 'Income')) {
            const cat = t.category || 'Uncategorised';
            const value = Math.abs(amt);
            totals[cat] = (totals[cat] || 0) + value;
            totalExpense += value;
        }
    });

    const labels = Object.keys(totals);
    const values = labels.map(k => totals[k]);
    const colours = labels.map(getCategoryColor);

    const breakdownEl = document.getElementById('breakdownList');
    if (breakdownEl) {
        if (labels.length === 0) {
            breakdownEl.innerHTML = '<p style="color:#888;">No spending yet.</p>';
        } else {
            breakdownEl.innerHTML = labels
                .sort((a, b) => totals[b] - totals[a])
                .map(cat => `
                    <div class="breakdown-item">
                        <span class="breakdown-label">
                            <i class="fas fa-circle" style="color:${getCategoryColor(cat)};"></i> ${typeof escapeHtml === 'function' ? escapeHtml(cat) : cat}
                        </span>
                        <span class="breakdown-amount">R${totals[cat].toFixed(2)}</span>
                    </div>
                `).join('');
        }
    }

    if (typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    if (typeof categoryChart !== 'undefined' && categoryChart) {
        categoryChart.destroy();
        categoryChart = null;
    }

    categoryChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels.length ? labels : ['No data'],
            datasets: [{
                data: values.length ? values : [1],
                backgroundColor: colours.length ? colours : ['#ccc'],
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
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed;
                            const percent = totalExpense > 0
                                ? ((value / totalExpense) * 100).toFixed(1)
                                : 0;
                            return `${context.label}: R${value.toFixed(2)} (${percent}%)`;
                        }
                    }
                }
            }
        }
    });
}

function updateTransactionList() {
    const container = document.getElementById('transactionList');
    if (!container) return;
    
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
            <select onchange="updateTransactionCategory('${t.id}', this.value)" style="padding: 5px 12px; border-radius: 30px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: #2c2c2a;">
                ${getAllCategories().map(cat => 
                    `<option ${t.category === cat ? 'selected' : ''}>${cat}</option>`
                ).join('')}
            </select>
            ${t.needsReview && !t.reviewed ? '<span style="background: #f4b1b4; color: #4a3a4a; padding:2px 10px; border-radius: 20px; font-size:10px;"><i class="fas fa-flag"></i> Needs Review</span>' : ''}
            <button class="delete-btn" onclick="deleteTransaction('${t.id}')" title="Delete transaction">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

function escapeHtml(text) {
    if (!text) return '';
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
        filterContainer.insertBefore(btn, filterContainer.children[1] || null);
    }
}

// ============================================
// SAMPLE DATA
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
// MULTIPLE GOALS
// ============================================
function saveGoal() {
    const goalTypeEl = document.getElementById('goalType');
    const goalAmountEl = document.getElementById('goalAmount');
    if (!goalTypeEl || !goalAmountEl) return;

    const goalType = goalTypeEl.value;
    const goalAmount = goalAmountEl.value;
    
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
    goalAmountEl.value = '';
}

function displayGoals() {
    const container = document.getElementById('goalDisplay');
    if (!container) return;
    
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
// DEBT FUNCTIONS
// ============================================
function addDebt() {
    const nameEl = document.getElementById('debtName');
    const balanceEl = document.getElementById('debtBalance');
    const rateEl = document.getElementById('debtRate');
    if (!nameEl || !balanceEl) return;

    const name = nameEl.value.trim();
    const balance = parseFloat(balanceEl.value);
    const rate = rateEl ? parseFloat(rateEl.value) : 0;
    
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
    
    nameEl.value = '';
    balanceEl.value = '';
    if (rateEl) rateEl.value = '';
}

function displayDebts() {
    const container = document.getElementById('debtList');
    if (!container) return;
    
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
                <button onclick="deleteDebt(${d.id})" style="background: rgba(200,170,170,0.4); border: none; padding: 4px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; margin-top: 6px;">Paid Off / Remove</button>
            </div>
        </div>
    </div>
`).join('');

}

// ============================================
// DEBT PAYOFF TIMELINE ESTIMATOR (AVALANCHE METHOD)
// ============================================
function calculatePayoffTimeline(monthlyBudget) {
    let debts = JSON.parse(localStorage.getItem('trackmyfin_debts') || '[]');
    if (debts.length === 0 || !monthlyBudget || monthlyBudget <= 0) {
        return { months: 0, totalInterest: 0, error: 'Add debts and a valid monthly budget.' };
    }

    // Deep copy debts so we don't mutate real state during simulation
    let simDebts = debts.map(d => ({
        name: d.name,
        balance: parseFloat(d.balance),
        rate: parseFloat(d.rate) || 0
    }));

    let months = 0;
    let totalInterestPaid = 0;
    let maxSafetyCounter = 600; // Cap at 50 years to prevent infinite loops

    while (simDebts.some(d => d.balance > 0.01) && months < maxSafetyCounter) {
        months++;
        let availableFunds = parseFloat(monthlyBudget);

        // 1. Sort debts by interest rate descending (Avalanche priority)
        simDebts.sort((a, b) => b.rate - a.rate);

        // 2. Apply monthly interest and collect required minimums (estimated at 3% or R50 minimum)
        let totalMinRequired = 0;
        simDebts.forEach(d => {
            if (d.balance > 0) {
                let monthlyInterest = (d.balance * (d.rate / 100)) / 12;
                totalInterestPaid += monthlyInterest;
                d.balance += monthlyInterest;

                let minPay = Math.max(50, d.balance * 0.03);
                if (minPay > d.balance) minPay = d.balance;
                
                d.balance -= minPay;
                availableFunds -= minPay;
            }
        });

        // If the monthly budget is too low to even cover minimums
        if (availableFunds < 0 && months === 1) {
            return { error: 'Monthly budget is too low to cover minimum payments!' };
        }

        // 3. Apply any remaining budget surplus directly to the highest-priority active debt
        let targetDebt = simDebts.find(d => d.balance > 0.01);
        if (targetDebt && availableFunds > 0) {
            targetDebt.balance -= availableFunds;
        }

        // Clean up fully paid debts
        simDebts = simDebts.filter(d => d.balance > 0.01);
    }

    return {
        months: months,
        years: (months / 12).toFixed(1),
        totalInterest: totalInterestPaid
    };
}

// ============================================
// UPDATED DEBT SUMMARY & SIMULATOR INTEGRATION
// ============================================
function updateDebtSummary() {
    let debts = JSON.parse(localStorage.getItem('trackmyfin_debts') || '[]');
    let totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
    let highestRate = debts.reduce((max, d) => Math.max(max, d.rate || 0), 0);
    
    const totalEl = document.getElementById('totalDebt');
    const rateEl = document.getElementById('highestRate');
    
    if (totalEl) totalEl.innerHTML = `R${totalDebt.toFixed(2)}`;
    if (rateEl) rateEl.innerHTML = `${highestRate.toFixed(1)}%`;
    
    // Grab current monthly budget value from simulator input
    const budgetInput = document.getElementById('monthlyDebtBudget');
    const monthlyBudget = budgetInput ? parseFloat(budgetInput.value) || 0 : 0;

    // Trigger live AI coach response
    fetchAICoachAdvice(debts, monthlyBudget);

    // Bind simulator listener if not already bound
    if (budgetInput && !budgetInput.dataset.simulatorBound) {
        budgetInput.addEventListener('input', () => {
            renderDebtPayoffSimulator();
            // Debounce or update AI coach on budget change as well
            fetchAICoachAdvice(debts, parseFloat(budgetInput.value) || 0);
        });
        budgetInput.dataset.simulatorBound = 'true';
    }
    
    renderDebtPayoffSimulator();
}

function clearDebts() {
    if (confirm('Delete ALL debts?')) {
        localStorage.removeItem('trackmyfin_debts');
        displayDebts();
        updateDebtSummary();
        showToast('All debts cleared');
    }
}

// Add this function to your debt section
function deleteDebt(id) {
    let debts = JSON.parse(localStorage.getItem('trackmyfin_debts') || '[]');
    debts = debts.filter(d => d.id !== id);
    localStorage.setItem('trackmyfin_debts', JSON.stringify(debts));
    displayDebts();
    updateDebtSummary();
    showToast('Debt settled and removed!');
}

// ============================================
// ADVANCED DEBT PAYOFF SIMULATOR (Avalanche vs. Snowball)
// ============================================
function calculateTimelineForMethod(monthlyBudget, method = 'avalanche') {
    let debts = JSON.parse(localStorage.getItem('trackmyfin_debts') || '[]');
    if (debts.length === 0 || !monthlyBudget || monthlyBudget <= 0) {
        return { months: 0, totalInterest: 0, error: 'Add debts and a valid monthly budget.' };
    }

    // Deep copy debts so we don't mutate state during simulation
    let simDebts = debts.map(d => ({
        name: d.name,
        balance: parseFloat(d.balance),
        rate: parseFloat(d.rate) || 0
    }));

    let months = 0;
    let totalInterestPaid = 0;
    let maxSafetyCounter = 600; // 50-year cap to prevent infinite loops

    while (simDebts.some(d => d.balance > 0.01) && months < maxSafetyCounter) {
        months++;
        let availableFunds = parseFloat(monthlyBudget);

        // Sort based on chosen strategy
        if (method === 'avalanche') {
            simDebts.sort((a, b) => b.rate - a.rate); // Highest interest rate first
        } else {
            simDebts.sort((a, b) => a.balance - b.balance); // Lowest balance first
        }

        // Apply minimum payments and calculate interest
        simDebts.forEach(d => {
            if (d.balance > 0) {
                let monthlyInterest = (d.balance * (d.rate / 100)) / 12;
                totalInterestPaid += monthlyInterest;
                d.balance += monthlyInterest;

                let minPay = Math.max(50, d.balance * 0.03);
                if (minPay > d.balance) minPay = d.balance;
                
                d.balance -= minPay;
                availableFunds -= minPay;
            }
        });

        if (availableFunds < 0 && months === 1) {
            return { error: 'Monthly budget is too low to cover minimum payments!' };
        }

        // Apply remaining budget surplus directly to top priority debt
        let targetDebt = simDebts.find(d => d.balance > 0.01);
        if (targetDebt && availableFunds > 0) {
            targetDebt.balance -= availableFunds;
        }

        simDebts = simDebts.filter(d => d.balance > 0.01);
    }

    return {
        months: months,
        years: (months / 12).toFixed(1),
        totalInterest: totalInterestPaid
    };
}

function renderDebtPayoffSimulator() {
    const container = document.getElementById('debtSimulatorResult');
    const budgetInput = document.getElementById('monthlyDebtBudget');
    if (!container || !budgetInput) return;

    let monthlyBudget = parseFloat(budgetInput.value) || 0;
    let debts = JSON.parse(localStorage.getItem('trackmyfin_debts') || '[]');

    if (debts.length === 0) {
        container.innerHTML = '<p style="color: #888; font-size: 13px;">Add debts above to use the payoff simulator.</p>';
        return;
    }

    if (monthlyBudget <= 0) {
        container.innerHTML = '<p style="color: #888; font-size: 13px;">Enter a monthly budget amount to run the simulator.</p>';
        return;
    }

    let avalanche = calculateTimelineForMethod(monthlyBudget, 'avalanche');
    let snowball = calculateTimelineForMethod(monthlyBudget, 'snowball');

    if (avalanche.error) {
        container.innerHTML = `<span style="color: #c47060; font-size: 13px;">${avalanche.error}</span>`;
        return;
    }

    let interestDiff = snowball.totalInterest - avalanche.totalInterest;

    container.innerHTML = `
        <div style="margin-top: 15px; padding: 15px; background: rgba(255, 255, 255, 0.2); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.3);">
            <h4 style="margin: 0 0 10px 0; color: #4a3a4a;"><i class="fas fa-calculator"></i> Payoff Simulator Results</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; font-size: 13px;">
                <div style="background: rgba(255,255,255,0.3); padding: 10px; border-radius: 12px;">
                    <strong>Avalanche Method</strong><br>
                     ${avalanche.months} months (${avalanche.years} yrs)<br>
                    Interest: R${avalanche.totalInterest.toFixed(2)}
                </div>
                <div style="background: rgba(255,255,255,0.3); padding: 10px; border-radius: 12px;">
                    <strong>Snowball Method</strong><br>
                    ${snowball.months} months (${snowball.years} yrs)<br>
                    Interest: R${snowball.totalInterest.toFixed(2)}
                </div>
            </div>
            <p style="font-size: 12px; color: #555; margin: 0;">
                 <strong>AI Recommendation:</strong> ${interestDiff > 100 ? `The <strong>Avalanche method</strong> saves you approximately <strong>R${interestDiff.toFixed(2)}</strong> in total interest compared to Snowball.` : `Both methods yield similar timelines, but Snowball gives you quick psychological wins by clearing smaller balances first.`}
            </p>
        </div>
    `;
}

// ============================================
// BUDGET
// ============================================
function saveBudgets() {
    const essential = document.getElementById('budgetEssential')?.value;
    const lifestyle = document.getElementById('budgetLifestyle')?.value;
    const financial = document.getElementById('budgetFinancial')?.value;
    
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
    if (!container) return;
    
    if (!saved) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i> Set budgets above to see progress</div>';
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
        
        container.innerHTML = `
            <div class="budget-grid">
                <div class="budget-item">
                    <label><i class="fas fa-circle" style="color:#6058a3;"></i> Essential</label>
                    <div class="budget-progress">
                        <div class="budget-progress-bar essential" style="width:${budgets.essential > 0 ? Math.min((essentialSpent / budgets.essential) * 100, 100) : 0}%;"></div>
                    </div>
                    <div class="budget-stats">
                        <span>R${essentialSpent.toFixed(2)}</span>
                        <span>R${budgets.essential.toFixed(2)}</span>
                    </div>
                </div>
                <div class="budget-item">
                    <label><i class="fas fa-circle" style="color:#b271af;"></i> Lifestyle</label>
                    <div class="budget-progress">
                        <div class="budget-progress-bar lifestyle" style="width:${budgets.lifestyle > 0 ? Math.min((lifestyleSpent / budgets.lifestyle) * 100, 100) : 0}%;"></div>
                    </div>
                    <div class="budget-stats">
                        <span>R${lifestyleSpent.toFixed(2)}</span>
                        <span>R${budgets.lifestyle.toFixed(2)}</span>
                    </div>
                </div>
                <div class="budget-item">
                    <label><i class="fas fa-circle" style="color:#7aa2c6;"></i> Financial</label>
                    <div class="budget-progress">
                        <div class="budget-progress-bar financial" style="width:${budgets.financial > 0 ? Math.min((financialSpent / budgets.financial) * 100, 100) : 0}%;"></div>
                    </div>
                    <div class="budget-stats">
                        <span>R${financialSpent.toFixed(2)}</span>
                        <span>R${budgets.financial.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        `;
    } catch(e) {}
}

// ============================================
// PROFILE FUNCTIONS
// ============================================
function saveProfile() {
    const name = document.getElementById('profileName')?.value.trim();
    const income = document.getElementById('monthlyIncome')?.value;
    const occupation = document.getElementById('userOccupation')?.value.trim();
    const goal = document.getElementById('userGoal')?.value.trim();
    
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
    if (!container) return;
    
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
// CUSTOM CATEGORIES
// ============================================
function addCustomCategory() {
    const nameEl = document.getElementById('newCategoryName');
    const colorEl = document.getElementById('categoryColor');
    if (!nameEl) return;

    const name = nameEl.value.trim();
    const color = colorEl ? colorEl.value : '#6058a3';
    
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
    updateAll();
    
    // --> ADD THIS LINE SO THE RULES DROPDOWN UPDATES INSTANTLY <--
    if (typeof populateRuleCategories === 'function') populateRuleCategories();
    
    showToast(`Category "${name}" added!`);
    nameEl.value = '';
}

function removeCustomCategory(index) {
    let categories = JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]');
    const removed = categories[index].name;
    categories.splice(index, 1);
    localStorage.setItem('trackmyfin_custom_categories', JSON.stringify(categories));
    displayCustomCategories();
    updateAll();
    
    
    if (typeof populateRuleCategories === 'function') populateRuleCategories();
    
    showToast(`Category "${removed}" removed`);
}

function displayCustomCategories() {
    const container = document.getElementById('customCategoryList');
    if (!container) return;
    
    const categories = JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]');
    
    if (categories.length === 0) {
        container.innerHTML = '<p style="color:#888;"><i class="fas fa-info-circle"></i> No custom categories added yet</p>';
        return;
    }
    
    container.innerHTML = categories.map((cat, index) => `
        <div style="background: rgba(255,255,255,0.12); padding: 12px 16px; border-radius: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${cat.color};">
            <span><i class="fas fa-circle" style="color:${cat.color}; margin-right:8px;"></i> ${escapeHtml(cat.name)}</span>
            <div>
                <button onclick="editCustomCategory('${cat.name}')" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; margin-right: 5px;">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button onclick="removeCustomCategory(${index})" class="btn-small" style="background: rgba(200,170,170,0.4);">Remove</button>
            </div>
        </div>
    `).join('');
}
function editCustomCategory(oldName) {
    const newName = prompt("Enter the new category name:", oldName);
    if (!newName || newName.trim() === "" || newName.trim() === oldName) return;

    const trimmedNewName = newName.trim();

    // 1. Update custom categories in localStorage
    let customCats = JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]');
    customCats = customCats.map(cat => {
        if (typeof cat === 'object' && cat.name === oldName) {
            cat.name = trimmedNewName;
        }
        return cat;
    });
    localStorage.setItem('trackmyfin_custom_categories', JSON.stringify(customCats));

    // 2. FIXED: Use 'trackmyfin_data' instead of 'transactions'
    let txs = JSON.parse(localStorage.getItem('trackmyfin_data') || '[]');
    txs.forEach(t => {
        if (t.category === oldName) {
            t.category = trimmedNewName;
        }
    });
    localStorage.setItem('trackmyfin_data', JSON.stringify(txs));

    if (typeof showToast === 'function') {
        showToast('Category updated successfully');
    }
    
    displayCustomCategories();
    if (typeof populateRuleCategories === 'function') populateRuleCategories();
    updateAll();
}

function applyRulesToExisting() {
    // FIXED: Use 'trackmyfin_data' instead of 'transactions'
    let txs = JSON.parse(localStorage.getItem('trackmyfin_data') || '[]');
    let updatedCount = 0;
    
    txs.forEach(t => {
        const matchedCategory = getCategoryForDescription(t.description);
        if (matchedCategory) {
            t.category = matchedCategory;
            updatedCount++;
        }
    });
    
    localStorage.setItem('trackmyfin_data', JSON.stringify(txs));
    transactions = txs; // update global array
    
    if (typeof showToast === 'function') {
        showToast(`Applied rules to ${updatedCount} transactions`);
    }
    if (typeof updateAll === 'function') {
        updateAll();
    }
}



// function removeCustomCategory(index) {
//     let categories = JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]');
//     const removed = categories[index].name;
//     categories.splice(index, 1);
//     localStorage.setItem('trackmyfin_custom_categories', JSON.stringify(categories));
//     displayCustomCategories();
//     updateAll();
//     showToast(`Category "${removed}" removed`);
// }

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
    const monthInput = document.getElementById('reportMonth')?.value;
    const reportContent = document.getElementById('reportContent');
    
    if (!monthInput || !reportContent) return;

    reportContent.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i> Generating report for ${monthInput}...</div>`;

    // FIXED: Use the correct LocalStorage keys ('trackmyfin_data' and 'trackmyfin_profile')
    const savedTransactions = JSON.parse(localStorage.getItem('trackmyfin_data') || '[]');
    const profile = JSON.parse(localStorage.getItem('trackmyfin_profile') || '{}');
    
    const monthTx = savedTransactions.filter(t => t.date && t.date.startsWith(monthInput));
    
    let income = 0;
    let expenses = 0;
    const catTotals = { Essential: 0, Lifestyle: 0, Financial: 0 };

    monthTx.forEach(t => {
        const amt = Math.abs(t.amount);
        if (t.type === 'income' || t.amount > 0) {
            income += amt;
        } else {
            expenses += amt;
            const cat = t.category || 'Lifestyle';
            if (catTotals[cat] !== undefined) catTotals[cat] += amt;
        }
    });

    const remaining = income - expenses;
    const topExpenses = monthTx
        .filter(t => t.type === 'expense' || t.amount < 0)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 3);

    try {
        // FIXED: Use REPORT_URL instead of hardcoding '/api/report'
        const response = await fetch(REPORT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                month: monthInput,
                income: income.toFixed(2),
                expenses: expenses.toFixed(2),
                remaining: remaining.toFixed(2),
                categories: catTotals,
                topTransactions: topExpenses,
                userGoal: profile.goal || 'Maintain financial health'
            })
        });

        if (!response.ok) throw new Error('Failed to generate report from server');

        const data = await response.json();
        
        const badgeClass = data.source === 'ai' ? 'style="background:#6058a3; color:#fff;"' : 'style="background:#aaa; color:#fff;"';
        const badgeText = data.source === 'ai' ? 'AI Generated' : 'Rule Summary';

        reportContent.innerHTML = `
            <div style="margin-bottom: 12px;">
                <span class="transaction-category" ${badgeClass}>${badgeText}</span>
            </div>
            <div style="line-height: 1.6; white-space: pre-line; color: #2c2c2a;">
                ${data.summary}
            </div>
        `;
        
        localStorage.setItem('lastGeneratedReport', JSON.stringify({
            month: monthInput,
            html: reportContent.innerHTML
        }));

    } catch (err) {
        console.error('Report Generation Error:', err);
        reportContent.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i> Failed to generate report. Please check your backend connection.</div>`;
    }
}


// Functional PDF Export replacing placeholder toast
function exportPDF() {
    const reportContent = document.getElementById('reportContent');
    if (!reportContent || reportContent.innerText.includes('Select a month')) {
        showToast('Please generate a report first');
        return;
    }
    window.print();
}

// Security sanitization helper
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.generateReport = generateReport;
function exportCSV() {
    const monthEl = document.getElementById('reportMonth');
    if (!monthEl) return;

    const month = monthEl.value;
    if (!month) {
        alert('Please select a month');
        return;
    }

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
    const nameEl = document.getElementById('savingsGoalName');
    const targetEl = document.getElementById('savingsTarget');
    if (!nameEl || !targetEl) return;

    const name = nameEl.value.trim();
    const target = parseFloat(targetEl.value);
    
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
    if (!container) return;
    
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
    
    if (document.getElementById('transactionList')) {
        addFilterButton();
    }
    if (document.getElementById('debtList')) {
        displayDebts();
        updateDebtSummary();
    }
    if (document.getElementById('goalDisplay')) {
        displayGoals();
    }
    if (document.getElementById('profileDisplay')) {
        displayProfile();
    }
    if (document.getElementById('profileName')) {
        loadProfile();
    }
    if (document.getElementById('savingsDisplay')) {
        displaySavingsGoal();
    }
    if (document.getElementById('budgetEssential')) {
        loadBudgets();
        updateBudgetDisplay();
    }
    if (document.getElementById('customCategoryList')) {
        displayCustomCategories();
    }
    if (document.getElementById('ruleCategorySelect')) {
        populateRuleCategories();
    }
    
    console.log('Track My Fin ready.');
    if (!USE_REAL_API) {
        console.log('API disabled - using keyword fallback');
    } else {
        console.log('API enabled - using:', API_URL);
    }
}

init();

function getCustomCategories() {
    return JSON.parse(localStorage.getItem('customCategories') || '[]');
}

function calculateCategoryTotals(transactions) {
    const totals = {
        Essential: 0,
        Lifestyle: 0,
        Financial: 0,
        Income: 0
    };

    // Pull in user-created custom categories from settings
    const customCats = getCustomCategories();
    customCats.forEach(c => { totals[c.name] = 0; });

    transactions.forEach(t => {
        if (t.type === 'expense') {
            const cat = t.category || 'Lifestyle';
            totals[cat] = (totals[cat] || 0) + Math.abs(t.amount);
        }
    });

    return totals;
}

function switchTab(tabName) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    
    const target = document.getElementById(tabName);
    if (target) target.style.display = 'block';

    // FIXED: Call generateReport() (singular) instead of generateReports()
    if (tabName === 'reports' && typeof generateReport === 'function') {
        generateReport();
    }
}

// Populate category dropdown in the rules section
function populateRuleCategories() {
    const select = document.getElementById('ruleCategorySelect');
    if (!select) return;
    
    const defaultCategories = ['Essential', 'Lifestyle', 'Financial'];
    const customCats = JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]');
    const customNames = customCats.map(c => c.name || c);
    
    const allCats = [...defaultCategories, ...customNames];
    select.innerHTML = allCats.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

// Handle adding a new rule from settings
function handleAddRule() {
    const keywordInput = document.getElementById('ruleKeywordInput');
    const categorySelect = document.getElementById('ruleCategorySelect');
    
    if (!keywordInput || !categorySelect) return;
    
    const keyword = keywordInput.value.trim();
    const category = categorySelect.value;
    
    if (!keyword) {
        if (typeof showToast === 'function') showToast('Please enter a keyword');
        return;
    }
    
    let rules = JSON.parse(localStorage.getItem('trackmyfin_rules') || '[]');
    rules.push({ keyword: keyword.toLowerCase(), category });
    localStorage.setItem('trackmyfin_rules', JSON.stringify(rules));
    
    keywordInput.value = '';
    renderCustomRules();
    if (typeof showToast === 'function') showToast('Rule added successfully');
}

// Render the list of rules in settings.html
function renderCustomRules() {
    const container = document.getElementById('customRulesContainer');
    if (!container) return;
    
    const rules = JSON.parse(localStorage.getItem('trackmyfin_rules') || '[]');
    
    if (rules.length === 0) {
        container.innerHTML = '<p style="color:#888; font-size: 13px; margin-top: 10px;"><i class="fas fa-info-circle"></i> No custom rules added yet.</p>';
        return;
    }
    
    container.innerHTML = rules.map((rule, index) => `
        <div style="background: rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 8px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
            <span>If description contains <strong>"${rule.keyword}"</strong> &rarr; <span style="font-weight:600; color:#6058a3;">${rule.category}</span></span>
            <button onclick="deleteRule(${index})" class="btn-small btn-danger" style="padding: 2px 6px; font-size: 11px;"><i class="fas fa-trash"></i></button>
        </div>
    `).join('');
}

// Delete an individual rule
function deleteRule(index) {
    let rules = JSON.parse(localStorage.getItem('trackmyfin_rules') || '[]');
    rules.splice(index, 1);
    localStorage.setItem('trackmyfin_rules', JSON.stringify(rules));
    renderCustomRules();
    if (typeof showToast === 'function') showToast('Rule deleted');
}

// Helper: Check description against all rules and return matching category
function getCategoryForDescription(description) {
    if (!description) return null;
    const lowerDesc = description.toLowerCase();
    const rules = JSON.parse(localStorage.getItem('trackmyfin_rules') || '[]');
    
    for (const rule of rules) {
        if (lowerDesc.includes(rule.keyword.toLowerCase())) {
            return rule.category;
        }
    }
    return null;
}

// Apply rules to all existing transactions
// function editCustomCategory(oldName) {
//     const newName = prompt("Enter the new category name:", oldName);
//     if (!newName || newName.trim() === "" || newName.trim() === oldName) return;

//     const trimmedNewName = newName.trim();

//     // 1. Update custom categories in localStorage
//     let customCats = JSON.parse(localStorage.getItem('trackmyfin_custom_categories') || '[]');
//     customCats = customCats.map(cat => {
//         if (typeof cat === 'object' && cat.name === oldName) {
//             cat.name = trimmedNewName;
//         }
//         return cat;
//     });
//     localStorage.setItem('trackmyfin_custom_categories', JSON.stringify(customCats));

//     // 2. FIXED: Use 'trackmyfin_data' instead of 'transactions'
//     let txs = JSON.parse(localStorage.getItem('trackmyfin_data') || '[]');
//     txs.forEach(t => {
//         if (t.category === oldName) {
//             t.category = trimmedNewName;
//         }
//     });
//     localStorage.setItem('trackmyfin_data', JSON.stringify(txs));

//     if (typeof showToast === 'function') {
//         showToast('Category updated successfully');
//     }
    
//     displayCustomCategories();
//     if (typeof populateRuleCategories === 'function') populateRuleCategories();
//     updateAll();
// }

// function applyRulesToExisting() {
//     // FIXED: Use 'trackmyfin_data' instead of 'transactions'
//     let txs = JSON.parse(localStorage.getItem('trackmyfin_data') || '[]');
//     let updatedCount = 0;
    
//     txs.forEach(t => {
//         const matchedCategory = getCategoryForDescription(t.description);
//         if (matchedCategory) {
//             t.category = matchedCategory;
//             updatedCount++;
//         }
//     });
    
//     localStorage.setItem('trackmyfin_data', JSON.stringify(txs));
//     transactions = txs; // update global array
    
//     if (typeof showToast === 'function') {
//         showToast(`Applied rules to ${updatedCount} transactions`);
//     }
//     if (typeof updateAll === 'function') {
//         updateAll();
//     }
// }

function exportReportToPDF() {
    const element = document.getElementById('reportContent');
    const monthInput = document.getElementById('reportMonth')?.value || 'summary';
    
    // Validation check to ensure there's a valid report to export
    if (!element || element.innerText.includes('Generating') || element.innerText.includes('Failed') || element.innerText.trim() === '') {
        if (typeof showToast === 'function') {
            showToast('Please generate a valid report first before exporting.');
        } else {
            alert('Please generate a valid report first before exporting.');
        }
        return;
    }

    // Configuration options for html2pdf
    const options = {
        margin:       10, // mm
        filename:     `TrackMyFin_Report_${monthInput}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Trigger download
    html2pdf().from(element).set(options).save().then(() => {
        if (typeof showToast === 'function') {
            showToast('PDF exported successfully!');
        }
    }).catch(err => {
        console.error('PDF Export Error:', err);
        if (typeof showToast === 'function') {
            showToast('Failed to generate PDF.');
        } else {
            alert('Failed to generate PDF.');
        }
    });
}

// ============================================
// LIVE AI COACH (FIN) INTEGRATION
// ============================================
async function fetchAICoachAdvice(debts, monthlyBudget) {
    const aiEl = document.getElementById('aiRecommendation');
    if (!aiEl) return;

    if (!debts || debts.length === 0) {
        aiEl.innerHTML = "Hey! Add your debts above, and I'll help you map out a custom strategy. You've got this!";
        return;
    }

    aiEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Fin is analyzing your strategy...`;

   try {
    // Define your payload object here
    const payloadData = {
        promptType: 'debt_coach',
        debts: debts,
        monthlyBudget: monthlyBudget || 0,
        userGoal: 'Provide encouraging, friendly AI coaching to pay off debt'
    };

    // Add your log right before the fetch() call:
    console.log("Data I am sending to Fin:", JSON.stringify(payloadData));

    const response = await fetch(REPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadData)
    });

    if (!response.ok) throw new Error('AI Coach backend error');

    const data = await response.json();
    
    // Render the AI-generated response from your backend
    if (data && (data.summary || data.response)) {
        aiEl.innerHTML = escapeHtml(data.summary || data.response);
    } else {
        renderSmartCoachFallback(debts, monthlyBudget, aiEl);
    }
} catch (error) {
    console.error('AI Coach Connection Error:', error);
    // Fallback to intelligent dynamic phrasing if offline
    renderSmartCoachFallback(debts, monthlyBudget, aiEl);
}
}

function renderSmartCoachFallback(debts, monthlyBudget, aiEl) {
    const highest = debts.reduce((max, d) => (d.rate || 0) > (max.rate || 0) ? d : max, debts[0]);
    aiEl.innerHTML = `Let's crush this together! Focus your extra cash on <strong>${escapeHtml(highest.name)}</strong> (${highest.rate}% interest) first. With R${monthlyBudget} budgeted monthly, you're well on your way!`;
}

// Force reset function (run in console if needed)
function forceResetEverything() {
    localStorage.clear();
    transactions = [];
    location.reload();
}