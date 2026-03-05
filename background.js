// File này tự động xóa URL khỏi lịch sử ngay lập tức khi phát hiện tab tải xong 1 trang nằm trong black list.

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Chỉ xử lý nếu URL thay đổi hoặc trang tải xong
    if (changeInfo.url || changeInfo.status === 'complete') {
        try {
            const url = changeInfo.url || tab.url;
            if (!url || url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:')) return;

            const urlObj = new URL(url);

            // Lấy danh sách domains do người dùng lưu
            const { domains = [] } = await chrome.storage.local.get(['domains']);

            // Kiểm tra xem tên miền của đường dẫn này có khớp danh sách ẩn hay không
            const isMatch = domains.some(d => urlObj.hostname.includes(d));

            if (isMatch) {
                // Xóa URL này khỏi lịch sử duyệt web liền ngay lập tức
                chrome.history.deleteUrl({ url: url });

                // Trình duyệt có thể có độ trễ khi ghi lịch sử vào database cục bộ (nhất là máy tính yếu)
                // Nên chúng ta đặt lịch xóa thêm 1 lần nữa sau 1.5 giây để quét dọn triệt để
                setTimeout(() => {
                    chrome.history.deleteUrl({ url: url });
                }, 1500);

                // Tăng biến đếm thống kê số lượng link đã bị dọn dẹp
                chrome.storage.local.get(['deletionCount'], (result) => {
                    let count = result.deletionCount || 0;
                    chrome.storage.local.set({ deletionCount: count + 1 });
                });
            }
        } catch (e) {
            // Không xử lý những URL lỗi, about:blank v.v...
        }
    }
});

// Dọn dẹp cache rác (nếu bạn từng dùng phiên bản cũ của tool này, script này sẽ dọn dẹp biến thừa)
chrome.runtime.onStartup.addListener(async () => {
    try {
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = Object.keys(allData).filter(k => k.startsWith('tab_'));
        if (keysToRemove.length > 0) {
            await chrome.storage.local.remove(keysToRemove);
        }
    } catch (e) {
    }
});
