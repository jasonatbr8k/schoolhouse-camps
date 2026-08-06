import json
import os
import re
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Depends, Query, Body, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

app = FastAPI(
    title="Schoolhouse Camps & After-School Finder",
    description="Helping parents discover curated summer camps and after-school programs.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
PROGRAMS_FILE = os.path.join(DATA_DIR, "programs.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
REMINDERS_FILE = os.path.join(DATA_DIR, "reminders.json")
ANALYTICS_FILE = os.path.join(DATA_DIR, "analytics.json")

# Current simulation date: Aug 6, 2026
SIMULATED_TODAY = datetime(2026, 8, 6)

def load_json(filepath: str, default_data: Any) -> Any:
    if os.path.exists(filepath):
        try:
            with open(filepath, "r") as f:
                return json.load(f)
        except Exception:
            return default_data
    return default_data

def save_json(filepath: str, data: Any):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)

def init_analytics():
    default_analytics = {
        "searches_count": 142,
        "card_clicks": 389,
        "reminders_set": 57,
        "profiles_created": 41,
        "active_collaborators": ["owner@schoolhouse.com"],
        "funnel": {
            "impressions": 1250,
            "searches": 142,
            "card_clicks": 389,
            "detail_views": 210,
            "reminders_set": 57,
            "profiles_created": 41
        },
        "top_categories": {
            "STEM": 58,
            "Arts": 34,
            "Nature": 29,
            "Sports": 21,
            "After-School": 18
        },
        "recent_searches": [
            "STEM camps under $350 for 8yo in Seattle",
            "Art and clay after school",
            "Outdoor nature ranger near Presidio",
            "Soccer and multi-sport camp"
        ]
    }
    if not os.path.exists(ANALYTICS_FILE):
        save_json(ANALYTICS_FILE, default_analytics)

init_analytics()

class ChatRequest(BaseModel):
    query: str
    location: Optional[str] = "98101 - Seattle, WA"
    max_distance: Optional[float] = 25.0

class ProfileModel(BaseModel):
    email: EmailStr
    parent_name: Optional[str] = "Parent"
    kid_name: Optional[str] = ""
    kid_age: Optional[int] = 8
    zip_code: Optional[str] = "98101"
    notification_preferences: Optional[Dict[str, bool]] = {
        "email_reminders": True,
        "sms_alerts": False,
        "weekly_digest": True
    }
    requirements: Optional[str] = ""

class ReminderModel(BaseModel):
    email: EmailStr
    program_id: str
    kid_name: Optional[str] = ""
    kid_age: Optional[int] = None
    zip_code: Optional[str] = "98101"

class AdminLoginModel(BaseModel):
    password: str

class CollaboratorModel(BaseModel):
    email: EmailStr

# Helper filter for date, location, and distance
def filter_programs_by_location(programs: List[Dict], location_str: str = "Seattle", max_dist: float = 25.0) -> List[Dict]:
    filtered = []
    min_date = SIMULATED_TODAY + timedelta(days=1)
    max_date = SIMULATED_TODAY + timedelta(days=90)
    
    loc_lower = location_str.lower()
    is_seattle = "seattle" in loc_lower or "wa" in loc_lower or "9810" in loc_lower or "9811" in loc_lower or "9812" in loc_lower
    is_sf = "sf" in loc_lower or "san francisco" in loc_lower or "ca" in loc_lower or "9410" in loc_lower or "9411" in loc_lower
    
    for p in programs:
        try:
            reg_date = datetime.strptime(p["registration_date"], "%Y-%m-%d")
        except Exception:
            reg_date = SIMULATED_TODAY + timedelta(days=14)
            
        is_fresh = min_date <= reg_date <= max_date
        dist = p.get("distance_miles", 5.0)
        within_dist = dist <= max_dist
        
        # Region check
        p_region = p.get("region", "").lower()
        region_match = True
        if is_seattle:
            region_match = p_region == "seattle"
        elif is_sf:
            region_match = p_region == "sf"
            
        if is_fresh and within_dist and region_match:
            filtered.append(p)
            
    # Fallback to all if region filter produces < 3 results
    if len(filtered) < 3:
        filtered = [p for p in programs if (min_date <= datetime.strptime(p["registration_date"], "%Y-%m-%d") <= max_date)]
        
    return filtered

@app.get("/api/programs")
def get_programs(
    search: Optional[str] = None,
    category: Optional[str] = None,
    max_price: Optional[float] = None,
    max_distance: float = 25.0,
    location: Optional[str] = "Seattle"
):
    programs = load_json(PROGRAMS_FILE, [])
    programs = filter_programs_by_location(programs, location_str=location or "Seattle", max_dist=max_distance)
    
    if category and category.lower() != "all":
        programs = [p for p in programs if p.get("category", "").lower() == category.lower()]
        
    if max_price:
        programs = [p for p in programs if p.get("cost_value", 0) <= max_price]
        
    if search:
        search_terms = re.findall(r'\w+', search.lower())
        scored = []
        for p in programs:
            text = f"{p['name']} {p['organizer']} {p['short_description']} {p['description']} {' '.join(p['pills'])} {p['category']}".lower()
            score = sum(1 for term in search_terms if term in text)
            if score > 0 or not search_terms:
                scored.append((score, p))
        scored.sort(key=lambda x: x[0], reverse=True)
        programs = [item[1] for item in scored]
        
    return {"programs": programs, "count": len(programs), "location": location}

@app.post("/api/chat")
def chat_matching(req: ChatRequest):
    programs = load_json(PROGRAMS_FILE, [])
    
    # Check if query itself specifies location e.g. "in Seattle" or "in San Francisco"
    query = req.query.lower()
    effective_loc = req.location or "Seattle"
    if "seattle" in query or "wa" in query or "981" in query:
        effective_loc = "Seattle, WA"
    elif "san francisco" in query or "sf" in query or "soma" in query or "941" in query:
        effective_loc = "San Francisco, CA"
        
    programs = filter_programs_by_location(programs, location_str=effective_loc, max_dist=req.max_distance or 25.0)
    
    # Record analytics
    analytics = load_json(ANALYTICS_FILE, {})
    analytics["searches_count"] = analytics.get("searches_count", 0) + 1
    analytics.setdefault("recent_searches", []).insert(0, f"{req.query} ({effective_loc})")
    analytics["recent_searches"] = analytics["recent_searches"][:10]
    save_json(ANALYTICS_FILE, analytics)
    
    keywords = re.findall(r'\w+', query)
    stop_words = {"a", "an", "the", "in", "on", "for", "my", "i", "and", "or", "is", "of", "to", "under", "camp", "camps", "program", "programs", "looking"}
    content_terms = [kw for kw in keywords if kw not in stop_words and len(kw) > 2]
    
    age_match = re.search(r'(\d{1,2})\s*(yo|year|yr|age)', query)
    target_age = int(age_match.group(1)) if age_match else None
    
    budget_match = re.search(r'(under|\$|<)\s*(\d{2,4})', query)
    target_budget = float(budget_match.group(2)) if budget_match else None

    scored_programs = []
    
    for p in programs:
        match_score = 0
        reasons = []
        
        text_corpus = f"{p['name']} {p['organizer']} {p['short_description']} {p['description']} {' '.join(p['pills'])} {p['category']}".lower()
        
        matched_terms = []
        for term in content_terms:
            if term in text_corpus:
                match_score += 10
                matched_terms.append(term.capitalize())
                
        if matched_terms:
            reasons.append(f"Matches '{', '.join(matched_terms[:2])}'")
            
        if p["category"].lower() in query:
            match_score += 15
            reasons.append(f"{p['category']} Specialty")
            
        if target_age:
            age_nums = [int(s) for s in re.findall(r'\d+', p.get("age_range", ""))]
            if len(age_nums) >= 2 and age_nums[0] <= target_age <= age_nums[1]:
                match_score += 8
                reasons.append(f"Ideal for Age {target_age}")
                    
        if target_budget and p.get("cost_value", 999) <= target_budget:
            match_score += 12
            reasons.append(f"Under ${int(target_budget)}")
        elif "cheap" in query or "budget" in query or "affordable" in query:
            if p.get("cost_value", 999) <= 250:
                match_score += 10
                reasons.append("Budget Pick")
                
        if p.get("distance_miles", 10) <= 2.0:
            match_score += 6
            reasons.append("Ultra Local")
        elif p.get("distance_miles", 10) <= 5.0:
            match_score += 3
            reasons.append("Near You")
            
        p_copy = dict(p)
        if reasons:
            p_copy["surfaced_pills"] = reasons[:3]
        else:
            p_copy["surfaced_pills"] = p.get("pills", [])[:3]
            
        p_copy["relevance_score"] = match_score
        scored_programs.append((match_score, p_copy))
        
    scored_programs.sort(key=lambda x: x[0], reverse=True)
    ranked_programs = [item[1] for item in scored_programs]
    
    top_6 = ranked_programs[:6]
    top_names = [p['name'] for p in top_6[:2]] if top_6 else ["Featured Camp"]
    
    city_name = "Seattle" if "seattle" in effective_loc.lower() else "San Francisco"
    summary = f"Processed request '{req.query}' in **{city_name}**! Re-ranked {len(ranked_programs)} local programs within 25 miles. Featuring top matches **{top_names[0]}** and **{top_names[1]}**:"

    return {
        "reply": summary,
        "location": effective_loc,
        "featured_carousel": top_6,
        "full_catalog": ranked_programs,
        "total_matches": len(ranked_programs)
    }

@app.post("/api/reminders")
def set_reminder(model: ReminderModel):
    reminders = load_json(REMINDERS_FILE, [])
    users = load_json(USERS_FILE, {})
    programs = load_json(PROGRAMS_FILE, [])
    
    program = next((p for p in programs if p["id"] == model.program_id), None)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
        
    reminder_entry = {
        "id": f"rem-{len(reminders)+1:04d}",
        "email": model.email,
        "program_id": model.program_id,
        "program_name": program["name"],
        "registration_date": program["registration_date"],
        "created_at": SIMULATED_TODAY.strftime("%Y-%m-%d %H:%M:%S")
    }
    reminders.append(reminder_entry)
    save_json(REMINDERS_FILE, reminders)
    
    user_profile = users.get(model.email, {
        "email": model.email,
        "parent_name": "Parent",
        "kid_name": model.kid_name or "Kid",
        "kid_age": model.kid_age or 8,
        "zip_code": model.zip_code or "98101",
        "saved_reminders": []
    })
    user_profile["saved_reminders"] = user_profile.get("saved_reminders", [])
    user_profile["saved_reminders"].append(reminder_entry)
    users[model.email] = user_profile
    save_json(USERS_FILE, users)
    
    analytics = load_json(ANALYTICS_FILE, {})
    analytics["reminders_set"] = analytics.get("reminders_set", 0) + 1
    analytics["profiles_created"] = len(users)
    funnel = analytics.get("funnel", {})
    funnel["reminders_set"] = funnel.get("reminders_set", 0) + 1
    funnel["profiles_created"] = len(users)
    analytics["funnel"] = funnel
    save_json(ANALYTICS_FILE, analytics)
    
    return {
        "status": "success",
        "message": f"Reminder set for {program['name']}! An email reminder will be sent on {program['registration_display']}.",
        "reminder": reminder_entry,
        "user_profile": user_profile
    }

@app.get("/api/profile/{email}")
def get_profile(email: str):
    users = load_json(USERS_FILE, {})
    if email not in users:
        return {"profile": None, "exists": False}
    return {"profile": users[email], "exists": True}

@app.post("/api/profile")
def save_profile(profile: ProfileModel):
    users = load_json(USERS_FILE, {})
    users[profile.email] = profile.dict()
    save_json(USERS_FILE, users)
    
    analytics = load_json(ANALYTICS_FILE, {})
    analytics["profiles_created"] = len(users)
    analytics.setdefault("funnel", {})["profiles_created"] = len(users)
    save_json(ANALYTICS_FILE, analytics)
    
    return {"status": "success", "profile": users[profile.email]}

@app.post("/api/analytics/track")
def track_event(event: str = Body(..., embed=True)):
    analytics = load_json(ANALYTICS_FILE, {})
    funnel = analytics.get("funnel", {})
    if event == "card_click":
        analytics["card_clicks"] = analytics.get("card_clicks", 0) + 1
        funnel["card_clicks"] = funnel.get("card_clicks", 0) + 1
    elif event == "detail_view":
        funnel["detail_views"] = funnel.get("detail_views", 0) + 1
    analytics["funnel"] = funnel
    save_json(ANALYTICS_FILE, analytics)
    return {"status": "tracked"}

@app.post("/api/admin/login")
def admin_login(data: AdminLoginModel):
    if data.password in ["schoolhouse2026", "admin123"]:
        return {"authenticated": True, "token": "admin-session-valid-2026"}
    raise HTTPException(status_code=401, detail="Invalid admin password")

@app.get("/api/admin/metrics")
def get_admin_metrics(authorization: Optional[str] = Header(None)):
    analytics = load_json(ANALYTICS_FILE, {})
    users = load_json(USERS_FILE, {})
    reminders = load_json(REMINDERS_FILE, [])
    
    return {
        "analytics": analytics,
        "total_users": len(users),
        "total_reminders": len(reminders),
        "users_list": list(users.values()),
        "reminders_list": reminders,
        "collaborators": analytics.get("active_collaborators", ["owner@schoolhouse.com"])
    }

@app.post("/api/admin/collaborators")
def add_collaborator(collab: CollaboratorModel):
    analytics = load_json(ANALYTICS_FILE, {})
    collabs = analytics.get("active_collaborators", ["owner@schoolhouse.com"])
    if collab.email not in collabs:
        collabs.append(collab.email)
        analytics["active_collaborators"] = collabs
        save_json(ANALYTICS_FILE, analytics)
    return {"status": "success", "collaborators": collabs}

# Serve static files
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def read_root():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
