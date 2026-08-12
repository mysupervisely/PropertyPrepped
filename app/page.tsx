1:01:51 PM: Netlify Build                                                 
1:01:51 PM: ────────────────────────────────────────────────────────────────
1:01:51 PM: ​
1:01:51 PM: ❯ Version
1:01:51 PM:   @netlify/build 36.2.4
1:01:51 PM: ​
1:01:51 PM: ❯ Flags
1:01:51 PM:   accountId: 6a30c2e1c58ac487ea8dc866
1:01:51 PM:   baseRelDir: true
1:01:51 PM:   buildId: 6a7ca6eae2e9ad2096975c4f
1:01:51 PM:   deployId: 6a7ca6eae2e9ad2096975c51
1:01:51 PM: ​
1:01:51 PM: ❯ Current directory
1:01:51 PM:   /opt/build/repo
1:01:51 PM: ​
1:01:51 PM: ❯ Config file
1:01:51 PM:   No config file was defined: using default values.
1:01:51 PM: ​
1:01:51 PM: ❯ Context
1:01:51 PM:   production
1:01:51 PM: ​
1:01:51 PM: ❯ Using Next.js Runtime - v5.15.13
1:01:53 PM: No Next.js cache to restore
1:01:53 PM: ​
1:01:53 PM: Build command from Netlify app                                
1:01:53 PM: ────────────────────────────────────────────────────────────────
1:01:53 PM: ​
1:01:53 PM: $ npm run build
1:01:53 PM: > propprepped-mvp@0.1.0 build
1:01:53 PM: > next build
1:01:53 PM: ▲ Next.js 16.3.0 (Turbopack)
1:01:53 PM: ✓ Running next.config took 16ms
1:01:53 PM: ⚠ No build cache found. Please configure build caching for faster rebuilds. Read more: https://nextjs.org/docs/messages/no-cache
1:01:53 PM:   Creating an optimized production build ...
1:01:57 PM: ✓ Compiled successfully in 3.4s
1:01:57 PM:   Running TypeScript ...
1:01:57 PM:   We detected TypeScript in your project and reconfigured your tsconfig.json file for you.
1:01:57 PM:   The following suggested values were added to your tsconfig.json. These values can be changed to fit your project's needs:
1:01:57 PM:   	- include was updated to add '.next/dev/types/**/*.ts'
1:01:57 PM:   The following mandatory changes were made to your tsconfig.json:
1:01:57 PM:   	- jsx was set to react-jsx (next.js uses the React automatic runtime)
1:01:57 PM: app/page.tsx:214:30 - error TS18047: 'supabase' is possibly 'null'.
1:01:57 PM: 214       const { data } = await supabase.storage.from('property-photos').createSignedUrl(photo.storage_path, 3600)
1:01:57 PM:                                  ~~~~~~~~
1:01:57 PM: Found 1 error in app/page.tsx:214
1:01:57 PM: Failed to type check.
1:01:57 PM: 
1:01:58 PM: Failed during stage 'building site': Build script returned non-zero exit code: 2 (https://ntl.fyi/exit-code-2)
1:01:58 PM: ​
1:01:58 PM: "build.command" failed                                        
1:01:58 PM: ────────────────────────────────────────────────────────────────
1:01:58 PM: ​
1:01:58 PM:   Error message
1:01:58 PM:   Command failed with exit code 1: npm run build (https://ntl.fyi/exit-code-1)
1:01:58 PM: ​
1:01:58 PM:   Error location
1:01:58 PM:   In Build command from Netlify app:
1:01:58 PM:   npm run build
1:01:58 PM: ​
1:01:58 PM:   Resolved config
1:01:58 PM:   build:
1:01:58 PM:     command: npm run build
1:01:58 PM:     commandOrigin: ui
1:01:58 PM:     environment:
1:01:58 PM:       - NEXT_PUBLIC_SUPABASE_ANON_KEY
1:01:58 PM:       - NEXT_PUBLIC_SUPABASE_URL
1:01:58 PM:     publish: /opt/build/repo/.next
1:01:58 PM:     publishOrigin: ui
1:01:58 PM:   plugins:
1:01:58 PM:     - inputs: {}
1:01:58 PM:       origin: ui
1:01:58 PM:       package: "@netlify/plugin-nextjs"
1:01:58 PM: Build failed due to a user error: Build script returned non-zero exit code: 2
1:01:58 PM: Failing build: Failed to build site
1:01:58 PM: Finished processing build request in 23.372s
