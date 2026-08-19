'use client';

import { useEffect, useState } from 'react';
import { api, ApiError, type AdminUser } from '@/lib/api';
import { Badge, Button, Card, CardHeader, ErrorState, Skeleton } from '@/components/ui';
import { formatDate, timeAgo } from '@/lib/utils';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setUsers(null);
      api.admin
        .users({ q: query || undefined, pageSize: 50 })
        .then((res) => setUsers(res.items))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load users.'));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const setRole = async (user: AdminUser, role: 'STUDENT' | 'ADMIN'): Promise<void> => {
    try {
      await api.admin.setUserRole(user.id, role);
      setUsers((current) => current?.map((u) => (u.id === user.id ? { ...u, role } : u)) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the role.');
    }
  };

  if (error) return <ErrorState message={error} />;

  return (
    <Card>
      <CardHeader
        title="Users"
        action={
          <input
            className="input w-56"
            placeholder="Search name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            aria-label="Search users"
          />
        }
      />
      {!users ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
              <tr>
                <th className="p-3 font-medium">User</th>
                <th className="p-3 font-medium">City</th>
                <th className="p-3 text-right font-medium">Profile</th>
                <th className="p-3 text-right font-medium">Applications</th>
                <th className="p-3 text-right font-medium">Saved</th>
                <th className="p-3 font-medium">Joined</th>
                <th className="p-3 font-medium">Last seen</th>
                <th className="p-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="p-3">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-subtle">{user.email}</p>
                  </td>
                  <td className="p-3 text-muted">{user.city ?? '—'}</td>
                  <td className="p-3 text-right tabular-nums">{user.profileCompletion}%</td>
                  <td className="p-3 text-right tabular-nums">{user.applications}</td>
                  <td className="p-3 text-right tabular-nums">{user.saved}</td>
                  <td className="p-3 text-xs text-muted">{formatDate(user.createdAt)}</td>
                  <td className="p-3 text-xs text-muted">{timeAgo(user.lastLoginAt)}</td>
                  <td className="p-3">
                    {user.role === 'ADMIN' ? (
                      <div className="flex items-center gap-2">
                        <Badge tone="brand">Admin</Badge>
                        <Button size="sm" variant="ghost" onClick={() => void setRole(user, 'STUDENT')}>
                          Revoke
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => void setRole(user, 'ADMIN')}>
                        Make admin
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
