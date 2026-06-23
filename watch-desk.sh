#!/bin/bash
# Live-desk watcher: polls the inbox every 1s, exits when a customer message
# arrives (which re-invokes Claude to answer), or after ~8 min (then re-armed).
for i in $(seq 1 500); do
  n=$(curl -s http://localhost:5210/api/inbox | grep -o '"id"' | wc -l | tr -d ' ')
  if [ "$n" -gt 0 ]; then echo "NEW_MESSAGES:$n"; exit 0; fi
  sleep 1
done
echo "IDLE_TIMEOUT"; exit 0
