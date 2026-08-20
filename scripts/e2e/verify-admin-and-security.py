#!/usr/bin/env python3
"""Admin journey + security boundaries against the live API."""
import json, time, urllib.parse, urllib.request, urllib.error

API = "http://localhost:4000/api"
G, R, D = "\033[32m", "\033[31m", "\033[0m"
passed = failed = 0

def call(method, path, token=None, body=None):
    req = urllib.request.Request(f"{API}{path}",
                                 data=json.dumps(body).encode() if body is not None else None,
                                 method=method)
    if body is not None: req.add_header("content-type", "application/json")
    if token: req.add_header("authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw

def check(label, cond, note=""):
    global passed, failed
    if cond: passed += 1; print(f"  {G}✓{D} {label:<54} {note}")
    else:    failed += 1; print(f"  {R}✗{D} {label:<54} {note}")

def section(t): print(f"\n── {t} " + "─" * max(0, 66 - len(t)))

_, login = call("POST", "/auth/login", body={"email": "admin@example.com", "password": "Admin@12345"})
admin = login["accessToken"]
_, slogin = call("POST", "/auth/login", body={"email": "student@example.com", "password": "Student@12345"})
student = slogin["accessToken"]

section("Admin: analytics and monitoring")
st, an = call("GET", "/admin/analytics", admin)
check("Platform analytics", st == 200 and an["totals"]["opportunities"] > 0,
      f'{an["totals"]["opportunities"]} opportunities, {an["totals"]["companies"]} companies')
check("Government vs private split", len(an["governmentVsPrivate"]) == 2,
      str([(x["name"], x["count"]) for x in an["governmentVsPrivate"]]))
check("Internship vs full-time split", len(an["internshipVsFullTime"]) == 2,
      str([(x["name"], x["count"]) for x in an["internshipVsFullTime"]]))
check("Breakdown by industry", len(an["byIndustry"]) > 0, str([x["name"] for x in an["byIndustry"][:3]]))
check("Most demanded skills", len(an["topSkills"]) > 0, str([x["name"] for x in an["topSkills"][:4]]))
st, dq = call("GET", "/admin/data-quality", admin)
check("Data quality report", st == 200 and dq["total"] > 0,
      f'{dq["total"]} live, flagged={dq["review"]["flagged"]}, unverified={dq["review"]["unverified"]}')
st, sh = call("GET", "/admin/system-health", admin)
check("System health", sh["database"]["status"] == "ok", f'db {sh["database"]["latencyMs"]}ms')

section("Admin: sources and ingestion")
st, sources = call("GET", "/admin/sources", admin)
mock = next(s for s in sources if s["kind"] == "MOCK")
check("Sources listed with policy", st == 200, f'{len(sources)} sources')
check("robots.txt honoured flag", all(s["respectsRobotsTxt"] for s in sources))
check("Live connectors ship disabled",
      all(not s["enabled"] for s in sources if s["kind"] in {"GREENHOUSE", "LEVER", "GOVERNMENT_FEED", "JSON_API"}),
      "verification is a human step")
check("Cumulative stats", mock["stats"]["fetched"] > 0, f'fetched {mock["stats"]["fetched"]}, created {mock["stats"]["created"]}')
st, run = call("POST", f"/admin/sources/{mock['id']}/run?sync=true", admin)
check("Trigger a source run", st == 200 and run["result"]["status"] == "SUCCESS",
      f'{run["result"]["fetched"]} fetched, {run["result"]["created"]} new, {run["result"]["duplicates"]} dupes')
st, jobs = call("GET", "/admin/ingestion/jobs", admin)
check("Ingestion job history", len(jobs["items"]) > 0, f'{jobs["total"]} runs recorded')
st, logs = call("GET", f'/admin/ingestion/jobs/{jobs["items"][0]["id"]}/logs', admin)
check("Per-record ingestion log", isinstance(logs, list), f'{len(logs)} entries')

section("Admin: moderation")
st, dupes = call("GET", "/admin/duplicates", admin)
check("Duplicate review queue", st == 200, f'{len(dupes)} candidate groups')
st, flagged = call("GET", "/admin/flagged", admin)
check("Safety review queue", st == 200, f'{len(flagged)} flagged')

st, created = call("POST", "/admin/opportunities", admin, {
    "title": "E2E Verification Trainee", "organizationName": "E2E Test Nigam",
    "opportunityType": "PSU_JOB", "applicationUrl": "https://example.gov.in/e2e/1",
    "description": "Created by the end-to-end verification run.",
    "applicationDeadline": "2026-12-31T00:00:00.000Z", "skills": ["AutoCAD"],
    "eligibility": {"degrees": ["B_TECH"], "branches": ["Mechanical"], "minCgpa": 6.5}})
check("Create an opportunity", st == 201, created.get("title", ""))
check("Manual entry still carries a source", len(created["sources"]) > 0,
      f'{created["sourceName"]}')
oid = created["id"]
check("Verify an opportunity", call("POST", f"/admin/opportunities/{oid}/status", admin, {"status": "VERIFIED"})[0] == 204)
check("Expire an opportunity", call("POST", f"/admin/opportunities/{oid}/status", admin, {"status": "EXPIRED"})[0] == 204)
check("Soft-delete an opportunity", call("DELETE", f"/admin/opportunities/{oid}", admin)[0] == 204)
st, pub = call("GET", f"/opportunities?pageSize=50")
check("Deleted row leaves public search", all(i["id"] != oid for i in pub["items"]))

section("Admin: runtime taxonomy extension")
st, ind = call("POST", "/admin/industries", admin, {"name": f"Maritime Logistics {int(time.time())}"})
check("Add an industry without deploying", st == 201, ind.get("slug", ""))
st, dom = call("POST", "/admin/domains", admin, {"industryId": ind["id"], "name": "Port Operations"})
check("Add a domain without deploying", st == 201, dom.get("slug", ""))
st, tax = call("GET", "/taxonomy")
check("New taxonomy is immediately filterable",
      any(i["slug"] == ind["slug"] for i in tax["industries"]))

section("Admin: users and audit")
st, users = call("GET", "/admin/users", admin)
check("List users", st == 200 and users["total"] >= 2, f'{users["total"]} users')
check("Cannot demote yourself",
      call("POST", f'/admin/users/{[u for u in users["items"] if u["role"] == "ADMIN"][0]["id"]}/role',
           admin, {"role": "STUDENT"})[0] == 409)
st, audit = call("GET", "/admin/audit-log", admin)
check("Audit log records actions", len(audit) > 0,
      str(sorted({a["action"] for a in audit})[:4]))

section("Security boundaries")
check("Anonymous blocked from admin", call("GET", "/admin/analytics")[0] == 401)
check("Student blocked from admin", call("GET", "/admin/analytics", student)[0] == 403)
check("Student cannot create opportunities",
      call("POST", "/admin/opportunities", student, {"title": "x"})[0] == 403)
check("Student cannot list users", call("GET", "/admin/users", student)[0] == 403)
check("Tampered token rejected", call("GET", "/auth/me", admin[:-4] + "aaaa")[0] == 401)
check("Anonymous cannot read a profile", call("GET", "/profile")[0] == 401)
check("Anonymous cannot export data", call("GET", "/profile/export")[0] == 401)
check("Anonymous cannot use the assistant", call("POST", "/assistant/ask", body={"question": "hi"})[0] == 401)

# Cross-tenant isolation: one student must not read another's application.
_, u1 = call("POST", "/auth/register", body={"name": "User One", "email": f"iso1-{int(time.time())}@example.com", "password": "Password1"})
_, u2 = call("POST", "/auth/register", body={"name": "User Two", "email": f"iso2-{int(time.time())}@example.com", "password": "Password1"})
_, opp = call("GET", "/opportunities?pageSize=1")
target = opp["items"][0]["id"]
_, app1 = call("POST", "/applications", u1["accessToken"], {"opportunityId": target})
check("A user cannot read another's application",
      call("GET", f'/applications/{app1["id"]}', u2["accessToken"])[0] == 404)
check("A user cannot modify another's application",
      call("PATCH", f'/applications/{app1["id"]}', u2["accessToken"], {"status": "OFFER"})[0] == 404)
check("A user cannot delete another's application",
      call("DELETE", f'/applications/{app1["id"]}', u2["accessToken"])[0] == 404)

section("Input validation")
check("Rejects a bad opportunity type", call("GET", "/opportunities?types=NONSENSE")[0] == 400)
check("Rejects an oversized page size",
      call("GET", "/opportunities?pageSize=99999")[0] == 400)
check("Rejects a malformed uuid", call("POST", "/applications", u1["accessToken"], {"opportunityId": "not-a-uuid"})[0] == 400)
check("Unknown opportunity is 404", call("GET", "/opportunities/does-not-exist-slug")[0] == 404)
check("Unknown route is 404", call("GET", "/no/such/route")[0] == 404)
st, inj = call("GET", "/opportunities?" + urllib.parse.urlencode({"q": "'; DROP TABLE opportunities; --"}))
check("SQL injection attempt is inert", st == 200, f'{inj["total"]} hits, table intact')

for t in [u1["refreshToken"], u2["refreshToken"]]:
    call("POST", "/auth/logout", body={"refreshToken": t})

print(f"\n{'=' * 74}")
print(f"ADMIN + SECURITY: {G if not failed else R}{passed} passed, {failed} failed{D}")
raise SystemExit(1 if failed else 0)
