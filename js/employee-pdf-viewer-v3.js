/* Employee PDF viewer: blob files open directly in a new tab; Drive links use modal. */
(function () {
  "use strict";
  function closePdf() {
    const modal=document.getElementById("employeePdfModal");
    const frame=document.getElementById("employeePdfFrame");
    if(!modal)return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden","true");
    if(frame)frame.src="about:blank";
    document.body.classList.remove("pdf-viewer-open");
  }
  function openPdf(url,title) {
    const value=String(url||"");
    if(value.startsWith("blob:")) { window.open(value,"_blank","noopener"); return; }
    const modal=document.getElementById("employeePdfModal");
    const frame=document.getElementById("employeePdfFrame");
    const titleEl=document.getElementById("employeePdfTitle");
    if(!modal||!frame){window.open(value,"_blank","noopener,noreferrer");return;}
    let target=value;
    const fileMatch=value.match(/\/file\/d\/([^/]+)/);
    const idMatch=value.match(/[?&]id=([^&]+)/);
    if(fileMatch)target="https://drive.google.com/file/d/"+fileMatch[1]+"/preview";
    else if(idMatch)target="https://drive.google.com/file/d/"+idMatch[1]+"/preview";
    if(titleEl)titleEl.textContent=title||"عرض التقرير";
    frame.src=target;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden","false");
    document.body.classList.add("pdf-viewer-open");
  }
  window.openEmployeePdf=openPdf;
  window.closeEmployeePdf=closePdf;
  document.addEventListener("click",function(event){
    const link=event.target.closest(".report-item .view-btn, .reports-list .view-btn");
    if(!link)return;
    const url=link.getAttribute("href")||"";
    if(url.startsWith("blob:")){
      event.preventDefault();
      event.stopImmediatePropagation();
      window.open(url,"_blank","noopener");
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    openPdf(url,link.getAttribute("data-pdf-title")||"عرض التقرير");
  },true);
  document.addEventListener("click",function(event){
    if(event.target.closest("#employeePdfClose")||event.target.id==="employeePdfModal")closePdf();
  });
  document.addEventListener("keydown",function(event){if(event.key==="Escape")closePdf();});
})();