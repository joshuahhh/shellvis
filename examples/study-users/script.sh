#!/bin/bash

# TASK
# ----
# We're running a web service, and need to respond to some users' requests to
# delete their accounts. We have a list of usernames in a file called
# users-to-delete.txt. Write a script that reads this file and deletes the
# corresponding user accounts.

cat users-to-delete.txt | while read LINE; do
  rm -rf $LINE
done

ls
