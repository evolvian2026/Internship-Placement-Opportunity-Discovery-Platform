'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DEGREES, DEGREE_LABELS, type Degree } from '@odp/shared';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { Badge, Button, Card } from '@/components/ui';

export default function OnboardingPage() {
  return (
    <RequireAuth>
      <Onboarding />
    </RequireAuth>
  );
}

const SUGGESTED_SKILLS = [
  'Python', 'Java', 'JavaScript', 'SQL', 'Excel', 'C++', 'React', 'Node.js',
  'Data Structures', 'Machine Learning', 'Power BI', 'AutoCAD', 'Communication',
  'Digital Marketing', 'Accounting', 'Figma',
];

/** Three short steps — enough for the eligibility engine to work from. */
function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [education, setEducation] = useState({
    degree: 'B_TECH' as Degree,
    branch: 'CSE',
    college: '',
    graduationYear: new Date().getFullYear(),
    cgpa: '',
    backlogs: 0,
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [preferences, setPreferences] = useState({
    city: '',
    opportunityPreference: 'ANY' as 'ANY' | 'INTERNSHIP' | 'FULL_TIME',
    sectorPreference: 'ANY' as 'ANY' | 'GOVERNMENT' | 'PRIVATE',
    remotePreference: 'ANY' as 'ANY' | 'REMOTE' | 'HYBRID' | 'ONSITE',
  });

  const finish = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await api.profile.update({
        city: preferences.city || null,
        skills,
        education: [
          {
            degree: education.degree,
            branch: education.branch || null,
            college: education.college || null,
            graduationYear: education.graduationYear,
            cgpa: education.cgpa ? Number(education.cgpa) : null,
            backlogs: education.backlogs,
            isPrimary: true,
          },
        ],
        preferences: {
          opportunityPreference: preferences.opportunityPreference,
          sectorPreference: preferences.sectorPreference,
          remotePreference: preferences.remotePreference,
          preferredLocations: preferences.city ? [preferences.city] : [],
        },
      });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile.');
      setSaving(false);
    }
  };

  const steps = ['Education', 'Skills', 'Preferences'];

  return (
    <div className="mx-auto max-w-xl py-6">
      <h1 className="text-2xl font-bold">Set up your profile</h1>
      <p className="mt-1 text-sm text-muted">
        Three quick steps. This is what the eligibility engine checks against.
      </p>

      <ol className="mt-6 flex gap-2" aria-label="Progress">
        {steps.map((label, index) => (
          <li key={label} className="flex-1">
            <div className={`h-1 rounded-full ${index <= step ? 'bg-brand' : 'bg-surface-2'}`} />
            <p className={`mt-1.5 text-xs ${index <= step ? 'font-medium text-brand' : 'text-subtle'}`}>{label}</p>
          </li>
        ))}
      </ol>

      {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <Card className="mt-5 p-5">
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="degree">Degree</label>
                <select
                  id="degree"
                  className="input"
                  value={education.degree}
                  onChange={(e) => setEducation({ ...education, degree: e.target.value as Degree })}
                >
                  {DEGREES.map((degree) => (
                    <option key={degree} value={degree}>{DEGREE_LABELS[degree]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="branch">Branch / specialisation</label>
                <input id="branch" className="input" value={education.branch} onChange={(e) => setEducation({ ...education, branch: e.target.value })} placeholder="CSE" />
              </div>
              <div>
                <label className="label" htmlFor="year">Graduation year</label>
                <input id="year" type="number" className="input" value={education.graduationYear} onChange={(e) => setEducation({ ...education, graduationYear: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label" htmlFor="cgpa">CGPA (out of 10)</label>
                <input id="cgpa" type="number" step="0.01" className="input" value={education.cgpa} onChange={(e) => setEducation({ ...education, cgpa: e.target.value })} placeholder="8.4" />
              </div>
              <div>
                <label className="label" htmlFor="college">College</label>
                <input id="college" className="input" value={education.college} onChange={(e) => setEducation({ ...education, college: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="backlogs">Active backlogs</label>
                <input id="backlogs" type="number" min={0} className="input" value={education.backlogs} onChange={(e) => setEducation({ ...education, backlogs: Number(e.target.value) })} />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="label">Pick the skills you have</p>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...SUGGESTED_SKILLS, ...skills])].map((skill) => {
                const selected = skills.includes(skill);
                return (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => setSkills(selected ? skills.filter((s) => s !== skill) : [...skills, skill])}
                    aria-pressed={selected}
                  >
                    <Badge tone={selected ? 'brand' : 'neutral'}>{selected ? '✓ ' : '+ '}{skill}</Badge>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-muted">
              You can add unlimited skills later, or upload a resume and we will extract them.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="city">Your city</label>
              <input id="city" className="input" value={preferences.city} onChange={(e) => setPreferences({ ...preferences, city: e.target.value })} placeholder="Bengaluru" />
            </div>
            <div>
              <label className="label" htmlFor="looking">What are you looking for?</label>
              <select id="looking" className="input" value={preferences.opportunityPreference} onChange={(e) => setPreferences({ ...preferences, opportunityPreference: e.target.value as never })}>
                <option value="ANY">Internships and jobs</option>
                <option value="INTERNSHIP">Internships only</option>
                <option value="FULL_TIME">Full-time roles only</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="sector">Sector preference</label>
              <select id="sector" className="input" value={preferences.sectorPreference} onChange={(e) => setPreferences({ ...preferences, sectorPreference: e.target.value as never })}>
                <option value="ANY">No preference</option>
                <option value="PRIVATE">Private sector</option>
                <option value="GOVERNMENT">Government &amp; PSU</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="mode">Work mode</label>
              <select id="mode" className="input" value={preferences.remotePreference} onChange={(e) => setPreferences({ ...preferences, remotePreference: e.target.value as never })}>
                <option value="ANY">No preference</option>
                <option value="REMOTE">Remote</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ONSITE">On-site</option>
              </select>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between gap-2">
          <Button variant="ghost" onClick={() => (step === 0 ? router.push('/dashboard') : setStep(step - 1))}>
            {step === 0 ? 'Skip for now' : 'Back'}
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)}>Continue</Button>
          ) : (
            <Button onClick={() => void finish()} loading={saving}>Finish setup</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
