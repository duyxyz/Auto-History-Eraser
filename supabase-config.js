// Cấu hình Supabase
const SUPABASE_URL = 'https://kdmokuvhcbwnhhrhynwg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkbW9rdXZoY2J3bmhocmh5bndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzY5ODMsImV4cCI6MjA4ODI1Mjk4M30.lrJU86DgukKr3ajeNcMie2gy7hR8YfkYCbkyL1xqkHs';

// Singleton: chỉ tạo 1 client duy nhất
let _supabaseClient = null;

function getSupabaseClient() {
    if (!window.supabase) {
        console.error('Supabase library not loaded');
        return null;
    }
    if (!_supabaseClient) {
        _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return _supabaseClient;
}
