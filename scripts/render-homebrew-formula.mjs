#!/usr/bin/env node
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const version = stripV(process.env.SLASH_LINKEDIN_RELEASE_TAG) || process.env.SLASH_LINKEDIN_VERSION || pkg.version;
const tag = process.env.SLASH_LINKEDIN_RELEASE_TAG || `v${version}`;
const sha256 = process.env.SLASH_LINKEDIN_TARBALL_SHA256 || "REPLACE_WITH_RELEASE_SHA256";
const repo = process.env.SLASH_LINKEDIN_GITHUB_REPO || "edihasaj/slash-linkedin";
const homepage = process.env.SLASH_LINKEDIN_HOMEPAGE || pkg.homepage || `https://github.com/${repo}`;
const desc = process.env.SLASH_LINKEDIN_DESC || pkg.description || "Local LinkedIn CLI";

console.log(`class SlashLinkedin < Formula
  desc "${escape(desc)}"
  homepage "${homepage}"
  url "https://github.com/${repo}/releases/download/${tag}/slash-linkedin-${version}.tar.gz"
  sha256 "${sha256}"
  license "MIT"
  version "${version}"

  # Intentionally no \`depends_on "node"\`: the tarball bundles its own
  # node_modules, and the wrapper runs whatever node is already on PATH
  # (e.g. an nvm-managed runtime), so installing slash-linkedin never pulls a
  # second Node onto the machine.

  def install
    libexec.install Dir["*"]
    %w[slash-linkedin sli].each do |name|
      (bin/name).write <<~EOS
        #!/bin/bash
        exec node "#{libexec}/dist/cli.js" "$@"
      EOS
      chmod 0755, bin/name
    end
  end

  test do
    assert_match "slash-linkedin", shell_output("#{bin}/slash-linkedin --version 2>&1", 0)
  end
end`);

function stripV(t) {
  if (!t) return "";
  return t.startsWith("v") ? t.slice(1) : t;
}

function escape(s) {
  return s.replace(/"/g, '\\"');
}
