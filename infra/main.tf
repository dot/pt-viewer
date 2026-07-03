# Zone must already exist in the account (created when the domain is
# registered via Cloudflare Registrar, or added manually).
data "cloudflare_zone" "app" {
  filter = {
    name = var.domain
  }
}

resource "cloudflare_d1_database" "ptviewer" {
  account_id = var.account_id
  name       = "pt-viewer"
  # Data is loaded out-of-band:
  #   wrangler d1 execute pt-viewer --remote --file data/<project>.dump.sql
}

# The Worker itself is deployed with `wrangler deploy` from packages/web;
# it attaches to the hostname via a Workers custom domain, which needs the
# zone to be active. DNS for the hostname is managed by wrangler.

resource "cloudflare_zero_trust_access_policy" "allow_members" {
  account_id = var.account_id
  name       = "pt-viewer linear members"
  decision   = "allow"

  include = [
    for email in var.allowed_emails : {
      email = { email = email }
    }
  ]
}

resource "cloudflare_zero_trust_access_application" "ptviewer" {
  account_id       = var.account_id
  name             = "pt-viewer"
  domain           = local.hostname
  type             = "self_hosted"
  session_duration = var.session_duration

  policies = [
    {
      id         = cloudflare_zero_trust_access_policy.allow_members.id
      precedence = 1
    }
  ]
}
