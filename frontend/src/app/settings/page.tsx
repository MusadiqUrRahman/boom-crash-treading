'use client';

import { useEffect, useState, useCallback } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { getWsClient } from '@/lib/ws-client';
import type { BotConfig, WsMessage } from '@/types';

const EDITABLE_KEYS: { key: string; label: string; type: string; section: string; step?: string; min?: number; max?: number; options?: string[] }[] = [
  // Trading
  { key: 'stake', label: 'Stake ($)', type: 'number', section: 'Trading', step: '0.01', min: 0.1, max: 100 },
  { key: 'stopLoss', label: 'Stop Loss ($)', type: 'number', section: 'Trading', step: '0.01', min: 0, max: 10 },
  { key: 'takeProfit', label: 'Take Profit ($)', type: 'number', section: 'Trading', step: '0.01', min: 0, max: 100 },
  { key: 'multiplier', label: 'Multiplier', type: 'number', section: 'Trading', step: '1', min: 1, max: 5000 },
  { key: 'scoreThreshold', label: 'Score Threshold', type: 'number', section: 'Trading', step: '1', min: 1, max: 20 },
  { key: 'direction', label: 'Direction', type: 'select', section: 'Trading', options: ['PUT', 'CALL', ''] },
  { key: 'cooldownTicks', label: 'Cooldown (ticks)', type: 'number', section: 'Trading', step: '1', min: 0, max: 100 },
  { key: 'minTicksBeforeTrade', label: 'Min Ticks Before Trade', type: 'number', section: 'Trading', step: '1', min: 1, max: 500 },

  // Indicators
  { key: 'rsiPeriod', label: 'RSI Period', type: 'number', section: 'Indicators', step: '1', min: 2, max: 100 },
  { key: 'rsiOversold', label: 'RSI Oversold', type: 'number', section: 'Indicators', step: '1', min: 1, max: 50 },
  { key: 'rsiOverbought', label: 'RSI Overbought', type: 'number', section: 'Indicators', step: '1', min: 50, max: 99 },
  { key: 'bbPeriod', label: 'BB Period', type: 'number', section: 'Indicators', step: '1', min: 2, max: 100 },
  { key: 'bbStdDev', label: 'BB StdDev', type: 'number', section: 'Indicators', step: '0.1', min: 0.1, max: 5 },
  { key: 'emaShortPeriod', label: 'EMA Short', type: 'number', section: 'Indicators', step: '1', min: 1, max: 100 },
  { key: 'emaLongPeriod', label: 'EMA Long', type: 'number', section: 'Indicators', step: '1', min: 1, max: 200 },
  { key: 'rocPeriod', label: 'ROC Period', type: 'number', section: 'Indicators', step: '1', min: 1, max: 100 },

  // Risk
  { key: 'maxConsecutiveLosses', label: 'Max Consecutive Losses', type: 'number', section: 'Risk', step: '1', min: 1, max: 100 },
  { key: 'maxDailyLoss', label: 'Max Daily Loss ($)', type: 'number', section: 'Risk', step: '0.01', min: 0, max: 10000 },
  { key: 'maxDailyTrades', label: 'Max Daily Trades', type: 'number', section: 'Risk', step: '1', min: 1, max: 10000 },
  { key: 'circuitBreakerCooldownMin', label: 'Circuit Breaker Cooldown (min)', type: 'number', section: 'Risk', step: '1', min: 1, max: 1440 },
  { key: 'maxCircuitBreakerTrips', label: 'Max Circuit Breaker Trips', type: 'number', section: 'Risk', step: '1', min: 1, max: 100 },

  // Stake Management
  { key: 'stakeMode', label: 'Stake Mode', type: 'select', section: 'Stake Mgmt', options: ['fixed', 'dynamic', 'percent'] },
  { key: 'baseStake', label: 'Base Stake ($)', type: 'number', section: 'Stake Mgmt', step: '0.01', min: 0.01, max: 100 },
  { key: 'minStake', label: 'Min Stake ($)', type: 'number', section: 'Stake Mgmt', step: '0.01', min: 0.01, max: 100 },
  { key: 'maxStake', label: 'Max Stake ($)', type: 'number', section: 'Stake Mgmt', step: '0.01', min: 0.01, max: 100 },
  { key: 'useMartingale', label: 'Use Martingale', type: 'boolean', section: 'Stake Mgmt' },

  // Others
  { key: 'dynamicDirection', label: 'Dynamic Direction', type: 'boolean', section: 'Other' },
  { key: 'debugScores', label: 'Debug Scores', type: 'boolean', section: 'Other' },
  { key: 'volatilityThreshold', label: 'Volatility Threshold', type: 'number', section: 'Other', step: '1', min: 1, max: 10000 },
  { key: 'directionLookbackTicks', label: 'Direction Lookback', type: 'number', section: 'Other', step: '1', min: 1, max: 100 },
  { key: 'directionMinAlignment', label: 'Direction Min Alignment', type: 'number', section: 'Other', step: '1', min: 1, max: 20 },
  { key: 'entryCooldownTicks', label: 'Entry Cooldown (ticks)', type: 'number', section: 'Other', step: '1', min: 0, max: 500 },
  { key: 'maxPositionTicks', label: 'Max Position (ticks)', type: 'number', section: 'Other', step: '1', min: 1, max: 9999 },
];

function EditableField({
  configKey,
  label,
  type,
  step,
  min,
  max,
  options: selectOptions,
  value,
  onChange,
  onSave,
  saving,
}: {
  configKey: string;
  label: string;
  type: string;
  step?: string;
  min?: number;
  max?: number;
  options?: string[];
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  onSave: (key: string, value: unknown) => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] text-[--color-text-muted] w-[140px] shrink-0" htmlFor={`cfg-${configKey}`}>
        {label}
      </label>
      <div className="flex items-center gap-1 flex-1">
        {type === 'boolean' ? (
          <button
            id={`cfg-${configKey}`}
            onClick={() => onChange(configKey, !value)}
            className={`w-8 h-5 rounded-full transition-colors ${value ? 'bg-emerald-600' : 'bg-[--color-bg-hover]'} relative`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
          </button>
        ) : type === 'select' ? (
          <select
            id={`cfg-${configKey}`}
            value={String(value ?? '')}
            onChange={(e) => onChange(configKey, e.target.value)}
            className="bg-[--color-bg] border border-[--color-border] rounded px-2 py-1 text-xs font-mono flex-1
              focus:outline-none focus:border-[--color-accent]"
          >
            {selectOptions?.map((opt) => (
              <option key={opt} value={opt}>{opt || '(auto)'}</option>
            ))}
          </select>
        ) : (
          <input
            id={`cfg-${configKey}`}
            type="number"
            value={value != null ? String(value) : ''}
            step={step}
            min={min}
            max={max}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') { onChange(configKey, 0); return; }
              const parsed = parseFloat(raw);
              onChange(configKey, isNaN(parsed) ? raw : parsed);
            }}
            className="bg-[--color-bg] border border-[--color-border] rounded px-2 py-1 text-xs font-mono w-24
              focus:outline-none focus:border-[--color-accent]"
          />
        )}
        <button
          onClick={() => onSave(configKey, value)}
          disabled={saving}
          className="px-2 py-1 text-[10px] rounded bg-[--color-accent] text-white
            hover:opacity-80 disabled:opacity-40 transition-opacity shrink-0"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function ConfigEditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-4">
      <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider mb-3">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const storeConfig = useBotStore((s) => s.config);
  const [config, setConfig] = useState<BotConfig | null>(storeConfig);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(!storeConfig);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ key: string; ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const client = getWsClient();
    client.send('getConfig');

    const unsub = client.subscribe((msg: WsMessage) => {
      if (msg.type === 'config') {
        const cfg = msg.data as BotConfig;
        setConfig(cfg);
        setLoading(false);
      } else if (msg.type === 'response') {
        const resp = msg.data as { data?: { success?: boolean; error?: string; updated?: string[] } };
        const d = resp?.data;
        if (d && 'success' in d) {
          setFeedback({ key: '', ok: d.success ?? false, msg: d.success ? 'Saved' : d.error ?? 'Failed' });
          setTimeout(() => setFeedback(null), 2000);
        }
      }
    });
    return unsub;
  }, []);

  const handleChange = useCallback((key: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async (key: string, value: unknown) => {
    const client = getWsClient();
    setSaving(key);
    try {
      const resp = await client.request('updateConfig', { config: { [key]: value } }) as Record<string, unknown>;
      const inner = (resp?.data as Record<string, unknown>) || {};
      const ok = inner?.success !== false;
      setFeedback({ key, ok, msg: ok ? `✓ ${key} saved` : String(inner?.error ?? 'Error') });
      setDraft((prev) => { const next = { ...prev }; delete next[key]; return next; });
      setTimeout(() => setFeedback(null), 2000);
    } catch (err) {
      setFeedback({ key, ok: false, msg: err instanceof Error ? err.message : 'Request failed' });
    } finally {
      setSaving(null);
    }
  }, []);

  if (loading || !config) {
    return (
      <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-6 animate-pulse space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-[--color-bg-hover] rounded" />
        ))}
      </div>
    );
  }

  const grouped: Record<string, typeof EDITABLE_KEYS> = {};
  for (const item of EDITABLE_KEYS) {
    if (!grouped[item.section]) grouped[item.section] = [];
    grouped[item.section].push(item);
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-[--color-text-muted] mb-1">
        Changes apply immediately to bot and persist in .env file
      </div>

      {feedback && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded text-xs font-mono z-50 transition-opacity ${
          feedback.ok ? 'bg-emerald-700 text-white' : 'bg-red-700 text-white'
        }`}>
          {feedback.msg}
        </div>
      )}

      {Object.entries(grouped).map(([section, items]) => (
        <ConfigEditorSection key={section} title={section}>
          {items.map((item) => {
            const draftVal = draft[item.key] !== undefined;
            const val = draftVal ? draft[item.key] : (config as unknown as Record<string, unknown>)[item.key];
            return (
              <EditableField
                key={item.key}
                configKey={item.key}
                label={item.label}
                type={item.type}
                step={item.step}
                min={item.min}
                max={item.max}
                options={'options' in item ? item.options : undefined}
                value={val}
                onChange={handleChange}
                onSave={handleSave}
                saving={saving === item.key}
              />
            );
          })}
        </ConfigEditorSection>
      ))}
    </div>
  );
}