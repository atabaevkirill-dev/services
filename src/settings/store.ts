import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Density, FontKey, ThemeMode } from '../theme/themes'
import type { DateFormat } from '../lib/date'

export type StampPosition = 'tl' | 'tr' | 'bl' | 'br'

export interface Settings {
  themeMode: ThemeMode
  accent: string
  fontKey: FontKey
  fontSize: number
  density: Density
  radius: number
  dateFormat: DateFormat
  longRepairDays: number
  widgetOpacity: number
  alwaysOnTop: boolean
  showSerial: boolean
  showThumbs: boolean
  stampEnabled: boolean
  stampDate: boolean
  stampTime: boolean
  stampEquipment: boolean
  stampNumber: boolean
  stampLocation: boolean
  stampPosition: StampPosition
  showLocation: boolean
  showNotes: boolean
}

export const DEFAULTS: Settings = {
  themeMode: 'dark',
  accent: '#6366f1',
  fontKey: 'inter',
  fontSize: 14,
  density: 'compact',
  radius: 10,
  dateFormat: 'dd.mm',
  longRepairDays: 14,
  widgetOpacity: 100,
  alwaysOnTop: true,
  showSerial: true,
  showThumbs: true,
  stampEnabled: true,
  stampDate: true,
  stampTime: true,
  stampEquipment: true,
  stampNumber: false,
  stampLocation: false,
  stampPosition: 'br',
  showLocation: true,
  showNotes: true,
}

interface SettingsState extends Settings {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void
  reset(): void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'services.settings.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ set: _set, reset: _reset, ...rest }) => rest,
    },
  ),
)
