const form = document.getElementById("add-form");
    const list = document.getElementById("slots");
    const status = document.getElementById("status");
    const banner = document.getElementById("launch-status");
    if (form && list && status && banner) {
      const today = () => {
        const p = new Intl.DateTimeFormat("en-US", {
          timeZone:"America/New_York", year:"numeric",month:"2-digit",day:"2-digit"
        }).formatToParts(new Date());
        const a = Object.fromEntries(p.map(x => [x.type,x.value]));
        return a.year + "-" + a.month + "-" + a.day;
      };
      document.getElementById("add-date").min = today();
      function labelDate(s) {
        return new Intl.DateTimeFormat("en-US", {
          month:"short",day:"numeric",year:"numeric",weekday:"short",timeZone:"UTC"
        }).format(new Date(s + "T12:00:00Z"));
      }
      function labelTime(s) {
        const h = Number(s.slice(0,2));
        return (h%12||12) + ":" + s.slice(3) + (h<12?" AM":" PM");
      }
      async function callApi(data) {
        const response = await fetch("/api/private-lessons/manage", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify(data)
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not save appointment.");
        return payload;
      }
      function field(parent,label,value) {
        const p = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = label + ": ";
        p.append(strong,document.createTextNode(value || ""));
        parent.append(p);
      }
      async function render() {
        status.textContent = "Loading appointment calendar…";
        list.replaceChildren();
        try {
          const resp = await fetch("/api/private-lessons/manage", {cache:"no-store"});
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || "Could not read appointments.");
          banner.textContent = data.publicBookingEnabled ?
            "Public booking is enabled. Open slots below are visible to students." :
            "Public booking is OFF. You can prepare open slots here, but nobody can book until PRIVATE_LESSON_BOOKINGS_ENABLED is set to true.";
          banner.classList.toggle("good", data.publicBookingEnabled);
          const slots = data.slots || [];
          status.textContent = slots.length ?
            slots.length + " upcoming appointment time(s)." :
            "No appointments have been opened yet.";
          slots.forEach(slot => {
            const article = document.createElement("article"); article.className="slot";
            const top = document.createElement("div"); top.className="slot-head";
            const title = document.createElement("h3");
            title.textContent = labelDate(slot.lesson_date) + " · " + labelTime(slot.start_time) +
              " · " + slot.duration_minutes + " min";
            const badge = document.createElement("span");
            badge.className = "pill " + slot.status;
            badge.textContent = slot.status.toUpperCase();
            top.append(title,badge); article.append(top);
            if (slot.status === "booked") {
              field(article,"Program",slot.program);
              field(article,"Student",slot.student_name);
              field(article,"Contact",slot.contact_name);
              field(article,"Email",slot.contact_email);
              field(article,"Phone",slot.contact_phone);
              if (slot.notes) field(article,"Requested focus",slot.notes);
            }
            const actions = document.createElement("div"); actions.className="actions";
            if (slot.status === "open" || slot.status === "closed") {
              const button = document.createElement("button");
              button.className = "btn btn-secondary";
              button.type = "button";
              const action = slot.status === "open" ? "close" : "reopen";
              button.textContent = action === "close" ? "Close This Slot" : "Reopen This Slot";
              button.addEventListener("click", async () => {
                button.disabled=true; status.textContent="Saving appointment…";
                try { await callApi({action,id:slot.id}); await render(); }
                catch (err) {status.textContent=err.message;button.disabled=false;}
              });
              actions.append(button);
            } else {
              const note = document.createElement("span");note.className="small";
              note.textContent="Reserved. Contact the student directly to arrange changes.";
              actions.append(note);
            }
            article.append(actions);
            list.append(article);
          });
        } catch (error) { status.textContent = error.message; }
      }
      document.getElementById("refresh").addEventListener("click", render);
      form.addEventListener("submit", async e => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const fields = Object.fromEntries(new FormData(form));
        const btn = form.querySelector("button");
        btn.disabled=true;status.textContent="Opening appointment…";
        try {
          await callApi({ action:"open",date:fields.date,time:fields.time,duration:Number(fields.duration) });
          status.textContent="Appointment added.";
          await render();
        } catch (error) {status.textContent=error.message;}
        finally {btn.disabled=false;}
      });
      render();
    }
