#!/usr/bin/env python3
"""Live end-to-end walkthrough of requirement 52 (definition of done)."""
import json, time, urllib.parse, urllib.request, urllib.error

API = "http://localhost:4000/api"
G, R, Y, D = "\033[32m", "\033[31m", "\033[33m", "\033[0m"
passed, failed = 0, 0

def call(method, path, token=None, body=None, raw=False):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data: req.add_header("content-type", "application/json")
    if token: req.add_header("authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            payload = r.read()
            return (r.status, json.loads(payload) if payload and not raw else payload)
    except urllib.error.HTTPError as e:
        payload = e.read()
        try: return (e.code, json.loads(payload))
        except Exception: return (e.code, payload)

def q(path, params, token=None):
    return call("GET", f"{path}?{urllib.parse.urlencode(params)}", token)

def check(label, cond, note=""):
    global passed, failed
    if cond:
        passed += 1; print(f"  {G}✓{D} {label:<54} {note}")
    else:
        failed += 1; print(f"  {R}✗{D} {label:<54} {note}")
    return cond

def section(t): print(f"\n── {t} " + "─" * max(0, 66 - len(t)))

email = f"e2e-{int(time.time())}@example.com"

section("1. Account creation")
st, reg = call("POST", "/auth/register", body={"name": "Rahul Sharma", "email": email, "password": "Password1"})
token = reg.get("accessToken") if isinstance(reg, dict) else None
check("Create an account", st == 201 and bool(token), f"HTTP {st}")
check("No password hash leaked", "passwordHash" not in json.dumps(reg))
check("Weak password rejected",
      call("POST", "/auth/register", body={"name": "X Y", "email": "w@e.com", "password": "short"})[0] == 400)

section("2. Build the career profile")
st, prof = call("PUT", "/profile", token, {
    "city": "Bengaluru", "state": "Karnataka", "yearsOfExperience": 0,
    "skills": ["Python", "SQL", "Pandas", "Excel"],
    "education": [{"degree": "B_TECH", "branch": "CSE", "college": "RVCE",
                   "graduationYear": 2026, "cgpa": 8.4, "backlogs": 0, "isPrimary": True}],
    "preferences": {"desiredRoles": ["Data Analyst"], "preferredLocations": ["Bengaluru"],
                    "opportunityPreference": "ANY", "sectorPreference": "ANY"}})
check("Education, skills and preferences saved",
      prof["education"][0]["degree"] == "B_TECH" and "Python" in prof["skills"],
      f"completion {prof['profileCompletion']}%")

section("3. Search and natural language")
st, s = q("/opportunities", {"pageSize": 10}, token)
check("Search returns opportunities", s["total"] > 0, f"{s['total']} total")
check("Facets returned", len(s["facets"]["types"]) > 0, f"{len(s['facets']['types'])} type facets")

for query in ["Software Engineer fresher", "Data Analyst internship", "AI internship remote",
              "Government jobs for BTech CSE", "PSU jobs 2026", "Mechanical engineering jobs",
              "MBA marketing internship", "Python developer fresher"]:
    st, r = q("/opportunities", {"q": query, "pageSize": 1}, token)
    check(f'NL: "{query}"', bool(r.get("interpretation")), f"{r['total']:>3} hits · {r.get('interpretation','')[:52]}")

section("4. Dedicated modules")
for module, allowed in [("internships", {"INTERNSHIP", "GOVERNMENT_INTERNSHIP", "RESEARCH_OPPORTUNITY"}),
                        ("government", None), ("psu", {"PSU_JOB"}), ("freshers", None)]:
    st, r = q(f"/opportunities/{module}", {"pageSize": 25}, token)
    types = {i["opportunityType"] for i in r["items"]}
    okay = r["total"] > 0 and (allowed is None or types <= allowed)
    check(f"Module /{module}", okay, f"{r['total']:>3} results · {sorted(types)}")

section("5. Eligibility and matching")
st, m = q("/opportunities", {"sort": "match", "pageSize": 50}, token)
items = m["items"]
scores = [i["match"]["overall"] for i in items]
check("Match score present", bool(scores), f"top {scores[0]}%, low {scores[-1]}%")
check("Six scoring components", len(items[0]["match"]["components"]) == 6)
check("Results ordered by match", scores == sorted(scores, reverse=True))
check("Ineligible capped at 35%",
      all(i["match"]["overall"] <= 35 for i in items if i["eligibility"]["verdict"] == "NOT_ELIGIBLE"),
      f'{sum(1 for i in items if i["eligibility"]["verdict"] == "NOT_ELIGIBLE")} ineligible in page')
check("Needs-review capped at 82%",
      all(i["match"]["overall"] <= 82 for i in items if i["eligibility"]["verdict"] == "NEEDS_REVIEW"),
      f'{sum(1 for i in items if i["eligibility"]["verdict"] == "NEEDS_REVIEW")} needs-review')
check("Every component carries an explanation",
      all(len(c["explanation"]) > 5 for c in items[0]["match"]["components"]))
st, el = q("/opportunities", {"eligibleOnly": "true", "pageSize": 20}, token)
check("eligibleOnly is honest",
      all(i["eligibility"]["verdict"] == "ELIGIBLE" for i in el["items"]), f"{el['total']} eligible")

top = items[0]
section("6. Opportunity detail")
st, det = call("GET", f"/opportunities/{top['slug']}", token)
check("Detail page loads", st == 200, det["title"][:44])
check("Eligibility reasons explained",
      len(det["eligibility"]["passed"]) + len(det["eligibility"]["failed"]) + len(det["eligibility"]["unknown"]) > 0,
      f'verdict {det["eligibility"]["verdict"]}, {len(det["eligibility"]["passed"])} passed')
check("Source retained", len(det["sources"]) > 0, f'{det["sourceName"]} · {det["trustLevel"]}')
check("Official application URL", det["applicationUrl"].startswith("http"))
check("Last verified recorded", det["lastVerifiedAt"] is not None)
check("JSON-LD JobPosting", det["seo"]["jsonLd"]["@type"] == "JobPosting")
check("Canonical URL", det["seo"]["canonicalUrl"].endswith(det["slug"]))
check('Missing data reads "Not Specified"',
      all(v != "" for v in [det["salaryLabel"], det["locationLabel"], det["experienceLabel"]]))

section("7. Skill gap")
st, gap = call("GET", f"/dashboard/skill-gap?opportunityId={top['id']}", token)
check("Gap for one opportunity", "matchPercent" in gap,
      f'{gap["matchPercent"]}% · missing {gap["missingSkills"][:3]}')
st, gm = call("GET", "/dashboard/skill-gap", token)
check("Gap across the matched market", len(gm["recommendedLearning"]) > 0,
      f'learn {[r["skill"] for r in gm["recommendedLearning"][:3]]}')

section("8. Save, apply and track")
check("Save an opportunity", call("POST", "/saved", token, {"opportunityId": top["id"]})[0] == 201)
check("Saved list reflects it", call("GET", "/saved", token)[1]["total"] == 1)
st, app = call("POST", "/applications", token, {"opportunityId": top["id"], "status": "APPLIED"})
check("Track an application", st == 201, f'appliedAt stamped: {app["appliedAt"] is not None}')
for stage in ["ASSESSMENT", "TECHNICAL_INTERVIEW", "OFFER"]:
    call("PATCH", f"/applications/{app['id']}", token, {"status": stage})
st, af = call("GET", f"/applications/{app['id']}", token)
check("Stage history recorded", len(af["events"]) == 4, str([e["status"] for e in af["events"]]))
check("Duplicate tracking rejected",
      call("POST", "/applications", token, {"opportunityId": top["id"]})[0] == 409)
st, an = call("GET", "/applications/analytics", token)
check("Application analytics", an["offers"] == 1, f'{an["applications"]} applied, {an["offers"]} offer')

section("9. Deadlines, companies, dashboard")
st, dl = call("GET", "/opportunities/deadlines", token)
check("Deadline buckets", len(dl) > 0, str([(g["label"], len(g["items"])) for g in dl]))
st, comps = q("/companies", {"pageSize": 1}, token)
cid = comps["items"][0]["id"]
check("Follow a company", call("POST", f"/companies/{cid}/follow", token)[0] == 201)
check("Following list", len(call("GET", "/companies/following", token)[1]) == 1)
st, db = call("GET", "/dashboard", token)
check("Personalised dashboard", db["greeting"].startswith("Good"),
      f'{db["greeting"]}, {db["user"]["name"]} · {db["stats"]["matchingOpportunities"]} matches')
check("Career readiness", len(db["readiness"]["breakdown"]) == 6, f'{db["readiness"]["overall"]}/100')
check("Recommended feed populated", len(db["recommended"]) > 0, f'{len(db["recommended"])} cards')
st, rec = call("GET", "/dashboard/recommendations", token)
check("Career recommendations", "roles" in rec, f'{[r["name"] for r in rec["roles"][:3]]}')

section("10. AI assistant (grounding)")
for question in ["Which jobs am I eligible for?", "What companies are hiring freshers?",
                 "Find opportunities closing this week", "What skills should I learn for AI engineering?"]:
    st, ans = call("POST", "/assistant/ask", token, {"question": question})
    cites = ans["message"]["citations"]
    grounded = all(call("GET", f"/opportunities/{c['opportunityId']}")[0] == 200 for c in cites)
    complete = all(c["applicationUrl"].startswith("http") and c["sourceName"] and c["deadline"] for c in cites)
    check(f'Assistant: "{question[:40]}"', st == 200 and grounded and complete,
          f"{len(cites)} citations, all real" if cites else "no citations (advice answer)")

section("11. Privacy")
st, ex = call("GET", "/profile/export", token)
check("Export my data", ex["user"]["email"] == email,
      f'{len(ex["applications"])} applications, {len(ex["savedOpportunities"])} saved')
check("Delete my account", call("DELETE", "/profile/account", token)[0] == 204)
check("Deleted account cannot authenticate", call("GET", "/auth/me", token)[0] == 401)

print(f"\n{'=' * 74}")
colour = G if failed == 0 else R
print(f"STUDENT JOURNEY: {colour}{passed} passed, {failed} failed{D}")
raise SystemExit(1 if failed else 0)
