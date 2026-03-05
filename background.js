// Auto History Eraser - Background Service Worker
// Sử dụng chrome.history.onVisited để bắt chính xác thời điểm Chrome ghi lịch sử mới.

// Cooldown để tránh quét lặp cùng 1 domain liên tục
const recentSweeps = {};
const SWEEP_COOLDOWN = 5000; // 5 giây

// ======== HÀM KIỂM TRA DOMAIN CHÍNH XÁC ========
// Chỉ match khi hostname KẾT THÚC bằng domain trong blacklist
// Ví dụ: blacklist có "facebook.com"
//   ✅ facebook.com        → match
//   ✅ m.facebook.com      → match
//   ✅ www.facebook.com    → match
//   ❌ notfacebook.com     → KHÔNG match
//   ❌ fakefacebook.com    → KHÔNG match
function isDomainMatch(hostname, blacklistDomain) {
    // Chuẩn hóa: bỏ www phía trước
    hostname = hostname.replace(/^www\./, '').toLowerCase();
    blacklistDomain = blacklistDomain.replace(/^www\./, '').toLowerCase();

    // Kiểm tra chính xác: hostname phải bằng hoặc kết thúc bằng ".domain"
    return hostname === blacklistDomain || hostname.endsWith('.' + blacklistDomain);
}

// ======== CORE: Lắng nghe sự kiện Chrome ghi lịch sử ========
chrome.history.onVisited.addListener(async (historyItem) => {
    try {
        const url = historyItem.url;
        if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) return;

        const urlObj = new URL(url);
        const { domains = [] } = await chrome.storage.local.get(['domains']);

        // Tìm domain nào trong blacklist khớp CHÍNH XÁC
        const matchedDomain = domains.find(d => isDomainMatch(urlObj.hostname, d));

        if (matchedDomain) {
            // 1. Xóa ngay URL vừa được ghi vào lịch sử
            await chrome.history.deleteUrl({ url: url });

            // 2. Sweep toàn bộ domain (có cooldown)
            const now = Date.now();
            if (!recentSweeps[matchedDomain] || (now - recentSweeps[matchedDomain]) >= SWEEP_COOLDOWN) {
                recentSweeps[matchedDomain] = now;
                await sweepDomain(matchedDomain);
            }
        }
    } catch (e) {
        // Bỏ qua URL lỗi parse
    }
});

// ======== SWEEP: Quét toàn bộ lịch sử của 1 domain ========
async function sweepDomain(domain) {
    try {
        // Tìm bằng domain để thu hẹp kết quả
        const results = await chrome.history.search({
            text: domain,
            startTime: 0,
            maxResults: 10000
        });

        let deletedCount = 0;
        for (const item of results) {
            try {
                const itemHost = new URL(item.url).hostname;
                // CHỈ xóa nếu hostname match CHÍNH XÁC
                if (isDomainMatch(itemHost, domain)) {
                    await chrome.history.deleteUrl({ url: item.url });
                    deletedCount++;
                }
            } catch (e) {
                // Bỏ qua URL lỗi
            }
        }

        // Cập nhật bộ đếm thống kê
        if (deletedCount > 0) {
            const { deletionCount = 0 } = await chrome.storage.local.get(['deletionCount']);
            await chrome.storage.local.set({ deletionCount: deletionCount + deletedCount });
        }

        return deletedCount;
    } catch (e) {
        console.error('Sweep error:', e);
        return 0;
    }
}

// ======== STARTUP: Quét sạch khi mở trình duyệt ========
chrome.runtime.onStartup.addListener(async () => {
    try {
        // Dọn rác storage cũ
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(allData).filter(k => k.startsWith('tab_'));
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
        }

        // Quét sạch lịch sử tồn đọng cho tất cả domain trong blacklist
        const { domains = [] } = await chrome.storage.local.get(['domains']);
        for (const domain of domains) {
            await sweepDomain(domain);
        }

        // Đồng bộ cloud ngay khi mở trình duyệt
        await backgroundSync();
    } catch (e) {
        console.error('Startup sweep error:', e);
    }
});

// ======== SYNC: Đồng bộ khi mở trình duyệt / mở popup ========
const SUPABASE_URL = 'https://kdmokuvhcbwnhhrhynwg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbW9rdXZoY2J3bmhocmh5bndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzY5ODMsImV4cCI6MjA4ODI1Mjk4M30.lrJU86DgukKr3ajeNcMie2gy7hR8YfkYCbkyL1xqkHs';

// Hàm đồng bộ 2 chiều (push local → cloud, pull cloud → local)
async function backgroundSync() {
    try {
        const result = await chrome.storage.local.get(['supabaseSession', 'userId', 'domains']);
        if (!result.supabaseSession || !result.userId) return; // Chưa đăng nhập

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
                // Update
                await fetch(
                    `${SUPABASE_URL}/rest/v1/user_domains?user_id=eq.${userId}`,
                    { method: 'PATCH', headers, body }
                );
            } else {
                // Insert
                await fetch(
                    `${SUPABASE_URL}/rest/v1/user_domains`,
                    { method: 'POST', headers, body }
                );
            }
        }

        // Lưu thời gian đồng bộ cuối
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
