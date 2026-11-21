import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Briefcase,
  Camera,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  GraduationCap,
  GripVertical,
  Linkedin,
  Plus,
  Search,
  Star,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { usePlatform } from '../../context/PlatformContext';
import { NEUTRAL_AVATARS, ProfileImageCropModal } from './ProfileImageCropModal';

interface TeamMemberDbRow {
  id: number;
  slugKey: string;
  fullName: string;
  designation: string;
  department: string;
  professionalCategory: string;
  profilePhotoUrl: string;
  photoAlt: string;
  shortBiography: string;
  detailedBiography: string;
  qualifications: string;
  experience: string;
  responsibilities: string;
  skills: string[];
  linkedinUrl: string;
  displayOrder: number;
  status: 'published' | 'draft' | string;
  isFeatured: boolean;
  isActive: boolean;
}

const PROFESSIONAL_CATEGORIES = [
  'Executive Leadership',
  'Engineering & Innovation',
  'UAV Operations',
  'Software & AI',
  'Operations & Support',
] as const;

interface TeamFormState {
  id?: number;
  fullName: string;
  designation: string;
  department: string;
  professionalCategory: string;
  profilePhotoUrl: string;
  photoAlt: string;
  shortBiography: string;
  detailedBiography: string;
  qualifications: string;
  experience: string;
  responsibilities: string;
  skillsText: string;
  linkedinUrl: string;
  displayOrder: number;
  status: 'published' | 'draft';
  isFeatured: boolean;
  isActive: boolean;
}

const EMPTY_FORM: TeamFormState = {
  fullName: '',
  designation: '',
  department: 'Engineering & Innovation',
  professionalCategory: 'Engineering & Innovation',
  profilePhotoUrl: NEUTRAL_AVATARS[0],
  photoAlt: '',
  shortBiography: '',
  detailedBiography: '',
  qualifications: '',
  experience: '',
  responsibilities: '',
  skillsText: '',
  linkedinUrl: '',
  displayOrder: 1,
  status: 'published',
  isFeatured: false,
  isActive: true,
};

function isCeoOrFounder(m: Pick<TeamMemberDbRow, 'slugKey' | 'designation'>): boolean {
  const slug = String(m.slugKey || '').toLowerCase();
  const desig = String(m.designation || '').toLowerCase();
  return slug.includes('sahil') || desig.includes('founder') || desig.includes('ceo') || desig.includes('chief executive');
}

function getInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'NT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const AboutTeamAdminPanel: React.FC = () => {
  const { apiFetch, refreshBootstrap, notify, navigate } = usePlatform();
  const [members, setMembers] = useState<TeamMemberDbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedId, setDraggedId] = useState<number | null>(null);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TeamFormState>(EMPTY_FORM);
  const [previewMember, setPreviewMember] = useState<TeamMemberDbRow | null>(null);

  // Crop Studio Modal state (can be used inside form OR directly on a card)
  const [cropTarget, setCropTarget] = useState<{
    mode: 'form' | 'quick';
    memberId?: number;
    name: string;
    photoUrl: string;
    category: string;
  } | null>(null);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<TeamMemberDbRow | null>(null);
  const [ceoDeleteConfirmed, setCeoDeleteConfirmed] = useState(false);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: TeamMemberDbRow[] }>('/api/admin/team');
      setMembers(
        [...(res.items || [])].sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999) || a.id - b.id)
      );
    } catch (err: any) {
      notify(err?.message || 'Failed to load team members.', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, notify]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const openCreateModal = () => {
    const nextOrder =
      members.length > 0 ? Math.max(...members.map((m) => Number(m.displayOrder) || 0)) + 1 : 1;
    const avatarPick = NEUTRAL_AVATARS[members.length % NEUTRAL_AVATARS.length];
    setForm({
      ...EMPTY_FORM,
      displayOrder: nextOrder,
      profilePhotoUrl: avatarPick,
    });
    setFormOpen(true);
  };

  const openEditModal = (m: TeamMemberDbRow) => {
    setForm({
      id: m.id,
      fullName: m.fullName,
      designation: m.designation,
      department: m.department || 'Engineering & Innovation',
      professionalCategory: m.professionalCategory || 'Engineering & Innovation',
      profilePhotoUrl: m.profilePhotoUrl || NEUTRAL_AVATARS[0],
      photoAlt: m.photoAlt || '',
      shortBiography: m.shortBiography || '',
      detailedBiography: m.detailedBiography || '',
      qualifications: m.qualifications || '',
      experience: m.experience || '',
      responsibilities: m.responsibilities || '',
      skillsText: Array.isArray(m.skills) ? m.skills.join(', ') : '',
      linkedinUrl: m.linkedinUrl || '',
      displayOrder: Number(m.displayOrder) || 1,
      status: m.status === 'draft' ? 'draft' : 'published',
      isFeatured: Boolean(m.isFeatured),
      isActive: m.isActive !== false,
    });
    setFormOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.designation.trim()) {
      notify('Full Name and Designation are required.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        designation: form.designation.trim(),
        department: form.department.trim() || 'Engineering & Innovation',
        professionalCategory: form.professionalCategory.trim() || 'Engineering & Innovation',
        profilePhotoUrl: form.profilePhotoUrl.trim(),
        photoAlt: form.photoAlt.trim() || `${form.fullName.trim()} — ${form.designation.trim()}`,
        shortBiography: form.shortBiography.trim(),
        detailedBiography: form.detailedBiography.trim(),
        qualifications: form.qualifications.trim(),
        experience: form.experience.trim(),
        responsibilities: form.responsibilities.trim(),
        skills: form.skillsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        linkedinUrl: form.linkedinUrl.trim(),
        displayOrder: Math.max(1, Number(form.displayOrder) || 1),
        status: form.status,
        isFeatured: form.isFeatured,
        isActive: form.isActive,
      };

      if (form.id) {
        await apiFetch(`/api/admin/team/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify(`Updated profile for ${payload.fullName}.`, 'success');
      } else {
        await apiFetch('/api/admin/team', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify(`Created team profile for ${payload.fullName}.`, 'success');
      }
      setFormOpen(false);
      await loadTeam();
      await refreshBootstrap();
    } catch (err: any) {
      notify(err?.message || 'Failed to save team member profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (m: TeamMemberDbRow) => {
    const nextStatus = m.status === 'published' && m.isActive ? 'draft' : 'published';
    const nextActive = nextStatus === 'published';
    try {
      await apiFetch(`/api/admin/team/${m.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, isActive: nextActive }),
      });
      notify(
        nextStatus === 'published'
          ? `Published "${m.fullName}" to About Us.`
          : `Unpublished "${m.fullName}" (hidden from public website).`,
        'success'
      );
      await loadTeam();
      await refreshBootstrap();
    } catch (err: any) {
      notify(err?.message || 'Failed to update status.', 'error');
    }
  };

  const handlePersistOrder = async (reordered: TeamMemberDbRow[]) => {
    const normalized = reordered.map((m, idx) => ({ ...m, displayOrder: idx + 1 }));
    setMembers(normalized);
    try {
      await apiFetch('/api/admin/team/reorder', {
        method: 'POST',
        body: JSON.stringify({ orderedIds: normalized.map((m) => m.id) }),
      });
      await refreshBootstrap();
      notify('Team display order updated.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Failed to reorder team members.', 'error');
      await loadTeam();
    }
  };

  const moveByIndex = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= members.length) return;
    const copy = [...members];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    handlePersistOrder(copy);
  };

  const handleDropOnMember = (targetId: number) => {
    if (draggedId === null || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const fromIdx = members.findIndex((m) => m.id === draggedId);
    const toIdx = members.findIndex((m) => m.id === targetId);
    setDraggedId(null);
    if (fromIdx < 0 || toIdx < 0) return;
    const copy = [...members];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);
    handlePersistOrder(copy);
  };

  const handleQuickPhotoApply = async (memberId: number, url: string, altText?: string) => {
    try {
      await apiFetch(`/api/admin/team/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify({
          profilePhotoUrl: url,
          ...(altText ? { photoAlt: altText } : {}),
        }),
      });
      notify('Profile photograph updated.', 'success');
      await loadTeam();
      await refreshBootstrap();
    } catch (err: any) {
      notify(err?.message || 'Failed to update profile photograph.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const founderLock = isCeoOrFounder(deleteTarget);
    if (founderLock && !ceoDeleteConfirmed) {
      notify('Please confirm deletion of the Founder & CEO profile first.', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/admin/team/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify(founderLock ? { confirmCeoDeletion: true } : {}),
      });
      notify(`Deleted profile for ${deleteTarget.fullName}.`, 'info');
      setDeleteTarget(null);
      setCeoDeleteConfirmed(false);
      await loadTeam();
      await refreshBootstrap();
    } catch (err: any) {
      notify(err?.message || 'Failed to delete profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return members.filter((m) => {
      if (categoryFilter !== 'All' && (m.professionalCategory || m.department) !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        m.fullName.toLowerCase().includes(q) ||
        m.designation.toLowerCase().includes(q) ||
        String(m.department || '').toLowerCase().includes(q) ||
        String(m.qualifications || '').toLowerCase().includes(q) ||
        (m.skills || []).join(' ').toLowerCase().includes(q)
      );
    });
  }, [members, categoryFilter, searchQuery]);

  const isFiltered = categoryFilter !== 'All' || searchQuery.trim().length > 0;

  return (
    <div className="space-y-6 text-xs">
      {/* Header Bar */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-display text-lg font-bold text-[#123B5D]">
            <Users className="w-5 h-5 text-[#42A5F5]" /> Team &amp; Executive Leadership Management
          </div>
          <p className="text-xs text-[#263746]/80">
            Full dynamic control over all team profiles including Founder &amp; CEO. Add members, crop/reposition photos, publish/unpublish, reorder via drag-and-drop, or delete profiles.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-3.5 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> View Live Site
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Team Member
          </button>
        </div>
      </div>

      {/* Category & Search Toolbar */}
      <div className="rounded-xl border border-[#DCEAF5] bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-[#42A5F5] absolute left-3 top-2.5" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, designation, qualification, or skill..."
              className="w-full rounded-lg border border-[#DCEAF5] bg-white pl-9 pr-3 py-2 text-xs text-[#263746] focus:outline-none focus:border-[#64B5F6]"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-xs font-medium text-[#263746] focus:outline-none focus:border-[#64B5F6]"
          >
            <option value="All">All Categories ({members.length})</option>
            {PROFESSIONAL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="text-[11px] text-[#263746]/70 tabular-nums">
          {members.filter((m) => m.status === 'published' && m.isActive).length} published ·{' '}
          {members.filter((m) => m.status === 'draft' || !m.isActive).length} draft/unpublished
          {!isFiltered && ' · Drag cards or use arrows to reorder'}
        </div>
      </div>

      {/* Team List */}
      {loading ? (
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-10 text-center text-[#263746]/70">
          Loading team profiles from database...
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="rounded-xl border border-[#DCEAF5] bg-white p-10 text-center space-y-3">
          <Users className="w-8 h-8 text-[#90CAF9] mx-auto" />
          <div className="font-display font-bold text-sm text-[#123B5D]">No Team Profiles Listed</div>
          <p className="text-[#263746]/70 max-w-md mx-auto">
            {members.length === 0
              ? 'All profiles have been removed. Click "Add Team Member" to create a new leadership or engineering profile.'
              : 'No profiles matched your current search or category filter.'}
          </p>
          {members.length === 0 && (
            <button
              type="button"
              onClick={openCreateModal}
              className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Team Member
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMembers.map((m, idx) => {
            const founderBadge = isCeoOrFounder(m);
            const isPublished = m.status === 'published' && m.isActive;
            return (
              <div
                key={m.id}
                draggable={!isFiltered}
                onDragStart={() => setDraggedId(m.id)}
                onDragOver={(e) => {
                  if (!isFiltered) e.preventDefault();
                }}
                onDrop={() => {
                  if (!isFiltered) handleDropOnMember(m.id);
                }}
                className={`rounded-xl border bg-white p-5 sm:p-6 transition-colors ${
                  draggedId === m.id
                    ? 'border-[#64B5F6] opacity-60'
                    : isPublished
                    ? 'border-[#DCEAF5] hover:border-[#90CAF9]'
                    : 'border-amber-200 bg-amber-50/20'
                }`}
              >
                <div className="flex flex-col lg:flex-row gap-5 items-start">
                  {/* Portrait & Quick Photo Action */}
                  <div className="flex items-start gap-3 shrink-0">
                    {!isFiltered && (
                      <div
                        className="mt-2 p-1 text-[#263746]/50 hover:text-[#123B5D] cursor-grab active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                    )}
                    <div className="w-24 sm:w-28 space-y-2">
                      <div className="aspect-[4/5] rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] overflow-hidden flex items-center justify-center">
                        {m.profilePhotoUrl ? (
                          <img
                            src={m.profilePhotoUrl}
                            alt={m.photoAlt || m.fullName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover object-top"
                          />
                        ) : (
                          <span className="font-display font-bold text-lg text-[#123B5D]">
                            {getInitials(m.fullName)}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCropTarget({
                            mode: 'quick',
                            memberId: m.id,
                            name: m.fullName,
                            photoUrl: m.profilePhotoUrl,
                            category: founderBadge ? 'Founder Profile' : 'Team Photographs',
                          })
                        }
                        className="w-full py-1.5 px-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold text-[11px] inline-flex items-center justify-center gap-1 transition-colors"
                      >
                        <Camera className="w-3 h-3 text-[#42A5F5]" /> Change Photo
                      </button>
                    </div>
                  </div>

                  {/* Profile Summary & Actions */}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DCEAF5]/60 pb-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-mono font-bold text-[#42A5F5] tabular-nums">
                            Order #{m.displayOrder}
                          </span>
                          <span aria-hidden="true" className="text-[#DCEAF5]">·</span>
                          <span className="font-medium text-[#263746]/80">{m.professionalCategory || m.department}</span>
                          {founderBadge && (
                            <>
                              <span aria-hidden="true" className="text-[#DCEAF5]">·</span>
                              <span className="font-semibold text-[#123B5D]">Founder / Executive</span>
                            </>
                          )}
                          {m.isFeatured && (
                            <>
                              <span aria-hidden="true" className="text-[#DCEAF5]">·</span>
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                                <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Featured
                              </span>
                            </>
                          )}
                          <span aria-hidden="true" className="text-[#DCEAF5]">·</span>
                          <span className={isPublished ? 'font-semibold text-[#42A5F5]' : 'font-semibold text-amber-700'}>
                            {isPublished ? 'Published Live' : 'Draft / Unpublished'}
                          </span>
                        </div>
                        <h3 className="font-display text-lg font-bold text-[#123B5D]">{m.fullName}</h3>
                        <div className="text-xs font-semibold text-[#263746]">{m.designation}</div>
                      </div>

                      {/* Profile Management Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {!isFiltered && (
                          <>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveByIndex(idx, -1)}
                              title="Move Up"
                              className="p-1.5 rounded-lg border border-[#DCEAF5] hover:bg-[#F0F8FF] text-[#123B5D] disabled:opacity-30"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === members.length - 1}
                              onClick={() => moveByIndex(idx, 1)}
                              title="Move Down"
                              className="p-1.5 rounded-lg border border-[#DCEAF5] hover:bg-[#F0F8FF] text-[#123B5D] disabled:opacity-30"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setPreviewMember(m)}
                          className="px-2.5 py-1.5 border border-[#DCEAF5] bg-white hover:bg-[#F0F8FF] text-[#263746] rounded-lg font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#42A5F5]" /> Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(m)}
                          className="px-2.5 py-1.5 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#42A5F5]" /> Edit Profile
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(m)}
                          className={`px-2.5 py-1.5 border rounded-lg font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                            isPublished
                              ? 'border-amber-200 text-amber-800 hover:bg-amber-50'
                              : 'border-[#90CAF9] text-[#123B5D] bg-[#F0F8FF] hover:bg-[#DCEAF5]/60'
                          }`}
                        >
                          {isPublished ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5" /> Unpublish
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#42A5F5]" /> Publish
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCeoDeleteConfirmed(false);
                            setDeleteTarget(m);
                          }}
                          className="px-2.5 py-1.5 border border-red-200 text-red-700 hover:bg-red-50 rounded-lg font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#263746]/80">
                      {m.qualifications && (
                        <div>
                          <span className="font-semibold text-[#123B5D]">Qualifications:</span> {m.qualifications}
                        </div>
                      )}
                      {m.experience && (
                        <div>
                          <span className="font-semibold text-[#123B5D]">Experience:</span> {m.experience}
                        </div>
                      )}
                    </div>

                    {m.shortBiography && (
                      <p className="text-xs text-[#263746] leading-relaxed line-clamp-2">{m.shortBiography}</p>
                    )}

                    {Array.isArray(m.skills) && m.skills.length > 0 && (
                      <div className="text-[11px] text-[#263746]/70">
                        <span className="font-semibold text-[#123B5D]">Expertise:</span> {m.skills.join(' · ')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Team Member Modal (All 15 Fields) */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-[#DCEAF5]">
            <div className="px-6 py-4 bg-[#F0F8FF] border-b border-[#DCEAF5] flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-[#123B5D]">
                  {form.id ? `Edit Team Profile — ${form.fullName}` : 'Add New Team Member'}
                </h3>
                <p className="text-xs text-[#263746]/70">
                  Complete all executive/engineering profile details, portrait crop settings, and publishing visibility.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-2 rounded-lg text-[#123B5D] hover:bg-[#DCEAF5]/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                {/* Portrait Box inside Form */}
                <div className="md:col-span-4 space-y-3">
                  <label className="font-semibold text-[#123B5D] block">Profile Photograph</label>
                  <div className="aspect-[4/5] rounded-xl border border-[#DCEAF5] bg-[#F0F8FF] overflow-hidden flex items-center justify-center">
                    {form.profilePhotoUrl ? (
                      <img
                        src={form.profilePhotoUrl}
                        alt={form.photoAlt || form.fullName || 'Portrait'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <User className="w-10 h-10 text-[#90CAF9]" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCropTarget({
                        mode: 'form',
                        name: form.fullName || 'Team Member',
                        photoUrl: form.profilePhotoUrl,
                        category: /founder|ceo/i.test(form.designation)
                          ? 'Founder Profile'
                          : 'Team Photographs',
                      })
                    }
                    className="w-full py-2.5 px-3 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#42A5F5]" /> Open Photo &amp; Crop Studio
                  </button>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#123B5D]">Photo Alt Text</label>
                    <input
                      value={form.photoAlt}
                      onChange={(e) => setForm({ ...form, photoAlt: e.target.value })}
                      placeholder="Descriptive alt attribute for SEO"
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-2.5 py-1.5 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                </div>

                {/* Primary Metadata */}
                <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">1. Full Name *</label>
                    <input
                      required
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      placeholder="e.g. Sahil Prakash Bhagat"
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">2. Designation *</label>
                    <input
                      required
                      value={form.designation}
                      onChange={(e) => setForm({ ...form, designation: e.target.value })}
                      placeholder="e.g. Founder & Chief Executive Officer"
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">3. Department</label>
                    <input
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      placeholder="e.g. Executive Leadership / UAV Avionics"
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">4. Professional Category</label>
                    <select
                      value={form.professionalCategory}
                      onChange={(e) => setForm({ ...form, professionalCategory: e.target.value })}
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    >
                      {PROFESSIONAL_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-semibold text-[#123B5D]">5. Short Biography</label>
                    <textarea
                      rows={2}
                      value={form.shortBiography}
                      onChange={(e) => setForm({ ...form, shortBiography: e.target.value })}
                      placeholder="Concise leadership or engineering overview shown on the main About Us card..."
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-semibold text-[#123B5D]">6. Detailed Biography</label>
                    <textarea
                      rows={3}
                      value={form.detailedBiography}
                      onChange={(e) => setForm({ ...form, detailedBiography: e.target.value })}
                      placeholder="Extended career profile displayed inside the full profile modal..."
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">7. Educational Qualifications</label>
                    <input
                      value={form.qualifications}
                      onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
                      placeholder="Degrees separated by · (dot)"
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">8. Professional Experience</label>
                    <input
                      value={form.experience}
                      onChange={(e) => setForm({ ...form, experience: e.target.value })}
                      placeholder="Domain years & focus summary"
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-semibold text-[#123B5D]">9. Responsibilities</label>
                    <textarea
                      rows={2}
                      value={form.responsibilities}
                      onChange={(e) => setForm({ ...form, responsibilities: e.target.value })}
                      placeholder="Key leadership or technical responsibilities separated by · (dot)"
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="font-semibold text-[#123B5D]">10. Skills &amp; Expertise (comma-separated)</label>
                    <input
                      value={form.skillsText}
                      onChange={(e) => setForm({ ...form, skillsText: e.target.value })}
                      placeholder="Agricultural UAV Strategy, Embedded Firmware, Flight Telemetry"
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-semibold text-[#123B5D]">11. LinkedIn Profile URL</label>
                    <input
                      type="url"
                      value={form.linkedinUrl}
                      onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                      placeholder="https://linkedin.com/in/..."
                      className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-[#123B5D]">12. Display Order</label>
                      <input
                        type="number"
                        min={1}
                        value={form.displayOrder}
                        onChange={(e) => setForm({ ...form, displayOrder: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 font-mono tabular-nums text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-[#123B5D]">13. Profile Status</label>
                      <select
                        value={form.status}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            status: e.target.value as 'published' | 'draft',
                            isActive: e.target.value === 'published',
                          })
                        }
                        className="w-full rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-[#263746] focus:outline-none focus:border-[#64B5F6]"
                      >
                        <option value="published">Published (Live)</option>
                        <option value="draft">Draft (Hidden)</option>
                      </select>
                    </div>
                  </div>
                  <div className="sm:col-span-2 flex flex-wrap gap-6 pt-1">
                    <label className="inline-flex items-center gap-2 font-semibold text-[#123B5D] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isFeatured}
                        onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
                        className="accent-[#64B5F6]"
                      />
                      14. Featured Executive / Spotlight Profile
                    </label>
                    <label className="inline-flex items-center gap-2 font-semibold text-[#123B5D] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                        className="accent-[#64B5F6]"
                      />
                      15. Profile Active on Public Website
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#DCEAF5] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-[#64B5F6] hover:bg-[#42A5F5] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving Profile...' : form.id ? 'Update Team Profile' : 'Create Team Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Profile Modal */}
      {previewMember && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-[#DCEAF5] text-xs">
            <div className="bg-[#F0F8FF] border-b border-[#DCEAF5] text-[#123B5D] p-6 flex flex-col sm:flex-row gap-6 items-start">
              <div className="w-32 aspect-[4/5] rounded-xl overflow-hidden bg-white border border-[#DCEAF5] shrink-0 flex items-center justify-center">
                {previewMember.profilePhotoUrl ? (
                  <img
                    src={previewMember.profilePhotoUrl}
                    alt={previewMember.photoAlt || previewMember.fullName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <span className="font-display font-bold text-xl text-[#123B5D]">{getInitials(previewMember.fullName)}</span>
                )}
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[#42A5F5] font-semibold">
                      {previewMember.professionalCategory} · {previewMember.department}
                    </div>
                    <h3 className="font-display text-2xl font-bold text-[#123B5D] mt-0.5">
                      {previewMember.fullName}
                    </h3>
                    <div className="text-sm text-[#263746] font-medium">{previewMember.designation}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewMember(null)}
                    className="p-1.5 text-[#123B5D] hover:bg-[#DCEAF5]/60 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {previewMember.linkedinUrl && (
                  <a
                    href={previewMember.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#42A5F5] hover:text-[#123B5D] hover:underline pt-1"
                  >
                    <Linkedin className="w-3.5 h-3.5" /> LinkedIn Profile
                  </a>
                )}
              </div>
            </div>

            <div className="p-6 space-y-5">
              {previewMember.shortBiography && (
                <div className="space-y-1">
                  <div className="font-semibold text-[#123B5D]">Executive / Short Biography</div>
                  <p className="text-[#263746] leading-relaxed">{previewMember.shortBiography}</p>
                </div>
              )}
              {previewMember.detailedBiography && (
                <div className="space-y-1">
                  <div className="font-semibold text-[#123B5D]">Detailed Background</div>
                  <p className="text-[#263746] leading-relaxed whitespace-pre-line">
                    {previewMember.detailedBiography}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#DCEAF5]/60">
                {previewMember.qualifications && (
                  <div className="space-y-1">
                    <div className="font-semibold text-[#123B5D] flex items-center gap-1">
                      <GraduationCap className="w-3.5 h-3.5 text-[#42A5F5]" /> Qualifications
                    </div>
                    <p className="text-[#263746]/80">{previewMember.qualifications}</p>
                  </div>
                )}
                {previewMember.experience && (
                  <div className="space-y-1">
                    <div className="font-semibold text-[#123B5D] flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5 text-[#42A5F5]" /> Experience
                    </div>
                    <p className="text-[#263746]/80">{previewMember.experience}</p>
                  </div>
                )}
              </div>
              {previewMember.responsibilities && (
                <div className="space-y-1 pt-2 border-t border-[#DCEAF5]/60">
                  <div className="font-semibold text-[#123B5D]">Core Responsibilities</div>
                  <p className="text-[#263746]/80 leading-relaxed">{previewMember.responsibilities}</p>
                </div>
              )}
              {Array.isArray(previewMember.skills) && previewMember.skills.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-[#DCEAF5]/60">
                  <div className="font-semibold text-[#123B5D]">Skills &amp; Expertise</div>
                  <p className="text-[#263746]">{previewMember.skills.join(' · ')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (with Explicit CEO/Founder Guard) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-[#123B5D]/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-[#DCEAF5] text-xs">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="font-display text-base font-bold text-[#123B5D]">
                  Delete Team Member Profile?
                </h3>
                <p className="text-[#263746]/80 leading-relaxed">
                  Are you sure you want to permanently delete <strong>{deleteTarget.fullName}</strong> ({deleteTarget.designation})? They will immediately disappear from the public About Us page.
                </p>
              </div>
            </div>

            {isCeoOrFounder(deleteTarget) && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 space-y-2.5 text-red-900">
                <div className="font-bold">Founder / CEO Deletion Confirmation Required</div>
                <p className="text-[11px] leading-relaxed">
                  This is an Executive Founder/CEO profile. You have full administrative authority to remove it, or you can Unpublish instead to temporarily hide it.
                </p>
                <label className="flex items-start gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ceoDeleteConfirmed}
                    onChange={(e) => setCeoDeleteConfirmed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>I confirm permanent removal of this Founder &amp; CEO profile from the website.</span>
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setCeoDeleteConfirmed(false);
                }}
                className="px-4 py-2 border border-[#90CAF9] bg-white hover:bg-[#F0F8FF] text-[#123B5D] rounded-lg font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || (isCeoOrFounder(deleteTarget) && !ceoDeleteConfirmed)}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold disabled:opacity-45"
              >
                {saving ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portrait Upload, Crop & Neutral Avatar Studio */}
      {cropTarget && (
        <ProfileImageCropModal
          open={Boolean(cropTarget)}
          memberName={cropTarget.name}
          currentPhotoUrl={cropTarget.photoUrl}
          defaultCategory={cropTarget.category}
          onClose={() => setCropTarget(null)}
          onApplyPhoto={(url, altText) => {
            if (cropTarget.mode === 'form') {
              setForm((prev) => ({
                ...prev,
                profilePhotoUrl: url,
                photoAlt: altText || prev.photoAlt,
              }));
            } else if (cropTarget.memberId) {
              handleQuickPhotoApply(cropTarget.memberId, url, altText);
            }
          }}
        />
      )}
    </div>
  );
};
