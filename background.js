// Auto History Eraser - Background Service Worker
// Sử dụng chrome.history.onVisited để bắt chính xác thời điểm Chrome ghi lịch sử mới.

// Cooldown để tránh quét lặp cùng 1 domain liên tục
const recentSweeps = {};
const SWEEP_COOLDOWN = 5000; // 5 giây

// ======== CORE: Lắng nghe sự kiện Chrome ghi lịch sử ========
chrome.history.onVisited.addListener(async (historyItem) => {
    try {
        const url = historyItem.url;
        if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) return;

        const urlObj = new URL(url);
        const { domains = [] } = await chrome.storage.local.get(['domains']);

        // Tìm domain nào trong blacklist khớp
        const matchedDomain = domains.find(d => urlObj.hostname.includes(d));

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
        const results = await chrome.history.search({
            text: domain,
            startTime: 0,
            maxResults: 10000
        });

        let deletedCount = 0;
        for (const item of results) {
            try {
                const itemHost = new URL(item.url).hostname;
                if (itemHost.includes(domain)) {
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
    } catch (e) {
        console.error('Startup sweep error:', e);
    }
});
