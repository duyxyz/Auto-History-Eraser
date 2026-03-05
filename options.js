document.addEventListener('DOMContentLoaded', () => {
    const domainTextarea = document.getElementById('domainTextarea');

    // Hàm load danh sách vào textarea
    function loadDomains() {
        chrome.storage.local.get(['domains'], (result) => {
            const domains = result.domains || [];
            domainTextarea.value = domains.join('\n');
        });
    }

    // Load danh sách đã lưu từ trước
    loadDomains();

    // Đồng bộ từ cloud khi mở trang + bật Realtime (nếu đã đăng nhập)
    chrome.storage.local.get(['supabaseSession', 'userId'], (result) => {
        if (result.supabaseSession && typeof syncFromCloudBackground === 'function') {
            syncFromCloudBackground().then(() => {
                loadDomains();
            });
        }

        // ======== SUPABASE REALTIME ========
        // Khi trang Options đang mở → lắng nghe thay đổi trực tiếp từ Cloud
        if (result.supabaseSession && result.userId && typeof getSupabaseClient === 'function') {
            const sb = getSupabaseClient();
            if (sb) {
                const channel = sb.channel('user-domains-changes')
                    .on('postgres_changes',
                        {
                            event: '*',          // INSERT, UPDATE, DELETE
                            schema: 'public',
                            table: 'user_domains',
                            filter: `user_id=eq.${result.userId}`
                        },
                        (payload) => {
                            // Nhận được thay đổi realtime từ cloud!
                            if (payload.new && payload.new.domains) {
                                const cloudDomains = payload.new.domains;

                                // Gộp với local
                                chrome.storage.local.get(['domains'], (localResult) => {
                                    const localDomains = localResult.domains || [];
                                    const merged = [...new Set([...localDomains, ...cloudDomains])];

                                    chrome.storage.local.set({ domains: merged }, () => {
                                        // Chỉ refresh textarea nếu user KHÔNG đang gõ
                                        if (document.activeElement !== domainTextarea) {
                                            domainTextarea.value = merged.join('\n');
                                        }

                                        // Cập nhật sync indicator
                                        const time = new Date().toLocaleTimeString('vi-VN');
                                        if (typeof updateSyncUI === 'function') {
                                            updateSyncUI('success', `Realtime: cập nhật lúc ${time} ⚡`);
                                        }
                                    });
                                });
                            }
                        }
                    )
                    .subscribe();

                // Dọn dẹp khi đóng trang
                window.addEventListener('beforeunload', () => {
                    sb.removeChannel(channel);
                });
            }
        }
    });

    // Auto-save khi người dùng gõ vào textarea
    let timer;
    domainTextarea.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const lines = domainTextarea.value.split('\n');

            // Lọc bỏ dòng trống, khoảng trắng dưa thừa, chuyển chữ thường
            const domains = lines
                .map(line => line.trim().toLowerCase())
                .filter(line => line !== '');

            // Cập nhật vào storage (loại bỏ phần tử trùng lặp)
            const uniqueDomains = [...new Set(domains)];
            chrome.storage.local.set({ domains: uniqueDomains }, () => {
                // Đồng bộ lên Cloud nếu đã đăng nhập
                if (typeof syncToCloud === 'function') syncToCloud();
            });
        }, 500); // Thêm delay nhỏ tránh ghi vào storage quá nhiều lần trên giây
    });

    // -------- TÍNH NĂNG IMPORT / EXPORT --------

    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    const exportBtn = document.getElementById('exportBtn');

    // Mở hộp thoại chọn file
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => {
            importFile.click();
        });

        // Xử lý khi chọn xong file JSON
        importFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (event) {
                try {
                    const parsedData = JSON.parse(event.target.result);

                    // Kiểm tra xem file json có chứa mảng array không
                    let newDomains = [];
                    if (Array.isArray(parsedData)) {
                        newDomains = parsedData;
                    } else if (parsedData.domains && Array.isArray(parsedData.domains)) {
                        newDomains = parsedData.domains;
                    } else {
                        alert("File JSON không đúng định dạng. Cần chứa ít nhất một danh sách (mảng) các tên miền.");
                        return;
                    }

                    // Nhập danh sách
                    chrome.storage.local.get(['domains'], (result) => {
                        const existingDomains = result.domains || [];
                        const mergedDomains = [...new Set([...existingDomains, ...newDomains])];

                        // Cập nhật storage
                        chrome.storage.local.set({ domains: mergedDomains }, () => {
                            // Cập nhật UI ngay lập tức
                            domainTextarea.value = mergedDomains.join('\n');
                            alert(`Nhập thành công ${newDomains.length} tên miền mới!`);
                        });
                    });

                } catch (error) {
                    alert("Có lỗi khi đọc file JSON: " + error.message);
                }

                // Reset file input để có thể chọn lại cùng 1 file
                importFile.value = '';
            };
            reader.readAsText(file);
        });
    }

    // Xử lý xuất file JSON
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            chrome.storage.local.get(['domains'], (result) => {
                const domains = result.domains || [];
                const jsonString = JSON.stringify(domains, null, 2);

                // Tạo một file ảo trong bộ nhớ trình duyệt -> Tải xuống
                const blob = new Blob([jsonString], { type: "application/json" });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                // Tạo tên file chứa ngày tháng hiện tại
                const date = new Date().toISOString().slice(0, 10);
                a.download = `auto_history_eraser_${date}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                // Thu hồi bộ nhớ Url
                URL.revokeObjectURL(url);
            });
        });
    }

    // -------- THỐNG KÊ (STATISTICS) --------
    const statsCount = document.getElementById('statsCount');
    if (statsCount) {
        // Load số đếm lúc mới mở trang
        chrome.storage.local.get(['deletionCount'], (result) => {
            statsCount.textContent = (result.deletionCount || 0).toLocaleString('vi-VN');
        });

        // Cập nhật số đếm theo thời gian thực nếu trình duyệt xóa link ngầm phía sau
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.deletionCount) {
                statsCount.textContent = (changes.deletionCount.newValue || 0).toLocaleString('vi-VN');
            }
        });
    }

    // -------- ĐỒNG BỘ INDICATOR --------
    const syncIndicator = document.getElementById('syncIndicator');
    const syncDot = document.getElementById('syncDot');
    const syncText = document.getElementById('syncText');

    function updateSyncUI(status, message) {
        if (!syncIndicator) return;
        syncIndicator.style.display = 'flex';
        syncIndicator.className = 'sync-indicator ' + status;
        syncDot.className = 'sync-dot ' + status;
        syncText.textContent = message;
    }

    // Đăng ký callback để nhận thông báo từ sync.js
    if (typeof onSyncStatus === 'function') {
        onSyncStatus(updateSyncUI);
    }

    // Hiển thị trạng thái đồng bộ cuối cùng khi mới mở trang
    chrome.storage.local.get(['lastSyncStatus', 'lastSyncMessage', 'supabaseSession'], (result) => {
        if (result.supabaseSession && result.lastSyncStatus) {
            updateSyncUI(result.lastSyncStatus, result.lastSyncMessage);
        }
    });

    // Lắng nghe thay đổi trạng thái đồng bộ trong thời gian thực
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.lastSyncStatus) {
            updateSyncUI(
                changes.lastSyncStatus.newValue,
                changes.lastSyncMessage ? changes.lastSyncMessage.newValue : ''
            );
        }
    });
});
