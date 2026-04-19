# Reparse synced orders — safe back-update, no delete

**Rule:** when parser taxonomy changes (new addon keyword, equipment alias, classification rule), **back-update existing MongoDB orders in place** — never `deleteMany` expecting the sync workflow to rebuild them. Google Tasks retention is ~30 days for completed/hidden tasks; past events purged by Google cannot be re-fetched.

See full postmortem: `Obsidian References/LESSON/2026-04-19-never-delete-to-resync.md`.

## Recipe — add missing addon to existing orders

Example: the addon `kolonėlė` ("speaker") just got added to the parser ADDONS map; existing orders whose `taskTitle` mentions `kolonele` don't have it in `form_data.priedai`. Fix:

```bash
ssh batutynas-vps "docker compose -f /opt/batutynas/docker-compose.yml exec -T mongo mongosh batutynas_db --quiet --eval '
db.orders.find({
  \"form_data.source\": \"google_tasks_sync\",
  \"form_data.taskTitle\": /kolonel/i
}).forEach(o => {
  var cur = (o.form_data.priedai || \"\").split(/,\\s*/).filter(Boolean);
  if (!cur.includes(\"Kolonėlė\")) cur.push(\"Kolonėlė\");
  db.orders.updateOne(
    {_id: o._id},
    {\$set: {\"form_data.priedai\": cur.join(\", \"), \"updated_at\": new Date().toISOString()}}
  );
  print(\"updated: \" + o.id + \" | \" + o.form_data.taskTitle);
});
'"
```

## Recipe — fix primary equipment tag

Example: order's `form_data.batutas` is wrong because parser matched the addon before the equipment.

```bash
ssh batutynas-vps "docker compose -f /opt/batutynas/docker-compose.yml exec -T mongo mongosh batutynas_db --quiet --eval '
db.orders.updateOne(
  {id: \"THE_ORDER_ID\"},
  {\$set: {\"form_data.batutas\": \"Mega Rocket\", \"updated_at\": new Date().toISOString()}}
);
'"
```

## Before running ANY bulk update

1. Change the query to `.find(...).limit(3).forEach(o => print(JSON.stringify(o.form_data)))` first — eyeball the matches
2. Run the update on ONE order by `id`, verify the dashboard shows the expected change
3. THEN batch over all matches

## Never

- `db.orders.deleteMany({"form_data.source": "google_tasks_sync", ...})`
- Trust that "the sync will pick it up next run" for past-dated tasks
