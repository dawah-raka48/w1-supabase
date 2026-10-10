/* Independent W1 API service.
   Until the Supabase schema and secure authentication are configured, fail closed:
   do not send login, upload, edit, or delete requests to the original production API. */
const apiInFlight = new Map();
let apiSettingsCache = null;
let apiSettingsCacheAt = 0;
const API_SETTINGS_TTL = 30000;

async function api(action, data = {}) {
    if (!CONFIG.API_URL) {
        return {
            success: false,
            code: "SUPABASE_SETUP_PENDING",
            message: "النسخة المستقلة قيد تجهيز قاعدة بيانات Supabase. لم يتم الاتصال بالنظام القديم أو تعديل بياناته."
        };
    }

    const payload = data || {};
    const key = action + "::" + JSON.stringify(payload);
    const now = Date.now();

    if (action === "getSettings" && apiSettingsCache && now - apiSettingsCacheAt < API_SETTINGS_TTL) {
        return apiSettingsCache;
    }
    if (apiInFlight.has(key)) return apiInFlight.get(key);

    const request = fetch(CONFIG.API_URL, {
        method: "POST",
        body: JSON.stringify({ action, ...payload })
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then(result => {
        if (action === "getSettings" && result && result.success) {
            apiSettingsCache = result;
            apiSettingsCacheAt = Date.now();
        }
        return result;
    })
    .finally(() => apiInFlight.delete(key));

    apiInFlight.set(key, request);
    return request;
}

function invalidateApiCache() {
    apiSettingsCache = null;
    apiSettingsCacheAt = 0;
}
