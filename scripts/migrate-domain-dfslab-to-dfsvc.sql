-- Migrate admin user email addresses from @dfslab.net to @dfs.vc
-- Run once after deploying the domain change.
-- Safe to re-run (WHERE clause filters to only @dfslab.net rows).

UPDATE users
SET email = REPLACE(email, '@dfslab.net', '@dfs.vc')
WHERE email LIKE '%@dfslab.net';
