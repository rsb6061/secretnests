# Image Acquisition Pipeline

SecretNests treats media rights as data.

Preferred intake order: traveler-owned uploads with explicit license; hotel/group press assets with documented permission; licensed hotel-content APIs; properly licensed public/editorial media; remote-display-only provider media where terms permit display but not copying.

Publicly viewable Google, Tripadvisor, Reddit, Instagram, blog, magazine, or hotel-site imagery is not automatically reusable.

Workflow: create media_ingest_requests → identify source/permission/attribution → rights review → store in R2 only if permitted → create media_assets → record rights-state changes in media_rights_reviews.

Public pages only select owned_user_upload, hotel_authorized, licensed_api, or licensed_public. needs_review, remote_display_only, and blocked are not served from the public R2 route.

Receipts/folios are separate verification artifacts with explicit status and redaction_status and must never be exposed on public hotel pages.