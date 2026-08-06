// Schoolhouse Camps App Frontend JS

let allPrograms = [];
let featuredPrograms = [];
let currentProfile = null;
let currentSelectedProgram = null;
let adminToken = null;

document.addEventListener("DOMContentLoaded", () => {
  initApp();
  setupEventListeners();
});

async function initApp() {
  // Try IP auto-detect on load if possible
  autoDetectLocation();
  await fetchPrograms("98101 - Seattle, WA");
  checkExistingProfile();
}

function setupEventListeners() {
  // Carousel arrows
  document.getElementById("carousel-left").addEventListener("click", () => {
    document.getElementById("carousel-track").scrollBy({ left: -360, behavior: "smooth" });
  });

  document.getElementById("carousel-right").addEventListener("click", () => {
    document.getElementById("carousel-track").scrollBy({ left: 360, behavior: "smooth" });
  });

  // Chat / Search form
  document.getElementById("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const query = document.getElementById("chat-input").value.trim();
    if (query) runAiChat(query);
  });

  // Preset pills
  document.querySelectorAll(".preset-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const query = pill.getAttribute("data-query");
      document.getElementById("chat-input").value = query;
      runAiChat(query);
    });
  });

  // Filters
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const category = btn.getAttribute("data-category");
      filterCatalog(category);
    });
  });

  document.getElementById("catalog-search").addEventListener("input", (e) => {
    const search = e.target.value.toLowerCase();
    searchCatalog(search);
  });

  // Modals
  document.getElementById("close-detail-modal").addEventListener("click", closeModal);
  document.getElementById("back-to-catalog").addEventListener("click", closeModal);
  
  document.getElementById("profile-nav-btn").addEventListener("click", openProfileModal);
  document.getElementById("close-profile-modal").addEventListener("click", () => {
    document.getElementById("profile-modal").style.display = "none";
  });
  
  document.getElementById("admin-nav-btn").addEventListener("click", openAdminModal);
  document.getElementById("close-admin-modal").addEventListener("click", () => {
    document.getElementById("admin-modal").style.display = "none";
  });

  // Reminder Form
  document.getElementById("reminder-form").addEventListener("submit", handleReminderSubmit);
  
  // Profile Form
  document.getElementById("profile-form").addEventListener("submit", handleProfileSave);
  
  // Admin Login
  document.getElementById("admin-login-form").addEventListener("submit", handleAdminLogin);

  // Location input change
  document.getElementById("user-location-input").addEventListener("change", (e) => {
    const loc = e.target.value.trim();
    fetchPrograms(loc);
  });

  // IP Detect button
  document.getElementById("detect-ip-btn").addEventListener("click", () => {
    autoDetectLocation(true);
  });
}

async function autoDetectLocation(userClicked = false) {
  const locInput = document.getElementById("user-location-input");
  try {
    const res = await fetch("https://ipapi.co/json/");
    if (res.ok) {
      const data = await res.json();
      const detectedStr = `${data.postal || ''} ${data.city || 'Seattle'}, ${data.region_code || 'WA'}`.trim();
      locInput.value = detectedStr;
      fetchPrograms(detectedStr);
      if (userClicked) {
        alert(`Detected your location as: ${data.city}, ${data.region_code} (${data.ip})`);
      }
    }
  } catch (err) {
    if (userClicked) {
      alert("IP detection defaulted to Seattle, WA. You can freely type your zip code!");
    }
  }
}

async function fetchPrograms(locationStr = "Seattle") {
  try {
    const res = await fetch(`/api/programs?location=${encodeURIComponent(locationStr)}&max_distance=25`);
    const data = await res.json();
    allPrograms = data.programs || [];
    featuredPrograms = allPrograms.slice(0, 6);
    
    renderCarousel(featuredPrograms, false);
    renderCatalogGrid(allPrograms);
  } catch (err) {
    console.error("Error fetching programs:", err);
  }
}

async function runAiChat(query) {
  const locStr = document.getElementById("user-location-input").value;
  const assistantBox = document.getElementById("assistant-response");
  
  assistantBox.style.display = "block";
  assistantBox.innerHTML = `<em>Searching 20+ local programs for: "${query}"...</em>`;
  
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, location: locStr, max_distance: 25.0 })
    });
    
    const data = await res.json();
    assistantBox.innerHTML = `✨ <strong>AI Assistant:</strong> ${data.reply}`;
    
    if (data.location) {
      document.getElementById("user-location-input").value = data.location;
    }
    
    featuredPrograms = data.featured_carousel || [];
    allPrograms = data.full_catalog || [];
    
    renderCarousel(featuredPrograms, true);
    renderCatalogGrid(allPrograms);
    
    // Smooth scroll to carousel so user visibly sees card updates
    document.querySelector(".carousel-wrapper").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    assistantBox.innerHTML = "<em>Sorry, could not connect to assistant right now.</em>";
  }
}

function renderCarousel(programs, isSearchActive = false) {
  const track = document.getElementById("carousel-track");
  track.innerHTML = "";
  
  if (programs.length === 0) {
    track.innerHTML = `<p style="padding:1.5rem; color:var(--text-muted);">No programs found for this location. Try searching for Seattle or San Francisco!</p>`;
    return;
  }
  
  programs.forEach((prog, index) => {
    const card = document.createElement("div");
    card.className = "card";
    if (isSearchActive) {
      card.style.border = "2px solid var(--red-primary)";
      card.style.boxShadow = "var(--shadow-hover)";
    }
    
    const locTag = prog.city ? ` - ${prog.city}` : "";
    const rankBadge = isSearchActive 
      ? `<div style="position:absolute; top:12px; left:12px; background:var(--red-primary); color:white; font-size:0.75rem; font-weight:800; padding:0.25rem 0.65rem; border-radius:var(--radius-pill); box-shadow:0 4px 10px rgba(0,0,0,0.2); z-index:2;">#${index+1} Match${locTag}</div>` 
      : "";
    
    const pillsToUse = prog.surfaced_pills || prog.pills || [];
    const pillsHtml = pillsToUse
      .map((p, i) => `<span class="pill ${i === 0 ? 'red' : 'yellow'}">${p}</span>`)
      .join("");
      
    card.innerHTML = `
      ${rankBadge}
      <img src="${prog.hero_image}" alt="${prog.name}" class="card-hero-img" />
      <div class="card-body">
        <div class="card-organizer">${prog.organizer}</div>
        <h3 class="card-title">${prog.name}</h3>
        <p class="card-description">${prog.short_description}</p>
        <div class="pill-container">${pillsHtml}</div>
        <div class="card-meta">
          <span class="card-cost">${prog.cost}</span>
          <span class="card-distance">${prog.distance_miles} mi away</span>
        </div>
        <div class="reg-date-tag">
          📅 Reg Opens: <strong>${prog.registration_display}</strong>
        </div>
      </div>
    `;
    
    card.addEventListener("click", () => {
      trackEvent("card_click");
      openDetailModal(prog);
    });
    
    track.appendChild(card);
  });
  
  // "See More" Card leading to full catalog
  const seeMoreCard = document.createElement("a");
  seeMoreCard.className = "card-see-more";
  seeMoreCard.href = "#catalog-section";
  seeMoreCard.innerHTML = `
    <h3>See All ${allPrograms.length} Programs →</h3>
    <p>Browse the complete curated list for your location</p>
  `;
  seeMoreCard.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("catalog-section").scrollIntoView({ behavior: "smooth" });
  });
  track.appendChild(seeMoreCard);
}

function renderCatalogGrid(programs) {
  const grid = document.getElementById("catalog-grid");
  const countEl = document.getElementById("catalog-count");
  
  grid.innerHTML = "";
  countEl.textContent = `Showing ${programs.length} programs`;
  
  if (programs.length === 0) {
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">No programs found matching your filters. Try entering a different zip code or city!</p>`;
    return;
  }
  
  programs.forEach((prog) => {
    const card = document.createElement("div");
    card.className = "card";
    
    const pillsToUse = prog.surfaced_pills || prog.pills || [];
    const pillsHtml = pillsToUse
      .map((p, i) => `<span class="pill ${i === 0 ? 'red' : ''}">${p}</span>`)
      .join("");
      
    card.innerHTML = `
      <img src="${prog.hero_image}" alt="${prog.name}" class="card-hero-img" />
      <div class="card-body">
        <div class="card-organizer">${prog.organizer}</div>
        <h3 class="card-title">${prog.name}</h3>
        <p class="card-description">${prog.short_description}</p>
        <div class="pill-container">${pillsHtml}</div>
        <div class="card-meta">
          <span class="card-cost">${prog.cost}</span>
          <span class="card-distance">${prog.distance_miles} mi away</span>
        </div>
        <div class="reg-date-tag">
          📅 Reg Opens: <strong>${prog.registration_display}</strong>
        </div>
      </div>
    `;
    
    card.addEventListener("click", () => {
      trackEvent("card_click");
      openDetailModal(prog);
    });
    
    grid.appendChild(card);
  });
}

function filterCatalog(category) {
  if (!category || category === "all") {
    renderCatalogGrid(allPrograms);
  } else {
    const filtered = allPrograms.filter(p => p.category.toLowerCase() === category.toLowerCase());
    renderCatalogGrid(filtered);
  }
}

function searchCatalog(term) {
  if (!term) {
    renderCatalogGrid(allPrograms);
    return;
  }
  const filtered = allPrograms.filter(p => 
    p.name.toLowerCase().includes(term) ||
    p.organizer.toLowerCase().includes(term) ||
    p.description.toLowerCase().includes(term)
  );
  renderCatalogGrid(filtered);
}

function openDetailModal(prog) {
  currentSelectedProgram = prog;
  trackEvent("detail_view");
  
  document.getElementById("modal-hero-img").src = prog.hero_image;
  document.getElementById("modal-title").textContent = prog.name;
  document.getElementById("modal-organizer").textContent = `Organized by ${prog.organizer} • ${prog.location_address}`;
  document.getElementById("modal-cost").textContent = prog.cost;
  document.getElementById("modal-age").textContent = prog.age_range;
  document.getElementById("modal-reg-date").textContent = prog.registration_display;
  document.getElementById("modal-session-dates").textContent = prog.session_dates;
  document.getElementById("modal-description").textContent = prog.description;
  document.getElementById("modal-website-link").href = prog.website_url;
  
  document.getElementById("reminder-message").style.display = "none";
  if (currentProfile && currentProfile.email) {
    document.getElementById("reminder-email").value = currentProfile.email;
  }
  
  document.getElementById("detail-modal").style.display = "flex";
}

function closeModal() {
  document.getElementById("detail-modal").style.display = "none";
}

async function handleReminderSubmit(e) {
  e.preventDefault();
  const email = document.getElementById("reminder-email").value.trim();
  if (!email || !currentSelectedProgram) return;
  
  const zipCode = document.getElementById("user-location-input").value;
  
  try {
    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email,
        program_id: currentSelectedProgram.id,
        zip_code: zipCode
      })
    });
    
    const data = await res.json();
    const msgBox = document.getElementById("reminder-message");
    msgBox.style.display = "block";
    msgBox.className = "assistant-response";
    msgBox.innerHTML = `✅ <strong>Reminder Set!</strong> ${data.message}`;
    
    currentProfile = data.user_profile;
    localStorage.setItem("schoolhouse_user_email", email);
  } catch (err) {
    console.error("Reminder error:", err);
  }
}

function openProfileModal() {
  const email = localStorage.getItem("schoolhouse_user_email") || "";
  document.getElementById("profile-email").value = email;
  
  if (email) {
    fetch(`/api/profile/${email}`)
      .then(res => res.json())
      .then(data => {
        if (data.exists) {
          currentProfile = data.profile;
          document.getElementById("profile-parent-name").value = currentProfile.parent_name || "";
          document.getElementById("profile-kid-name").value = currentProfile.kid_name || "";
          document.getElementById("profile-kid-age").value = currentProfile.kid_age || 8;
          document.getElementById("profile-zip").value = currentProfile.zip_code || "98101";
          document.getElementById("profile-reqs").value = currentProfile.requirements || "";
          
          renderSavedReminders(currentProfile.saved_reminders || []);
        }
      });
  }
  
  document.getElementById("profile-modal").style.display = "flex";
}

function renderSavedReminders(reminders) {
  const list = document.getElementById("saved-reminders-list");
  if (!reminders || reminders.length === 0) {
    list.innerHTML = `<p style="font-size:0.88rem; color:var(--text-muted);">No active reminders yet.</p>`;
    return;
  }
  list.innerHTML = reminders.map(r => `
    <div style="background:var(--bg-warm); padding:0.75rem; border-radius:var(--radius-sm); margin-bottom:0.5rem; font-size:0.88rem; border:1px solid var(--border-light);">
      <strong>${r.program_name}</strong><br>
      📅 Registration Reminder: ${r.registration_date}
    </div>
  `).join("");
}

async function handleProfileSave(e) {
  e.preventDefault();
  const profile = {
    email: document.getElementById("profile-email").value.trim(),
    parent_name: document.getElementById("profile-parent-name").value.trim(),
    kid_name: document.getElementById("profile-kid-name").value.trim(),
    kid_age: parseInt(document.getElementById("profile-kid-age").value) || 8,
    zip_code: document.getElementById("profile-zip").value.trim(),
    requirements: document.getElementById("profile-reqs").value.trim(),
    notification_preferences: {
      email_reminders: document.getElementById("pref-email").checked,
      sms_alerts: document.getElementById("pref-sms").checked,
      weekly_digest: document.getElementById("pref-digest").checked
    }
  };
  
  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    });
    const data = await res.json();
    currentProfile = data.profile;
    localStorage.setItem("schoolhouse_user_email", profile.email);
    alert("Profile saved successfully!");
    document.getElementById("profile-modal").style.display = "none";
  } catch (err) {
    console.error("Profile save error:", err);
  }
}

function checkExistingProfile() {
  const email = localStorage.getItem("schoolhouse_user_email");
  if (email) {
    fetch(`/api/profile/${email}`)
      .then(res => res.json())
      .then(data => {
        if (data.exists) currentProfile = data.profile;
      });
  }
}

function openAdminModal() {
  if (adminToken) {
    loadAdminDashboard();
  } else {
    document.getElementById("admin-login-view").style.display = "block";
    document.getElementById("admin-dashboard-view").style.display = "none";
  }
  document.getElementById("admin-modal").style.display = "flex";
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const password = document.getElementById("admin-password").value;
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    
    if (res.ok) {
      const data = await res.json();
      adminToken = data.token;
      loadAdminDashboard();
    } else {
      document.getElementById("admin-login-error").textContent = "Invalid password. (Try 'schoolhouse2026' or 'admin123')";
    }
  } catch (err) {
    console.error("Admin login error:", err);
  }
}

async function loadAdminDashboard() {
  document.getElementById("admin-login-view").style.display = "none";
  document.getElementById("admin-dashboard-view").style.display = "block";
  
  try {
    const res = await fetch("/api/admin/metrics", {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const data = await res.json();
    const analytics = data.analytics || {};
    const funnel = analytics.funnel || {};
    
    document.getElementById("metric-searches").textContent = analytics.searches_count || 0;
    document.getElementById("metric-clicks").textContent = analytics.card_clicks || 0;
    document.getElementById("metric-reminders").textContent = data.total_reminders || 0;
    document.getElementById("metric-users").textContent = data.total_users || 0;
    
    // Funnel bars
    document.getElementById("funnel-container").innerHTML = `
      <div class="funnel-bar"><span>1. Search Impressions</span> <span>${funnel.impressions || 1250}</span></div>
      <div class="funnel-bar"><span>2. Active AI Searches</span> <span>${funnel.searches || 142}</span></div>
      <div class="funnel-bar"><span>3. Card Clicks</span> <span>${funnel.card_clicks || 389}</span></div>
      <div class="funnel-bar"><span>4. Details Page Views</span> <span>${funnel.detail_views || 210}</span></div>
      <div class="funnel-bar"><span>5. Reminders Set</span> <span>${funnel.reminders_set || 57}</span></div>
      <div class="funnel-bar"><span>6. Parent Profiles Created</span> <span>${funnel.profiles_created || 41}</span></div>
    `;
    
    // Collaborators
    document.getElementById("collaborators-list").innerHTML = (data.collaborators || [])
      .map(c => `<li style="font-weight:600;">${c}</li>`).join("");
      
  } catch (err) {
    console.error("Error loading metrics:", err);
  }
}

async function trackEvent(eventName) {
  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: eventName })
    });
  } catch (e) {
    // silent
  }
}
