# Deliberately empty

Vercel serves a build's "output directory" as static files, and refuses to
finish a build without one. This API has no static files: every request is
answered by the function in `api/`, which `vercel.json` routes all paths to.

So this directory is the output directory, and it stays empty. Pointing the
output directory at the project root instead would work, and would also
publish this API's own source - `/src/config/env.ts` and everything beside
it - because Vercel serves real files before it applies a rewrite.

Nothing here is served: a request for a file that does not exist falls
through to the rewrite, and the API answers it.
