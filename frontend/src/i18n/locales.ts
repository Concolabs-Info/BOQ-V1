export type LocaleOption = {
  code: string;
  label: string;
  short: string;
  enabled: boolean;
};

// Add a new locale by dropping a messages/<code>.json file, an entry here,
// and a loader in LocaleProvider's MESSAGE_LOADERS map.
export const locales: LocaleOption[] = [
  { code: "en", label: "English (US)", short: "ENG", enabled: true },
  { code: "si", label: "සිංහල", short: "SIN", enabled: true },
  { code: "ta", label: "தமிழ்", short: "TAM", enabled: true },
  { code: "es", label: "Español", short: "ESP", enabled: true },
  { code: "fr", label: "Français", short: "FRA", enabled: true },
];

export const defaultLocale = "en";
