/* Supabase Auth for the independent 2027 app. */
const loginBtn = document.getElementById("loginBtn");
const loginText = document.getElementById("loginText");
const username = document.getElementById("username");
const password = document.getElementById("password");

loginBtn.addEventListener("click", login);
username.addEventListener("keydown", e => { if (e.key === "Enter") login(); });
password.addEventListener("keydown", e => { if (e.key === "Enter") login(); });

async function login() {
    const identity = username.value.trim();
    const secret = password.value;
    if (!identity || !secret) {
        if (typeof showWarning === "function") await showWarning("يرجى إدخال البريد الإلكتروني وكلمة المرور", "بيانات الدخول ناقصة");
        else alert("يرجى إدخال البريد الإلكتروني وكلمة المرور");
        return;
    }
    if (!window.supabaseClient) {
        if (typeof showError === "function") await showError("تعذر تحميل اتصال Supabase. حدّث الصفحة وحاول مرة أخرى.", "تعذر الاتصال");
        else alert("تعذر تحميل اتصال Supabase");
        return;
    }
    loginBtn.disabled = true;
    loginText.textContent = "جارٍ تسجيل الدخول...";
    try {
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email: identity, password: secret });
        if (error) throw error;
        const { data: profile, error: profileError } = await window.supabaseClient
            .from("profiles")
            .select("id, username, full_name, department, role, is_active")
            .eq("id", data.user.id)
            .maybeSingle();
        if (profileError) throw profileError;
        if (!profile || profile.is_active !== true) {
            await window.supabaseClient.auth.signOut();
            throw new Error("الحساب غير مربوط بملف مستخدم نشط. تواصل مع مدير النظام.");
        }
        const user = {
            id: profile.id,
            username: profile.username,
            name: profile.full_name,
            department: profile.department,
            role: profile.role,
            status: "active"
        };
        localStorage.setItem("currentUser", JSON.stringify(user));
        if (user.role === "admin") location.href = "admin.html";
        else if (user.role === "manager") location.href = "manager.html";
        else location.href = "employee.html";
    } catch (error) {
        loginBtn.disabled = false;
        loginText.textContent = "تسجيل الدخول";
        const message = error.message || "تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.";
        if (typeof showError === "function") await showError(message, "تعذر تسجيل الدخول");
        else alert(message);
    }
}
