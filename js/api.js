/* Supabase API for the independent weekly reports system. */
let apiSettingsCache = null, apiSettingsCacheAt = 0;
const API_SETTINGS_TTL = 10000;
async function api(action, data = {}) {
 const client = window.supabaseClient;
 if (!client) return {success:false,message:"تعذر تحميل اتصال Supabase. حدّث الصفحة."};
 const {data: sessionData} = await client.auth.getSession(); const session = sessionData?.session;
 if (!session) return {success:false,message:"انتهت الجلسة. سجّل الدخول مرة أخرى."};
 try {
  if (action === "login") return {success:false,message:"استخدم نموذج تسجيل الدخول المتصل بـ Supabase."};
  if (action === "getEmployees") {
   const {data:rows,error}=await client.from("profiles").select("id, username, full_name, department, role, is_active, created_at").order("full_name"); if(error) throw error;
   return {success:true,employees:(rows||[]).map(r=>({id:r.id,username:r.username,name:r.full_name,department:r.department,role:r.role,status:r.is_active?"active":"inactive",createdAt:r.created_at}))};
  }
  if (action === "getReports") {
   let q=client.from("reports").select("id, employee_id, employee_name, department, report_date, report_week_start, report_week_end, title, original_filename, file_path, created_at").order("created_at",{ascending:false});
   if(data.employeeId) q=q.eq("employee_id",data.employeeId); const {data:rows,error}=await q; if(error) throw error;
   const reports=await Promise.all((rows||[]).map(async r=>{let url=""; if(r.file_path){const {data:signed,error:sErr}=await client.storage.from("weekly-reports-pdf").createSignedUrl(r.file_path,3600);if(!sErr)url=signed?.signedUrl||"";} return {id:r.id,employeeId:r.employee_id,employeeName:r.employee_name,department:r.department,week:r.report_week_start||r.report_date,uploadDate:r.created_at,fileName:r.original_filename||r.title||"تقرير PDF",url,status:"تم الرفع"};}));
   return {success:true,reports};
  }
  if (action === "getSettings") {
   if(apiSettingsCache&&Date.now()-apiSettingsCacheAt<API_SETTINGS_TTL)return apiSettingsCache;
   const {data:row,error}=await client.from("app_settings").select("upload_day,start_time,end_time").eq("id",1).maybeSingle();if(error)throw error;
   const result={success:true,settings:row?{uploadDay:row.upload_day,startTime:String(row.start_time).slice(0,5),endTime:String(row.end_time).slice(0,5)}:{}};apiSettingsCache=result;apiSettingsCacheAt=Date.now();return result;
  }
  if (action === "saveSettings") {
   const d=Number(data.uploadDay),s=String(data.startTime||""),e=String(data.endTime||"");
   if(!Number.isInteger(d)||d<0||d>6||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(s)||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(e)||s>e)return {success:false,message:"تحقق من يوم الرفع ووقت البداية والنهاية."};
   const {data:saved,error}=await client.from("app_settings").update({upload_day:d,start_time:s,end_time:e,updated_by:session.user.id}).eq("id",1).select("id").maybeSingle();if(error)throw error;if(!saved)return {success:false,message:"لم يتم حفظ الإعدادات. تأكد من صلاحية المدير العام."};invalidateApiCache();return {success:true,message:"تم حفظ موعد رفع التقارير بنجاح."};
  }
  if (action === "addEmployee") {
   const {data:created,error}=await client.functions.invoke("admin-create-employee",{body:{name:String(data.name||"").trim(),username:String(data.username||"").trim().toLowerCase(),password:String(data.password||""),department:String(data.department||"").trim(),role:String(data.role||"employee")}});
   if(error){let message=error.message||"تعذر إضافة الموظف.";try{const d=await error.context?.json?.();if(d?.message)message=d.message;}catch(_){}return {success:false,message};}return created||{success:false,message:"لم يصل تأكيد إنشاء الموظف."};
  }
  if (action === "checkWeeklyReport") {
   const id=data.employeeId||session.user.id,now=new Date(),start=new Date(now);start.setDate(start.getDate()-((start.getDay()+6)%7));start.setHours(0,0,0,0);const wk=start.getFullYear()+"-"+String(start.getMonth()+1).padStart(2,"0")+"-"+String(start.getDate()).padStart(2,"0");
   const {data:row,error}=await client.from("reports").select("id").eq("employee_id",id).eq("report_week_start",wk).maybeSingle();if(error)throw error;return {success:true,uploaded:!!row};
  }
  if (action === "uploadReport") {
   const {data:p,error:pe}=await client.from("profiles").select("id,full_name,department,role,is_active").eq("id",session.user.id).maybeSingle();if(pe)throw pe;if(!p||p.role!=="employee"||!p.is_active)return {success:false,message:"رفع التقارير متاح للموظف النشط فقط."};
   const sr=await api("getSettings");if(!sr.success)return sr;const st=sr.settings||{},now=new Date(),time=now.toTimeString().slice(0,5);if(now.getDay()!==Number(st.uploadDay)||time<String(st.startTime)||time>String(st.endTime))return {success:false,message:"رفع التقارير مغلق الآن. عدّل موعد الرفع من لوحة المدير العام ثم حدّث صفحة الموظف."};
   const name=String(data.fileName||"report.pdf"),mime=String(data.mimeType||"application/pdf"),b64=String(data.fileData||"");if(!name.toLowerCase().endsWith(".pdf")||(mime&&mime!=="application/pdf"))return {success:false,message:"يسمح فقط بملفات PDF."};if(!b64)return {success:false,message:"الملف فارغ أو لم تتم قراءته."};if(b64.length>22000000)return {success:false,message:"حجم الملف كبير. الحد الأقصى 15 ميجابايت."};
   const start=new Date(now);start.setDate(start.getDate()-((start.getDay()+6)%7));start.setHours(0,0,0,0);const wk=start.getFullYear()+"-"+String(start.getMonth()+1).padStart(2,"0")+"-"+String(start.getDate()).padStart(2,"0");const end=new Date(start);end.setDate(end.getDate()+6);const wkEnd=end.getFullYear()+"-"+String(end.getMonth()+1).padStart(2,"0")+"-"+String(end.getDate()).padStart(2,"0");
   const safe=name.replace(/[^\\w.\\-\\u0600-\\u06FF]/g,"_").slice(-120),path=p.id+"/"+wk+"/"+Date.now()+"_"+safe,binary=atob(b64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const {error:ue}=await client.storage.from("weekly-reports-pdf").upload(path,new Blob([bytes],{type:"application/pdf"}),{contentType:"application/pdf",upsert:false});if(ue)throw ue;
   const {error:ie}=await client.from("reports").insert({employee_id:p.id,employee_name:p.full_name,department:p.department,report_date:now.toISOString().slice(0,10),report_week_start:wk,report_week_end:wkEnd,title:"التقرير الأسبوعي",original_filename:name,file_path:path});
   if(ie){await client.storage.from("weekly-reports-pdf").remove([path]);if(ie.code==="23505")return {success:false,message:"تم رفع تقرير لهذا الأسبوع بالفعل."};throw ie;}invalidateApiCache();return {success:true,message:"تم رفع التقرير بنجاح."};
  }
  if (["updateEmployee","deleteEmployee","deleteReport"].includes(action)) return {success:false,message:"هذا الإجراء غير مفعّل بعد في النسخة الجديدة."};
  return {success:false,message:"الإجراء غير معروف في النسخة الجديدة."};
 } catch(error){console.error("Supabase API error:",action,error);return {success:false,message:error.message||"تعذر تنفيذ الطلب في Supabase."};}
}
function invalidateApiCache(){apiSettingsCache=null;apiSettingsCacheAt=0;}