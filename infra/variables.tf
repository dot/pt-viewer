variable "account_id" {
  description = "Cloudflare account id"
  type        = string
}

variable "domain" {
  description = "Apex domain for the app (must be a zone in the Cloudflare account; registration itself is a manual step — Terraform cannot purchase domains)"
  type        = string
}

variable "app_hostname" {
  description = "Hostname the app is served on. Defaults to the apex domain."
  type        = string
  default     = ""
}

variable "allowed_emails" {
  description = "Emails allowed through Cloudflare Access (mirror of Linear workspace members). Supply via terraform.tfvars — never commit."
  type        = list(string)
  sensitive   = true
}

variable "session_duration" {
  description = "Access session duration"
  type        = string
  default     = "730h" # ~1 month
}

locals {
  hostname = var.app_hostname != "" ? var.app_hostname : var.domain
}
