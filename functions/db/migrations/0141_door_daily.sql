-- 0141 — « La porte, en chiffres » : ce qui passe par la porte et ne laisse AUCUNE trace.
--
-- Le courriel de nuit compte déjà les maisonnées réelles (nouvelles, confirmées, actives,
-- restées vides — _lib/strangers.ts). Ce qu'il ne pouvait pas compter, ce sont les
-- événements qui s'effacent d'eux-mêmes : un essai ouvert (le bac à sable est balayé
-- après 24 h, ligne comprise), un essai GARDÉ (« Garder ma maisonnée » réécrit l'opérateur
-- en place — le bac devient une maisonnée ordinaire, indiscernable d'une inscription), et
-- les essais refusés parce que le plafond était plein. Le 2026-09-29, zéro inscription en
-- cinq jours ne disait pas si personne n'était venu ou si tout le monde était reparti.
--
-- DES TOTAUX PAR JOUR, RIEN D'AUTRE : pas de maisonnée, pas d'adresse, pas d'appareil,
-- pas d'IP. La politique de confidentialité le dit (« Ce qui n'est PAS fait »). Hors de
-- toute maisonnée, donc hors du balayage — EXEMPT_TABLES le dit, avec la raison.
--
-- `day` est un localDayStart() — dans le fuseau par défaut du déploiement, puisque la
-- porte s'ouvre AVANT qu'une maisonnée existe. `event` est un petit vocabulaire fermé
-- (_lib/strangers.ts DoorEvent). La paire (jour, événement) EST la ligne.
CREATE TABLE IF NOT EXISTS door_daily (
  day INTEGER NOT NULL,
  event TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (day, event)
);
