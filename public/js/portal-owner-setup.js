// First-owner setup: the token arrives in the URL fragment, is kept only
// in this tab, and is never sent in a GET request, image, analytics or referrer.
(() => {
  "use strict";
  const invite=document.getElementById("owner-invite");
  const claim=document.getElementById("owner-claim");
  const inviteStatus=document.getElementById("invite-status");
  const claimStatus=document.getElementById("claim-status");
  const show=(node,message)=>{node.textContent=message;node.hidden=false;};
  let ticket="";
  const params=new URLSearchParams(location.hash.startsWith("#")?location.hash.slice(1):"");
  const possible=params.get("token")||"";
  if(/^[a-f0-9]{64}$/.test(possible)){
    ticket=possible;
    document.getElementById("request-panel").hidden=true;
    document.getElementById("claim-panel").hidden=false;
    // Prevent link tokens from surviving normal page navigation or screenshots.
    history.replaceState(null,"",location.pathname);
  }
  invite?.addEventListener("submit",async event=>{
    event.preventDefault();
    const button=invite.querySelector("button");
    button.disabled=true;
    inviteStatus.hidden=true;
    try{
      const response=await fetch("/api/student-portal/owner-setup/request",{
        method:"POST",body:new FormData(invite),credentials:"same-origin",cache:"no-store"
      });
      const data=await response.json();
      show(inviteStatus,data.message||data.error||"Unable to request a setup link.");
      // Only disable repeats after the provider accepted a new email. An
      // existing 10-minute cooldown must not look like a fresh email was sent.
      if(!response.ok||data.sent!==true)button.disabled=false;
    }catch{
      show(inviteStatus,"The setup email service is temporarily unavailable.");
      button.disabled=false;
    }
    if(window.turnstile?.reset)window.turnstile.reset();
  });
  claim?.addEventListener("submit",async event=>{
    event.preventDefault();
    const password=claim.elements.namedItem("password")?.value||"";
    const confirmation=claim.elements.namedItem("confirm")?.value||"";
    if(password!==confirmation){
      show(claimStatus,"Your passwords don't match. Please try again.");
      return;
    }
    if(password.length<12||password.length>200||/[\u0000-\u001f\u007f]/.test(password)){
      show(claimStatus,"Choose a password of 12–200 characters without control characters.");
      return;
    }
    if(!ticket){
      show(claimStatus,"This link is missing its setup token. Request a new link.");
      return;
    }
    const button=claim.querySelector("button");
    button.disabled=true;
    claimStatus.hidden=true;
    try{
      const response=await fetch("/api/student-portal/owner-setup/complete",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({token:ticket,password}),
        credentials:"same-origin",cache:"no-store"
      });
      const data=await response.json();
      if(response.ok && data.ok===true && data.redirect==="/student-portal/"){
        ticket="";
        claim.reset();
        window.location.replace("/student-portal/");
        return;
      }
      show(claimStatus,data.error||"This setup link could not be verified.");
    }catch{
      show(claimStatus,"The secure connection is temporarily unavailable.");
    }
    button.disabled=false;
  });
})();
