'use client';

import { useEffect, useRef, useState } from 'react';
import { DEGREES, DEGREE_LABELS, type Degree, type UserProfileDto } from '@odp/shared';
import { api, ApiError, getStoredToken } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { Badge, Button, Card, CardHeader, ErrorState, Meter, Skeleton } from '@/components/ui';

export default function ProfilePage() {
  return (
    <RequireAuth>
      <Profile />
    </RequireAuth>
  );
}

interface ExtractedResume {
  name: string | null;
  phone: string | null;
  city: string | null;
  skills: string[];
  education: {
    degree: Degree;
    branch: string | null;
    college: string | null;
    graduationYear: number | null;
    cgpa: number | null;
    percentage: number | null;
  }[];
  experience: { kind: string; title: string; organization: string | null; description: string | null }[];
  certifications: string[];
}

function Profile() {
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = (): void => {
    setError(null);
    api.profile
      .get()
      .then(setProfile)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your profile.'));
  };

  useEffect(load, []);

  const save = async (patch: Partial<UserProfileDto> & Record<string, unknown>): Promise<void> => {
    setSaving(true);
    setMessage(null);
    try {
      setProfile(await api.profile.update(patch));
      setMessage('Saved');
      setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  if (error && !profile) return <ErrorState message={error} retry={load} />;
  if (!profile) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Your profile</h1>
          <p className="mt-1 text-sm text-muted">
            Eligibility checks and match scores are computed from what you enter here.
          </p>
        </div>
        {message && <Badge tone="success">{message}</Badge>}
      </header>

      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">Profile completeness</p>
          <span className="text-sm font-semibold tabular-nums">{profile.profileCompletion}%</span>
        </div>
        <div className="mt-2">
          <Meter value={profile.profileCompletion} showValue={false} />
        </div>
      </Card>

      <ResumeSection profile={profile} onApplied={load} />

      <BasicsSection profile={profile} onSave={save} saving={saving} />
      <EducationSection profile={profile} onSave={save} saving={saving} />
      <SkillsSection profile={profile} onSave={save} saving={saving} />
      <PreferencesSection profile={profile} onSave={save} saving={saving} />
      <PrivacySection />
    </div>
  );
}

/* ---------------- Resume ---------------- */

function ResumeSection({ profile, onApplied }: { profile: UserProfileDto; onApplied: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedResume | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File): Promise<void> => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('resume', file);

      // FormData must not go through the JSON client.
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/api/resumes`, {
        method: 'POST',
        headers: { authorization: `Bearer ${getStoredToken() ?? ''}` },
        body: form,
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error?.message ?? 'Upload failed');

      if (payload.parseStatus === 'FAILED') {
        setError(payload.parseError ?? 'We could not read this file. Try a text-based PDF or DOCX.');
      } else {
        setExtracted(payload.extracted);
        setResumeId(payload.resumeId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const applyExtraction = async (): Promise<void> => {
    if (!resumeId || !extracted) return;
    await api.resumes.apply(resumeId, extracted);
    setExtracted(null);
    setResumeId(null);
    onApplied();
  };

  return (
    <Card>
      <CardHeader
        title="Resume"
        description="We extract your details for you to review — nothing is written to your profile until you confirm"
        action={
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} loading={uploading}>
            {profile.resumeId ? 'Replace' : 'Upload'}
          </Button>
        }
      />
      <div className="p-4">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />

        {error && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        {!extracted ? (
          <p className="text-sm text-muted">
            {profile.resumeId
              ? 'A resume is on file. Upload a new one to re-extract your details.'
              : 'Upload a PDF or DOCX (max 5 MB). We read your education, skills and experience so you do not have to type them.'}
          </p>
        ) : (
          <div className="space-y-4">
            <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
              Review what we found. Edit anything that is wrong, then apply it to your profile.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name" value={extracted.name ?? ''} onChange={(v) => setExtracted({ ...extracted, name: v })} />
              <Field label="Phone" value={extracted.phone ?? ''} onChange={(v) => setExtracted({ ...extracted, phone: v })} />
              <Field label="City" value={extracted.city ?? ''} onChange={(v) => setExtracted({ ...extracted, city: v })} />
            </div>

            <div>
              <p className="label">Skills found ({extracted.skills.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {extracted.skills.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => setExtracted({ ...extracted, skills: extracted.skills.filter((s) => s !== skill) })}
                    aria-label={`Remove ${skill}`}
                  >
                    <Badge tone="brand">{skill} <span aria-hidden="true">✕</span></Badge>
                  </button>
                ))}
                {extracted.skills.length === 0 && <p className="text-sm text-subtle">None detected.</p>}
              </div>
            </div>

            {extracted.education.length > 0 && (
              <div>
                <p className="label">Education found</p>
                <ul className="space-y-1 text-sm text-muted">
                  {extracted.education.map((edu, i) => (
                    <li key={i}>
                      {DEGREE_LABELS[edu.degree]}
                      {edu.branch && ` · ${edu.branch}`}
                      {edu.graduationYear && ` · ${edu.graduationYear}`}
                      {edu.cgpa != null && ` · CGPA ${edu.cgpa}`}
                      {edu.college && ` · ${edu.college}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => void applyExtraction()}>Apply to my profile</Button>
              <Button variant="outline" onClick={() => setExtracted(null)}>Discard</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------------- Sections ---------------- */

type SaveFn = (patch: Record<string, unknown>) => Promise<void>;

function BasicsSection({ profile, onSave, saving }: { profile: UserProfileDto; onSave: SaveFn; saving: boolean }) {
  const [form, setForm] = useState({
    name: profile.name,
    phone: profile.phone ?? '',
    city: profile.city ?? '',
    state: profile.state ?? '',
    country: profile.country ?? 'India',
    headline: profile.headline ?? '',
    dateOfBirth: profile.dateOfBirth?.slice(0, 10) ?? '',
    yearsOfExperience: profile.yearsOfExperience,
  });

  return (
    <Card>
      <CardHeader title="Basic information" description="Used for location matching and age-limited government posts" />
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Full name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label="Date of birth" type="date" value={form.dateOfBirth} onChange={(v) => setForm({ ...form, dateOfBirth: v })} />
        <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
        <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
        <Field label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
        <Field label="Headline" value={form.headline} onChange={(v) => setForm({ ...form, headline: v })} className="sm:col-span-2" />
        <Field
          label="Years of experience"
          type="number"
          value={String(form.yearsOfExperience)}
          onChange={(v) => setForm({ ...form, yearsOfExperience: Number(v) || 0 })}
        />
      </div>
      <div className="border-t border-border p-4">
        <Button
          loading={saving}
          onClick={() =>
            void onSave({
              name: form.name,
              phone: form.phone || null,
              city: form.city || null,
              state: form.state || null,
              country: form.country || null,
              headline: form.headline || null,
              dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth).toISOString() : null,
              yearsOfExperience: form.yearsOfExperience,
            })
          }
        >
          Save basics
        </Button>
      </div>
    </Card>
  );
}

function EducationSection({ profile, onSave, saving }: { profile: UserProfileDto; onSave: SaveFn; saving: boolean }) {
  const [rows, setRows] = useState(
    profile.education.length
      ? profile.education
      : [{
          degree: 'B_TECH' as Degree, branch: '', university: null, college: '',
          graduationYear: new Date().getFullYear(), currentYear: null, cgpa: null,
          percentage: null, backlogs: 0, isPrimary: true,
        }],
  );

  const update = (index: number, patch: Record<string, unknown>): void => {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <Card>
      <CardHeader
        title="Education"
        description="Degree, branch, batch, CGPA and backlogs decide most eligibility checks"
      />
      <div className="space-y-4 p-4">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="label">Degree</label>
              <select className="input" value={row.degree} onChange={(e) => update(index, { degree: e.target.value })}>
                {DEGREES.map((degree) => (
                  <option key={degree} value={degree}>{DEGREE_LABELS[degree]}</option>
                ))}
              </select>
            </div>
            <Field label="Branch" value={row.branch ?? ''} onChange={(v) => update(index, { branch: v })} placeholder="CSE" />
            <Field label="College" value={row.college ?? ''} onChange={(v) => update(index, { college: v })} />
            <Field
              label="Graduation year"
              type="number"
              value={String(row.graduationYear ?? '')}
              onChange={(v) => update(index, { graduationYear: v ? Number(v) : null })}
            />
            <Field
              label="CGPA (out of 10)"
              type="number"
              value={String(row.cgpa ?? '')}
              onChange={(v) => update(index, { cgpa: v ? Number(v) : null })}
            />
            <Field
              label="Percentage"
              type="number"
              value={String(row.percentage ?? '')}
              onChange={(v) => update(index, { percentage: v ? Number(v) : null })}
            />
            <Field
              label="Active backlogs"
              type="number"
              value={String(row.backlogs ?? 0)}
              onChange={(v) => update(index, { backlogs: v ? Number(v) : 0 })}
            />
            <Field
              label="Current year of study"
              type="number"
              value={String(row.currentYear ?? '')}
              onChange={(v) => update(index, { currentYear: v ? Number(v) : null })}
            />
            {rows.length > 1 && (
              <button
                type="button"
                className="justify-self-start text-xs text-danger hover:underline"
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            )}
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setRows([
              ...rows,
              {
                degree: 'B_TECH' as Degree, branch: '', university: null, college: '',
                graduationYear: null, currentYear: null, cgpa: null, percentage: null,
                backlogs: 0, isPrimary: false,
              },
            ])
          }
        >
          Add another qualification
        </Button>
      </div>
      <div className="border-t border-border p-4">
        <Button loading={saving} onClick={() => void onSave({ education: rows })}>Save education</Button>
      </div>
    </Card>
  );
}

function SkillsSection({ profile, onSave, saving }: { profile: UserProfileDto; onSave: SaveFn; saving: boolean }) {
  const [skills, setSkills] = useState<string[]>(profile.skills);
  const [draft, setDraft] = useState('');

  const add = (): void => {
    const value = draft.trim();
    if (!value || skills.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setDraft('');
      return;
    }
    setSkills([...skills, value]);
    setDraft('');
  };

  return (
    <Card>
      <CardHeader title="Skills" description="Add as many as you like — these drive skill matching and gap analysis" />
      <div className="p-4">
        <div className="mb-3 flex gap-2">
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Type a skill and press Enter"
            aria-label="Add a skill"
          />
          <Button variant="outline" onClick={add}>Add</Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <button key={skill} type="button" onClick={() => setSkills(skills.filter((s) => s !== skill))} aria-label={`Remove ${skill}`}>
              <Badge tone="brand">{skill} <span aria-hidden="true">✕</span></Badge>
            </button>
          ))}
          {skills.length === 0 && <p className="text-sm text-subtle">No skills added yet.</p>}
        </div>
      </div>
      <div className="border-t border-border p-4">
        <Button loading={saving} onClick={() => void onSave({ skills })}>Save skills</Button>
      </div>
    </Card>
  );
}

function PreferencesSection({ profile, onSave, saving }: { profile: UserProfileDto; onSave: SaveFn; saving: boolean }) {
  const [prefs, setPrefs] = useState(profile.preferences);
  const [roleDraft, setRoleDraft] = useState('');
  const [locationDraft, setLocationDraft] = useState('');

  const addTo = (key: 'desiredRoles' | 'preferredLocations', value: string): void => {
    const cleaned = value.trim();
    if (!cleaned) return;
    setPrefs({ ...prefs, [key]: [...new Set([...prefs[key], cleaned])] });
  };

  return (
    <Card>
      <CardHeader title="Preferences" description="What you want next — used by the career-preference part of your match score" />
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <label className="label">Target roles</label>
          <div className="flex gap-2">
            <input
              className="input"
              value={roleDraft}
              onChange={(e) => setRoleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTo('desiredRoles', roleDraft);
                  setRoleDraft('');
                }
              }}
              placeholder="Data Analyst"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {prefs.desiredRoles.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setPrefs({ ...prefs, desiredRoles: prefs.desiredRoles.filter((r) => r !== role) })}
              >
                <Badge>{role} ✕</Badge>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Preferred locations</label>
          <input
            className="input"
            value={locationDraft}
            onChange={(e) => setLocationDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTo('preferredLocations', locationDraft);
                setLocationDraft('');
              }
            }}
            placeholder="Bengaluru"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {prefs.preferredLocations.map((location) => (
              <button
                key={location}
                type="button"
                onClick={() =>
                  setPrefs({ ...prefs, preferredLocations: prefs.preferredLocations.filter((l) => l !== location) })
                }
              >
                <Badge>{location} ✕</Badge>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="workmode">Work mode</label>
          <select
            id="workmode"
            className="input"
            value={prefs.remotePreference}
            onChange={(e) => setPrefs({ ...prefs, remotePreference: e.target.value as never })}
          >
            <option value="ANY">No preference</option>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ONSITE">On-site</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="opptype">Looking for</label>
          <select
            id="opptype"
            className="input"
            value={prefs.opportunityPreference}
            onChange={(e) => setPrefs({ ...prefs, opportunityPreference: e.target.value as never })}
          >
            <option value="ANY">Both</option>
            <option value="INTERNSHIP">Internships</option>
            <option value="FULL_TIME">Full-time roles</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="sector">Sector</label>
          <select
            id="sector"
            className="input"
            value={prefs.sectorPreference}
            onChange={(e) => setPrefs({ ...prefs, sectorPreference: e.target.value as never })}
          >
            <option value="ANY">No preference</option>
            <option value="PRIVATE">Private</option>
            <option value="GOVERNMENT">Government &amp; PSU</option>
          </select>
        </div>

        <Field
          label="Minimum expected salary (₹ per year)"
          type="number"
          value={String(prefs.minSalaryExpectation ?? '')}
          onChange={(v) => setPrefs({ ...prefs, minSalaryExpectation: v ? Number(v) : null })}
        />

        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-[rgb(var(--brand))]"
            checked={prefs.willingToRelocate}
            onChange={(e) => setPrefs({ ...prefs, willingToRelocate: e.target.checked })}
          />
          I am willing to relocate
        </label>
      </div>
      <div className="border-t border-border p-4">
        <Button loading={saving} onClick={() => void onSave({ preferences: prefs })}>Save preferences</Button>
      </div>
    </Card>
  );
}

function PrivacySection() {
  const [confirming, setConfirming] = useState(false);

  return (
    <Card>
      <CardHeader title="Your data" description="Export everything, or delete your account permanently" />
      <div className="flex flex-wrap gap-2 p-4">
        <Button
          variant="outline"
          onClick={() => {
            const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
            // Streamed as a download by the API with the auth header applied.
            void fetch(`${base}/api/profile/export`, {
              headers: { authorization: `Bearer ${getStoredToken() ?? ''}` },
            })
              .then((res) => res.blob())
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'my-data.json';
                link.click();
                URL.revokeObjectURL(url);
              });
          }}
        >
          Export my data
        </Button>

        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-danger">This permanently deletes everything. Sure?</span>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                void api.profile.deleteAccount().then(() => {
                  window.localStorage.clear();
                  window.location.href = '/';
                })
              }
            >
              Delete permanently
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)} className="text-danger">
            Delete my account
          </Button>
        )}
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} type={type} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
