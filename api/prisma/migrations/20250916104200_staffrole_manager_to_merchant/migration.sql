-- Rename enum value MANAGER -> MERCHANT for StaffRole
-- PostgreSQL 12+ supports RENAME VALUE
ALTER TYPE "public"."StaffRole" RENAME VALUE 'MANAGER' TO 'MERCHANT';
