set windows-shell := ["pwsh.exe", "-NoLogo", "-Command"]
set shell := ["bash", "-cu"]

# Build the npm package then run it (simulates `npx @spec-ade/open-design --open`)
dev-npm:
    node npm-package/scripts/build.mjs
    npm install --prefix npm-package
    node npm-package/bin/open-design.mjs --open

# Bump patch, build, and publish to npm (`just publish-npm dry-run` to preview)
publish-npm mode="":
    node npm-package/scripts/publish.mjs {{mode}}
