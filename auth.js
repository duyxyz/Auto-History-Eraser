document.addEventListener('DOMContentLoaded', () => {
    const sb = getSupabaseClient();
    if (!sb) return;

    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const authForm = document.getElementById('authForm');
    const authBtn = document.getElementById('authBtn');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const authError = document.getElementById('authError');
    const authSuccess = document.getElementById('authSuccess');
    const switchText = document.getElementById('switchText');
    const switchLink = document.getElementById('switchLink');

    let isLoginMode = true;

    function setMode(loginMode) {
        isLoginMode = loginMode;
        if (loginMode) {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            authBtn.textContent = 'Đăng nhập';
            switchText.textContent = 'Chưa có tài khoản?';
            switchLink.textContent = 'Đăng ký ngay';
        } else {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            authBtn.textContent = 'Đăng ký';
            switchText.textContent = 'Đã có tài khoản?';
            switchLink.textContent = 'Đăng nhập';
        }
        authError.style.display = 'none';
        authSuccess.style.display = 'none';
    }

    tabLogin.addEventListener('click', () => setMode(true));
    tabRegister.addEventListener('click', () => setMode(false));
    switchLink.addEventListener('click', () => setMode(!isLoginMode));

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        authError.style.display = 'none';
        authSuccess.style.display = 'none';
        authBtn.disabled = true;
        authBtn.textContent = 'Đang xử lý...';

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        try {
            if (isLoginMode) {
                // Đăng nhập
                const { data, error } = await sb.auth.signInWithPassword({ email, password });
                if (error) throw error;

                // Lưu session vào chrome storage
                await chrome.storage.local.set({
                    supabaseSession: data.session,
                    userEmail: data.user.email,
                    userId: data.user.id
                });

                // Đồng bộ danh sách domains từ cloud về local
                await syncFromCloud(sb, data.user.id);

                // Đóng tab đăng nhập
                window.close();

            } else {
                // Đăng ký
                const { data, error } = await sb.auth.signUp({ email, password });
                if (error) throw error;

                authSuccess.textContent = 'Đăng ký thành công! Bạn có thể đăng nhập ngay.';
                authSuccess.style.display = 'block';
                setMode(true);
                emailInput.value = email; // Giữ lại email
                passwordInput.value = '';
            }
        } catch (error) {
            authError.textContent = translateError(error.message);
            authError.style.display = 'block';
        }

        authBtn.disabled = false;
        authBtn.textContent = isLoginMode ? 'Đăng nhập' : 'Đăng ký';
    });
});

// Đồng bộ từ cloud về storage cục bộ
async function syncFromCloud(sb, userId) {
    try {
        const { data, error } = await sb.from('user_domains')
            .select('domains')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows found

        if (data && data.domains) {
            // Gộp danh sách cloud với local
            const localResult = await chrome.storage.local.get(['domains']);
            const localDomains = localResult.domains || [];
            const mergedDomains = [...new Set([...localDomains, ...data.domains])];
            await chrome.storage.local.set({ domains: mergedDomains });
        }
    } catch (e) {
        console.error('Sync from cloud error:', e);
    }
}

// Dịch thông báo lỗi tiếng Anh sang tiếng Việt
function translateError(msg) {
    if (msg.includes('Invalid login credentials')) return 'Email hoặc mật khẩu không đúng.';
    if (msg.includes('User already registered')) return 'Email này đã được đăng ký.';
    if (msg.includes('Password should be at least')) return 'Mật khẩu phải có ít nhất 6 ký tự.';
    if (msg.includes('Unable to validate email')) return 'Email không hợp lệ.';
    if (msg.includes('Email not confirmed')) return 'Email chưa được xác nhận. Kiểm tra hộp thư của bạn.';
    return msg;
}
