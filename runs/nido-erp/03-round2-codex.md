Added `vercel.json` with a catch-all rewrite to `/index.html`, so direct `/login` requests reach the SPA and render its sign-in form instead of Vercel’s 404 page.

[stderr]
s only and cannot run commands. Do not touch application behaviour that is unrelated. After you finish, Kane will run the same check again; you do not get to edit the check. End with one line: what you changed and why.
codex
I’ll add the minimal Vercel SPA rewrite so direct requests such as `/login` load the app entry point and let the client router render the sign-in form.
apply patch
patch: completed
/Volumes/MajjiR/github/kane/.targets/nido-erp/vercel.json
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
Added `vercel.json` with a catch-all rewrite to `/index.html`, so direct `/login` requests reach the SPA and render its sign-in form instead of Vercel’s 404 page.
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
8,351
