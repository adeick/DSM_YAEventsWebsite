# Diocese of Des Moines — Events Site

React + Supabase site: a scrolling list of upcoming events on the left,
a map of parishes in the diocese on the right. Volunteers log in to
add events; anyone can view them.

## 1. Install

npm install

## 2. Connect Supabase

1. Copy .env.example to .env.
2. In your Supabase project: Project Settings → API, copy the
   Project URL and anon public key into .env.

## 3. Set up the database

In the Supabase dashboard, go to SQL Editor → New query, paste in
the contents of supabase-setup.sql, and run it. This creates the
events table (if you haven't already) with the right read/write
rules, plus a churches table for the map.

## 4. Add churches to the map

Run the geocoding helper once to turn addresses into map coordinates:

node scripts/geocode-churches.mjs

This prints an insert into churches ... SQL statement — paste the
output into the Supabase SQL Editor and run it.

## 5. Run it locally

npm run dev

## 6. Deploy to Vercel

1. Push this project to a GitHub repo.
2. In Vercel, New Project → import the repo.
3. Under Environment Variables, add VITE_SUPABASE_URL and
   VITE_SUPABASE_ANON_KEY with the same values from your .env.
4. Deploy.