// sync.js - Module đồng bộ danh sách domains lên Supabase

// Callback để thông báo trạng thái đồng bộ lên UI
let _syncStatusCallback = null;
function onSyncStatus(callback) {
    _syncStatusCallback = callback;
}

function _notifyStatus(status, message) {
    if (_syncStatusCallback) _syncStatusCallback(status, message);
    chrome.storage.local.set({
        lastSyncStatus: status,
        lastSyncMessage: message,
        lastSyncTime: new Date().toISOString()
    });
}

// Lấy Supabase client đã xác thực (singleton)
async function _getAuthenticatedClient() {
    const result = await chrome.storage.local.get(['supabaseSession', 'userId']);
    if (!result.supabaseSession || !result.userId) return null;

    const sb = getSupabaseClient();
    if (!sb) return null;

    return { sb, userId: result.userId, token: result.supabaseSession.access_token };
}

// Đẩy danh sách domains lên cloud
async function syncToCloud() {
    try {
        const auth = await _getAuthenticatedClient();
        if (!auth) return;

        _notifyStatus('syncing', 'Đang đồng bộ lên Cloud...');

        const { domains = [] } = await chrome.storage.local.get(['domains']);

        const { error } = await auth.sb.from('user_domains')
            .upsert({
                user_id: auth.userId,
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
            _notifyStatus('success', `Đã đồng bộ lúc ${time} ☁️`);
        }
    } catch (e) {
        _notifyStatus('error', 'Lỗi kết nối: ' + e.message);
        console.error('Sync error:', e);
    }
}

// Kéo danh sách domains từ cloud về local
async function syncFromCloudBackground() {
    try {
        const auth = await _getAuthenticatedClient();
        if (!auth) return;

        _notifyStatus('syncing', 'Đang kéo dữ liệu từ Cloud...');

        const { data, error } = await auth.sb.from('user_domains')
            .select('domains')
            .eq('user_id', auth.userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data && data.domains) {
            const localResult = await chrome.storage.local.get(['domains']);
            const localDomains = localResult.domains || [];
            const mergedDomains = [...new Set([...localDomains, ...data.domains])];
            await chrome.storage.local.set({ domains: mergedDomains });
            const time = new Date().toLocaleTimeString('vi-VN');
            _notifyStatus('success', `Đã đồng bộ từ Cloud lúc ${time} ☁️`);
        } else {
            _notifyStatus('success', 'Không có dữ liệu mới trên Cloud.');
        }
    } catch (e) {
        _notifyStatus('error', 'Lỗi kéo dữ liệu: ' + e.message);
        console.error('Sync from cloud error:', e);
    }
}
