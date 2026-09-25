PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO affiliate_providers (id,name,provider_type,enabled,config_json)
VALUES ('serpapi_google_hotels','SerpApi Google Hotels','rate_api',0,'{}');
