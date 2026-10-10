/* Secure settings persistence for the independent Supabase app. */
(function(){
 document.addEventListener("click",async function(event){
  const btn=event.target.closest("#saveSettingsBtn"); if(!btn)return;
  event.preventDefault(); event.stopImmediatePropagation();
  if(btn.dataset.saving==="1")return;
  const oldHtml=btn.innerHTML; btn.dataset.saving="1";btn.disabled=true;
  btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> جارٍ حفظ الإعدادات...';
  try{
   const client=window.supabaseClient;
   if(!client)throw new Error("تعذر الاتصال بقاعدة البيانات. حدّث الصفحة.");
   const {data:sessionResult,error:sessionError}=await client.auth.getSession();
   if(sessionError)throw sessionError;
   const session=sessionResult?.session;
   if(!session)throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
   const {data:profile,error:profileError}=await client.from("profiles").select("role,is_active").eq("id",session.user.id).maybeSingle();
   if(profileError)throw profileError;
   if(!profile||profile.role!=="admin"||!profile.is_active)throw new Error("حفظ الإعدادات متاح للمدير العام فقط.");
   const uploadDay=Number(document.getElementById("uploadDay")?.value);
   const startTime=document.getElementById("startTime")?.value||"";
   const endTime=document.getElementById("endTime")?.value||"";
   if(!Number.isInteger(uploadDay)||uploadDay<0||uploadDay>6||!startTime||!endTime||startTime>endTime)throw new Error("اختر يوم الرفع وحدد وقت بداية ونهاية صحيحين.");
   const {data:saved,error}=await client.from("app_settings").update({
    upload_day:uploadDay,start_time:startTime,end_time:endTime,updated_by:session.user.id
   }).eq("id",1).select("id").maybeSingle();
   if(error)throw error;
   if(!saved)throw new Error("لم تُحفظ الإعدادات. تحقق من صلاحيات المدير العام.");
   if(typeof invalidateApiCache==="function")invalidateApiCache();
   alert("تم حفظ موعد رفع التقارير بنجاح.");
  }catch(error){console.error("Save settings failed:",error);alert(error.message||"تعذر حفظ الإعدادات.");}
  finally{btn.disabled=false;btn.dataset.saving="0";btn.innerHTML=oldHtml;}
 },true);
})();