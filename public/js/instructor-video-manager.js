(() => {
  "use strict";
  const form = document.getElementById("lesson-form");
  const status = document.getElementById("upload-status");
  const allowed = new Set(["video/mp4", "video/quicktime", "video/webm"]);
  const maxSize = 190 * 1024 * 1024;

  async function callApi(path, data) {
    const response = await fetch(path, {
      method:"POST", credentials:"same-origin",
      headers:{"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify(data)
    });
    let reply;
    try { reply = await response.json(); }
    catch { throw new Error("The server did not return a valid response."); }
    if (!response.ok || !reply.ok) throw new Error(reply.error || "Request failed.");
    return reply;
  }
  if (form) form.addEventListener("submit",async (event)=>{
    event.preventDefault();
    const submit=form.querySelector('button[type="submit"]');
    if (!submit || submit.disabled) return;
    const data=new FormData(form);
    const file=data.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > maxSize ||
        !allowed.has(file.type)) {
      status.textContent="Choose an MP4, MOV, or WebM video under 190 MB.";
      return;
    }
    submit.disabled=true;
    status.textContent="Creating private draft...";
    try {
      const created=await callApi("/api/instructor-videos/start",{
        title:String(data.get("title") || ""),
        description:String(data.get("description") || ""),
        program:String(data.get("program") || ""),
        belt_level:String(data.get("belt_level") || ""),
        size:file.size,
        type:file.type
      });
      const destination=new URL(created.uploadURL);
      if (destination.protocol!=="https:" || destination.hostname!=="upload.videodelivery.net")
        throw new Error("The video upload destination could not be verified.");
      status.textContent="Uploading video to Cloudflare Stream. Keep this page open until it finishes...";
      const body=new FormData();
      body.set("file",file,file.name);
      const uploaded=await fetch(destination.href,{method:"POST",body});
      if (!uploaded.ok) throw new Error("The upload failed. The lesson remains unpublished.");
      status.textContent="Video uploaded as a private draft. Processing may take a few minutes. Refresh this page to check its status.";
      form.reset();
    } catch(err) {
      status.textContent=err?.message || "Could not upload video. Please try again.";
    } finally { submit.disabled=false; }
  });

  for(const button of document.querySelectorAll(".video-action")) {
    button.addEventListener("click",async ()=>{
      const parent=button.closest("[data-lesson]");
      const feedback=parent?.querySelector(".action-feedback");
      if (!parent || !feedback || button.disabled) return;
      const id=button.dataset.id;
      const action=button.dataset.action;
      if (!["publish","unpublish","status"].includes(action)) return;
      if (action==="unpublish" && !confirm("Remove this lesson from student access?")) return;
      if (action==="publish" && !confirm("Publish this private lesson only to active students matching its program and selected belt level?")) return;
      button.disabled=true;
      feedback.textContent=action==="status"?"Checking video processing...":"Saving...";
      try {
        const result=await callApi("/api/instructor-videos/actions",{id,action});
        if(action==="status") {
          const label=result.ready ? "Ready to publish" : "Not ready yet";
          feedback.textContent=label + " (" + result.status + ").";
          const cell=parent.querySelector(".video-status");
          if(cell) cell.textContent=result.status;
        } else {
          feedback.textContent=action==="publish" ?
            "Published to " + result.assigned + " eligible household(s). Refresh to see the updated lesson list." :
            "Unpublished. All student access grants were revoked. Refresh to see updated status.";
          // Force a reload only after explicit action, so status and controls match.
          const chip=parent.querySelector(".status");
          if(chip) {
            chip.textContent=action==="publish"?"PUBLISHED":"PRIVATE DRAFT";
            chip.classList.toggle("published",action==="publish");
          }
          setTimeout(()=>location.reload(),900);
        }
      }catch(err){feedback.textContent=err?.message || "Unable to complete action.";}
      finally{button.disabled=false;}
    });
  }
})();
