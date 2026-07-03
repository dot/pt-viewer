output "d1_database_id" {
  description = "Set this as database_id in packages/web/wrangler.toml"
  value       = cloudflare_d1_database.ptviewer.id
}

output "app_hostname" {
  value = local.hostname
}
