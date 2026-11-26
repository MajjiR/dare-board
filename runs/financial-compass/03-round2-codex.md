Added `vercel.json` with an SPA rewrite so direct `/auth` requests load `index.html` and render the sign-in/sign-up screen instead of Vercel’s 404.

[stderr]
u have file tools only and cannot run commands. Do not touch application behaviour that is unrelated. After you finish, Kane will run the same check again; you do not get to edit the check. End with one line: what you changed and why.
codex
I’ll add the minimal Vercel SPA fallback so direct requests such as `/auth` are served by the app entry point instead of the host’s 404 page.
apply patch
patch: completed
/Volumes/MajjiR/github/kane/.targets/financial-compass/vercel.json
diff --git a/vercel.json b/vercel.json
new file mode 100644
index 0000000000000000000000000000000000000000..0d199b2df67dcc25a1e798f499cf2340b034eda4
--- /dev/null
+++ b/vercel.json
@@ -0,0 +1,5 @@
+{
+  "rewrites": [
+    { "source": "/(.*)", "destination": "/index.html" }
+  ]
+}

diff --git a/vercel.json b/vercel.json
new file mode 100644
index 0000000000000000000000000000000000000000..0d199b2df67dcc25a1e798f499cf2340b034eda4
--- /dev/null
+++ b/vercel.json
@@ -0,0 +1,5 @@
+{
+  "rewrites": [
+    { "source": "/(.*)", "destination": "/index.html" }
+  ]
+}

codex
Added `vercel.json` with an SPA rewrite so direct `/auth` requests load `index.html` and render the sign-in/sign-up screen instead of Vercel’s 404.
diff --git a/vercel.json b/vercel.json
new file mode 100644
index 0000000000000000000000000000000000000000..0d199b2df67dcc25a1e798f499cf2340b034eda4
--- /dev/null
+++ b/vercel.json
@@ -0,0 +1,5 @@
+{
+  "rewrites": [
+    { "source": "/(.*)", "destination": "/index.html" }
+  ]
+}

tokens used
8,196
