// sync.js - Module đồng bộ danh sách domains lên Supabase

// Callback để thông báo trạng thái đồng bộ lên UI
let _syncStatusCallback = null;
function onSyncStatus(callback) {
    _syncStatusCallback = callback;
}

function _notifyStatus(status, message) {
    if (_syncStatusCallback) _syncStatusCallback(status, message);
    // Lưu lại trạng thái cuối cùng vào storage để hiển thị cho cả popup lẫn options
    chrome.storage.local.set({
        lastSyncStatus: status,
        lastSyncMessage: message,
        lastSyncTime: new Date().toISOString()
    });
}

// Đẩy danh sách domains lên cloud
async function syncToCloud() {
    try {
        const result = await chrome.storage.local.get(['supabaseSession', 'userId', 'domains']);
        if (!result.supabaseSession || !result.userId) return; // Chưa đăng nhập

        _notifyStatus('syncing', 'Đang đồng bộ lên Cloud...');

        const sb = window.supabase.createClient(
            'https://kdmokuvhcbwnhhrhynwg.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbW9rdXZoY2J3bmhocmh5bndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzY5ODMsImV4cCI6MjA4ODI1Mjk4M30.lrJU86DgukKr3ajeNcMie2gy7hR8YfkYCbkyL1xqkHs',
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${result.supabaseSession.access_token}`
                    }
                }
            }
        );

        const domains = result.domains || [];
        const userId = result.userId;

        // Upsert: insert nếu chưa có, update nếu đã có
        const { error } = await sb.from('user_domains')
            .upsert({
                user_id: userId,
                domains: domains,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });

        if (error) {
            _notifyStatus('error', 'Lỗi đồng bộ: ' + error.message);
            console.error('Sync to cloud error:', error);
        } else {
            const time = new Date().toLocaleTimeString('vi-VN');
            _notifyStatus('success', `Đã đồng bộ lúc ${time} `);
        }
    } catch (e) {
        _notifyStatus('error', 'Lỗi kết nối: ' + e.message);
        console.error('Sync error:', e);
    }
}

// Kéo danh sách domains từ cloud về local
async function syncFromCloudBackground() {
    try {
        const result = await chrome.storage.local.get(['supabaseSession', 'userId']);
        if (!result.supabaseSession || !result.userId) return;

        _notifyStatus('syncing', 'Đang kéo dữ liệu từ Cloud...');

        const sb = window.supabase.createClient(
            'https://kdmokuvhcbwnhhrhynwg.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbW9rdXZoY2J3bmhocmh5bndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzY5ODMsImV4cCI6MjA4ODI1Mjk4M30.lrJU86DgukKr3ajeNcMie2gy7hR8YfkYCbkyL1xqkHs',
            {
                global: {
                    headers: {
                        Authorization: `Bearer ${result.supabaseSession.access_token}`
                    }
                }
            }
        );

        const { data, error } = await sb.from('user_domains')
            .select('domains')
            .eq('user_id', result.userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data && data.domains) {
            const localResult = await chrome.storage.local.get(['domains']);
            const localDomains = localResult.domains || [];
            const mergedDomains = [...new Set([...localDomains, ...data.domains])];
            await chrome.storage.local.set({ domains: mergedDomains });
            const time = new Date().toLocaleTimeString('vi-VN');
            _notifyStatus('success', `Đã đồng bộ từ Cloud lúc ${time} `);
        } else {
            _notifyStatus('success', 'Không có dữ liệu mới trên Cloud.');
        }
    } catch (e) {
        _notifyStatus('error', 'Lỗi kéo dữ liệu: ' + e.message);
        console.error('Sync from cloud error:', e);
    }
}
