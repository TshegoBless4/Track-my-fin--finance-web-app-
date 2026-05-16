// IndexedDB Setup
let db;

// Initialize database
function initDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('TrackMyFinDB', 1);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            
            // Create transactions store
            if (!db.objectStoreNames.contains('transactions')) {
                const store = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
                store.createIndex('date', 'date');
                store.createIndex('category', 'category');
            }
            
            // Create debts store
            if (!db.objectStoreNames.contains('debts')) {
                db.createObjectStore('debts', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// Add a transaction
function addTransaction(transaction) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['transactions'], 'readwrite');
        const store = tx.objectStore('transactions');
        const request = store.add(transaction);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get all transactions
function getAllTransactions() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['transactions'], 'readonly');
        const store = tx.objectStore('transactions');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Delete a transaction
function deleteTransaction(id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['transactions'], 'readwrite');
        const store = tx.objectStore('transactions');
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Debt operations
function addDebt(debt) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['debts'], 'readwrite');
        const store = tx.objectStore('debts');
        const request = store.add(debt);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getAllDebts() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['debts'], 'readonly');
        const store = tx.objectStore('debts');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}