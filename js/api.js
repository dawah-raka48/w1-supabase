/* Supabase-backed read API for the independent 2027 system.
   Writes remain disabled until the upload/storage and admin-user flows are secured. */
const apiInFlight = new Map();
let apiSettingsCache = null;
let apiSettingsCacheAt = 0;
const API_SETTINGS_TTL = 30000;

async function api(action, data = {}) {
    const client = window.supabaseClient;
    if (!client) return { success: false, message: "تعذر تحميل اتصال Supabase. حدّث الصفحة." };
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData?.session) return { success: false, message: "انتهت الجلسة. سجّل الدخول مرة أخرى." };

    try {
        if (action === "login") {
            return { success: false, message: "استخدم نموذج تسجيل الدخول المتصل بـ Supabase." };
        }
        if (action === "getEmployees") {
            const { data: rows, error } = await client.from("profiles")
                .select("id, username, full_name, department, role, is_active, created_at")
                .order("full_name");
            if (error) throw error;
            return { success: true, employees: (rows || []).map(r => ({
                id: r.id, username: r.username, name: r.full_name, department: r.department,
                role: r.role, status: r.is_active ? "active" : "inactive", createdAt: r.created_at
            })) };
        }
        if (action === "getReports") {
            const { data: rows, error } = await client.from("reports")
                .select("id, employee_id, employee_name, department, report_date, report_week_start, report_week_end, title, original_filename, file_path, created_at")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return { success: true, reports: (rows || []).map(r => ({
                id: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
                department: r.department, week: r.report_week_start || r.report_date,
                uploadDate: r.created_at, fileName: r.original_filename || r.title || "تقرير PDF",
                url: r.file_path || "", status: "تم الرفع"
            })) };
        }
        if (action === "getSettings") {
            if (apiSettingsCache && Date.now() - apiSettingsCacheAt < API_SETTINGS_TTL) return apiSettingsCache;
            const { data: row, error } = await client.from("app_settings")
                .select("upload_day, start_time, end_time").eq("id", 1).maybeSingle();
            if (error) throw error;
            const result = { success: true, settings: row ? {
                uploadDay: row.upload_day, startTime: String(row.start_time).slice(0,5), endTime: String(row.end_time).slice(0,5)
            } : {} };
            apiSettingsCache = result; apiSettingsCacheAt = Date.now();
            return result;
        }
        if (["addEmployee","updateEmployee","deleteEmployee","deleteReport","saveSettings","uploadReport"].includes(action)) {
            return { success: false, message: "هذا الإجراء غير مفعّل بعد في النسخة الجديدة حفاظًا على أمان الحسابات والملفات." };
        }
        return { success: false, message: "الإجراء غير معروف في النسخة الجديدة." };
    } catch (error) {
        console.error("Supabase API error:", action, error);
        return { success: false, message: error.message || "تعذر جلب البيانات من Supabase." };
    }
}

function invalidateApiCache() {
    apiSettingsCache = null;
    apiSettingsCacheAt = 0;
}
