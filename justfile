set windows-shell := ["pwsh.exe", "-NoLogo", "-Command"]
set shell := ["bash", "-cu"]

# Build the npm package then run it (simulates `npx @spec-ade/open-design --open`)
dev-npm:
    node npm-package/scripts/build.mjs
    npm install --prefix npm-package
    node npm-package/bin/open-design.mjs --open
