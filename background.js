// Auto History Eraser → Website Blocker - Background Service Worker
// Chặn truy cập các trang web có trong danh sách đen

// ======== HÀM KIỂM TRA DOMAIN CHÍNH XÁC ========
function isDomainMatch(hostname, blacklistDomain) {
    // Bỏ qua domain rỗng hoặc quá ngắn
    if (!blacklistDomain || blacklistDomain.trim().length < 2) return false;

    hostname = hostname.replace(/^www\./, '').toLowerCase().trim();
    blacklistDomain = blacklistDomain.replace(/^www\./, '').toLowerCase().trim();

    // Phải chứa ít nhất 1 dấu chấm (ví dụ: "facebook.com", không phải chỉ "facebook")
    // Hoặc phải khớp chính xác hostname
    return hostname === blacklistDomain || hostname.endsWith('.' + blacklistDomain);
}

// ======== CORE: Chặn truy cập khi tab mở trang nằm trong danh sách ========
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Chỉ xử lý khi URL thay đổi
    if (!changeInfo.url) return;

    try {
        const url = changeInfo.url;
        if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('chrome-extension://')) return;

        const urlObj = new URL(url);
        const { domains = [] } = await chrome.storage.local.get(['domains']);

        // Lọc bỏ domain rỗng / không hợp lệ
        const validDomains = domains.filter(d => d && d.trim().length >= 2);

        // Tìm domain nào trong blacklist khớp
        const matchedDomain = validDomains.find(d => isDomainMatch(urlObj.hostname, d));

        if (matchedDomain) {
            console.log(`[Blocker] Chặn: ${urlObj.hostname} (match: ${matchedDomain})`);
            // Redirect sang trang blocked
            const blockedUrl = chrome.runtime.getURL('blocked.html') + '?domain=' + encodeURIComponent(matchedDomain);
            chrome.tabs.update(tabId, { url: blockedUrl });

            // Tăng bộ đếm thống kê
            const { blockCount = 0 } = await chrome.storage.local.get(['blockCount']);
            await chrome.storage.local.set({ blockCount: blockCount + 1 });
        }
    } catch (e) {
        // Bỏ qua URL lỗi parse
    }
});

// ======== STARTUP: Dọn rác storage cũ ========
chrome.runtime.onStartup.addListener(async () => {
    try {
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(allData).filter(k => k.startsWith('tab_'));
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
        }

        // Đồng bộ cloud ngay khi mở trình duyệt
        await backgroundSync();
    } catch (e) {
        console.error('Startup error:', e);
    }
});

// ======== SYNC: Đồng bộ khi mở trình duyệt / mở popup ========
const SUPABASE_URL = 'https://kdmokuvhcbwnhhrhynwg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbW9rdXZoY2J3bmhocmh5bndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzY5ODMsImV4cCI6MjA4ODI1Mjk4M30.lrJU86DgukKr3ajeNcMie2gy7hR8YfkYCbkyL1xqkHs';

// Hàm đồng bộ 2 chiều (push local → cloud, pull cloud → local)
async function backgroundSync() {
    try {
        const result = await chrome.storage.local.get(['supabaseSession', 'userId', 'domains']);
        if (!result.supabaseSession || !result.userId) return;

        const token = result.supabaseSession.access_token;
        const userId = result.userId;
        const localDomains = result.domains || [];

        const headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        };

        // 1. Kéo dữ liệu từ cloud
        const getRes = await fetch(
            `${SUPABASE_URL}/rest/v1/user_domains?user_id=eq.${userId}&select=domains,updated_at`,
            { headers }
        );

        let cloudDomains = [];
        let hasCloudData = false;

        if (getRes.ok) {
            const data = await getRes.json();
            if (data.length > 0 && data[0].domains) {
                cloudDomains = data[0].domains;
                hasCloudData = true;
            }
        }

        // 2. Gộp 2 chiều: local + cloud
        const mergedDomains = [...new Set([...localDomains, ...cloudDomains])];

        // 3. Cập nhật local nếu có thay đổi
        if (mergedDomains.length !== localDomains.length ||
            !mergedDomains.every(d => localDomains.includes(d))) {
            await chrome.storage.local.set({ domains: mergedDomains });
        }

        // 4. Đẩy lên cloud nếu có thay đổi
        if (mergedDomains.length !== cloudDomains.length ||
            !mergedDomains.every(d => cloudDomains.includes(d))) {

            const body = JSON.stringify({
                user_id: userId,
                domains: mergedDomains,
                updated_at: new Date().toISOString()
            });

            if (hasCloudData) {
                await fetch(
                    `${SUPABASE_URL}/rest/v1/user_domains?user_id=eq.${userId}`,
                    { method: 'PATCH', headers, body }
                );
            } else {
                await fetch(
                    `${SUPABASE_URL}/rest/v1/user_domains`,
                    { method: 'POST', headers, body }
                );
            }
        }

        const time = new Date().toLocaleTimeString('vi-VN');
        await chrome.storage.local.set({
            lastSyncStatus: 'success',
            lastSyncMessage: `Đã đồng bộ lúc ${time} ☁️`,
            lastSyncTime: new Date().toISOString()
        });

    } catch (e) {
        console.error('Background sync error:', e);
        await chrome.storage.local.set({
            lastSyncStatus: 'error',
            lastSyncMessage: 'Lỗi đồng bộ: ' + e.message
        });
    }
}
