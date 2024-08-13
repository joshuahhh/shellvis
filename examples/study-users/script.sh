#!/bin/bash

# TASK
#
# We're running a web service, and need to respond to some users'
# requests to delete their accounts. We have a list of usernames in a
# file called users-to-delete.txt. Write a script that deletes the
# user folders for each user in that file.
#
# A code assistant generated the following code. Is it correct?

cat users-to-delete.txt | while read LINE; do
  rm -rf users/$LINE
done
