-- SecretNests analytics dashboard queries
-- Run against production D1. Read-only templates.

-- 1) Funnel by day: page -> search -> hotel -> outbound
SELECT substr(created_at,1,10) AS day,
  COUNT(DISTINCT CASE WHEN event_name='page_view' THEN session_id END) AS sessions,
  COUNT(CASE WHEN event_name='search' THEN 1 END) AS searches,
  COUNT(CASE WHEN event_name='hotel_view' THEN 1 END) AS hotel_views,
  COUNT(CASE WHEN event_name='outbound_booking_click' THEN 1 END) AS outbound_clicks
FROM analytics_events GROUP BY day ORDER BY day DESC;

-- 2) Most-viewed hotels
SELECT h.name, COUNT(*) AS views FROM analytics_events e JOIN hotels h ON h.id=e.hotel_id
WHERE e.event_name='hotel_view' GROUP BY h.id ORDER BY views DESC LIMIT 100;

-- 3) Zero-result searches
SELECT lower(query) AS query, COUNT(*) AS searches, MAX(created_at) AS last_seen
FROM zero_result_searches GROUP BY lower(query) ORDER BY searches DESC,last_seen DESC LIMIT 100;

-- 4) Creator-driven traffic
SELECT COALESCE(cp.handle,'(none)') AS creator, COUNT(DISTINCT e.session_id) AS sessions,
  COUNT(CASE WHEN e.event_name='outbound_booking_click' THEN 1 END) AS outbound_clicks
FROM analytics_events e LEFT JOIN creator_profiles cp ON cp.id=e.creator_id
GROUP BY creator ORDER BY outbound_clicks DESC,sessions DESC;

-- 5) Booking revenue and commission
SELECT substr(COALESCE(booked_at,created_at),1,10) AS day, COUNT(*) AS bookings,
  SUM(booking_value) AS gross_booking_value, SUM(commission_value) AS commission
FROM booking_conversions WHERE status IN ('confirmed','completed') GROUP BY day ORDER BY day DESC;

-- 6) 30-day revenue per unique first-party session
WITH s AS (SELECT COUNT(DISTINCT session_id) AS sessions FROM analytics_events WHERE created_at >= datetime('now','-30 days')),
r AS (SELECT COALESCE(SUM(commission_value),0) AS revenue FROM booking_conversions WHERE status IN ('confirmed','completed') AND created_at >= datetime('now','-30 days'))
SELECT revenue,sessions,CASE WHEN sessions>0 THEN revenue*1.0/sessions ELSE NULL END AS revenue_per_session FROM s,r;

-- 7) Creator attributable economics
SELECT cp.handle,COUNT(DISTINCT bc.id) AS bookings,COALESCE(SUM(bc.booking_value),0) AS booking_value,
COALESCE(SUM(bc.commission_value),0) AS commission,COALESCE(SUM(ce.amount),0) AS creator_earnings
FROM creator_profiles cp
LEFT JOIN booking_conversions bc ON bc.creator_id=cp.id AND bc.status IN ('confirmed','completed')
LEFT JOIN creator_earnings ce ON ce.creator_id=cp.id
GROUP BY cp.id ORDER BY commission DESC;