export const COUNTRIES: { name: string; code: string; currency: string }[] = [
  { name: "Sri Lanka", code: "LK", currency: "LKR" },
  { name: "India", code: "IN", currency: "INR" },
  { name: "Maldives", code: "MV", currency: "MVR" },
  { name: "United Arab Emirates", code: "AE", currency: "AED" },
  { name: "Qatar", code: "QA", currency: "QAR" },
  { name: "Saudi Arabia", code: "SA", currency: "SAR" },
  { name: "Singapore", code: "SG", currency: "SGD" },
  { name: "United Kingdom", code: "GB", currency: "GBP" },
  { name: "Australia", code: "AU", currency: "AUD" },
  { name: "United States", code: "US", currency: "USD" },
];

export function currencyForCountry(country: string): string {
  const key = country.trim().toLowerCase();
  return COUNTRIES.find((item) => item.name.toLowerCase() === key)?.currency ?? "USD";
}
