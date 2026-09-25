PRAGMA foreign_keys = ON;

-- Demo creator stays remain visible on the labeled demo profile, but demo-derived
-- aggregate hotel value snapshots must never appear as first-party market signal.
DELETE FROM hotel_value_snapshots
WHERE id LIKE 'demo-snapshot-%';
