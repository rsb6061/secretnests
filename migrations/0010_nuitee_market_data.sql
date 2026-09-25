PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO affiliate_providers (id,name,provider_type,enabled,config_json)
VALUES ('nuitee_connect','Nuitee Connect','rate_api',0,'{}');

INSERT OR IGNORE INTO affiliate_providers (id,name,provider_type,enabled,config_json)
VALUES ('nuitee_sandbox','Nuitee Connect Sandbox','rate_api_test',0,'{}');
