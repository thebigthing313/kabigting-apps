-- The Admin holds every App through the role, so rows for an Admin are never read again.
DELETE FROM "app_access" WHERE "user_id" IN (SELECT "id" FROM "auth_user" WHERE "role" = 'admin');
