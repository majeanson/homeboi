-- Drop « Lier Flipp » (rolled back 2026-09-11). The account-API push could write the
-- household's Flipp server list, but Flipp renders a clipping only by hydrating it
-- through their own item-details service — an externally-injected clipping spins on
-- the web and shows nothing in the app (verified on Marc's account: typed words
-- landed, deal-clippings never rendered). The link held a third-party credential for
-- a words-only result the no-credential « Envoyer à Flipp » already covers, so it is
-- removed and the stored token deleted with the table.
--
-- Forward-only: 0124 created this table and stays as history; this drops it.
DROP TABLE IF EXISTS flipp_links;
