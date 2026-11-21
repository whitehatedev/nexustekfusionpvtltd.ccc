import React, { useState } from 'react';
import { Plus, MapPin } from 'lucide-react';
import { AddressData } from '../types/platform';
import { usePlatform } from '../context/PlatformContext';

interface AddressSelectorProps {
  title: string;
  addresses: AddressData[];
  selected: AddressData | null;
  onSelect: (addr: AddressData) => void;
  onAddressSaved?: () => void;
}

const EMPTY_ADDR: AddressData = {
  label: 'Office / Home',
  addressType: 'both',
  fullName: '',
  mobile: '',
  houseFlat: '',
  streetArea: '',
  landmark: '',
  city: '',
  district: '',
  state: 'Maharashtra',
  pinCode: '',
  country: 'India',
  isDefault: false,
};

export const AddressSelector: React.FC<AddressSelectorProps> = ({
  title,
  addresses,
  selected,
  onSelect,
  onAddressSaved,
}) => {
  const { apiFetch, notify } = usePlatform();
  const [adding, setAdding] = useState(addresses.length === 0);
  const [form, setForm] = useState<AddressData>(EMPTY_ADDR);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch<{ address: AddressData }>('/api/addresses', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      onSelect(res.address);
      setAdding(false);
      setForm(EMPTY_ADDR);
      notify('Address saved.', 'success');
      onAddressSaved?.();
    } catch (err: any) {
      notify(err?.message || 'Failed to save address.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold text-[#123B5D] flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-[#64B5F6]" />
          {title}
        </h4>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-xs font-semibold text-[#123B5D] hover:text-[#42A5F5] inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5 text-[#64B5F6]" />
          {adding ? 'Choose Saved' : 'Add New Address'}
        </button>
      </div>

      {!adding && addresses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {addresses.map((addr) => {
            const isSelected =
              selected &&
              (selected.id ? selected.id === addr.id : selected.pinCode === addr.pinCode && selected.houseFlat === addr.houseFlat);
            return (
              <button
                key={addr.id ?? `${addr.houseFlat}-${addr.pinCode}`}
                type="button"
                onClick={() => onSelect(addr)}
                className={`text-left rounded-lg border p-3.5 text-xs space-y-1 transition-colors ${
                  isSelected
                    ? 'border-[#64B5F6] bg-[#F0F8FF]'
                    : 'border-[#DCEAF5] bg-white hover:border-[#90CAF9]'
                }`}
              >
                <div className="font-semibold text-[#123B5D]">
                  {addr.fullName} · {addr.label || 'Saved'}
                </div>
                <div className="text-[#263746]">
                  {addr.houseFlat}, {addr.streetArea}
                  {addr.landmark ? `, Near ${addr.landmark}` : ''}
                </div>
                <div className="text-[#263746]">
                  {addr.city}, {addr.district}, {addr.state} — {addr.pinCode}
                </div>
                <div className="text-[#263746]/70 font-mono">{addr.mobile}</div>
              </button>
            );
          })}
        </div>
      )}

      {(adding || addresses.length === 0) && (
        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#F0F8FF] border border-[#DCEAF5] rounded-lg p-4">
          <input
            required
            placeholder="Full Name *"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:border-[#64B5F6] focus:outline-none"
          />
          <input
            required
            placeholder="Mobile Number *"
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:border-[#64B5F6] focus:outline-none"
          />
          <input
            required
            placeholder="House / Flat / Building *"
            value={form.houseFlat}
            onChange={(e) => setForm({ ...form, houseFlat: e.target.value })}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:border-[#64B5F6] focus:outline-none"
          />
          <input
            required
            placeholder="Street / Locality *"
            value={form.streetArea}
            onChange={(e) => setForm({ ...form, streetArea: e.target.value })}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:border-[#64B5F6] focus:outline-none"
          />
          <input
            placeholder="Landmark"
            value={form.landmark}
            onChange={(e) => setForm({ ...form, landmark: e.target.value })}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:border-[#64B5F6] focus:outline-none"
          />
          <input
            required
            placeholder="City *"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:border-[#64B5F6] focus:outline-none"
          />
          <input
            required
            placeholder="District *"
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:border-[#64B5F6] focus:outline-none"
          />
          <input
            required
            placeholder="State *"
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:border-[#64B5F6] focus:outline-none"
          />
          <input
            required
            placeholder="6-Digit PIN Code *"
            value={form.pinCode}
            onChange={(e) => setForm({ ...form, pinCode: e.target.value })}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm font-mono text-[#263746] focus:border-[#64B5F6] focus:outline-none"
          />
          <input
            required
            placeholder="Country *"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
            className="rounded-lg border border-[#DCEAF5] bg-white px-3 py-2 text-sm text-[#263746] focus:border-[#64B5F6] focus:outline-none"
          />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-[#64B5F6] hover:bg-[#42A5F5] text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save & Use Address'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
