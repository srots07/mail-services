# Regenerates the initial migration from prisma/schema.prisma (development helper, pre-release only).
$ErrorActionPreference = "Stop"
$f = "prisma/migrations/20261006000000_init/migration.sql"
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script -o $f | Out-Null
$extra = @"

-- At most one in-flight or successful campaign send per recipient. Enforces duplicate-send
-- protection at the database level, independent of application logic.
CREATE UNIQUE INDEX "email_sends_one_active_campaign_send" ON "email_sends"("campaign_contact_id") WHERE "kind" = 'CAMPAIGN' AND "status" IN ('SENDING', 'SENT');
"@
[System.IO.File]::AppendAllText((Resolve-Path $f), $extra, (New-Object System.Text.UTF8Encoding $false))
npx prisma generate | Out-Null
Write-Output "Migration regenerated: $f"
