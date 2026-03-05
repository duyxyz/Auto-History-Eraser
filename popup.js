document.addEventListener('DOMContentLoaded', () => {
    // -------- AUTH UI --------
    const authBar = document.getElementById('authBar');
    const loginBar = document.getElementById('loginBar');
    const userEmailSpan = document.getElementById('userEmail');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginBtn = document.getElementById('loginBtn');
    const syncStatus = document.getElementById('syncStatus');

    // Kiểm tra trạng thái đăng nhập
    chrome.storage.local.get(['supabaseSession', 'userEmail'], (result) => {
        if (result.supabaseSession && result.userEmail) {
            // Đã đăng nhập
            authBar.style.display = 'flex';
            loginBar.style.display = 'none';
            userEmailSpan.textContent = result.userEmail;
        } else {
            // Chưa đăng nhập
            authBar.style.display = 'none';
            loginBar.style.display = 'flex';
        }
    });

    // Nút đăng nhập -> mở trang auth
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
        });
    }

    // Nút đăng xuất
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await chrome.storage.local.remove(['supabaseSession', 'userEmail', 'userId']);
            authBar.style.display = 'none';
            loginBar.style.display = 'flex';
        });
    }

    // -------- NÚT MỞ TRANG DANH SÁCH --------
    const openOptionsBtn = document.getElementById('openOptionsBtn');
    if (openOptionsBtn) {
        openOptionsBtn.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                window.open(chrome.runtime.getURL('options.html'));
            }
        });
    }

    // -------- DETECT CURRENT TAB --------
    const addCurrentContainer = document.getElementById('addCurrentContainer');
    const addCurrentBtn = document.getElementById('addCurrentBtn');
    const currentDomainSpan = document.getElementById('currentDomain');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url) {
            try {
                let url = new URL(tabs[0].url);
                if (url.protocol.startsWith('http')) {
                    let domain = url.hostname.replace(/^www\./, '');
                    currentDomainSpan.textContent = domain;

                    chrome.storage.local.get(['domains'], (result) => {
                        const domains = result.domains || [];
                        if (domains.includes(domain)) {
                            // Already in list
                            addCurrentBtn.style.display = 'none';
                            const status = document.createElement('span');
                            status.className = 'current-site-status';
                            status.textContent = 'Đã có';
                            addCurrentContainer.appendChild(status);
                        } else {
                            addCurrentBtn.addEventListener('click', () => {
                                domains.push(domain);
                                chrome.storage.local.set({ domains }, () => {
                                    // Update styling visually to show success
                                    addCurrentBtn.style.display = 'none';
                                    const status = document.createElement('span');
                                    status.className = 'current-site-status';
                                    status.textContent = 'Đã thêm';
                                    addCurrentContainer.appendChild(status);

                                    // Đồng bộ lên Cloud nếu đã đăng nhập
                                    if (typeof syncToCloud === 'function') {
                                        syncToCloud();
                                    }
                                });
                            });
                        }
                    });

                    addCurrentContainer.style.display = 'flex';
                }
            } catch (e) {
                // ignore invalid urls
            }
        }
    });

    // -------- HIỂN THỊ TRẠNG THÁI ĐỒNG BỘ --------
    if (typeof onSyncStatus === 'function') {
        onSyncStatus((status, message) => {
            syncStatus.textContent = message;
            syncStatus.style.display = 'block';
            syncStatus.style.color = status === 'error' ? '#ef4444' : status === 'success' ? '#10b981' : 'var(--primary)';
        });
    }

    // Hiển thị trạng thái cuối cùng khi mở popup
    chrome.storage.local.get(['lastSyncStatus', 'lastSyncMessage', 'supabaseSession'], (result) => {
        if (result.supabaseSession && result.lastSyncMessage) {
            syncStatus.textContent = result.lastSyncMessage;
            syncStatus.style.display = 'block';
            const s = result.lastSyncStatus;
            syncStatus.style.color = s === 'error' ? '#ef4444' : s === 'success' ? '#10b981' : 'var(--primary)';
        }
    });
});
