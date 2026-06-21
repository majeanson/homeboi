// « Le cercle » → Business: a household service / vendor (vet, hospital, plumber,
// business card…). Mirrors the camelCase shape /api/businesses returns. DELIBERATELY
// NOT a cercle Person — it never enters unifyCircle / relationships / the tree.
export interface Business {
  id: string
  name: string
  category: string | null
  phone: string | null
  email: string | null
  address: string | null
  website: string | null
  notes: string | null
  photoKey: string | null
}

// Free-text category, but a small suggestion list seeds the picker (EntityCombobox,
// typeaheadOnly). Labels are bilingual; the chosen string is stored verbatim.
export const BUSINESS_CATEGORIES: { fr: string; en: string }[] = [
  { fr: 'Vétérinaire', en: 'Vet' },
  { fr: 'Médecin', en: 'Doctor' },
  { fr: 'Hôpital', en: 'Hospital' },
  { fr: 'Dentiste', en: 'Dentist' },
  { fr: 'Pharmacie', en: 'Pharmacy' },
  { fr: 'Plomberie', en: 'Plumbing' },
  { fr: 'Électricien', en: 'Electrician' },
  { fr: 'Garage / auto', en: 'Garage / car' },
  { fr: 'École / garderie', en: 'School / daycare' },
  { fr: 'Assurance', en: 'Insurance' },
  { fr: 'Banque', en: 'Bank' },
  { fr: 'Restaurant', en: 'Restaurant' },
  { fr: 'Autre', en: 'Other' },
]
