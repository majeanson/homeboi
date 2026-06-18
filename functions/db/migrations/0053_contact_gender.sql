-- Gender hint for contacts: helps display gendered relationship labels (Tante/Oncle).
-- 'm' = masc, 'f' = fém, NULL = non précisé.
ALTER TABLE contacts ADD COLUMN gender TEXT;
