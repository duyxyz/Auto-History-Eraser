document.addEventListener('DOMContentLoaded', () => {
    // Nút mở trang danh sách
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

    // Detect current tab and update the UI
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
});
